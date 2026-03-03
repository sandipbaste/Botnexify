# create_cleanup.py
import asyncio
from datetime import datetime, timedelta
import os
import json

async def cleanup_old_sessions():
    """Clean up old session files and database entries"""
    session_storage_dir = "user_sessions"
    
    if not os.path.exists(session_storage_dir):
        return
    
    cutoff_time = datetime.now() - timedelta(hours=24)
    
    for filename in os.listdir(session_storage_dir):
        if filename.endswith('.json'):
            filepath = os.path.join(session_storage_dir, filename)
            file_time = datetime.fromtimestamp(os.path.getmtime(filepath))
            
            if file_time < cutoff_time:
                try:
                    os.remove(filepath)
                    print(f"🗑️ Cleaned up old session: {filename}")
                except Exception as e:
                    print(f"❌ Error deleting session file {filename}: {e}")

if __name__ == "__main__":
    asyncio.run(cleanup_old_sessions())