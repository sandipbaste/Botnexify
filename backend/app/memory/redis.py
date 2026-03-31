# app/memory/redis.py
import os
import json
import urllib.parse
import asyncio
from typing import List, Dict, Any, Optional, Tuple, AsyncIterator
from datetime import datetime
from functools import partial

import redis
from langgraph.checkpoint.redis import RedisSaver
from langgraph.checkpoint.base import BaseCheckpointSaver, Checkpoint, CheckpointMetadata, CheckpointTuple

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
            conn_kwargs = self.redis_client.connection_pool.connection_kwargs
            
            if hasattr(RedisSaver, 'from_conn_string'):
                scheme = "rediss" if conn_kwargs.get("ssl") else "redis"
                if conn_kwargs.get('password'):
                    redis_url = f"{scheme}://:{conn_kwargs.get('password')}@{conn_kwargs.get('host','localhost')}:{conn_kwargs.get('port',6379)}/1"
                else:
                    redis_url = f"{scheme}://{conn_kwargs.get('host','localhost')}:{conn_kwargs.get('port',6379)}/1"
                self._saver = RedisSaver.from_conn_string(os.getenv("REDIS_URL"))
            else:
                self._saver = RedisSaver(
                    host=conn_kwargs.get('host', 'localhost'),
                    port=conn_kwargs.get('port', 6379),
                    db=1,
                    password=conn_kwargs.get('password'),
                    username=conn_kwargs.get('username'),
                    ssl=True
                )
            print(" RedisSaver initialized successfully")
        except Exception as e:
            print(f" RedisSaver initialization error: {e}")
            self._saver = None
    
    def get_next_version(self, current_version: Optional[int], channel: str) -> int:
        if self._saver and hasattr(self._saver, 'get_next_version'):
            return self._saver.get_next_version(current_version, channel)
        if current_version is None:
            return 1
        return current_version + 1
    
    def put(self, config: Dict, checkpoint: Checkpoint, metadata: CheckpointMetadata, new_versions: Dict[str, int]) -> None:
        if self._saver and hasattr(self._saver, 'put'):
            return self._saver.put(config, checkpoint, metadata, new_versions)
        return None
    
    async def aput(self, config: Dict, checkpoint: Checkpoint, metadata: CheckpointMetadata, new_versions: Dict[str, int]) -> None:
        if self._saver and hasattr(self._saver, 'aput'):
            return await self._saver.aput(config, checkpoint, metadata, new_versions)
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, 
            partial(self.put, config, checkpoint, metadata, new_versions)
        )
    
    def put_writes(self, config: Dict, writes: List[Tuple[str, Any]], task_id: str) -> None:
        if self._saver and hasattr(self._saver, 'put_writes'):
            return self._saver.put_writes(config, writes, task_id)
        return None
    
    async def aput_writes(self, config: Dict, writes: List[Tuple[str, Any]], task_id: str) -> None:
        if self._saver and hasattr(self._saver, 'aput_writes'):
            return await self._saver.aput_writes(config, writes, task_id)
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, 
            partial(self.put_writes, config, writes, task_id)
        )
    
    def get_tuple(self, config: Dict) -> Optional[CheckpointTuple]:
        if self._saver and hasattr(self._saver, 'get_tuple'):
            return self._saver.get_tuple(config)
        return None
    
    async def aget_tuple(self, config: Dict) -> Optional[CheckpointTuple]:
        if self._saver and hasattr(self._saver, 'aget_tuple'):
            return await self._saver.aget_tuple(config)
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, partial(self.get_tuple, config))
    
    def list(self, config: Dict, limit: Optional[int] = None, before: Optional[Dict] = None) -> List[CheckpointTuple]:
        if self._saver and hasattr(self._saver, 'list'):
            return self._saver.list(config, limit, before)
        return []
    
    async def alist(self, config: Dict, limit: Optional[int] = None, before: Optional[Dict] = None) -> AsyncIterator[CheckpointTuple]:
        if self._saver and hasattr(self._saver, 'alist'):
            async for item in self._saver.alist(config, limit, before):
                yield item
        else:
            items = self.list(config, limit, before)
            for item in items:
                yield item
    
    def delete(self, config: Dict) -> None:
        if self._saver and hasattr(self._saver, 'delete'):
            return self._saver.delete(config)
        return None
    
    async def adelete(self, config: Dict) -> None:
        if self._saver and hasattr(self._saver, 'adelete'):
            return await self._saver.adelete(config)
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, partial(self.delete, config))


class RedisMemory:
    """Redis operations for chat history management"""
    
    def __init__(self, redis_client):
        self.redis_client = redis_client
    
    @staticmethod
    def normalize_url(redis_url: str) -> str:
        """Normalize Redis URL to handle special characters in password"""
        redis_url = redis_url.strip()
        
        if '@' in redis_url and '://' in redis_url:
            if redis_url.startswith('redis://'):
                scheme = 'redis://'
                rest = redis_url[8:]
            elif redis_url.startswith('rediss://'):
                scheme = 'rediss://'
                rest = redis_url[9:]
            else:
                return redis_url
            
            if '@' in rest:
                auth_part, host_part = rest.split('@', 1)
                if ':' in auth_part:
                    username, password = auth_part.split(':', 1)
                    encoded_password = urllib.parse.quote(password, safe='')
                    encoded_auth = f"{username}:{encoded_password}"
                    redis_url = f"{scheme}{encoded_auth}@{host_part}"
                    print(f" Encoded Redis URL password")
        
        if not redis_url.startswith(('redis://', 'rediss://', 'unix://')):
            if '://' not in redis_url:
                redis_url = f"redis://{redis_url}"
            else:
                raise ValueError(f"Invalid Redis URL scheme: {redis_url}")

        safe_url = redis_url.split("@")[-1]
        print(f"Using Redis URL host: {safe_url}")
        return redis_url
    
    @staticmethod
    def init_redis_client(redis_url: str):
        """Initialize Redis client"""
        normalized_url = RedisMemory.normalize_url(redis_url)
        redis_client = redis.from_url(
            normalized_url,
            decode_responses=True
        )
        redis_client.ping()
        print("Redis connected successfully")
        return redis_client
    
    def _get_redis_key(self, website_id: str, conversation_id: str, message_id: str = None) -> str:
        if message_id:
            return f"chat:history:{website_id}:{conversation_id}:{message_id}"
        return f"chat:history:{conversation_id}"
    
    def save_message(self, website_id: str, conversation_id: str, message_data: Dict[str, Any]) -> str:
        """Save a single message to Redis"""
        try:
            message_id = f"msg_{int(datetime.now().timestamp() * 1000)}_{hash(str(message_data)) % 10000}"
            key = self._get_redis_key(website_id, conversation_id, message_id)
            
            if 'timestamp' not in message_data:
                message_data['timestamp'] = datetime.now().isoformat()
            
            if 'metadata' not in message_data:
                message_data['metadata'] = {}
            message_data['metadata']['timestamp_epoch'] = datetime.now().timestamp()
            
            self.redis_client.setex(
                key,
                2592000,
                json.dumps(message_data)
            )
            
            sorted_set_key = f"chat:messages:{conversation_id}"
            self.redis_client.zadd(
                sorted_set_key,
                {message_id: message_data['metadata']['timestamp_epoch']}
            )
            self.redis_client.expire(sorted_set_key, 2592000)
            
            return message_id
            
        except Exception as e:
            print(f"  Error saving message to Redis: {e}")
            return None
    
    def get_conversation_summary(self, conversation_id: str) -> str:
        """Get conversation summary from Redis"""
        try:
            key = f"chat:summary:{conversation_id}"
            summary = self.redis_client.get(key)
            return summary if summary else ""
        except Exception as e:
            print(f"Error getting summary: {e}")
            return ""
    
    def save_conversation_summary(self, conversation_id: str, summary: str) -> bool:
        """Save conversation summary to Redis"""
        try:
            key = f"chat:summary:{conversation_id}"
            self.redis_client.setex(key, 2592000, summary)  # 30 days expiry
            return True
        except Exception as e:
            print(f"Error saving summary: {e}")
            return False
    
    def get_message_count(self, conversation_id: str) -> int:
        """Get total message count for a conversation"""
        try:
            sorted_set_key = f"chat:messages:{conversation_id}"
            return self.redis_client.zcard(sorted_set_key)
        except Exception as e:
            print(f"Error getting message count: {e}")
            return 0
    
    def get_recent_messages(
        self,
        website_id: str,
        conversation_id: str,
        user_id: str = None,
        limit: int = 30
    ) -> List[Dict]:
        """Get only recent messages (bypasses summary)"""
        try:
            sorted_set_key = f"chat:messages:{conversation_id}"
            message_ids = self.redis_client.zrevrange(
                sorted_set_key,
                0,
                limit - 1
            )
            
            pipe = self.redis_client.pipeline(transaction=False)
            for msg_id in message_ids:
                key = self._get_redis_key(website_id, conversation_id, msg_id)
                pipe.get(key)
            
            results = pipe.execute()
            messages = []
            
            for msg_json in results:
                if msg_json:
                    try:
                        msg_data = json.loads(msg_json)
                        if user_id:
                            msg_user_id = msg_data.get('user_id') or msg_data.get('metadata', {}).get('user_id')
                            if msg_user_id and msg_user_id != user_id:
                                continue
                        messages.append(msg_data)
                    except json.JSONDecodeError:
                        continue
            
            # Sort by timestamp ascending
            messages.sort(key=lambda x: x.get("metadata", {}).get("timestamp_epoch", 0))
            
            return messages
            
        except Exception as e:
            print(f"Error getting recent messages: {e}")
            return []
    
    def get_messages(self, website_id: str, conversation_id: str, user_id: str = None, limit: int = 30, hours: int = 24):
        """Get messages from Redis for the last specified hours, optionally filtered by user_id"""
        try:
            sorted_set_key = f"chat:messages:{conversation_id}"
            cutoff_time = datetime.now().timestamp() - (hours * 3600)
            
            message_ids = self.redis_client.zrevrangebyscore(
                sorted_set_key,
                '+inf',
                cutoff_time,
                start=0,
                num=limit
            )
            
            pipe = self.redis_client.pipeline(transaction=False)
            for msg_id in message_ids:
                key = self._get_redis_key(website_id, conversation_id, msg_id)
                pipe.get(key)
            
            results = pipe.execute()
            messages = []
            
            for msg_json in results:
                if msg_json:
                    try:
                        msg_data = json.loads(msg_json)
                        if user_id:
                            msg_user_id = msg_data.get('user_id') or msg_data.get('metadata', {}).get('user_id')
                            if msg_user_id and msg_user_id != user_id:
                                continue
                        messages.append(msg_data)
                    except json.JSONDecodeError:
                        continue
            
            messages.sort(key=lambda x: x.get("metadata", {}).get("timestamp_epoch", 0))
            
            user_filter_msg = f" for user {user_id}" if user_id else ""
            print(f" Retrieved {len(messages)} messages from last {hours} hours{user_filter_msg}")
            
            return messages
            
        except Exception as e:
            print(f"  Error getting messages from Redis: {e}")
            return []
    
    def clear_conversation(self, conversation_id: str) -> bool:
        """Clear all messages for a conversation from Redis"""
        try:
            pipe = self.redis_client.pipeline(transaction=False)
            for key in self.redis_client.scan_iter(f"chat:history:*:{conversation_id}:*"):
                pipe.delete(key)
            pipe.delete(f"chat:messages:{conversation_id}")
            pipe.execute()
            print(f" Cleared conversation {conversation_id} from Redis")
            return True
        except Exception as e:
            print(f" Error clearing conversation from Redis: {e}")
            return False