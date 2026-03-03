# agents.py - Fixed with proper user isolation for chat history

import os
import json
import traceback
import urllib.parse
from typing import List, Dict, Any, Optional, Annotated, AsyncIterator, Tuple
from datetime import datetime
from pydantic import BaseModel, Field

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langgraph.checkpoint.base import BaseCheckpointSaver, Checkpoint, CheckpointMetadata, CheckpointTuple, get_checkpoint_id

# Import database and email services
from src.database import db_manager
from src.email_service import email_service
from src.token_counter import token_counter

# DuckDuckGo Search imports
from duckduckgo_search import DDGS
import re

# Redis imports
import redis
from langgraph.checkpoint.redis import RedisSaver
import asyncio
from functools import partial

# =========================
# STATE
# =========================

class ChatState(BaseModel):
    messages: Annotated[List[Any], add_messages]
    website_id: str
    conversation_id: str
    user_id: Optional[str] = None  # Add user_id to state
    session_id: Optional[str] = None
    context: List[Dict[str, Any]] = Field(default_factory=list)
    response: Optional[str] = None
    user_info: Optional[Dict[str, str]] = None
    requires_search: bool = Field(default=False)
    search_results: List[Dict[str, Any]] = Field(default_factory=list)
    fallback_triggered: bool = Field(default=False)


# =========================
# DUCKDUCKGO SEARCH TOOL
# =========================

class DuckDuckGoSearcher:
    def __init__(self, max_results: int = 5):
        self.max_results = max_results
        self.ddgs = DDGS()
    
    def search(self, query: str) -> List[Dict[str, str]]:
        """
        Search DuckDuckGo for information
        
        Args:
            query: Search query
            
        Returns:
            List of search results with title, link, and snippet
        """
        try:
            print(f"🔍 DuckDuckGo searching for: {query}")
            
            # Clean the query
            clean_query = self._clean_query(query)
            
            # Perform search
            results = list(self.ddgs.text(
                keywords=clean_query,
                max_results=self.max_results,
                region='wt-wt',  # Worldwide
                safesearch='moderate'
            ))
            
            # Format results
            formatted_results = []
            for i, result in enumerate(results[:self.max_results]):
                formatted_results.append({
                    'title': result.get('title', 'No title'),
                    'link': result.get('href', ''),
                    'snippet': result.get('body', ''),
                    'relevance': self.max_results - i  # Simple relevance score
                })
            
            print(f"✅ Found {len(formatted_results)} search results")
            return formatted_results
            
        except Exception as e:
            print(f"❌ DuckDuckGo search error: {e}")
            return []
    
    def _clean_query(self, query: str) -> str:
        """
        Clean the search query for better results
        """
        # Remove special characters but keep important words
        query = re.sub(r'[^\w\s-]', ' ', query)
        # Remove extra whitespace
        query = ' '.join(query.split())
        # Add context words for better search
        if len(query.split()) < 4:
            query += " information details"
        return query
    
    def extract_relevant_info(self, search_results: List[Dict[str, str]], query: str) -> str:
        """
        Extract and summarize relevant information from search results
        
        Args:
            search_results: List of search results
            query: Original query
            
        Returns:
            Summarized information from search results
        """
        if not search_results:
            return ""
        
        # Combine snippets from top results
        combined_info = []
        for result in search_results[:3]:  # Use top 3 results
            snippet = result.get('snippet', '')
            if snippet:
                # Clean the snippet
                snippet = snippet.replace('\n', ' ').replace('\r', '')
                snippet = ' '.join(snippet.split()[:50])  # Limit to 50 words
                combined_info.append(f"- {snippet}")
        
        if combined_info:
            search_summary = f"Based on available information from external sources:\n\n"
            search_summary += '\n'.join(combined_info)
            search_summary += "\n\nNote: This information is gathered from external sources and may need verification."
            return search_summary
        
        return ""


# =========================
# REDIS CHECKPOINTER - COMPLETE IMPLEMENTATION
# =========================

class RedisCheckpointSaver(BaseCheckpointSaver):
    """
    Proper Redis checkpointer that extends BaseCheckpointSaver
    with all required methods implemented
    """
    def __init__(self, redis_client):
        super().__init__()
        self.redis_client = redis_client
        self._saver = None
        self._init_saver()
    
    def _init_saver(self):
        """Initialize the underlying RedisSaver"""
        try:
            # Try different initialization methods
            conn_kwargs = self.redis_client.connection_pool.connection_kwargs
            
            if hasattr(RedisSaver, 'from_conn_string'):
                # This is the preferred method
                redis_url = f"redis://"
                if conn_kwargs.get('password'):
                    redis_url = f"redis://:{conn_kwargs.get('password')}@{conn_kwargs.get('host', 'localhost')}:{conn_kwargs.get('port', 6379)}/1"
                else:
                    redis_url = f"redis://{conn_kwargs.get('host', 'localhost')}:{conn_kwargs.get('port', 6379)}/1"
                self._saver = RedisSaver.from_conn_string(redis_url)
            else:
                # Fallback to direct initialization
                self._saver = RedisSaver(
                    host=conn_kwargs.get('host', 'localhost'),
                    port=conn_kwargs.get('port', 6379),
                    db=1,  # Use different DB for checkpoints
                    password=conn_kwargs.get('password'),
                    username=conn_kwargs.get('username'),
                    ssl=conn_kwargs.get('ssl', False)
                )
            
            print("✅ RedisSaver initialized successfully")
        except Exception as e:
            print(f"⚠️ RedisSaver initialization error: {e}")
            self._saver = None
    
    def get_next_version(self, current_version: Optional[int], channel: str) -> int:
        """Get the next version number"""
        if self._saver and hasattr(self._saver, 'get_next_version'):
            return self._saver.get_next_version(current_version, channel)
        # Default implementation
        if current_version is None:
            return 1
        return current_version + 1
    
    def put(self, config: Dict, checkpoint: Checkpoint, metadata: CheckpointMetadata, new_versions: Dict[str, int]) -> None:
        """Save a checkpoint"""
        if self._saver and hasattr(self._saver, 'put'):
            return self._saver.put(config, checkpoint, metadata, new_versions)
        return None
    
    async def aput(self, config: Dict, checkpoint: Checkpoint, metadata: CheckpointMetadata, new_versions: Dict[str, int]) -> None:
        """Async save a checkpoint"""
        if self._saver and hasattr(self._saver, 'aput'):
            return await self._saver.aput(config, checkpoint, metadata, new_versions)
        # Fallback to sync version in thread pool
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, 
            partial(self.put, config, checkpoint, metadata, new_versions)
        )
    
    def put_writes(self, config: Dict, writes: List[Tuple[str, Any]], task_id: str) -> None:
        """Save writes for a checkpoint"""
        if self._saver and hasattr(self._saver, 'put_writes'):
            return self._saver.put_writes(config, writes, task_id)
        # Default implementation - just return None
        return None
    
    async def aput_writes(self, config: Dict, writes: List[Tuple[str, Any]], task_id: str) -> None:
        """Async save writes for a checkpoint"""
        if self._saver and hasattr(self._saver, 'aput_writes'):
            return await self._saver.aput_writes(config, writes, task_id)
        # Fallback to sync version in thread pool
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, 
            partial(self.put_writes, config, writes, task_id)
        )
    
    def get_tuple(self, config: Dict) -> Optional[CheckpointTuple]:
        """Get a checkpoint tuple"""
        if self._saver and hasattr(self._saver, 'get_tuple'):
            return self._saver.get_tuple(config)
        return None
    
    async def aget_tuple(self, config: Dict) -> Optional[CheckpointTuple]:
        """Async get a checkpoint tuple"""
        if self._saver and hasattr(self._saver, 'aget_tuple'):
            return await self._saver.aget_tuple(config)
        # Fallback to sync version in thread pool
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, partial(self.get_tuple, config))
    
    def list(self, config: Dict, limit: Optional[int] = None, before: Optional[Dict] = None) -> List[CheckpointTuple]:
        """List checkpoints"""
        if self._saver and hasattr(self._saver, 'list'):
            return self._saver.list(config, limit, before)
        return []
    
    async def alist(self, config: Dict, limit: Optional[int] = None, before: Optional[Dict] = None) -> AsyncIterator[CheckpointTuple]:
        """Async list checkpoints"""
        if self._saver and hasattr(self._saver, 'alist'):
            async for item in self._saver.alist(config, limit, before):
                yield item
        else:
            # Fallback to sync version
            items = self.list(config, limit, before)
            for item in items:
                yield item
    
    def delete(self, config: Dict) -> None:
        """Delete a checkpoint"""
        if self._saver and hasattr(self._saver, 'delete'):
            return self._saver.delete(config)
        return None
    
    async def adelete(self, config: Dict) -> None:
        """Async delete a checkpoint"""
        if self._saver and hasattr(self._saver, 'adelete'):
            return await self._saver.adelete(config)
        # Fallback to sync version in thread pool
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, partial(self.delete, config))


# =========================
# CHAT AGENT
# =========================

class ChatAgent:
    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY not found in environment variables")
        
        # Initialize LLM first
        self.llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=api_key,
            temperature=0.3,
            max_output_tokens=1000,
        )
        
        # Initialize DuckDuckGo searcher
        self.searcher = DuckDuckGoSearcher(max_results=5)
        
        # Initialize Redis for production
        
        redis_url = os.getenv("REDIS_URL")
        if not redis_url:
            raise ValueError("REDIS_URL not found in environment variables")
        
        # Initialize Redis components
        self.redis_client, self.checkpointer = self._init_redis_production(redis_url)
        print("✅ Production Redis initialized successfully")
        
        # Build workflow
        self.graph = self._build_graph()
    
    def _init_redis_production(self, redis_url: str):
        """
        Initialize Redis for production - separate client for history and checkpointer
        Returns: (redis_client, checkpoint_saver)
        """
        try:
            # Normalize Redis URL
            normalized_url = self._normalize_redis_url(redis_url)
            
            # ===== 1. Create Redis client for chat history =====
            print("🔄 Initializing Redis client for chat history...")
            
            # Parse URL for components
            parsed = urllib.parse.urlparse(normalized_url)
            
            # Create Redis client with connection pool
            redis_client = redis.Redis(
                host=parsed.hostname or 'localhost',
                port=parsed.port or 6379,
                password=parsed.password,
                username=parsed.username,
                db=0,
                ssl=parsed.scheme == 'rediss',
                decode_responses=True,
                socket_connect_timeout=10,
                socket_timeout=10,
                retry_on_timeout=True,
                health_check_interval=30,
                max_connections=20
            )
            
            # Test connection
            redis_client.ping()
            print("✅ Redis client connected successfully")
            
            # ===== 2. Create Redis checkpointer that extends BaseCheckpointSaver =====
            print("🔄 Initializing Redis checkpoint saver...")
            checkpointer = RedisCheckpointSaver(redis_client)
            
            return redis_client, checkpointer
            
        except Exception as e:
            print(f"❌ Failed to initialize Redis: {e}")
            raise
    
    def _normalize_redis_url(self, redis_url: str) -> str:
        """Normalize Redis URL to handle special characters in password"""
        # Remove any whitespace
        redis_url = redis_url.strip()
        
        # If it's an Upstash URL with @ in password, we need to encode it
        if '@' in redis_url and '://' in redis_url:
            # Parse the URL
            if redis_url.startswith('redis://'):
                scheme = 'redis://'
                rest = redis_url[8:]  # Remove 'redis://'
            elif redis_url.startswith('rediss://'):
                scheme = 'rediss://'
                rest = redis_url[9:]  # Remove 'rediss://'
            else:
                return redis_url  # Return as is if we can't parse
            
            # Check if there's auth part
            if '@' in rest:
                auth_part, host_part = rest.split('@', 1)
                # URL-encode the auth part (especially the @ symbol in password)
                if ':' in auth_part:
                    username, password = auth_part.split(':', 1)
                    # URL encode the password
                    encoded_password = urllib.parse.quote(password, safe='')
                    encoded_auth = f"{username}:{encoded_password}"
                    redis_url = f"{scheme}{encoded_auth}@{host_part}"
                    print(f"🔐 Encoded Redis URL password")
        
        # Ensure it starts with valid scheme
        if not redis_url.startswith(('redis://', 'rediss://', 'unix://')):
            if '://' not in redis_url:
                redis_url = f"redis://{redis_url}"
            else:
                raise ValueError(f"Invalid Redis URL scheme: {redis_url}")
        
        print(f"📡 Using Redis URL: {redis_url[:50]}...")
        return redis_url
    
    def _get_redis_key(self, conversation_id: str, message_id: str = None) -> str:
        """Generate Redis key for chat history"""
        if message_id:
            return f"chat:history:{conversation_id}:{message_id}"
        return f"chat:history:{conversation_id}"
    
    def _get_user_specific_redis_key(self, website_id: str, user_id: str, message_id: str = None) -> str:
        """Generate user-specific Redis key for chat history (isolates users)"""
        if message_id:
            return f"chat:history:{website_id}:{user_id}:{message_id}"
        return f"chat:history:{website_id}:{user_id}"
    
    def _save_message_to_redis(self, conversation_id: str, message_data: Dict[str, Any]) -> str:
        """Save a single message to Redis"""
        try:
            # Generate message ID
            message_id = f"msg_{int(datetime.now().timestamp() * 1000)}_{hash(str(message_data)) % 10000}"
            key = self._get_redis_key(conversation_id, message_id)
            
            # Add timestamp if not present
            if 'timestamp' not in message_data:
                message_data['timestamp'] = datetime.now().isoformat()
            
            # Add epoch timestamp for sorting
            if 'metadata' not in message_data:
                message_data['metadata'] = {}
            message_data['metadata']['timestamp_epoch'] = datetime.now().timestamp()
            
            # Save to Redis with 30 day expiry
            self.redis_client.setex(
                key,
                2592000,  # 30 days in seconds
                json.dumps(message_data)
            )
            
            # Add to sorted set for ordering by timestamp
            sorted_set_key = f"chat:messages:{conversation_id}"
            self.redis_client.zadd(
                sorted_set_key,
                {message_id: message_data['metadata']['timestamp_epoch']}
            )
            
            # Set expiry on sorted set too
            self.redis_client.expire(sorted_set_key, 2592000)
            
            return message_id
            
        except Exception as e:
            print(f"❌ Error saving message to Redis: {e}")
            return None
    
    def _get_messages_from_redis(self, conversation_id: str, user_id: str = None, limit: int = 100, hours: int = 24) -> List[Dict[str, Any]]:
        """
        Get messages from Redis for the last specified hours, optionally filtered by user_id
        """
        try:
            sorted_set_key = f"chat:messages:{conversation_id}"
            
            # Calculate timestamp for X hours ago
            cutoff_time = datetime.now().timestamp() - (hours * 3600)
            
            # Get message IDs with score >= cutoff_time
            message_ids = self.redis_client.zrangebyscore(
                sorted_set_key, 
                cutoff_time, 
                '+inf', 
                start=0, 
                num=limit
            )
            
            messages = []
            for msg_id in message_ids:
                key = self._get_redis_key(conversation_id, msg_id)
                msg_json = self.redis_client.get(key)
                if msg_json:
                    try:
                        msg_data = json.loads(msg_json)
                        
                        # Filter by user_id if provided
                        if user_id:
                            msg_user_id = msg_data.get('user_id') or msg_data.get('metadata', {}).get('user_id')
                            if msg_user_id and msg_user_id != user_id:
                                continue
                        
                        messages.append(msg_data)
                    except json.JSONDecodeError:
                        continue
            
            user_filter_msg = f" for user {user_id}" if user_id else ""
            print(f"📊 Retrieved {len(messages)} messages from last {hours} hours{user_filter_msg}")
            return messages
            
        except Exception as e:
            print(f"❌ Error getting messages from Redis: {e}")
            return []
    
    def _clear_conversation_from_redis(self, conversation_id: str) -> bool:
        """Clear all messages for a conversation from Redis"""
        try:
            # Get all message keys for this conversation
            pattern = f"chat:history:{conversation_id}:*"
            keys = self.redis_client.keys(pattern)
            
            if keys:
                # Delete all message keys
                self.redis_client.delete(*keys)
            
            # Delete sorted set
            sorted_set_key = f"chat:messages:{conversation_id}"
            self.redis_client.delete(sorted_set_key)
            
            print(f"✅ Cleared conversation {conversation_id} from Redis")
            return True
            
        except Exception as e:
            print(f"❌ Error clearing conversation from Redis: {e}")
            return False

    # =========================
    # GRAPH
    # =========================

    def _build_graph(self):
        workflow = StateGraph(ChatState)

        workflow.add_node("retrieve_context", self.retrieve_context)
        workflow.add_node("check_context_sufficiency", self.check_context_sufficiency)
        workflow.add_node("generate_response", self.generate_response)
        workflow.add_node("search_external", self.search_external)
        workflow.add_node("generate_external_response", self.generate_external_response)

        # Set entry point
        workflow.set_entry_point("retrieve_context")
        
        # Main flow
        workflow.add_edge("retrieve_context", "check_context_sufficiency")
        
        # Decision: Check if context is sufficient
        workflow.add_conditional_edges(
            "check_context_sufficiency",
            self.decide_search_required,
            {
                "context_sufficient": "generate_response",
                "needs_search": "search_external"
            }
        )
        
        # External search flow
        workflow.add_edge("search_external", "generate_external_response")
        workflow.add_edge("generate_external_response", END)
        
        # Regular response flow
        workflow.add_edge("generate_response", END)

        # Compile with Redis checkpointer
        return workflow.compile(checkpointer=self.checkpointer)

    # =========================
    # NODES
    # =========================

    def retrieve_context(self, state: ChatState) -> Dict[str, Any]:
        try:
            from src.embedding_handler import EmbeddingHandler

            embedding_handler = EmbeddingHandler()

            # Get the latest user message
            last_user_message = ""
            for msg in reversed(state.messages):
                if isinstance(msg, HumanMessage):
                    last_user_message = msg.content
                    break
            
            context = []
            if last_user_message:
                print(f"🔍 Searching context for: {last_user_message[:50]}...")
                print(f"🔍 For website: {state.website_id} and user: {state.user_id}")
                
                # Check if this is a follow-up question asking about a previous list item
                is_follow_up, item_number, item_name = self._parse_follow_up_question(last_user_message, state.messages)
                
                if is_follow_up and item_name:
                    print(f"📝 Detected follow-up question about: {item_name}")
                    # Search specifically for this item
                    website_context = embedding_handler.search_similar_content(
                        website_id=state.website_id,
                        query=item_name,
                        top_k=5,
                    )
                    
                    # Also search in uploaded files
                    uploads_context = embedding_handler.search_uploaded_content(
                        website_id=state.website_id,
                        query=item_name,
                        top_k=3,
                    )
                else:
                    # Regular search with the original query
                    website_context = embedding_handler.search_similar_content(
                        website_id=state.website_id,
                        query=last_user_message,
                        top_k=5,
                    )
                    
                    # Also search in uploaded files
                    uploads_context = embedding_handler.search_uploaded_content(
                        website_id=state.website_id,
                        query=last_user_message,
                        top_k=3,
                    )
                
                # Combine contexts
                combined_context = website_context + uploads_context
                
                # Remove duplicates based on text similarity
                seen_texts = set()
                unique_context = []
                for item in combined_context:
                    text_hash = hash(item['text'][:100])
                    if text_hash not in seen_texts:
                        seen_texts.add(text_hash)
                        unique_context.append(item)
                
                # Sort by similarity score
                unique_context.sort(key=lambda x: x.get('similarity_score', 0), reverse=True)
                context = unique_context[:5]

            print(f"📚 Retrieved {len(context)} context items from website knowledge base")
            return {"context": context}
            
        except Exception as e:
            print(f"❌ Error in retrieve_context: {e}")
            print(traceback.format_exc())
            return {"context": []}

    def _parse_follow_up_question(self, query: str, messages: List[Any]) -> tuple:
        """
        Parse if the query is asking about a previous list item
        Returns: (is_follow_up, item_number, item_name)
        """
        query_lower = query.lower().strip()
        
        # Check for patterns like "explain fifth", "explain third", "tell me about number 5", etc.
        follow_up_patterns = [
            (r'explain\s+(?:the\s+)?(\w+)(?:\s+one)?', 'explain'),
            (r'tell\s+me\s+about\s+(?:the\s+)?(\w+)(?:\s+one)?', 'tell'),
            (r'what\s+about\s+(?:the\s+)?(\w+)(?:\s+one)?', 'what'),
            (r'describe\s+(?:the\s+)?(\w+)(?:\s+one)?', 'describe'),
            (r'number\s+(\d+)', 'number'),
            (r'item\s+(\d+)', 'item'),
        ]
        
        # Number words mapping
        number_words = {
            'first': 1, 'second': 2, 'third': 3, 'fourth': 4, 'fifth': 5,
            'sixth': 6, 'seventh': 7, 'eighth': 8, 'ninth': 9, 'tenth': 10,
            '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5,
            '6th': 6, '7th': 7, '8th': 8, '9th': 9, '10th': 10
        }
        
        # Check for follow-up patterns
        for pattern, pattern_type in follow_up_patterns:
            import re
            match = re.search(pattern, query_lower)
            if match:
                number_text = match.group(1)
                
                # Check if it's a number word
                if number_text in number_words:
                    item_number = number_words[number_text]
                # Check if it's a digit
                elif number_text.isdigit():
                    item_number = int(number_text)
                else:
                    continue
                
                # Get the last assistant message with a list
                last_list = self._extract_previous_list(messages)
                
                if last_list and item_number <= len(last_list):
                    # Extract the item name from the list
                    list_item = last_list[item_number - 1]
                    # Remove the number prefix (e.g., "5. Amino Acid & Chelates" -> "Amino Acid & Chelates")
                    if '. ' in list_item:
                        item_name = list_item.split('. ', 1)[1]
                    else:
                        item_name = list_item
                    
                    print(f"🔍 Follow-up detected: asking about item #{item_number}: {item_name}")
                    return True, item_number, item_name
        
        return False, None, None

    def check_context_sufficiency(self, state: ChatState) -> Dict[str, Any]:
        """
        Check if the retrieved context is sufficient to answer the question
        """
        try:
            # Get the latest user message
            last_user_message = ""
            for msg in reversed(state.messages):
                if isinstance(msg, HumanMessage):
                    last_user_message = msg.content
                    break
            
            if not last_user_message:
                return {"requires_search": False}
            
            # Check if we have any context
            if not state.context:
                print("⚠️ No context found, will search externally")
                return {"requires_search": True}
            
            # Analyze the query type
            requires_search = self._analyze_query_for_search(last_user_message, state.context)
            
            print(f"🔍 Context sufficiency check: search_required={requires_search}")
            return {"requires_search": requires_search}
            
        except Exception as e:
            print(f"❌ Error in check_context_sufficiency: {e}")
            return {"requires_search": True}

    def _format_conversation_history(self, messages: List[Any], user_id: str = None) -> str:
        """Format conversation history for better context"""
        formatted = []
        for i, msg in enumerate(messages):
            if isinstance(msg, HumanMessage):
                formatted.append(f"USER {i+1}: {msg.content}")
            elif isinstance(msg, AIMessage):
                # Truncate long responses for brevity
                content = msg.content[:200] + "..." if len(msg.content) > 200 else msg.content
                formatted.append(f"ASSISTANT {i+1}: {content}")
        
        if not formatted:
            return "No previous conversation in this session."
        
        # Add note about user isolation
        if user_id:
            header = f"CONVERSATION HISTORY FOR USER {user_id} (only this user's history):\n"
        else:
            header = "CONVERSATION HISTORY (current session only):\n"
        
        return header + "\n".join(formatted)

    def _extract_previous_list(self, messages: List[Any]) -> List[str]:
        """Extract the last numbered list from assistant messages"""
        for msg in reversed(messages):
            if isinstance(msg, AIMessage):
                lines = msg.content.split('\n')
                items = []
                for line in lines:
                    line = line.strip()
                    # Look for numbered items like "1. Something" or "1. Something"
                    if line and len(line) > 2 and line[0].isdigit() and '. ' in line:
                        # Extract just the item text without the number
                        parts = line.split('. ', 1)
                        if len(parts) > 1:
                            items.append(parts[1].strip())
                        else:
                            items.append(line)
                if items:
                    print(f"📋 Extracted list: {items}")
                    return items
        return []

    def _analyze_query_for_search(self, query: str, context: List[Dict[str, Any]]) -> bool:
        """
        Analyze if a query requires external search
        """
        # Convert context to text for analysis
        context_text = " ".join([c.get('text', '') for c in context])
        
        # Keywords that often require specific, factual answers
        fact_based_keywords = [
            'price', 'cost', 'fee', 'charge', 'rate', 'how much',
            'contact', 'phone', 'email', 'address', 'location',
            'schedule', 'timing', 'hours', 'opening', 'closing',
            'deadline', 'date', 'time',
            'specification', 'specs', 'technical', 'requirement',
            'compare', 'vs', 'versus', 'difference between',
            'latest', 'new', 'update', 'news', 'recent',
            'statistic', 'data', 'figure', 'percentage', 'ratio'
        ]
        
        # Check if query contains fact-based keywords
        query_lower = query.lower()
        has_fact_keywords = any(keyword in query_lower for keyword in fact_based_keywords)
        
        if not has_fact_keywords:
            return False
        
        # Check if context contains relevant information for fact-based queries
        for keyword in fact_based_keywords:
            if keyword in query_lower and keyword not in context_text.lower():
                print(f"⚠️ Missing fact-based info for keyword: {keyword}")
                return True
        
        # Check similarity scores - if all are low, might need search
        low_similarity_count = sum(1 for c in context if c.get('similarity_score', 0) < 0.3)
        if low_similarity_count >= 3:
            print(f"⚠️ Low similarity scores detected: {low_similarity_count} items < 0.3")
            return True
        
        return False

    def decide_search_required(self, state: ChatState) -> str:
        """
        Decision function for conditional edge
        """
        if state.requires_search:
            print("🔀 Decision: Needs external search")
            return "needs_search"
        else:
            print("🔀 Decision: Context sufficient")
            return "context_sufficient"

    def search_external(self, state: ChatState) -> Dict[str, Any]:
        """
        Perform external search using DuckDuckGo
        """
        try:
            # Get the latest user message
            last_user_message = ""
            for msg in reversed(state.messages):
                if isinstance(msg, HumanMessage):
                    last_user_message = msg.content
                    break
            
            if not last_user_message:
                return {"search_results": [], "fallback_triggered": True}
            
            print(f"🌐 Performing external search for: {last_user_message}")
            
            # Perform search
            search_results = self.searcher.search(last_user_message)
            
            # Extract relevant information
            search_summary = self.searcher.extract_relevant_info(search_results, last_user_message)
            
            # Store search results in context
            enhanced_context = state.context.copy()
            if search_summary:
                enhanced_context.append({
                    'text': search_summary,
                    'metadata': {
                        'title': 'External Search Results',
                        'type': 'external_search',
                        'source': 'duckduckgo'
                    },
                    'similarity_score': 1.0
                })
            
            print(f"✅ External search completed: {len(search_results)} results found")
            return {
                "search_results": search_results,
                "context": enhanced_context,
                "fallback_triggered": True
            }
            
        except Exception as e:
            print(f"❌ Error in search_external: {e}")
            print(traceback.format_exc())
            return {"search_results": [], "fallback_triggered": True}

    def generate_response(self, state: ChatState) -> Dict[str, Any]:
        """
        Generate response using only website context
        """
        return self._generate_response_internal(state, use_external=False)

    def generate_external_response(self, state: ChatState) -> Dict[str, Any]:
        """
        Generate response using both website context and external search results
        """
        return self._generate_response_internal(state, use_external=True)

    def _is_follow_up_question(self, messages: List[Any]) -> bool:
        """Check if current question is a follow-up to previous conversation"""
        human_messages = [msg for msg in messages if isinstance(msg, HumanMessage)]
        return len(human_messages) > 1

    def _generate_response_internal(self, state: ChatState, use_external: bool = False) -> Dict[str, Any]:
        """
        Internal method to generate response with or without external search
        NOW WITH PROPER USER ISOLATION - only shows current user's conversation history
        """
        try:
            # Build context text from retrieved documents (from knowledge base, NOT user history)
            if state.context:
                context_text = "\n\n".join(
                    f"Source: {c['metadata'].get('title', 'Unknown')} "
                    f"(Type: {c['metadata'].get('type', 'website')})\n"
                    f"Content: {c['text']}"
                    for c in state.context[:5]
                )
            else:
                context_text = "No specific context found from the website."

            # Create personalized greeting if user info is available
            user_greeting = ""
            if state.user_info:
                full_name = state.user_info.get('full_name', '')
                if full_name:
                    user_greeting = f"\nUSER INFORMATION:\n- Name: {full_name}\n- Email: {state.user_info.get('email', 'Not provided')}\n- Mobile: {state.user_info.get('mobile', 'Not provided')}\n"

            # Format conversation history
            conversation_history_text = self._format_conversation_history(
                state.messages, 
                user_id=state.user_id or state.session_id
            )

            # Extract the last assistant message with a numbered list
            last_assistant_list = self._extract_previous_list(state.messages)
            last_assistant_list_text = ""
            if last_assistant_list:
                last_assistant_list_text = "\n\nYOUR LAST RESPONSE WITH LIST:\n"
                for i, item in enumerate(last_assistant_list, 1):
                    last_assistant_list_text += f"{i}. {item}\n"

            # Get the latest user message
            last_user_message = ""
            for msg in reversed(state.messages):
                if isinstance(msg, HumanMessage):
                    last_user_message = msg.content
                    break
            
            # Parse if this is a follow-up question
            is_follow_up, item_number, item_name = self._parse_follow_up_question(last_user_message, state.messages)
            
            follow_up_instruction = ""
            if is_follow_up and item_name:
                follow_up_instruction = f"""
    CRITICAL: The user is asking about item #{item_number}: "{item_name}" from your previous list.
    You MUST provide detailed information about "{item_name}" using the WEBSITE CONTEXT below.
    If the website context contains information about "{item_name}", provide that information.
    If the website context doesn't have specific details, explain what "{item_name}" typically means in this context.
    """

            # Create system message with context and full conversation history
            system_message_content = f"""
    You are a helpful AI assistant for our company website.

    Your role is to answer user questions using:
    - WEBSITE CONTEXT (knowledge base for website: {state.website_id})
    - CURRENT USER'S CONVERSATION HISTORY ONLY
    {'**INCLUDING EXTERNAL SEARCH RESULTS WHEN AVAILABLE**' if use_external else ''}

    WEBSITE CONTEXT (knowledge base):
    {context_text}
    {user_greeting}

    CURRENT USER'S CONVERSATION HISTORY (only this user's previous messages):
    {conversation_history_text}
    {last_assistant_list_text}

    {follow_up_instruction}

    IMPORTANT RULES FOR FOLLOW-UP QUESTIONS:
    1. When a user asks "explain fifth", "explain third", "tell me about number 5", etc., they are referring to items in YOUR PREVIOUS RESPONSE in THIS conversation.
    2. Look at YOUR LAST RESPONSE above - it contains a numbered list.
    3. Identify which item they're asking about based on the number.
    4. Provide DETAILED information about THAT SPECIFIC ITEM using the WEBSITE CONTEXT.
    5. DO NOT say "I cannot provide specific details" - instead, use the website context to explain the item.
    6. If the website context has information, use it. If not, explain what the item typically means based on general knowledge.
    7. If the requested information EXISTS in the WEBSITE CONTEXT, you MUST display it directly in this chat. Never say "I cannot display" or redirect to the website.
    8. If job openings, services, products, roles, or any data exist in context — list them clearly in chat.
    
    EXAMPLES:
    - User: "explain third" → You explain item #3 from your previous list
    - User: "tell me about number 5" → You explain item #5 from your previous list
    - User: "what about the second one?" → You explain item #2 from your previous list

    CRITICAL: You MUST pay attention to the conversation flow. The user is asking about something you just mentioned in your previous response.

    RESPONSE STYLE:
    - Use short sentences and simple language.
    - Avoid unnecessary formatting like "<>" or other special characters.
    - NEVER use "<>" in your responses.
    - Keep a professional and helpful tone.
    
    STRICT RESPONSE CONTROL:
    - Never repeat or restate the user’s message.
    - Never summarize what the user just said.
    - Do not start with phrases like "You want" or "You are looking for".
    - Keep the total response under 300 characters.
    - Provide direct confirmation and short value-based explanation.
    - If no more features are added, move toward enquiry suggestion.
    
    ADDITIONAL RESPONSE RULES:
    - Do NOT repeat or rephrase the user's message in your response.
    - Do NOT start responses with phrases like "You want..." or "You are looking for..."
    - Provide direct answers without restating the question.
    - Ask only 1–2 basic requirement questions if necessary.
    - Avoid deep technical or multiple layered questions.
    - Keep responses short, clear, and professional.
    - Speak like a human customer support executive.

    ENQUIRY FORM DECISION LOGIC:
    - Suggest the enquiry form when:
    1. The user wants to build a project/system/service.
    2. Detailed requirements are needed to proceed.
    3. Business discussion or quotation is required.
    - Do NOT overuse the enquiry form.
    - When suggesting it, say politely:
    "For detailed discussion, please fill out the enquiry form and our team will contact you shortly."
    - Always assume the enquiry form button is visible when you suggest it.
    - Do NOT say "Click the button below" unless the UI actually shows it.
    - When requirements are finalized, suggest the enquiry form briefly.
    - Keep the full response within 300 characters.
    - Do not repeat listed features before suggesting the enquiry form.
    - Use one short professional sentence to suggest it.
    
    LANGUAGE SUPPORT RULES:
    - Detect the user’s intended language automatically.
    - If the user types in proper English grammar → Respond in English.
    - If the user types English words but meaning is Hindi → Respond in Hindi.
    - If the user types English words but meaning is Marathi → Respond in Marathi.
    - If user clearly writes in Hindi → Respond in Hindi.
    - If user clearly writes in Marathi → Respond in Marathi.
    - Always reply in only ONE language.
    - Do not mix languages in one response.
    
    ENQUIRY FORM RESPONSE (Language Based):

    English:
    - "For detailed discussion, please fill out the enquiry form and our team will contact you shortly."

    Hindi (Devanagari):
    - "विस्तृत चर्चा के लिए कृपया Enquiry form भरें, हमारी टीम आपसे शीघ्र संपर्क करेगी।"

    Hindi (English typed):
    - "Vistrit charcha ke liye kripya Enquiry form bharein, hamari team aapse sheeghra sampark karegi."

    Marathi (Devanagari):
    - "सविस्तर चर्चेसाठी कृपया Enquiry form भरा, आमची टीम लवकरच तुमच्याशी संपर्क साधेल."

    Marathi (English typed):
    - "Savistar charchesathi krupaya Enquiry form bhara, aamchi team lavkarach tumchyashi sampark sadhel."

    Rule:
    Respond in only ONE language. Do not mix languages in a single response.
    """

            # Get all messages for the conversation (already filtered to current user)
            all_messages = state.messages
            
            # Debug: Print message count and user isolation info
            print(f"📨 Processing {len(all_messages)} messages in history for user: {state.user_id or state.session_id}")
            print(f"🔒 User isolation: Only showing this user's conversation history")
            if is_follow_up:
                print(f"🎯 Follow-up detected: explaining item #{item_number}: {item_name}")
            
            # Create a new messages list starting with system message
            messages_for_llm = [SystemMessage(content=system_message_content)] + all_messages

            # Debug: Print what we're sending to LLM
            print(f"🤖 Sending to LLM: {len(messages_for_llm)} total messages")
            
            # Invoke the LLM with all messages
            try:
                response = self.llm.invoke(messages_for_llm)
                response_text = response.content
                
                # Clean response - remove any unwanted prefixes or special characters
                response_text = response_text.strip()
                
                # Remove any unwanted prefixes
                unwanted_prefixes = [
                    "[Using external sources]",
                    "[External Sources]",
                    "[External Info]",
                    "[Search Results]",
                    "[From external search]:",
                    "Based on external search:",
                ]
                
                for prefix in unwanted_prefixes:
                    if response_text.startswith(prefix):
                        response_text = response_text[len(prefix):].strip()
                
                # Remove any "<>" or similar special characters
                response_text = response_text.replace("<>", "").strip()
                
                # If response still contains the "cannot provide specific details" message, try one more time
                if "cannot provide specific details" in response_text.lower() and is_follow_up:
                    print("⚠️ Detected 'cannot provide' response for follow-up, providing fallback")
                    response_text = f"Regarding {item_name}: Based on the information available, this is a specialized product in our portfolio. For detailed specifications, pricing, or technical information, please fill out our enquiry form and our team will assist you."
                
                print(f"✅ LLM response generated: {len(response_text)} chars")
            except Exception as e:
                print(f"❌ Error generating LLM response: {e}")
                if is_follow_up and item_name:
                    response_text = f"I apologize, but I'm having trouble accessing detailed information about {item_name} right now. Please fill out our enquiry form and our team will provide you with complete details."
                else:
                    response_text = "Something went wrong, please try again later."

            # Return the response
            return {"response": response_text, "messages": [AIMessage(content=response_text)]}
            
        except Exception as e:
            print(f"❌ Error in generate_response: {e}")
            print(traceback.format_exc())
            error_text = "I apologize, but I encountered an error while processing your request."
            return {"response": error_text, "messages": [AIMessage(content=error_text)]}

    # =========================
    # PUBLIC API (FASTAPI CALL)
    # =========================

    async def chat(
        self,
        question: str,
        website_id: str,
        conversation_id: str = None,
        user_info: Dict[str, str] = None,
        session_id: str = None,
    ) -> str:
        """Main chat method - this is what FastAPI calls"""
        print(f"\n💬 Chat request for website: {website_id}, question: {question[:50]}...")
        
        # Generate conversation ID if not provided
        if not conversation_id:
            conversation_id = f"conv_{int(datetime.now().timestamp())}"
            print(f"📝 Generated new conversation_id: {conversation_id}")
        
        # Extract user_id from user_info if available
        user_id = None
        if user_info and 'id' in user_info:
            user_id = user_info['id']
        elif user_info and 'user_id' in user_info:
            user_id = user_info['user_id']
        
        print(f"👤 User ID for this conversation: {user_id}")
        print(f"🔒 User isolation: Messages will be saved with user_id: {user_id}")
        
        config = {
            "configurable": {"thread_id": conversation_id},
            "metadata": {
                "thread_id": conversation_id
            },
            "run_name": "chat_turn",
        }
        
        try:
            # Save user message to Redis FIRST
            user_message_data = {
                'website_id': website_id,
                'conversation_id': conversation_id,
                'session_id': session_id,
                'user_id': user_id,  # Store user_id
                'user_name': user_info.get('full_name', '') if user_info else '',
                'user_email': user_info.get('email', '') if user_info else '',
                'role': 'user',
                'content': question,
                'message': question,
                'metadata': {
                    'timestamp': datetime.now().isoformat(),
                    'user_info': user_info if user_info else {},
                    'user_id': user_id  # Store in metadata too
                }
            }
            user_message_id = self._save_message_to_redis(conversation_id, user_message_data)
            print(f"💾 Saved user message to Redis (ID: {user_message_id})")
            
            # Load previous conversation history from Redis - only last 24 hours
            redis_messages = self._get_messages_from_redis(conversation_id, hours=24)
            
            # Convert Redis messages to LangChain message objects
            all_messages = []
            for msg in redis_messages:
                if msg.get('role') == 'user':
                    all_messages.append(HumanMessage(content=msg.get('content', msg.get('message', ''))))
                elif msg.get('role') == 'assistant':
                    all_messages.append(AIMessage(content=msg.get('content', msg.get('message', ''))))
            
            # Add the new question
            all_messages.append(HumanMessage(content=question))
            
            print(f"📜 Loaded {len(all_messages)} messages from Redis history for conversation: {conversation_id}")
            print(f"🔒 These messages are isolated to this specific user session")
            
            # Create initial state with full conversation history
            initial_state = ChatState(
                messages=all_messages,
                website_id=website_id,
                conversation_id=conversation_id,
                user_id=user_id,  # Pass user_id to state
                user_info=user_info,
                session_id=session_id
            )

            print(f"🔧 Invoking graph with config: {config}")
            
            # Invoke the graph
            result = await self.graph.ainvoke(
                initial_state,
                config=config,
            )
            
            response_text = result.get("response", "Sorry, I couldn't generate a response.")
            
            # Add metadata about search if used
            if result.get("fallback_triggered", False):
                print("✅ Used external search fallback")
            
            print(f"✅ Chat response generated ({len(response_text)} chars)")
            print(f"📄 Response: {response_text[:100]}...")
            
            # Save bot response to Redis
            bot_message_data = {
                'website_id': website_id,
                'conversation_id': conversation_id,
                'session_id': session_id,
                'user_id': user_id,  # Store user_id
                'user_name': user_info.get('full_name', '') if user_info else '',
                'user_email': user_info.get('email', '') if user_info else '',
                'role': 'assistant',
                'content': response_text,
                'message': response_text,
                'metadata': {
                    'timestamp': datetime.now().isoformat(),
                    'response_length': len(response_text),
                    'user_message_id': user_message_id,
                    'used_external_search': result.get("fallback_triggered", False),
                    'search_results_count': len(result.get("search_results", [])),
                    'user_id': user_id  # Store in metadata too
                }
            }
            bot_message_id = self._save_message_to_redis(conversation_id, bot_message_data)
            print(f"💾 Saved bot response to Redis (ID: {bot_message_id})")
            
            # Also save to PostgreSQL for reporting/backup
            try:
                # Save user message to PostgreSQL
                pg_user_data = {
                    'website_id': website_id,
                    'conversation_id': conversation_id,
                    'session_id': session_id,
                    'user_id': user_id,  # Add user_id
                    'user_name': user_info.get('full_name', '') if user_info else '',
                    'user_email': user_info.get('email', '') if user_info else '',
                    'role': 'user',
                    'message': question,
                    'metadata': {
                        'source': 'postgres_backup',
                        'user_id': user_id
                    }
                }
                db_manager.save_chat_message(pg_user_data)
                
                # Save bot response to PostgreSQL
                pg_bot_data = {
                    'website_id': website_id,
                    'conversation_id': conversation_id,
                    'session_id': session_id,
                    'user_id': user_id,  # Add user_id
                    'user_name': user_info.get('full_name', '') if user_info else '',
                    'user_email': user_info.get('email', '') if user_info else '',
                    'role': 'assistant',
                    'message': response_text,
                    'metadata': {
                        'source': 'postgres_backup',
                        'user_id': user_id
                    }
                }
                db_manager.save_chat_message(pg_bot_data)
                print(f"💾 Also saved to PostgreSQL as backup with user isolation")
            except Exception as pg_error:
                print(f"⚠️ Failed to save to PostgreSQL: {pg_error}")
            
            # Track tokens
            try:
                token_data = token_counter.track_chat_tokens(
                    website_id=website_id,
                    user_id=user_id,
                    input_text=question,
                    output_text=response_text,
                    model="gemini-2.5-flash",
                    metadata={
                        'conversation_id': conversation_id,
                        'session_id': session_id,
                        'user_message_id': user_message_id,
                        'bot_message_id': bot_message_id
                    }
                )
                print(f"💰 Token tracking: {token_data}")
            except Exception as token_error:
                print(f"⚠️ Token tracking error: {token_error}")
            
            return response_text
            
        except Exception as e:
            print(f"\n❌❌❌ ERROR in chat method: {str(e)}")
            print(f"📋 Error type: {type(e).__name__}")
            print(f"📝 Traceback:")
            print(traceback.format_exc())
            
            # Save error to Redis
            if session_id or conversation_id:
                try:
                    error_message_data = {
                        'website_id': website_id,
                        'conversation_id': conversation_id,
                        'session_id': session_id,
                        'user_id': user_id,
                        'role': 'system',
                        'content': f"Error: {str(e)}",
                        'message': f"Error: {str(e)}",
                        'metadata': {
                            'error': True,
                            'timestamp': datetime.now().isoformat(),
                            'question': question,
                            'error_type': type(e).__name__,
                            'user_id': user_id
                        }
                    }
                    self._save_message_to_redis(conversation_id, error_message_data)
                except Exception as redis_error:
                    print(f"❌ Failed to save error to Redis: {redis_error}")
            
            return "I'm sorry, I encountered an error while processing your request. Please try again."

    # =========================
    # CONVERSATION MANAGEMENT
    # =========================

    async def get_conversation_history(self, conversation_id: str) -> List[Dict[str, str]]:
        """Get the full conversation history for a thread"""
        try:
            # Get from Redis first
            redis_messages = self._get_messages_from_redis(conversation_id)
            
            if redis_messages:
                formatted = []
                for msg in redis_messages:
                    formatted.append({
                        "role": msg.get('role', 'user'),
                        "content": msg.get('content', msg.get('message', '')),
                        "timestamp": msg.get('metadata', {}).get('timestamp', msg.get('timestamp')),
                        "user_id": msg.get('user_id')
                    })
                return formatted
            
            # Fallback to PostgreSQL
            return await self._get_history_from_database(conversation_id)
            
        except Exception as e:
            print(f"Error getting conversation history: {e}")
            return await self._get_history_from_database(conversation_id)
    
    async def _get_history_from_database(self, conversation_id: str) -> List[Dict[str, str]]:
        """Get conversation history from PostgreSQL (fallback)"""
        try:
            chat_history = db_manager.get_chat_history(
                website_id=None, 
                conversation_id=conversation_id,
                limit=100
            )
            formatted = []
            for chat in chat_history:
                formatted.append({
                    "role": chat.get('role', 'user'),
                    "content": chat.get('message', ''),
                    "timestamp": chat.get('created_at'),
                    "user_id": chat.get('user_id')
                })
            return formatted
        except Exception as e:
            print(f"Error getting conversation history from database: {e}")
            return []

    async def clear_conversation(self, conversation_id: str) -> bool:
        """Clear conversation history for a thread"""
        try:
            # Clear from Redis history
            redis_success = self._clear_conversation_from_redis(conversation_id)
            
            # Also clear from Redis checkpoint using the checkpointer
            if self.checkpointer:
                try:
                    config = {
                        "configurable": {"thread_id": conversation_id}
                    }
                    await self.checkpointer.adelete(config)
                    print(f"✅ Cleared conversation {conversation_id} from Redis checkpoint")
                except Exception as cp_error:
                    print(f"⚠️ Error clearing checkpoint: {cp_error}")
            
            # Also clear from PostgreSQL
            try:
                conn = db_manager.get_connection()
                cursor = conn.cursor()
                cursor.execute("DELETE FROM chat_history WHERE conversation_id = %s", (conversation_id,))
                conn.commit()
                cursor.close()
                print(f"✅ Cleared conversation {conversation_id} from PostgreSQL")
            except Exception as db_error:
                print(f"⚠️ Error clearing from PostgreSQL: {db_error}")
            
            return redis_success
        except Exception as e:
            print(f"Error clearing conversation: {e}")
            return False

    async def send_chat_report(self, website_id: str, conversation_id: str):
        """Send chat history report to admin"""
        try:
            # Get chat history from Redis
            redis_messages = self._get_messages_from_redis(conversation_id)
            
            if redis_messages:
                # Format for email
                formatted_history = []
                for msg in redis_messages:
                    formatted_history.append({
                        'role': msg.get('role', 'user'),
                        'message': msg.get('content', msg.get('message', '')),
                        'created_at': msg.get('metadata', {}).get('timestamp', datetime.now().isoformat()),
                        'user_id': msg.get('user_id')
                    })
                
                # Send email
                success = email_service.send_chat_history_email(
                    website_id,
                    conversation_id,
                    formatted_history
                )
                
                if success:
                    print(f"✅ Chat report sent for conversation {conversation_id}")
                    return success
            
            # Fallback to PostgreSQL
            chat_history = db_manager.get_full_conversation(conversation_id)
            
            if not chat_history:
                print(f"No chat history found for conversation {conversation_id}")
                return False
            
            # Format chat history for email
            formatted_history = []
            for chat in chat_history:
                formatted_history.append({
                    'role': chat['role'],
                    'message': chat['message'],
                    'created_at': chat['created_at'].strftime('%Y-%m-%d %H:%M:%S') if chat['created_at'] else '',
                    'user_id': chat.get('user_id')
                })
            
            # Send email with PDF attachment
            success = email_service.send_chat_history_email(
                website_id,
                conversation_id,
                formatted_history
            )
            
            if success:
                print(f"✅ Chat report sent for conversation {conversation_id}")
            else:
                print(f"❌ Failed to send chat report for conversation {conversation_id}")
            
            return success
            
        except Exception as e:
            print(f"❌ Error sending chat report: {e}")
            return False