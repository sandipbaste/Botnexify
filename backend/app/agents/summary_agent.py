# app/agents/summary_agent.py
"""
Summary agent for managing long conversation histories
Compresses older messages into summaries when conversation exceeds 30 messages
"""

from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
from functools import partial

from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, RemoveMessage
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.base import BaseCheckpointSaver

from app.core.llm import LLMManager
from app.memory.redis import RedisMemory


class ConversationSummaryState:
    """State for conversation summarization"""
    def __init__(
        self,
        conversation_id: str,
        website_id: str,
        user_id: Optional[str] = None,
        messages: List[Any] = None,
        summary: str = "",
        total_message_count: int = 0
    ):
        self.conversation_id = conversation_id
        self.website_id = website_id
        self.user_id = user_id
        self.messages = messages or []
        self.summary = summary
        self.total_message_count = total_message_count


class SummaryAgent:
    """
    Agent that handles conversation summarization
    Compresses older messages when conversation exceeds threshold
    """
    
    def __init__(self, llm_manager: LLMManager, redis_memory: RedisMemory):
        self.llm = llm_manager
        self.redis_memory = redis_memory
        self.summary_threshold = 30  # Trigger summarization when total > 30
        self.keep_recent = 30  # Keep last 30 messages in full
        
    def should_summarize(self, total_messages: int) -> bool:
        """
        Check if conversation needs summarization
        Returns True if total messages exceed threshold
        """
        return total_messages > self.summary_threshold
    
    def get_summary_key(self, conversation_id: str) -> str:
        """Get Redis key for storing summary"""
        return f"chat:summary:{conversation_id}"
    
    async def get_existing_summary(self, conversation_id: str) -> str:
        """Retrieve existing summary from Redis"""
        try:
            key = self.get_summary_key(conversation_id)
            summary = self.redis_memory.redis_client.get(key)
            return summary if summary else ""
        except Exception as e:
            print(f"Error getting existing summary: {e}")
            return ""
    
    async def save_summary(self, conversation_id: str, summary: str) -> bool:
        """Save summary to Redis with 30-day expiry"""
        try:
            key = self.get_summary_key(conversation_id)
            self.redis_memory.redis_client.setex(key, 2592000, summary)
            print(f"Summary saved for conversation {conversation_id}")
            return True
        except Exception as e:
            print(f"Error saving summary: {e}")
            return False
    

    async def generate_summary(
        self,
        messages: List[Any],
        existing_summary: str = ""
    ) -> str:
        """
        Generate or extend conversation summary using LLM
        """
        try:
            # Build messages for summarization
            if existing_summary:
                prompt = (
                    f"Existing summary of previous conversation:\n{existing_summary}\n\n"
                    "Extend this summary to include the new conversation above. "
                    "Keep the summary concise but capture key topics, user questions, "
                    "and important information provided. The summary should be in the "
                    "same language as the conversation."
                )
            else:
                prompt = (
                    "Summarize the following conversation. Keep the summary concise but "
                    "capture key topics, user questions, and important information provided. "
                    "The summary should be in the same language as the conversation."
                )
            
            # Prepare messages for summary
            messages_for_summary = [
                SystemMessage(content="You are a conversation summarizer. Create concise, informative summaries.")
            ]
            
            # Add conversation messages
            for msg in messages:
                if isinstance(msg, HumanMessage):
                    messages_for_summary.append(msg)
                elif isinstance(msg, AIMessage):
                    # Truncate very long AI responses for summary
                    content = msg.content[:500] if len(msg.content) > 500 else msg.content
                    messages_for_summary.append(AIMessage(content=content))
            
            messages_for_summary.append(HumanMessage(content=prompt))
            
            # ========== FIX: Use async generate_response ==========
            summary = await self.llm.generate_response(messages_for_summary)
            
            # Clean up summary
            summary = summary.strip()
            print(f"Generated summary: {summary[:100]}...")
            print("="*60)
            print(summary)
            print("="*60 + "\n")
            return summary
            
        except Exception as e:
            print(f"Error generating summary: {e}")
            import traceback
            traceback.print_exc()
            # Fallback: create simple summary from message count
            return f"Conversation about {len(messages)} messages. Topics include: previous discussions from chat."
    
    def separate_messages_for_summary(
        self,
        messages: List[Any],
        keep_recent: int = 30
    ) -> Tuple[List[Any], List[Any]]:
        """
        Separate messages into:
        - older_messages: those to be summarized
        - recent_messages: those to keep in full
        
        Returns (older_messages, recent_messages)
        """
        if len(messages) <= keep_recent:
            return [], messages
        
        # Keep last keep_recent messages
        recent_messages = messages[-keep_recent:]
        older_messages = messages[:-keep_recent]
        
        return older_messages, recent_messages
    
    async def process_conversation(
        self,
        conversation_id: str,
        website_id: str,
        messages: List[Any],
        user_id: Optional[str] = None
    ) -> Tuple[str, List[Any]]:
        """
        Process conversation to manage summary
        Returns: Tuple of (summary, recent_messages)
        """
        total_messages = len(messages)
        
        if not self.should_summarize(total_messages):
            # No summarization needed
            existing_summary = await self.get_existing_summary(conversation_id)
            return existing_summary, messages
        
        print(f"Processing summarization for {conversation_id}: {total_messages} messages")
        
        # Separate older and recent messages
        older_messages, recent_messages = self.separate_messages_for_summary(
            messages, self.keep_recent
        )
        
        if older_messages:
            # Get existing summary
            existing_summary = await self.get_existing_summary(conversation_id)
            
            # Generate or extend summary
            new_summary = await self.generate_summary(older_messages, existing_summary)
            
            # Save summary
            await self.save_summary(conversation_id, new_summary)
            
            print(f"Summarized {len(older_messages)} messages, keeping {len(recent_messages)} recent")
            
            return new_summary, recent_messages
        
        existing_summary = await self.get_existing_summary(conversation_id)
        return existing_summary, recent_messages
    
    async def get_context_for_llm(
        self,
        conversation_id: str,
        website_id: str,
        recent_messages: List[Any]
    ) -> str:
        """
        Get context string for LLM (summary + recent messages indicator)
        """
        summary = await self.get_existing_summary(conversation_id)
        
        if summary:
            context = f"""
CONVERSATION SUMMARY (previous messages):
{summary}

RECENT CONVERSATION (last {len(recent_messages)} messages):
"""
        else:
            context = "CONVERSATION HISTORY:\n"
        
        return context