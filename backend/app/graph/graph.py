# app/graph/graph.py (UPDATED)
import re
from typing import List, Dict, Any, Optional
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langgraph.graph import StateGraph, END

from app.graph.state import ChatState
from app.agents.prompts.build_prompt import build_system_prompt
from app.agents.summary_agent import SummaryAgent


class ChatGraph:
    """LangGraph workflow for chat processing with conversation summarization"""
    
    def __init__(self, embedding_handler, llm, checkpointer, redis_memory=None):
        self.embedding_handler = embedding_handler
        self.llm = llm
        self.checkpointer = checkpointer
        self.redis_memory = redis_memory
        
        # Initialize summary agent if Redis memory is available
        self.summary_agent = None
        if redis_memory:
            from app.agents.summary_agent import SummaryAgent
            self.summary_agent = SummaryAgent(llm, redis_memory)
            print("Summary agent initialized")
        
        self.graph = self._build_graph()
    
    def _build_graph(self):
        workflow = StateGraph(ChatState)
        # All nodes are now async
        workflow.add_node("prepare_context", self.prepare_context)
        workflow.add_node("retrieve_context", self.retrieve_context)
        workflow.add_node("generate_response", self.generate_response)
        
        workflow.set_entry_point("prepare_context")
        workflow.add_edge("prepare_context", "retrieve_context")
        workflow.add_edge("retrieve_context", "generate_response")
        workflow.add_edge("generate_response", END)
        
        return workflow.compile(checkpointer=self.checkpointer)
    
    # ========== MAKE THIS ASYNC ==========
    async def prepare_context(self, state: ChatState) -> Dict[str, Any]:
        """
        Prepare conversation context including summary management
        This runs before context retrieval
        """
        try:
            # If summary agent is available, process conversation
            if self.summary_agent and state.messages:
                # Direct async call - no loop creation
                summary, processed_messages = await self.summary_agent.process_conversation(
                    conversation_id=state.conversation_id,
                    website_id=state.website_id,
                    messages=state.messages,
                    user_id=state.user_id
                )
                
                # Store summary in state for later use
                state.summary = summary
                # Update messages to only keep recent ones
                state.messages = processed_messages
                
                print(f"Context prepared: summary={'present' if summary else 'none'}, "
                      f"messages={len(processed_messages)}")
            
            return {"summary": getattr(state, 'summary', '')}
            
        except Exception as e:
            print(f"Error in prepare_context: {e}")
            import traceback
            traceback.print_exc()
            return {"summary": ""}
    
    # ========== MAKE THIS ASYNC ==========
    async def retrieve_context(self, state: ChatState) -> Dict[str, Any]:
        """Retrieve context from embeddings"""
        try:
            last_user_message = ""
            for msg in reversed(state.messages):
                if isinstance(msg, HumanMessage):
                    last_user_message = msg.content
                    break

            context = []
            if last_user_message:
                is_follow_up, item_number, item_name = self._parse_follow_up_question(
                    last_user_message, state.messages
                )

                if is_follow_up and item_name:
                    website_context = self.embedding_handler.search_similar_content(
                        website_id=state.website_id,
                        query=item_name,
                        top_k=5,
                    )
                    uploads_context = self.embedding_handler.search_similar_content(
                        website_id=state.website_id,
                        query=item_name,
                        top_k=3,
                    )
                else:
                    website_context = self.embedding_handler.search_similar_content(
                        website_id=state.website_id,
                        query=last_user_message,
                        top_k=5,
                    )
                    uploads_context = self.embedding_handler.search_similar_content(
                        website_id=state.website_id,
                        query=last_user_message,
                        top_k=3,
                    )

                combined_context = (website_context or []) + (uploads_context or [])
                
                seen_texts = set()
                unique_context = []
                for item in combined_context:
                    text_hash = hash(item['text'])
                    if text_hash not in seen_texts:
                        seen_texts.add(text_hash)
                        unique_context.append(item)
                
                unique_context.sort(key=lambda x: x.get('similarity_score', 0), reverse=True)
                context = unique_context[:5]

            return {"context": context}
        except Exception as e:
            print(f"Error in retrieve_context: {e}")
            return {"context": []}
    
    # ========== KEEP THIS ASYNC (already is) ==========
    async def generate_response(self, state: ChatState) -> Dict[str, Any]:
        """Generate response using LLM with summary context"""
        return await self._generate_response_internal(state, use_external=False)
    
    async def _generate_response_internal(self, state: ChatState, use_external: bool = False) -> Dict[str, Any]:
        """Internal method to generate response"""
        try:
            # Build context text
            if state.context:
                context_text = "\n\n".join(
                    f"Source: {c['metadata'].get('title', 'Unknown')} "
                    f"(Type: {c['metadata'].get('type', 'website')})\n"
                    f"Content: {c['text']}"
                    for c in state.context[:5]
                )
            else:
                context_text = "No specific context found from the website."

            # Create user greeting
            user_greeting = ""
            if state.user_info and state.user_info.get('full_name'):
                user_greeting = f"\nUSER INFORMATION:\n- Name: {state.user_info.get('full_name', '')}\n- Email: {state.user_info.get('email', 'Not provided')}\n- Mobile: {state.user_info.get('mobile', 'Not provided')}\n"

            # Format conversation history with summary
            conversation_history_text = await self._format_conversation_history_with_summary(
                state.messages,
                summary=getattr(state, 'summary', ''),
                user_id=state.user_id or state.session_id
            )

            # Extract last assistant list
            last_assistant_list = self._extract_previous_list(state.messages)
            last_assistant_list_text = ""
            if last_assistant_list:
                last_assistant_list_text = "\n\nYOUR LAST RESPONSE WITH LIST:\n"
                for i, item in enumerate(last_assistant_list, 1):
                    last_assistant_list_text += f"{i}. {item}\n"

            # Check for follow-up
            last_user_message = ""
            for msg in reversed(state.messages):
                if isinstance(msg, HumanMessage):
                    last_user_message = msg.content
                    break
            
            is_follow_up, item_number, item_name = self._parse_follow_up_question(last_user_message, state.messages)
            
            follow_up_instruction = ""
            if is_follow_up and item_name:
                follow_up_instruction = f"""
CRITICAL: The user is asking about item #{item_number}: "{item_name}" from your previous list.
You MUST provide detailed information about "{item_name}" using the WEBSITE CONTEXT below.
If the website context contains information about "{item_name}", provide that information.
If the website context doesn't have specific details, explain what "{item_name}" typically means in this context.
"""

            # Build system prompt
            system_message_content = build_system_prompt(
                website_id=state.website_id,
                context_text=context_text,
                user_greeting=user_greeting,
                conversation_history_text=conversation_history_text,
                last_assistant_list_text=last_assistant_list_text,
                follow_up_instruction=follow_up_instruction,
                use_external=use_external
            )

            # Prepare messages for LLM
            all_messages = [
                m for m in state.messages if isinstance(m, (HumanMessage, AIMessage))
            ][-10:]  # Keep last 10 for context, summary handles the rest
            
            messages_for_llm = [SystemMessage(content=system_message_content)] + all_messages

            # Generate response
            try:
                response_text = await self.llm.generate_response(messages_for_llm)
            except Exception as e:
                print("LLM error:", e)
                if is_follow_up and item_name:
                    response_text = (
                        f"I apologize, but I'm having trouble accessing details about {item_name}. "
                        "Please fill out our enquiry form and our team will assist you."
                    )
                else:
                    response_text = "Temporary AI service issue. Please try again."

            # Clean response
            unwanted_prefixes = [
                "[Using external sources]", "[External Sources]", "[External Info]",
                "[Search Results]", "[From external search]:", "Based on external search:",
            ]
            for prefix in unwanted_prefixes:
                if response_text.lower().startswith(prefix.lower()):
                    response_text = response_text[len(prefix):].strip()

            response_text = response_text.replace("<>", "").strip()

            # Fallback for follow-up
            if "cannot provide specific details" in response_text.lower() and is_follow_up:
                print("Detected 'cannot provide' response for follow-up")
                response_text = (
                    f"Regarding {item_name}: This is a specialized product in our portfolio. "
                    "For specifications or pricing, please fill out the enquiry form and our team will assist you."
                )

            print(f"LLM response generated: {len(response_text)} chars")

            return {
                "response": response_text,
                "messages": [AIMessage(content=response_text)]
            }
            
        except Exception as e:
            print(f"  Error in generate_response: {e}")
            import traceback
            print(traceback.format_exc())
            error_text = "I apologize, but I encountered an error while processing your request."
            return {"response": error_text, "messages": [AIMessage(content=error_text)]}
    
    async def _format_conversation_history_with_summary(
        self,
        messages: List[Any],
        summary: str = "",
        user_id: str = None
    ) -> str:
        """Format conversation history with summary context"""
        formatted_parts = []
        
        # Add summary if present
        if summary:
            formatted_parts.append(f"PREVIOUS CONVERSATION SUMMARY:\n{summary}\n")
            formatted_parts.append("RECENT CONVERSATION:")
        
        # Format recent messages
        formatted = []
        for i, msg in enumerate(messages):
            if isinstance(msg, HumanMessage):
                formatted.append(f"USER {i+1}: {msg.content}")
            elif isinstance(msg, AIMessage):
                content = msg.content[:300] + "..." if len(msg.content) > 300 else msg.content
                formatted.append(f"ASSISTANT {i+1}: {content}")
        
        if formatted:
            formatted_parts.append("\n".join(formatted))
        
        if not formatted_parts:
            return "No previous conversation in this session."
        
        if user_id:
            header = f"CONVERSATION HISTORY FOR USER {user_id}:\n"
        else:
            header = "CONVERSATION HISTORY:\n"
        
        return header + "\n".join(formatted_parts)
    
    def _parse_follow_up_question(self, query: str, messages: List[Any]) -> tuple:
        """Parse if the query is asking about a previous list item"""
        # ... (keep existing code)
        query_lower = query.lower().strip()
        
        follow_up_patterns = [
            (r'explain\s+(?:the\s+)?(\w+)(?:\s+one)?', 'explain'),
            (r'tell\s+me\s+about\s+(?:the\s+)?(\w+)(?:\s+one)?', 'tell'),
            (r'what\s+about\s+(?:the\s+)?(\w+)(?:\s+one)?', 'what'),
            (r'describe\s+(?:the\s+)?(\w+)(?:\s+one)?', 'describe'),
            (r'number\s+(\d+)', 'number'),
            (r'item\s+(\d+)', 'item'),
        ]
        
        number_words = {
            'first': 1, 'second': 2, 'third': 3, 'fourth': 4, 'fifth': 5,
            'sixth': 6, 'seventh': 7, 'eighth': 8, 'ninth': 9, 'tenth': 10,
            '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5,
            '6th': 6, '7th': 7, '8th': 8, '9th': 9, '10th': 10
        }
        
        for pattern, pattern_type in follow_up_patterns:
            match = re.search(pattern, query_lower)
            if match:
                number_text = match.group(1)
                
                if number_text in number_words:
                    item_number = number_words[number_text]
                elif number_text.isdigit():
                    item_number = int(number_text)
                else:
                    continue
                
                last_list = self._extract_previous_list(messages)
                
                if last_list and item_number <= len(last_list):
                    list_item = last_list[item_number - 1]
                    if '. ' in list_item:
                        item_name = list_item.split('. ', 1)[1]
                    else:
                        item_name = list_item
                    
                    print(f" Follow-up detected: asking about item #{item_number}: {item_name}")
                    return True, item_number, item_name
        
        return False, None, None
    
    def _extract_previous_list(self, messages: List[Any]) -> List[str]:
        """Extract the last numbered list from assistant messages"""
        # ... (keep existing code)
        for msg in reversed(messages):
            if isinstance(msg, AIMessage):
                lines = msg.content.split('\n')
                items = []
                for line in lines:
                    line = line.strip()
                    if line and len(line) > 2 and line[0].isdigit() and '. ' in line:
                        parts = line.split('. ', 1)
                        if len(parts) > 1:
                            items.append(parts[1].strip())
                        else:
                            items.append(line)
                if items:
                    print(f" Extracted list: {items}")
                    return items
        return []
    