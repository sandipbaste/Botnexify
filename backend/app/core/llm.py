# app/core/llm.py
import os
from langchain_google_genai import ChatGoogleGenerativeAI

class LLMManager:
    """Manages LLM initialization and interactions"""
    
    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY not found in environment variables")
        
        self.llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=api_key,
            temperature=0.3,
            max_output_tokens=300,
        )
    
    async def generate_response(self, messages):
        """Generate response from LLM"""
        try:
            response = await self.llm.ainvoke(messages)
            return response.content.strip()
        except Exception as e:
            print("LLM error:", e)
            raise