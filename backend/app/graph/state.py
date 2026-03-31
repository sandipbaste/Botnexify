# app/graph/state.py (UPDATED)
from typing import List, Dict, Any, Optional, Annotated
from pydantic import BaseModel, Field
from langgraph.graph.message import add_messages

class ChatState(BaseModel):
    """State for the chat conversation graph"""
    messages: Annotated[List[Any], add_messages]
    website_id: str
    conversation_id: str
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    context: List[Dict[str, Any]] = Field(default_factory=list)
    response: Optional[str] = None
    user_info: Optional[Dict[str, str]] = None
    summary: Optional[str] = Field(default="")  # summary field