# main.py

import os
import json
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from dotenv import load_dotenv
import sys
import uuid
import shutil
import threading
import warnings
import time

# Suppress SSL warnings
warnings.filterwarnings('ignore', message='Unverified HTTPS request')

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Form, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi import Depends, Security
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import aiofiles
import asyncio
from psycopg2 import Error
from psycopg2.extras import RealDictCursor

# Add src to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Import handlers
from app.vectoredb.website_loader import WebsiteLoader
from app.file_processor import FileProcessor
from app.vectoredb.embedding_handler import EmbeddingHandler
from app.chatbot_generator import ChatbotGenerator
from app.agents.agents import ChatAgent
from app.database.database import db_manager
from app.services.email_service import email_service
from app.pdf_generator import pdf_generator
from app.auth.auth import auth_service
from app.services.payment_service import payment_service
from app.auth.addAdmin import CreateAdminRequest, GenerateHashRequest, admin_service
from app.auth.admin_auth import admin_auth_service
from app.tokens.token_counter import token_counter
from app.vectoredb.vector_store import VectorStore

load_dotenv()
security = HTTPBearer()

BASE_URL = os.getenv("BASE_URL", "https://botnexify-frontend.onrender.com").rstrip("/")

app = FastAPI(
    title="Chatbot Generator API",
    description="API for generating AI chatbots trained on website content with MySQL database and email notifications",
    version="3.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    servers=[
        {
            "url": BASE_URL,
            "description": "Current server"
        }
    ]
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# Mount static files
os.makedirs("generated_scripts", exist_ok=True)
app.mount("/scripts", StaticFiles(directory="generated_scripts"), name="scripts")

# Mount static files for data directory
os.makedirs("data", exist_ok=True)
app.mount("/data", StaticFiles(directory="data"), name="data")

# Also mount uploads directory explicitly if needed
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

admin_service.initialize_admin_tables()


# Pydantic models
class TrainRequest(BaseModel):
    website_url: str
    website_name: Optional[str] = None
    contact_email: str  # Contact email for admin notifications
    generate_script: bool = True

class ChatRequest(BaseModel):
    website_id: str
    question: str
    conversation_id: Optional[str] = None
    user_info: Optional[Dict[str, str]] = None
    session_id: Optional[str] = None

class UserRegistration(BaseModel):
    full_name: str
    email: str
    mobile: str
    website_id: str
    
class SignUpModel(BaseModel):
    full_name: str
    email: str
    mobile: Optional[str] = None
    password: str
    confirm_password: str

class UserLogin(BaseModel):
    email: str
    password: str

class UpdateProfile(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    mobile: Optional[str] = None

class ChangePassword(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str    

class FileUploadRequest(BaseModel):
    website_id: str

class ContactFormRequest(BaseModel):
    website_id: str
    name: str
    email: str
    phone: Optional[str] = None
    message: str
    additional_data: Optional[Dict[str, Any]] = None

class WebsiteRegistration(BaseModel):
    website_id: str
    website_name: str
    website_url: str
    admin_email: str

class SendChatReportRequest(BaseModel):
    website_id: str
    conversation_id: str

class EndSessionRequest(BaseModel):
    session_id: str

class ForgotPasswordRequest(BaseModel):
    email: str

class VerifyOTPRequest(BaseModel):
    reset_token: str
    otp: str

class ResetPasswordRequest(BaseModel):
    reset_token: str
    new_password: str
    confirm_password: str

class CreateOrderRequest(BaseModel):
    plan_id: int

class VerifyPaymentRequest(BaseModel):
    razorpay_payment_id: str
    razorpay_order_id: str
    razorpay_signature: str
    

# Initialize handlers
website_loader = WebsiteLoader(max_pages=50, max_depth=3)
file_processor = FileProcessor()
embedding_handler = EmbeddingHandler()
chatbot_generator = ChatbotGenerator(base_url=BASE_URL)
chat_agent = ChatAgent()

# In-memory store for training status
training_status = {}

# Persistent session storage
session_storage_dir = "user_sessions"
os.makedirs(session_storage_dir, exist_ok=True)

# Payment service methods

class PaymentService:
    def __init__(self):
        self.razorpay_key = os.getenv('RAZORPAY_KEY')
        self.razorpay_secret = os.getenv('RAZORPAY_SECRET')
        
    def check_user_access(self, user_id: int, action: str = "train") -> Dict[str, Any]:
        """Check if user can perform an action based on subscription"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # First check if user is admin
            cursor.execute("SELECT role FROM users WHERE id = %s", (user_id,))
            user = cursor.fetchone()
            
            if user and user['role'] == 'admin':
                # Admin has unlimited access
                cursor.close()
                conn.close()
                return {
                    "success": True,
                    "has_access": True,
                    "has_subscription": True,
                    "is_admin": True,
                    "message": "Admin access granted"
                }
            
            # For regular users, check subscription
            cursor.execute('''
                SELECT us.*, sp.plan_name, sp.max_websites, sp.max_chat_messages, sp.max_uploads
                FROM user_subscriptions us
                JOIN subscription_plans sp ON us.plan_id = sp.id
                WHERE us.user_id = %s 
                AND us.payment_status = 'completed'
                AND (us.end_date IS NULL OR us.end_date > CURRENT_DATE)
                ORDER BY us.end_date DESC
                LIMIT 1
            ''', (user_id,))
            
            subscription = cursor.fetchone()
            
            cursor.close()
            conn.close()
            
            if subscription:
                # User has active subscription
                return {
                    "success": True,
                    "has_access": True,
                    "has_subscription": True,
                    "subscription": subscription,
                    "message": "Active subscription found"
                }
            else:
                # User doesn't have subscription
                return {
                    "success": True,
                    "has_access": False,
                    "has_subscription": False,
                    "message": "No active subscription found",
                    "requires_subscription": True
                }
                
        except Error as e:
            print(f"  Check user access error: {e}")
            return {
                "success": False,
                "error": str(e),
                "has_access": False
            }
    
    def get_user_subscription(self, user_id: int) -> Dict[str, Any]:
        """Get user's active subscription"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # First check if user is admin
            cursor.execute("SELECT role FROM users WHERE id = %s", (user_id,))
            user = cursor.fetchone()
            
            if user and user['role'] == 'admin':
                # Return admin subscription info
                cursor.close()
                conn.close()
                return {
                    "success": True,
                    "has_subscription": True,
                    "is_admin": True,
                    "subscription": {
                        "plan_name": "Admin",
                        "max_websites": 999,
                        "max_chat_messages": 999999,
                        "max_uploads": 999,
                        "is_admin": True,
                        "days_remaining": 999
                    }
                }
            
            # For regular users, check actual subscription
            cursor.execute('''
                SELECT us.*, sp.plan_name, sp.price, sp.duration_days,
                       sp.max_websites, sp.max_chat_messages, sp.max_uploads,
                       sp.features
                FROM user_subscriptions us
                JOIN subscription_plans sp ON us.plan_id = sp.id
                WHERE us.user_id = %s 
                AND us.payment_status = 'completed'
                AND (us.end_date IS NULL OR us.end_date > CURRENT_DATE)
                ORDER BY us.end_date DESC
                LIMIT 1
            ''', (user_id,))
            
            subscription = cursor.fetchone()
            
            if subscription:
                # Calculate days remaining
                if subscription.get('end_date'):
                    end_date = subscription['end_date']
                    if isinstance(end_date, str):
                        end_date = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                    days_remaining = (end_date - datetime.now()).days
                    subscription['days_remaining'] = max(0, days_remaining)
                else:
                    subscription['days_remaining'] = 999
            
            cursor.close()
            conn.close()
            
            return {
                "success": True,
                "has_subscription": subscription is not None,
                "subscription": subscription
            }
            
        except Error as e:
            print(f"  Get user subscription error: {e}")
            return {
                "success": False,
                "error": str(e),
                "has_subscription": False
            }

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
    
    async def connect(self, websocket: WebSocket, session_id: str):
        await websocket.accept()
        self.active_connections[session_id] = websocket
    
    def disconnect(self, session_id: str):
        if session_id in self.active_connections:
            del self.active_connections[session_id]
    
    async def send_message(self, message: str, session_id: str):
        if session_id in self.active_connections:
            await self.active_connections[session_id].send_text(message)

manager = ConnectionManager()

# Ensure directories exist
os.makedirs("data", exist_ok=True)
os.makedirs("generated_scripts", exist_ok=True)
os.makedirs("uploads", exist_ok=True)
os.makedirs("user_sessions", exist_ok=True)


def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)):
    """Get current user from JWT token (checks both users and admins)"""
    token = credentials.credentials
    result = auth_service.verify_token(token)
    if not result['success']:
        raise HTTPException(
            status_code=401,
            detail=result['error']
        )
    
    # Get user info based on type
    user_data = result['user']
    user_type = user_data.get('role', 'user')  # 'user' or 'admin'
    user_id = user_data['id']
    
    if user_type == 'admin':
        # Get admin info
        admin = admin_auth_service.get_admin_by_id(user_id)
        if not admin:
            raise HTTPException(status_code=401, detail="Admin not found")
        return admin
    else:
        # Get user info
        user = auth_service.get_user_by_id(user_id)
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user

def get_current_admin(user: dict = Depends(get_current_user)):
    """Ensure user is admin"""
    if user.get('role') != 'admin':
        raise HTTPException(
            status_code=403,
            detail="Admin access required"
        )
    return user


def save_session_data(session_id: str, session_data: Dict[str, Any]):
    """Save session data to file"""
    session_file = os.path.join(session_storage_dir, f"{session_id}.json")
    try:
        with open(session_file, 'w', encoding='utf-8') as f:
            json.dump(session_data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"  Error saving session data: {e}")

def load_session_data(session_id: str) -> Optional[Dict[str, Any]]:
    """Load session data from file"""
    session_file = os.path.join(session_storage_dir, f"{session_id}.json")
    if os.path.exists(session_file):
        try:
            with open(session_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"  Error loading session data: {e}")
    return None

def delete_session_data(session_id: str):
    """Delete session data file"""
    session_file = os.path.join(session_storage_dir, f"{session_id}.json")
    if os.path.exists(session_file):
        try:
            os.remove(session_file)
        except Exception as e:
            print(f"  Error deleting session data: {e}")

def cleanup_old_sessions(hours: int = 24):
    """Clean up session files older than specified hours"""
    try:
        cutoff_time = datetime.now() - timedelta(hours=hours)
        for filename in os.listdir(session_storage_dir):
            if filename.endswith('.json'):
                filepath = os.path.join(session_storage_dir, filename)
                file_time = datetime.fromtimestamp(os.path.getmtime(filepath))
                if file_time < cutoff_time:
                    os.remove(filepath)
                    print(f" Cleaned up old session: {filename}")
    except Exception as e:
        print(f"  Error cleaning up old sessions: {e}")

def send_auto_report_in_background(session_id: str):
    """Background task to send auto-report"""
    try:
        print(f" Background auto-report for session: {session_id}")
        
        # Get session data
        session_file = os.path.join(session_storage_dir, f"{session_id}.json")
        if not os.path.exists(session_file):
            print(f" Session file not found: {session_id}")
            return
        
        with open(session_file, 'r', encoding='utf-8') as f:
            session_data = json.load(f)
        
        user_info = session_data.get("user_info", {})
        website_id = user_info.get("website_id")
        conversation_id = user_info.get("conversation_id")
        
        if not website_id or not conversation_id:
            print(f" Missing website/conversation ID for session: {session_id}")
            return
        
        # Get chat history
        chat_history = db_manager.get_chat_history(
            website_id=website_id,
            conversation_id=conversation_id,
            limit=100
        )
        
        if len(chat_history) < 2:
            print(f" Insufficient chat history for session: {session_id}")
            return
        
        # Get website info
        website = db_manager.get_website(website_id)
        admin_email = website.get('admin_email') if website else None
        
        if admin_email:
            # Get user info from chat history
            user_info_from_history = {}
            for message in chat_history:
                if message.get('user_name'):
                    user_info_from_history = {
                        'full_name': message.get('user_name', 'Unknown'),
                        'email': message.get('user_email', 'Unknown'),
                        'mobile': message.get('user_phone', 'Unknown')
                    }
                    break
            
            # Send email
            email_service.send_chat_session_report(
                website_id=website_id,
                admin_email=admin_email,
                conversation_id=conversation_id,
                chat_history=chat_history,
                user_info=user_info_from_history,
                is_auto_report=True
            )
            
            print(f" Auto-report email sent for session: {session_id}")
        
        # Clean up session file
        try:
            os.remove(session_file)
        except:
            pass
            
    except Exception as e:
        print(f"  Background auto-report error: {e}")


def auto_send_chat_report(session_id: str):
    """Automatically send chat report when session ends unexpectedly"""
    try:
        # Load session data
        session_data = load_session_data(session_id)
        
        if not session_data:
            # Try to get chat history from database
            chat_history = db_manager.get_chat_history_by_session(session_id, limit=100)
            
            if chat_history:
                # Find website ID from chat history
                website_id = chat_history[0].get('website_id') if chat_history else None
                conversation_id = chat_history[0].get('conversation_id') if chat_history else None
                
                if website_id and conversation_id:
                    # Get website info
                    website = db_manager.get_website(website_id)
                    if website and website.get('admin_email'):
                        # Get user info from first message
                        user_info = {}
                        for message in chat_history:
                            if message.get('user_name'):
                                user_info = {
                                    'full_name': message.get('user_name', 'Unknown'),
                                    'email': message.get('user_email', 'Unknown'),
                                    'mobile': message.get('user_phone', 'Unknown')
                                }
                                break
                        
                        # Send auto-report email
                        email_service.send_chat_session_report(
                            website_id=website_id,
                            admin_email=website.get('admin_email'),
                            conversation_id=conversation_id,
                            chat_history=chat_history,
                            user_info=user_info,
                            is_auto_report=True
                        )
                        
                        print(f" Auto-sent chat report for session: {session_id}")
                        
                        # Save auto-report event
                        system_message_data = {
                            'website_id': website_id,
                            'conversation_id': conversation_id,
                            'role': 'system',
                            'message': 'Chat session auto-reported (browser closed/refreshed)',
                            'metadata': {
                                'event': 'auto_report',
                                'session_id': session_id,
                                'admin_email': website.get('admin_email'),
                                'message_count': len(chat_history),
                                'timestamp': datetime.now().isoformat()
                            }
                        }
                        db_manager.save_chat_message(system_message_data)
            
            # Delete session file
            delete_session_data(session_id)
            return
        
        user_info = session_data.get("user_info", {})
        website_id = user_info.get("website_id")
        conversation_id = user_info.get("conversation_id")
        
        if not website_id or not conversation_id:
            delete_session_data(session_id)
            return
        
        # Get chat history from database
        chat_history = db_manager.get_chat_history(
            website_id=website_id,
            conversation_id=conversation_id,
            limit=100
        )
        
        if not chat_history or len(chat_history) < 2:  # At least one user and one assistant message
            delete_session_data(session_id)
            return
        
        # Get website info
        website = db_manager.get_website(website_id)
        admin_email = website.get('admin_email') if website else None
        
        # Send auto-report email to admin
        if admin_email:
            email_service.send_chat_session_report(
                website_id=website_id,
                admin_email=admin_email,
                conversation_id=conversation_id,
                chat_history=chat_history,
                user_info=user_info,
                is_auto_report=True
            )
            
            print(f" Auto-sent chat report for session: {session_id}")
            
            # Save auto-report event
            system_message_data = {
                'website_id': website_id,
                'conversation_id': conversation_id,
                'role': 'system',
                'message': 'Chat session auto-reported (browser closed/refreshed)',
                'metadata': {
                    'event': 'auto_report',
                    'session_id': session_id,
                    'admin_email': admin_email,
                    'message_count': len(chat_history),
                    'timestamp': datetime.now().isoformat()
                }
            }
            db_manager.save_chat_message(system_message_data)
        
        # Delete session file
        delete_session_data(session_id)
        
    except Exception as e:
        print(f"  Auto-send chat report error: {e}")

# Run cleanup on startup
cleanup_old_sessions()


# ======================
# PUBLIC ROUTES
# ======================

@app.get("/")
async def root():
    """Root endpoint with API info"""
    return {
        "success": True,
        "message": " Chatbot Generator API v3.0",
        "version": "3.0.0",
        "status": "running",
        "database": "MySQL",
        "email": "Enabled",
        "timestamp": datetime.now().isoformat(),
        "endpoints": {
            "/api/contact": "Submit contact form (POST)",
            "/api/train": "Train chatbot on website URL (POST)",
            "/api/chat": "Chat with trained chatbot (POST)",
            "/api/register": "Register user before chat (POST)",
            "/api/websites": "List all trained websites (GET)",
            "/api/website/{id}": "Get website info (GET)",
            "/api/website/stats/{id}": "Get website statistics (GET)",
            "/api/upload/{id}": "Upload files (POST)",
            "/api/reindex/{id}": "Reindex uploaded files (POST)",
            "/api/generate-script/{id}": "Generate embed script (GET)",
            "/api/training-status/{id}": "Check training status (GET)",
            "/api/chat/history/{id}": "Get chat history (GET)",
            "/api/chat/send-report": "Send chat report email (POST)",
            "/api/chat/end-session": "End chat session and send report (POST)",
            "/api/contact/forms/{id}": "Get contact forms (GET)",
            "/ws/chat/{session_id}": "WebSocket for chat session tracking",
            "/embed/{id}/script.js": "Get chatbot script (GET)",
            "/test/{id}": "Test page with embedded chatbot (GET)",
            "/api/auth/register": "User registration (POST)",
            "/api/auth/login": "User login (POST)",
            "/api/auth/forgot-password": "Forgot password (POST)",
            "/api/auth/verify-otp": "Verify OTP (POST)",
            "/api/auth/reset-password": "Reset password (POST)"
        }
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    # Check database connection
    db_status = "healthy"
    try:
        websites = db_manager.get_all_websites()
        db_status = f"healthy ({len(websites)} websites)"
    except Exception as e:
        db_status = f"error: {str(e)[:50]}"
    
    # Check Qdrant connection
    qdrant_status = "healthy"
    try:
        # Try to get collection info
        vector_store = VectorStore()
        collection_info = vector_store.get_collection_info()
        if collection_info.get("status") == "ok":
            qdrant_status = f"healthy ({collection_info.get('points_count', 0)} points)"
        else:
            qdrant_status = f"error: {collection_info.get('error', 'Unknown error')}"
    except Exception as e:
        qdrant_status = f"error: {str(e)[:50]}"
    
    return {
        "success": True,
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "database": db_status,
        "vector_store": qdrant_status,
        "services": {
            "website_loader": "ready",
            "file_processor": "ready",
            "embedding_handler": "ready",
            "chatbot_generator": "ready",
            "chat_agent": "ready",
            "email_service": "ready",
            "qdrant_cloud": qdrant_status.split(":")[0]  # Just the status part
        }
    }


# ======================
# WEBSITE MANAGEMENT ROUTES
# ======================


@app.post("/api/register")
async def register_user(request: UserRegistration):
    """Register user before starting chat"""
    try:
        # Generate session ID
        session_id = str(uuid.uuid4())
        
        # Generate conversation ID
        conversation_id = f"conv_{int(datetime.now().timestamp())}"
        
        # Store user info
        user_info = {
            "session_id": session_id,
            "full_name": request.full_name,
            "email": request.email,
            "mobile": request.mobile,
            "website_id": request.website_id,
            "registered_at": datetime.now().isoformat(),
            "conversation_id": conversation_id
        }
        
        # Save session data to file
        session_data = {
            "user_info": user_info,
            "messages": [],
            "created_at": datetime.now().isoformat(),
            "last_active": datetime.now().isoformat()
        }
        save_session_data(session_id, session_data)
        
        # Save initial system message to database
        system_message_data = {
            'website_id': request.website_id,
            'conversation_id': conversation_id,
            'session_id': session_id,
            'user_name': request.full_name,
            'user_email': request.email,
            'role': 'system',
            'message': f"User {request.full_name} registered with email {request.email}",
            'metadata': {
                'event': 'user_registration',
                'timestamp': datetime.now().isoformat()
            }
        }
        db_manager.save_chat_message(system_message_data)
        
        # Get admin email for this website
        website = db_manager.get_website(request.website_id)
        admin_email = website.get('admin_email') if website else None
        
        # Send registration notification to admin (NO welcome email to user)
        if admin_email:
            email_service.send_registration_notification(
                website_id=request.website_id,
                admin_email=admin_email,
                user_data=user_info
            )
        
        return {
            "success": True,
            "message": "User registered successfully",
            "session_id": session_id,
            "conversation_id": conversation_id,
            "user_info": {
                "full_name": request.full_name,
                "email": request.email,
                "mobile": request.mobile
            }
        }
        
    except Exception as e:
        print(f"  User registration error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Registration failed",
                "message": str(e)
            }
        )

@app.get("/api/user/{website_id}/{session_id}")
async def get_user_info(website_id: str, session_id: str):
    """Get user session information"""
    try:
        # Load session data
        session_data = load_session_data(session_id)
        
        if not session_data:
            raise HTTPException(
                status_code=404,
                detail={
                    "success": False,
                    "error": "Session not found",
                    "message": "User session not found or expired"
                }
            )
        
        # Update last active timestamp
        session_data["last_active"] = datetime.now().isoformat()
        save_session_data(session_id, session_data)
        
        return {
            "success": True,
            "user_info": session_data.get("user_info", {})
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"  Get user info error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Internal server error",
                "message": str(e)
            }
        )


@app.get("/api/websites")
async def list_websites():
    """List all trained websites"""
    try:
        websites = db_manager.get_all_websites()
        
        # Enhance with file system info
        for website in websites:
            website_id = website['website_id']
            website_dir = os.path.join("data", website_id)
            
            if os.path.exists(website_dir):
                # Check for training info
                info_file = os.path.join(website_dir, "training_info.json")
                if os.path.exists(info_file):
                    try:
                        with open(info_file, 'r') as f:
                            file_info = json.load(f)
                            website.update(file_info)
                    except:
                        pass
                
                # Check for embeddings
                embedding_dir = os.path.join(website_dir, "embeddings")
                if os.path.exists(embedding_dir):
                    website['has_embeddings'] = True
                
                # Check for script
                script_file = os.path.join("generated_scripts", f"chatbot_{website_id}.js")
                if os.path.exists(script_file):
                    website['has_script'] = True
                    website['script_size'] = os.path.getsize(script_file)
                
                # Check for uploads
                upload_dir = os.path.join(website_dir, "uploads")
                if os.path.exists(upload_dir):
                    uploads_meta = os.path.join(upload_dir, "uploads_metadata.json")
                    if os.path.exists(uploads_meta):
                        try:
                            with open(uploads_meta, 'r') as f:
                                uploads = json.load(f)
                                website['uploads_metadata'] = uploads
                                website['upload_count'] = len(uploads)
                        except:
                            website['upload_count'] = 0
                    else:
                        website['upload_count'] = 0
            
            # Add stats
            stats = db_manager.get_website_stats(website_id)
            website['stats'] = stats
        
        # Add ongoing trainings from memory
        for website_id, status in training_status.items():
            if website_id not in [w["website_id"] for w in websites]:
                websites.append({
                    "website_id": website_id,
                    "website_name": status.get("website_name", website_id),
                    "website_url": status.get("website_url", ""),
                    "contact_email": status.get("contact_email", ""),
                    "status": status.get("status", "training"),
                    "progress": status.get("progress", 0),
                    "message": status.get("message", "Training in progress"),
                    "started_at": status.get("started_at"),
                    "has_data": False,
                    "has_embeddings": False,
                    "upload_count": 0
                })
        
        return {
            "success": True,
            "websites": websites,
            "count": len(websites),
            "trained_count": len([w for w in websites if w.get("status") == "active" or w.get("status") == "completed"]),
            "training_count": len([w for w in websites if w.get("status") == "training"]),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        print(f"  List websites error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Internal server error",
                "message": str(e)
            }
        )

@app.get("/api/website/{website_id}")
async def get_website_info(website_id: str):
    """Get detailed info about a website"""
    try:
        # Get from database first
        website = db_manager.get_website(website_id)
        
        if not website:
            # Check training status
            if website_id in training_status:
                return {
                    "success": True,
                    **training_status[website_id]
                }
            
            raise HTTPException(
                status_code=404,
                detail={
                    "success": False,
                    "error": "Website not found",
                    "message": f"Website with ID {website_id} not found."
                }
            )
        
        # Get additional info from file system
        website_dir = os.path.join("data", website_id)
        if os.path.exists(website_dir):
            info_file = os.path.join(website_dir, "training_info.json")
            if os.path.exists(info_file):
                with open(info_file, 'r') as f:
                    file_info = json.load(f)
                    website.update(file_info)
            
            # Check for embeddings
            embedding_dir = os.path.join(website_dir, "embeddings")
            if os.path.exists(embedding_dir):
                website['has_embeddings'] = True
            
            # Check for script
            script_file = os.path.join("generated_scripts", f"chatbot_{website_id}.js")
            if os.path.exists(script_file):
                website['has_script'] = True
                website['script_url'] = f"{BASE_URL}/embed/{website_id}/script.js"
                website['embed_code'] = f'<script src="{BASE_URL}/embed/{website_id}/script.js" defer></script>'
            
            # Check for uploads
            upload_dir = os.path.join(website_dir, "uploads")
            if os.path.exists(upload_dir):
                website['has_uploads'] = True
                uploads_meta = os.path.join(upload_dir, "uploads_metadata.json")
                if os.path.exists(uploads_meta):
                    try:
                        with open(uploads_meta, 'r') as f:
                            uploads = json.load(f)
                            website['uploads_metadata'] = uploads
                            website['upload_count'] = len(uploads)
                    except:
                        website['upload_count'] = 0
                else:
                    website['upload_count'] = 0
        
        # Get stats
        website['stats'] = db_manager.get_website_stats(website_id)
        
        # Get recent conversations
        website['recent_conversations'] = db_manager.get_conversations(website_id, limit=5)
        
        # Get training logs
        website['training_logs'] = db_manager.get_training_logs(website_id, limit=5)
        
        return {
            "success": True,
            **website
        }
        
    except Exception as e:
        print(f"  Get website info error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Internal server error",
                "message": str(e)
            }
        )

@app.get("/api/download-file/{website_id}")
async def download_file(
    website_id: str,
    filename: str,
    user: dict = Depends(get_current_user)
):
    """Download a file from website uploads"""
    try:
        # Security check - verify user owns this website
        website = db_manager.get_website(website_id)
        if not website or website.get('user_id') != user['id']:
            raise HTTPException(
                status_code=403,
                detail="You don't have permission to access this file"
            )
        
        # Construct file path
        file_path = os.path.join("data", website_id, "uploads", filename)
        
        if not os.path.exists(file_path):
            raise HTTPException(
                status_code=404,
                detail="File not found"
            )
        
        # Return file
        return FileResponse(
            path=file_path,
            filename=filename,
            media_type='application/octet-stream'
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Download error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/website/stats/{website_id}")
async def get_website_statistics(website_id: str):
    """Get website statistics"""
    try:
        stats = db_manager.get_website_stats(website_id)
        conversations = db_manager.get_conversations(website_id, limit=5)
        training_logs = db_manager.get_training_logs(website_id, limit=3)
        
        return {
            "success": True,
            "website_id": website_id,
            "statistics": stats,
            "recent_conversations": conversations,
            "recent_training_logs": training_logs
        }
    except Exception as e:
        print(f"  Get stats error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ======================
# TRAINING ROUTES
# ======================

@app.post("/api/train")
async def train_chatbot(
    request: TrainRequest,
    user: dict = Depends(get_current_user)  # Add authentication
):
    """Train chatbot on website URL with contact email"""
    try:
        
        subscription_result = payment_service.get_user_subscription(user['id'])
        
        if not subscription_result['success']:
            raise HTTPException(
                status_code=500,
                detail={
                    "success": False,
                    "error": "Failed to check subscription status"
                }
            )
        
        if not subscription_result['has_subscription']:
            raise HTTPException(
                status_code=403,
                detail={
                    "success": False,
                    "error": "Subscription required",
                    "message": "You need an active subscription to train chatbots",
                    "requires_subscription": True
                }
            )
        
        # Check website count
        conn = auth_service.get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute('SELECT COUNT(*) as count FROM websites WHERE user_id = %s', (user['id'],))
        website_count = cursor.fetchone()['count']
        cursor.close()
        conn.close()
        
        if website_count >= subscription_result['subscription']['max_websites']:
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "Chatbot limit reached"
                }
            )
        
        # First check if user has access based on subscription
        access_result = payment_service.check_user_access(user['id'], "train")
        
        if not access_result.get('has_access', False):
            raise HTTPException(
                status_code=403,
                detail={
                    "success": False,
                    "error": "Subscription required",
                    "message": access_result.get('message', 'You need an active subscription to train chatbots'),
                    "requires_subscription": True,
                    "has_subscription": access_result.get('has_subscription', False)
                }
            )
        
        # Validate URL
        if not request.website_url.startswith(('http://', 'https://')):
            request.website_url = 'https://' + request.website_url
        
        # Generate unique website ID
        website_id = str(uuid.uuid4())[:8]
        
        # Clean website name
        if request.website_name:
            website_name = request.website_name
        else:
            # Extract domain from URL
            from urllib.parse import urlparse
            parsed = urlparse(request.website_url)
            website_name = parsed.netloc or request.website_url
            
        website_name = "".join(c for c in website_name if c.isalnum() or c in (' ', '-', '_')).rstrip()
        
        # Validate contact email
        if not request.contact_email or '@' not in request.contact_email:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Invalid contact email",
                    "message": "Please provide a valid contact email address"
                }
            )
        
        # Set initial status
        training_status[website_id] = {
            "website_id": website_id,
            "website_name": website_name,
            "website_url": request.website_url,
            "contact_email": request.contact_email,
            "user_id": user['id'],  # Add user ID to training status
            "status": "starting",
            "progress": 0,
            "message": "Initializing training process...",
            "started_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat()
        }
        
        # Create website directory and .env if not exists
        website_dir = os.path.join("data", website_id)
        os.makedirs(website_dir, exist_ok=True)
        
        # Create uploads directory
        upload_dir = os.path.join(website_dir, "uploads")
        os.makedirs(upload_dir, exist_ok=True)
        
        # Create .env file with contact email
        env_content = f"""ADMIN_EMAIL={request.contact_email}
CONTACT_EMAIL={request.contact_email}
GEMINI_API_KEY={os.getenv('GEMINI_API_KEY', '')}
SMTP_HOST={os.getenv('SMTP_HOST', 'smtp.gmail.com')}
SMTP_PORT={os.getenv('SMTP_PORT', '587')}
SMTP_USERNAME={os.getenv('SMTP_USERNAME', '')}
SMTP_PASSWORD={os.getenv('SMTP_PASSWORD', '')}
"""
        
        env_path = os.path.join(website_dir, ".env")
        with open(env_path, 'w') as f:
            f.write(env_content)
        
        print(f" Starting training for: {request.website_url} (ID: {website_id}, User: {user['id']}, Contact: {request.contact_email})")
        
        # Save to database with user_id
        website_data = {
            'website_id': website_id,
            'website_name': website_name,
            'website_url': request.website_url,
            'admin_email': request.contact_email,
            'contact_email': request.contact_email,
            'data_directory': website_dir,
            'status': 'training',
            'user_id': user['id']  # Link to user
        }
        
        db_manager.save_website_with_user(website_data, user['id'])
        db_manager.save_training_log(website_id, {
            'status': 'started',
            'message': 'Training started',
            'data_points': 0,
            'user_id': user['id']
        })
        
        
        auth_service.add_website_to_user(user['id'], website_id)
        
        # Start training in background thread
        thread = threading.Thread(
            target=train_website_background,
            args=(website_id, request.website_url, website_name, request.contact_email, request.generate_script, user['id']),
            daemon=True
        )
        thread.start()
        
        return {
            "success": True,
            "message": "Training started successfully!",
            "website_id": website_id,
            "website_name": website_name,
            "website_url": request.website_url,
            "contact_email": request.contact_email,
            "status_url": f"/api/training-status/{website_id}",
            "upload_url": f"/api/upload/{website_id}",
            "estimated_time": "2-3 minutes",
            "polling_interval": 2000,
            "instructions": "Use the status URL to monitor training progress. After training, you can upload files using the upload URL."
        }
        
    except Exception as e:
        print(f"  Training initialization error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Training failed to start",
                "message": str(e),
                "timestamp": datetime.now().isoformat()
            }
        )



def train_website_background(website_id: str, url: str, website_name: str, contact_email: str, should_generate_script: bool, user_id: int):
    """Background task for website training with progressive updates"""
    try:
        print(f" Background training started for {website_id} (User: {user_id})")
        
        # Track start time
        start_time = datetime.now()
        
        # Update status - starting (1-8%)
        training_status[website_id].update({
            "status": "starting",
            "progress": 5,
            "message": "Initializing training process...",
            "updated_at": datetime.now().isoformat()
        })
        
        # Small delay for UI to show initialization
        time.sleep(0.5)
        
        training_status[website_id].update({
            "status": "starting",
            "progress": 8,
            "message": "Preparing to crawl website...",
            "updated_at": datetime.now().isoformat()
        })
        
        # Step 1: Extract website data (progress 8% to 40%)
        print(f" Extracting data from: {url}")
        
        training_status[website_id].update({
            "status": "extracting",
            "progress": 10,
            "message": "Starting website crawl...",
            "data_points": 0,
            "updated_at": datetime.now().isoformat()
        })
        
        try:
            website_data = website_loader.extract_website_data(url)
            
            if not website_data:
                raise Exception("No content could be extracted from the website")
            
            # Update progress based on pages extracted (smooth increments)
            pages_extracted = len(website_data)
            
            # Progress increases with each page found (8% base + up to 32% for pages)
            # This gives smooth 1% increments as pages are discovered
            for i, page in enumerate(website_data):
                if i % 2 == 0:  # Update every 2 pages to avoid too many updates
                    progress = min(40, 8 + ((i + 1) / pages_extracted) * 32)
                    training_status[website_id].update({
                        "status": "extracting",
                        "progress": progress,
                        "message": f"Crawling website: Found {i + 1} pages...",
                        "data_points": i + 1,
                        "updated_at": datetime.now().isoformat()
                    })
                    time.sleep(0.1)  # Small delay to show progress
            
            # Final extraction progress
            training_status[website_id].update({
                "status": "extracting",
                "progress": 40,
                "message": f"Extracted {pages_extracted} pages from website",
                "data_points": pages_extracted,
                "updated_at": datetime.now().isoformat()
            })
            
            print(f" Successfully extracted {pages_extracted} pages")
            
        except Exception as e:
            error_msg = f"Failed to extract website content: {str(e)}"
            print(f"  {error_msg}")
            
            elapsed_time = (datetime.now() - start_time).total_seconds()
            
            db_manager.save_training_log(website_id, {
                'status': 'failed',
                'message': error_msg,
                'training_time': elapsed_time
            })
            
            training_status[website_id] = {
                "website_id": website_id,
                "website_name": website_name,
                "status": "error",
                "progress": 0,
                "message": error_msg,
                "error": str(e),
                "completed_at": datetime.now().isoformat(),
                "training_time": elapsed_time
            }
            return
        
        # Step 2: Processing data (progress 40% to 60%)
        # Simulate smooth progress during processing
        for i in range(1, 11):  # 10 steps from 40% to 60%
            progress = 40 + (i * 2)  # 42%, 44%, 46%, ... 60%
            training_status[website_id].update({
                "status": "processing",
                "progress": progress,
                "message": f"Processing extracted content: Step {i}/10...",
                "data_points": pages_extracted,
                "updated_at": datetime.now().isoformat()
            })
            time.sleep(0.3)  # Small delay for smooth progress
        
        # Create website directory
        website_dir = os.path.join("data", website_id)
        os.makedirs(website_dir, exist_ok=True)
        
        # Save extracted data
        training_status[website_id].update({
            "status": "processing",
            "progress": 60,
            "message": "Saving extracted content...",
            "updated_at": datetime.now().isoformat()
        })
        
        data_file = os.path.join(website_dir, "website_data.json")
        with open(data_file, 'w', encoding='utf-8') as f:
            json.dump(website_data, f, ensure_ascii=False, indent=2)
        
        # Step 3: Creating embeddings (progress 60% to 90%)
        training_status[website_id].update({
            "status": "embedding",
            "progress": 62,
            "message": "Initializing HuggingFace embedding model...",
            "updated_at": datetime.now().isoformat()
        })
        
        time.sleep(0.5)

        try:
            # Simulate embedding creation progress
            for i in range(1, 11):  # 10 steps from 62% to 90%
                progress = 62 + (i * 2.8)  # ~64.8%, 67.6%, 70.4%, ... 90%
                training_status[website_id].update({
                    "status": "embedding",
                    "progress": min(90, progress),
                    "message": f"Creating embeddings: Chunk {i}/10...",
                    "embedding_count": int((i / 10) * pages_extracted),
                    "updated_at": datetime.now().isoformat()
                })
                time.sleep(0.4)
            
            # Actually create embeddings
            embedding_info = embedding_handler.create_embeddings(
                website_id, 
                website_data,
                user_id=user_id
            )
            
            # Final embedding progress
            training_status[website_id].update({
                "status": "embedding",
                "progress": 90,
                "message": f"Created {pages_extracted} embeddings and stored in Qdrant Cloud",
                "embedding_count": pages_extracted,
                "updated_at": datetime.now().isoformat()
            })
            
            print(f" Created embeddings: {pages_extracted} chunks")
            
        except Exception as e:
            error_msg = "Internal server Error"
            print(f"Failed to create embeddings in Qdrant: {str(e)}")
            
            elapsed_time = (datetime.now() - start_time).total_seconds()
            
            training_status[website_id] = {
                "website_id": website_id,
                "website_name": website_name,
                "status": "error",
                "progress": 0,
                "message": error_msg,
                "error": str(e),
                "completed_at": datetime.now().isoformat(),
                "training_time": elapsed_time
            }
            return
        
        # Step 4: Generate script (progress 90% to 98%)
        training_status[website_id].update({
            "status": "embedding",
            "progress": 92,
            "message": "Generating chatbot script...",
            "updated_at": datetime.now().isoformat()
        })
        
        time.sleep(0.5)
        
        script_data = {}
        if should_generate_script:
            try:
                training_status[website_id].update({
                    "status": "embedding",
                    "progress": 94,
                    "message": "Creating embed code...",
                    "updated_at": datetime.now().isoformat()
                })
                
                script_path = chatbot_generator.generate_script_file(website_id)
                
                training_status[website_id].update({
                    "status": "embedding",
                    "progress": 96,
                    "message": "Finalizing script...",
                    "updated_at": datetime.now().isoformat()
                })
                
                script_url = chatbot_generator.generate_script_url(website_id)
                embed_code = chatbot_generator.generate_embed_code(website_id)
                
                script_data = {
                    "script_url": script_url,
                    "embed_code": embed_code,
                    "script_path": script_path,
                    "script_generated": True
                }
                
                db_manager.update_website_script(website_id, embed_code)
                print(f" Generated chatbot script: {script_url}")
                
            except Exception as e:
                print(f" Script generation warning: {e}")
                script_data = {
                    "script_generated": False,
                    "script_error": str(e)
                }
        
        # Calculate total training time
        total_training_time = (datetime.now() - start_time).total_seconds()
        
        # Final progress (98% to 100%)
        training_status[website_id].update({
            "status": "embedding",
            "progress": 98,
            "message": "Saving training data...",
            "updated_at": datetime.now().isoformat()
        })
        
        time.sleep(0.3)
        
        # Final status - completed
        training_status[website_id].update({
            "status": "completed",
            "progress": 100,
            "message": "Training completed successfully!",
            "website_id": website_id,
            "website_name": website_name,
            "contact_email": contact_email,
            "website_url": url,
            "data_points": pages_extracted,
            "embedding_info": embedding_info,
            "completed_at": datetime.now().isoformat(),
            "training_time": total_training_time,
            "training_time_formatted": f"{total_training_time:.2f} seconds",
            **script_data
        })
        
        # Save to database
        db_manager.save_training_log(website_id, {
            'status': 'completed',
            'message': 'Training completed successfully',
            'data_points': pages_extracted,
            'embedding_count': pages_extracted,
            'training_time': total_training_time
        })
        
        if user_id:
            auth_service.add_website_to_user(user_id, website_id)
            
            db_manager.save_website({
                'website_id': website_id,
                'website_name': website_name,
                'website_url': url,
                'admin_email': contact_email,
                'contact_email': contact_email,
                'script_tag': script_data.get('embed_code', ''),
                'status': 'active',
                'user_id': user_id
            })
            
            print(f" Website {website_id} associated with user {user_id}")
        
        print(f" Training completed for: {website_name} (ID: {website_id})")
        print(f"      Pages extracted: {pages_extracted}")
        print(f"     Training time: {total_training_time:.2f} seconds")
        
    except Exception as e:
        print(f"  Background training error: {str(e)}")
        import traceback
        traceback.print_exc()
        
        elapsed_time = (datetime.now() - datetime.fromisoformat(training_status[website_id]["started_at"])).total_seconds()
        
        training_status[website_id] = {
            "website_id": website_id,
            "website_name": website_name,
            "status": "error",
            "progress": 0,
            "message": f"Training failed: {str(e)}",
            "error": str(e),
            "completed_at": datetime.now().isoformat(),
            "training_time": elapsed_time
        }


@app.get("/api/debug/user-websites/{user_id}")
async def debug_user_websites(user_id: int, admin: dict = Depends(get_current_admin)):
    """Debug endpoint to check user-website association"""
    try:
        conn = auth_service.get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get user's website_ids
        cursor.execute("SELECT id, email, full_name, website_ids FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()
        
        # Get all websites
        cursor.execute("SELECT * FROM websites ORDER BY created_at DESC")
        all_websites = cursor.fetchall()
        
        # Get user's websites based on website_ids
        user_websites = []
        if user and user['website_ids']:
            try:
                website_ids = json.loads(user['website_ids']) if isinstance(user['website_ids'], str) else user['website_ids']
                for website in all_websites:
                    if website['website_id'] in website_ids:
                        user_websites.append(website)
            except:
                pass
        
        # Get websites by user_id column
        cursor.execute("SELECT * FROM websites WHERE user_id = %s", (user_id,))
        websites_by_user_id = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        return {
            "success": True,
            "user": user,
            "all_websites_count": len(all_websites),
            "all_websites": [{"website_id": w['website_id'], "website_name": w['website_name'], "user_id": w['user_id']} for w in all_websites],
            "user_websites_by_ids": [{"website_id": w['website_id'], "website_name": w['website_name']} for w in user_websites],
            "user_websites_by_user_id": [{"website_id": w['website_id'], "website_name": w['website_name']} for w in websites_by_user_id],
            "recommendation": "If both lists are empty, the website was not properly associated with the user during training"
        }
        
    except Exception as e:
        print(f"Debug error: {e}")
        return {"success": False, "error": str(e)}


# ======================
# CHAT HISTORY ROUTES FOR ADMIN
# ======================

@app.get("/api/chat-users/{website_id}")
async def get_chat_users(
    website_id: str,
    user: dict = Depends(get_current_user)
):
    """Get all unique users who have chatted with this website"""
    try:
        # Check if user is admin or owns the website
        conn = db_manager.get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Verify website exists
        cursor.execute(
            "SELECT * FROM websites WHERE website_id = %s",
            (website_id,)
        )
        website = cursor.fetchone()
        
        if not website:
            cursor.close()
            conn.close()
            raise HTTPException(
                status_code=404,
                detail={
                    "success": False,
                    "error": "Website not found"
                }
            )

        # Get unique users with their chat statistics
        cursor.execute('''
            SELECT 
                user_email as email,
                MAX(user_name) as name,
                COUNT(*) as message_count,
                MAX(created_at) as last_message_date
            FROM chat_history 
            WHERE website_id = %s 
                AND user_email IS NOT NULL 
                AND user_email != ''
            GROUP BY user_email
            ORDER BY last_message_date DESC
        ''', (website_id,))
        
        users = cursor.fetchall()
        
        # Format the results
        formatted_users = []
        for user_data in users:
            formatted_users.append({
                'email': user_data['email'],
                'name': user_data['name'] or 'Anonymous User',
                'message_count': user_data['message_count'],
                'last_message_date': user_data['last_message_date'].isoformat() if user_data['last_message_date'] else None
            })
        
        cursor.close()
        conn.close()
        
        return {
            "success": True,
            "users": formatted_users,
            "count": len(formatted_users)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting chat users: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Internal server error",
                "message": str(e)
            }
        )

@app.get("/api/user-chat/{website_id}")
async def get_user_chat_messages(
    website_id: str,
    email: str,
    user: dict = Depends(get_current_user)
):
    """Get all chat messages for a specific user email"""
    try:
        if not email:
            raise HTTPException(
                status_code=400,
                detail={
                    "success": False,
                    "error": "Email parameter required"
                }
            )

        # Verify website exists
        conn = db_manager.get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute(
            "SELECT * FROM websites WHERE website_id = %s",
            (website_id,)
        )
        website = cursor.fetchone()
        
        if not website:
            cursor.close()
            conn.close()
            raise HTTPException(
                status_code=404,
                detail={
                    "success": False,
                    "error": "Website not found"
                }
            )

        # Get all messages for this user
        cursor.execute('''
            SELECT * FROM chat_history 
            WHERE website_id = %s 
                AND user_email = %s
            ORDER BY created_at ASC
        ''', (website_id, email))
        
        messages = cursor.fetchall()
        
        # Format messages
        formatted_messages = []
        for msg in messages:
            formatted_messages.append({
                'id': msg['id'],
                'role': msg['role'],
                'message': msg['message'],
                'created_at': msg['created_at'].isoformat() if msg['created_at'] else None,
                'user_name': msg.get('user_name'),
                'user_email': msg.get('user_email'),
                'conversation_id': msg.get('conversation_id')
            })
        
        cursor.close()
        conn.close()
        
        return {
            "success": True,
            "messages": formatted_messages,
            "count": len(formatted_messages),
            "user_email": email,
            "website_id": website_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting user chat messages: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Internal server error",
                "message": str(e)
            }
        )

# Optional: Add a route to get all conversations for a website
@app.get("/api/chat-conversations/{website_id}")
async def get_chat_conversations(
    website_id: str,
    user: dict = Depends(get_current_user),
    limit: int = 50
):
    """Get all conversations with summary for a website"""
    try:
        # Verify website belongs to user
        conn = db_manager.get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute(
            "SELECT * FROM websites WHERE website_id = %s AND user_id = %s",
            (website_id, user['id'])
        )
        website = cursor.fetchone()
        
        if not website:
            cursor.close()
            conn.close()
            raise HTTPException(
                status_code=404,
                detail={
                    "success": False,
                    "error": "Website not found",
                    "message": "Website not found or you don't have permission to access it"
                }
            )

        # Get all conversations with their stats
        cursor.execute('''
            SELECT 
                conversation_id,
                MIN(created_at) as started_at,
                MAX(created_at) as last_message_at,
                COUNT(*) as message_count,
                MAX(user_name) as user_name,
                MAX(user_email) as user_email,
                SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) as user_messages,
                SUM(CASE WHEN role = 'assistant' THEN 1 ELSE 0 END) as assistant_messages
            FROM chat_history 
            WHERE website_id = %s
            GROUP BY conversation_id
            ORDER BY last_message_at DESC
            LIMIT %s
        ''', (website_id, limit))
        
        conversations = cursor.fetchall()
        
        # Format conversations
        formatted_conversations = []
        for conv in conversations:
            formatted_conversations.append({
                'conversation_id': conv['conversation_id'],
                'started_at': conv['started_at'].isoformat() if conv['started_at'] else None,
                'last_message_at': conv['last_message_at'].isoformat() if conv['last_message_at'] else None,
                'message_count': conv['message_count'],
                'user_name': conv['user_name'] or 'Anonymous',
                'user_email': conv['user_email'] or 'No email provided',
                'user_messages': conv['user_messages'],
                'assistant_messages': conv['assistant_messages']
            })
        
        cursor.close()
        conn.close()
        
        return {
            "success": True,
            "conversations": formatted_conversations,
            "count": len(formatted_conversations),
            "website_id": website_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting chat conversations: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Internal server error",
                "message": str(e)
            }
        )

# Route to get detailed conversation by conversation_id
@app.get("/api/chat-conversation/{conversation_id}")
async def get_conversation_details(
    conversation_id: str,
    user: dict = Depends(get_current_user)
):
    """Get all messages for a specific conversation"""
    try:
        conn = db_manager.get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # First, get the website_id from the conversation
        cursor.execute('''
            SELECT DISTINCT website_id 
            FROM chat_history 
            WHERE conversation_id = %s
        ''', (conversation_id,))
        
        result = cursor.fetchone()
        if not result:
            cursor.close()
            conn.close()
            raise HTTPException(
                status_code=404,
                detail={
                    "success": False,
                    "error": "Conversation not found"
                }
            )
        
        website_id = result['website_id']
        
        # Verify user owns this website
        cursor.execute(
            "SELECT * FROM websites WHERE website_id = %s AND user_id = %s",
            (website_id, user['id'])
        )
        website = cursor.fetchone()
        
        if not website:
            cursor.close()
            conn.close()
            raise HTTPException(
                status_code=403,
                detail={
                    "success": False,
                    "error": "Permission denied",
                    "message": "You don't have permission to view this conversation"
                }
            )
        
        # Get all messages for this conversation
        cursor.execute('''
            SELECT * FROM chat_history 
            WHERE conversation_id = %s
            ORDER BY created_at ASC
        ''', (conversation_id,))
        
        messages = cursor.fetchall()
        
        # Format messages
        formatted_messages = []
        for msg in messages:
            formatted_messages.append({
                'id': msg['id'],
                'role': msg['role'],
                'message': msg['message'],
                'created_at': msg['created_at'].isoformat() if msg['created_at'] else None,
                'user_name': msg.get('user_name'),
                'user_email': msg.get('user_email')
            })
        
        # Get conversation summary
        user_info = {}
        if formatted_messages:
            for msg in formatted_messages:
                if msg.get('user_name') and msg.get('user_email'):
                    user_info = {
                        'name': msg['user_name'],
                        'email': msg['user_email']
                    }
                    break
        
        cursor.close()
        conn.close()
        
        return {
            "success": True,
            "conversation_id": conversation_id,
            "website_id": website_id,
            "messages": formatted_messages,
            "message_count": len(formatted_messages),
            "user_info": user_info,
            "started_at": formatted_messages[0]['created_at'] if formatted_messages else None,
            "last_message_at": formatted_messages[-1]['created_at'] if formatted_messages else None
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting conversation details: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Internal server error",
                "message": str(e)
            }
        )

@app.get("/api/training-status/{website_id}")
async def get_training_status(website_id: str):
    """Get training status for a website with detailed progress"""
    try:
        if website_id not in training_status:
            # Check if website exists in data directory
            website_dir = os.path.join("data", website_id)
            if os.path.exists(website_dir):
                # Load from training info file
                info_file = os.path.join(website_dir, "training_info.json")
                if os.path.exists(info_file):
                    with open(info_file, 'r', encoding='utf-8') as f:
                        status_info = json.load(f)
                    
                    # Ensure we have progress field
                    if 'progress' not in status_info:
                        if status_info.get('status') == 'completed':
                            status_info['progress'] = 100
                        elif status_info.get('status') == 'error':
                            status_info['progress'] = 0
                        else:
                            status_info['progress'] = 50  # Default
                    
                    return {
                        "success": True,
                        **status_info
                    }
            
            return {
                "success": False,
                "error": "Training not found",
                "message": f"No training found for website ID: {website_id}",
                "timestamp": datetime.now().isoformat()
            }
        
        # Get current status
        status = training_status[website_id].copy()
        
        # Ensure progress is within bounds
        if status.get('progress') is None:
            if status.get('status') == 'completed':
                status['progress'] = 100
            elif status.get('status') == 'error':
                status['progress'] = 0
            else:
                status['progress'] = 50
        
        # Calculate estimated time remaining based on progress and elapsed time
        if 'started_at' in status and status['progress'] < 100 and status['progress'] > 0:
            try:
                started = datetime.fromisoformat(status['started_at'])
                elapsed = (datetime.now() - started).total_seconds()
                
                if elapsed > 0 and status['progress'] > 0:
                    total_estimated = (elapsed * 100) / status['progress']
                    remaining = total_estimated - elapsed
                    status['estimated_remaining'] = max(0, remaining)
                    status['estimated_remaining_formatted'] = f"{int(remaining)} seconds"
            except:
                pass
        
        return {
            "success": True,
            **status
        }
        
    except Exception as e:
        print(f"  Training status error: {str(e)}")
        return {
            "success": False,
            "error": "Internal server error",
            "message": str(e),
            "timestamp": datetime.now().isoformat()
        }

@app.delete("/api/website/{website_id}")
async def delete_website(website_id: str, user: dict = Depends(get_current_user)):
    """Delete a trained website and all associated data including Qdrant embeddings"""
    try:
        # Check if website exists and user owns it
        website = db_manager.get_website(website_id)
        if not website:
            raise HTTPException(
                status_code=404,
                detail={
                    "success": False,
                    "error": "Website not found",
                    "message": f"Website with ID {website_id} not found."
                }
            )
        
        # Check if user owns this website (admin can delete any)
        if user.get('role') != 'admin' and website.get('user_id') != user['id']:
            raise HTTPException(
                status_code=403,
                detail={
                    "success": False,
                    "error": "Permission denied",
                    "message": "You don't have permission to delete this website."
                }
            )
        
        # STEP 1: Delete embeddings from Qdrant Cloud
        try:
            from app.vectoredb.embedding_handler import EmbeddingHandler
            embedding_handler = EmbeddingHandler()
            
            # Delete website embeddings from Qdrant
            qdrant_deleted = embedding_handler.delete_website_embeddings(website_id)
            if qdrant_deleted:
                print(f" Successfully deleted Qdrant embeddings for website: {website_id}")
            else:
                print(f" Warning: Could not delete Qdrant embeddings for website: {website_id}")
                
        except Exception as e:
            print(f"  Error deleting Qdrant embeddings: {e}")
            # Continue with deletion even if Qdrant fails
        
        # STEP 2: Delete from database (cascading delete will remove all related records)
        try:
            conn = db_manager.get_connection()
            cursor = conn.cursor()
            
            # Delete from websites table (cascade will handle chat_history, contact_forms, etc.)
            cursor.execute("DELETE FROM websites WHERE website_id = %s", (website_id,))
            deleted_rows = cursor.rowcount
            
            conn.commit()
            cursor.close()
            conn.close()
            
            if deleted_rows > 0:
                print(f" Deleted website from database: {website_id}")
            else:
                print(f" Website not found in database: {website_id}")
                
        except Exception as db_error:
            print(f"  Error deleting from database: {db_error}")
            # Continue with file deletion even if database fails
        
        # STEP 3: Delete local files and directories
        website_dir = os.path.join("data", website_id)
        if os.path.exists(website_dir):
            try:
                shutil.rmtree(website_dir)
                print(f" Deleted website directory: {website_dir}")
            except Exception as dir_error:
                print(f"  Error deleting website directory: {dir_error}")
        
        # STEP 4: Delete script file
        script_file = os.path.join("generated_scripts", f"chatbot_{website_id}.js")
        if os.path.exists(script_file):
            try:
                os.remove(script_file)
                print(f" Deleted script file: {script_file}")
            except Exception as script_error:
                print(f"  Error deleting script file: {script_error}")
        
        # STEP 5: Remove from training status
        if website_id in training_status:
            del training_status[website_id]
        
        # STEP 6: Remove website from user's website_ids
        if user.get('role') != 'admin':
            auth_service.remove_website_from_user(user['id'], website_id)
        
        return {
            "success": True,
            "message": f"Website {website_id} and all associated data deleted successfully",
            "website_id": website_id,
            "deleted_from": {
                "qdrant": True,
                "database": True,
                "filesystem": True
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"  Delete website error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Deletion failed",
                "message": str(e)
            }
        )


# ======================
# CHAT ROUTES
# ======================

@app.post("/api/chat")
async def chat_with_website(request: ChatRequest):
    """Chat with website chatbot - Qdrant Cloud only"""
    try:
        print(f" Chat request for website: {request.website_id}, "
              f"question: {request.question[:50]}...")
        
        # Check if website exists in database
        website = db_manager.get_website(request.website_id)
        
        if not website:
            raise HTTPException(
                status_code=404,
                detail={
                    "success": False,
                    "error": "Website not found",
                    "message": f"Website with ID {request.website_id} not found. Please train it first."
                }
            )
        
        # Check for embeddings in Qdrant Cloud
        try:
            from app.vectoredb.embedding_handler import EmbeddingHandler
            embedding_handler = EmbeddingHandler()
            
            # Use the dedicated method to check embeddings
            has_embeddings = embedding_handler.check_embeddings_exist(request.website_id)
            
            if not has_embeddings:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "success": False,
                        "error": "Embeddings not found",
                        "message": "No embeddings found in Qdrant Cloud. Please train the website first."
                    }
                )
            
            print(f" Verified embeddings in Qdrant Cloud for website: {request.website_id}")
            
        except Exception as e:
            print(f"  Error checking Qdrant: {e}")
            raise HTTPException(
                status_code=500,
                detail={
                    "success": False,
                    "error": "Qdrant connection failed",
                    "message": f" {str(e)}"
                }
            )
        
        # Load session data if session_id provided
        session_data = None
        if request.session_id:
            session_data = load_session_data(request.session_id)
            if session_data:
                # Update last active timestamp
                session_data["last_active"] = datetime.now().isoformat()
                # Add message to session
                session_data["messages"].append({
                    'role': 'user',
                    'message': request.question,
                    'timestamp': datetime.now().isoformat()
                })
                save_session_data(request.session_id, session_data)
        
        try:
            # Use the chat agent (it now handles database saving internally)
            response = await chat_agent.chat(
                question=request.question,
                website_id=request.website_id,
                conversation_id=request.conversation_id,
                user_info=request.user_info,
                session_id=request.session_id
            )
        except AttributeError as e:
            # If chat agent doesn't have chat method, fallback to simple response
            print(f" ChatAgent chat method error: {e}. Using fallback.")
            
            # Try to search in Qdrant directly
            try:
                from app.vectoredb.embedding_handler import EmbeddingHandler
                handler = EmbeddingHandler()
                
                # Search for similar content
                search_results = handler.search_similar_content(
                    website_id=request.website_id,
                    query=request.question,
                    top_k=3
                )
                
                if search_results:
                    # Build context from search results
                    context = "\n\n".join([f"Content: {r['text'][:500]}..." for r in search_results])
                    response = f"Based on your website content: {context[:200]}..."
                else:
                    response = "I'm your AI assistant. How can I help you today?"
                    
            except Exception as search_error:
                print(f" Direct search error: {search_error}")
                response = "I'm your AI assistant. How can I help you today? Please note that advanced chat features are currently being configured."
            
            # Save to database for fallback case
            if request.conversation_id:
                user_message_data = {
                    'website_id': request.website_id,
                    'conversation_id': request.conversation_id,
                    'session_id': request.session_id,
                    'user_name': request.user_info.get('full_name', '') if request.user_info else '',
                    'user_email': request.user_info.get('email', '') if request.user_info else '',
                    'role': 'user',
                    'message': request.question,
                    'metadata': {
                        'timestamp': datetime.now().isoformat(),
                        'user_info': request.user_info if request.user_info else {}
                    }
                }
                db_manager.save_chat_message(user_message_data)
                
                bot_message_data = {
                    'website_id': request.website_id,
                    'conversation_id': request.conversation_id,
                    'session_id': request.session_id,
                    'user_name': request.user_info.get('full_name', '') if request.user_info else '',
                    'user_email': request.user_info.get('email', '') if request.user_info else '',
                    'role': 'assistant',
                    'message': response,
                    'metadata': {
                        'timestamp': datetime.now().isoformat(),
                        'response_length': len(response)
                    }
                }
                db_manager.save_chat_message(bot_message_data)
        
        # Update session with assistant response
        if session_data:
            session_data["messages"].append({
                'role': 'assistant',
                'message': response,
                'timestamp': datetime.now().isoformat()
            })
            save_session_data(request.session_id, session_data)
        
        print(f" Chat response generated ({len(response)} chars)")
        
        return {
            "success": True,
            "website_id": request.website_id,
            "conversation_id": request.conversation_id or f"conv_{int(datetime.now().timestamp())}",
            "question": request.question,
            "response": response,
            "timestamp": datetime.now().isoformat(),
            "response_length": len(response)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"  Chat error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Chat failed",
                "message": str(e)
            }
        )

@app.post("/api/contact")
async def submit_contact_form(request: ContactFormRequest):
    """Submit contact form and send email to admin"""
    try:
        # Save to database
        form_data = {
            'name': request.name,
            'email': request.email,
            'phone': request.phone,
            'message': request.message,
            'additional_data': request.additional_data
        }
        
        form_id = db_manager.save_contact_form(request.website_id, form_data)
        
        # Get admin email for this website
        website = db_manager.get_website(request.website_id)
        admin_email = website.get('admin_email') if website else None
        
        # Send email to admin (NO welcome email to user)
        if admin_email:
            email_service.send_contact_form_notification(
                website_id=request.website_id,
                admin_email=admin_email,
                form_data=form_data
            )
        
        # Save to chat history as system message
        system_message_data = {
            'website_id': request.website_id,
            'conversation_id': f"contact_{form_id}",
            'role': 'system',
            'message': f"Contact form submitted by {request.name} ({request.email}): {request.message[:100]}...",
            'metadata': {
                'event': 'contact_form',
                'form_id': form_id,
                'admin_notified': admin_email is not None,
                'timestamp': datetime.now().isoformat()
            }
        }
        db_manager.save_chat_message(system_message_data)
        
        return {
            "success": True,
            "message": "Contact form submitted successfully",
            "form_id": form_id,
            "admin_notified": admin_email is not None,
            "website_id": request.website_id
        }
        
    except Exception as e:
        print(f"  Contact form error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Submission failed",
                "message": str(e)
            }
        )

@app.get("/api/contact/forms/{website_id}")
async def get_contact_forms(
    website_id: str,
    limit: int = 100,
    user: dict = Depends(get_current_user)
):
    """Get contact forms for a website"""
    try:
        conn = db_manager.get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute(
            "SELECT * FROM contact_forms WHERE website_id = %s ORDER BY created_at DESC LIMIT %s",
            (website_id, limit)
        )
        forms = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        return {
            "success": True,
            "website_id": website_id,
            "forms": forms,
            "count": len(forms)
        }
    except Exception as e:
        print(f"Error getting contact forms: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/chat/history/{website_id}")
async def get_chat_history(website_id: str, conversation_id: Optional[str] = None, limit: int = 50):
    """Get chat history for website or conversation"""
    try:
        if conversation_id:
            history = db_manager.get_chat_history(website_id, conversation_id, limit)
        else:
            history = db_manager.get_chat_history(website_id, limit=limit)
        
        return {
            "success": True,
            "website_id": website_id,
            "conversation_id": conversation_id,
            "history": history,
            "count": len(history)
        }
    except Exception as e:
        print(f"  Get chat history error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat/send-report")
async def send_chat_report(request: SendChatReportRequest):
    """Send chat history report to admin"""
    try:
        # Get chat history
        chat_history = db_manager.get_full_conversation(request.conversation_id)
        
        if not chat_history:
            raise HTTPException(
                status_code=404,
                detail="No chat history found for this conversation"
            )
        
        # Get website info
        website = db_manager.get_website(request.website_id)
        if not website:
            raise HTTPException(
                status_code=404,
                detail="Website not found"
            )
        
        # Get user info from first message
        user_info = {}
        for message in chat_history:
            if message.get('user_name'):
                user_info = {
                    'full_name': message.get('user_name', 'Unknown'),
                    'email': message.get('user_email', 'Unknown'),
                    'mobile': message.get('user_phone', 'Unknown')
                }
                break
        
        # Send chat session report to admin
        if website.get('admin_email'):
            email_service.send_chat_session_report(
                website_id=request.website_id,
                admin_email=website.get('admin_email'),
                conversation_id=request.conversation_id,
                chat_history=chat_history,
                user_info=user_info
            )
        
        # Save report event to database
        system_message_data = {
            'website_id': request.website_id,
            'conversation_id': request.conversation_id,
            'role': 'system',
            'message': f"Chat history report sent to admin",
            'metadata': {
                'event': 'chat_report',
                'admin_email': website.get('admin_email'),
                'message_count': len(chat_history),
                'timestamp': datetime.now().isoformat()
            }
        }
        db_manager.save_chat_message(system_message_data)
        
        return {
            "success": True,
            "admin_notified": website.get('admin_email') is not None,
            "conversation_id": request.conversation_id,
            "message_count": len(chat_history),
            "website_id": request.website_id
        }
        
    except Exception as e:
        print(f"  Send chat report error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat/end-session")
async def end_chat_session(request: EndSessionRequest):
    """End chat session and send report to admin"""
    try:
        session_id = request.session_id
        
        # Load session data
        session_data = load_session_data(session_id)
        
        if not session_data:
            # Try to find session by conversation ID in database
            # First, get all websites and search for the session
            websites = db_manager.get_all_websites()
            found_conversation = None
            found_website_id = None
            
            for website in websites:
                conversations = db_manager.get_conversations(website['website_id'], limit=100)
                for conv in conversations:
                    # Check if session_id matches or is in conversation metadata
                    if conv.get('conversation_id') and session_id in conv.get('conversation_id', ''):
                        found_conversation = conv
                        found_website_id = website['website_id']
                        break
                if found_conversation:
                    break
            
            if not found_conversation:
                raise HTTPException(
                    status_code=404,
                    detail={
                        "success": False,
                        "error": "Session not found",
                        "message": "Chat session not found"
                    }
                )
            
            # Get chat history for this conversation
            chat_history = db_manager.get_chat_history(
                website_id=found_website_id,
                conversation_id=found_conversation.get('conversation_id'),
                limit=100
            )
            
            if not chat_history:
                raise HTTPException(
                    status_code=404,
                    detail={
                        "success": False,
                        "error": "No chat history found",
                        "message": "No messages found for this session"
                    }
                )
            
            # Get user info from first message
            user_info = {}
            for message in chat_history:
                if message.get('user_name'):
                    user_info = {
                        'full_name': message.get('user_name', 'Unknown'),
                        'email': message.get('user_email', 'Unknown'),
                        'mobile': message.get('user_phone', 'Unknown')
                    }
                    break
            
            website_id = found_website_id
            conversation_id = found_conversation.get('conversation_id')
        else:
            user_info = session_data.get("user_info", {})
            website_id = user_info.get("website_id")
            conversation_id = user_info.get("conversation_id")
            chat_history = db_manager.get_chat_history(
                website_id=website_id,
                conversation_id=conversation_id,
                limit=100
            )
        
        if not website_id or not conversation_id:
            raise HTTPException(
                status_code=400,
                detail={
                    "success": False,
                    "error": "Invalid session data",
                    "message": "Missing website ID or conversation ID"
                }
            )
        
        # Get admin email
        website = db_manager.get_website(website_id)
        admin_email = website.get('admin_email') if website else None
        
        # Send chat session report to admin
        if admin_email and chat_history:
            email_service.send_chat_session_report(
                website_id=website_id,
                admin_email=admin_email,
                conversation_id=conversation_id,
                chat_history=chat_history,
                user_info=user_info
            )
        
        # Delete session data
        delete_session_data(session_id)
        
        return {
            "success": True,
            "message": "Chat session ended and report sent to admin",
            "session_id": session_id,
            "messages_count": len(chat_history) if chat_history else 0,
            "admin_notified": admin_email is not None
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"  End chat session error: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Internal server error",
                "message": str(e)
            }
        )

@app.post("/api/chat/auto-report")
async def auto_report_chat_session(session_id: str = Form(...)):
    """Auto-report chat session when browser closes/refreshes"""
    try:
        print(f" Auto-report triggered for session: {session_id}")
        
        # Load session data
        session_data = load_session_data(session_id)
        
        if not session_data:
            # Try to get chat history from database
            chat_history = db_manager.get_chat_history_by_session(session_id, limit=100)
            
            if not chat_history:
                return JSONResponse(
                    status_code=404,
                    content={
                        "success": False,
                        "error": "Session not found",
                        "message": f"No chat history found for session: {session_id}"
                    }
                )
            
            # Find website ID from chat history
            website_id = chat_history[0].get('website_id') if chat_history else None
            conversation_id = chat_history[0].get('conversation_id') if chat_history else None
            
            if not website_id or not conversation_id:
                return JSONResponse(
                    status_code=400,
                    content={
                        "success": False,
                        "error": "Invalid session data",
                        "message": "Missing website ID or conversation ID"
                    }
                )
            
            # Get user info from first message
            user_info = {}
            for message in chat_history:
                if message.get('user_name'):
                    user_info = {
                        'full_name': message.get('user_name', 'Unknown'),
                        'email': message.get('user_email', 'Unknown'),
                        'mobile': message.get('user_phone', 'Unknown')
                    }
                    break
        else:
            user_info = session_data.get("user_info", {})
            website_id = user_info.get("website_id")
            conversation_id = user_info.get("conversation_id")
            chat_history = db_manager.get_chat_history(
                website_id=website_id,
                conversation_id=conversation_id,
                limit=100
            )
        
        if not website_id or not conversation_id:
            delete_session_data(session_id)
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Invalid session data",
                    "message": "Missing website ID or conversation ID"
                }
            )
        
        if not chat_history or len(chat_history) < 2:  # At least one user and one assistant message
            delete_session_data(session_id)
            return {
                "success": True,
                "message": "No significant chat history to report",
                "session_id": session_id,
                "messages_count": len(chat_history) if chat_history else 0
            }
        
        # Get website info
        website = db_manager.get_website(website_id)
        admin_email = website.get('admin_email') if website else None
        
        # Send auto-report email to admin
        if admin_email:
            email_service.send_chat_session_report(
                website_id=website_id,
                admin_email=admin_email,
                conversation_id=conversation_id,
                chat_history=chat_history,
                user_info=user_info,
                is_auto_report=True
            )
            
            print(f" Auto-sent chat report for session: {session_id}")
            
            # Save auto-report event
            system_message_data = {
                'website_id': website_id,
                'conversation_id': conversation_id,
                'role': 'system',
                'message': 'Chat session auto-reported (browser closed/refreshed)',
                'metadata': {
                    'event': 'auto_report',
                    'session_id': session_id,
                    'admin_email': admin_email,
                    'message_count': len(chat_history),
                    'timestamp': datetime.now().isoformat()
                }
            }
            db_manager.save_chat_message(system_message_data)
        
        # Delete session file
        delete_session_data(session_id)
        
        return {
            "success": True,
            "message": "Chat session auto-reported successfully",
            "session_id": session_id,
            "messages_count": len(chat_history) if chat_history else 0,
            "admin_notified": admin_email is not None
        }
        
    except Exception as e:
        print(f"  Auto-report error: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "Internal server error",
                "message": str(e)
            }
        )

@app.websocket("/ws/chat/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await manager.connect(websocket, session_id)
    try:
        while True:
            data = await websocket.receive_text()
            # Handle WebSocket messages if needed
    except WebSocketDisconnect:
        manager.disconnect(session_id)
        # Auto-send chat report when WebSocket disconnects (browser closed/refreshed)
        try:
            # Wait a moment to ensure all messages are saved
            await asyncio.sleep(1)
            
            # Call auto-report endpoint using HTTP client
            import httpx
            async with httpx.AsyncClient(timeout=10.0) as client:
                try:
                    response = await client.post(
                        f"{BASE_URL}/api/chat/auto-report",
                        data={"session_id": session_id}
                    )
                    if response.status_code == 200:
                        print(f" WebSocket auto-report successful for session: {session_id}")
                    else:
                        print(f" WebSocket auto-report failed: {response.status_code} - {response.text}")
                except Exception as e:
                    print(f" WebSocket auto-report HTTP error: {e}")
            
            print(f" Auto-report triggered for session: {session_id}")
        except Exception as e:
            print(f" Error in WebSocket auto-report: {e}")


# ======================
# FILE UPLOAD ROUTES
# ======================

@app.post("/api/upload/{website_id}")
async def upload_files(
    website_id: str,
    files: List[UploadFile] = File(...),
    background_tasks: BackgroundTasks = None
):
    """Upload additional files to existing website"""
    try:
        print(f" Upload request for website: {website_id}, files: {[f.filename for f in files]}")
        
        # Check if website exists
        website_dir = os.path.join("data", website_id)
        if not os.path.exists(website_dir):
            raise HTTPException(
                status_code=404,
                detail={
                    "success": False,
                    "error": "Website not found",
                    "message": f"Website with ID {website_id} not found. Please train it first."
                }
            )
        
        # Create uploads directory
        upload_dir = os.path.join(website_dir, "uploads")
        os.makedirs(upload_dir, exist_ok=True)
        
        uploaded_files = []
        successful_uploads = 0
        failed_uploads = 0
        
        for file in files:
            try:
                # Generate safe filename
                safe_filename = "".join(c for c in file.filename if c.isalnum() or c in ('.', '-', '_')).rstrip()
                if not safe_filename:
                    safe_filename = f"file_{uuid.uuid4()[:8]}"
                
                # Save uploaded file
                file_path = os.path.join(upload_dir, safe_filename)
                async with aiofiles.open(file_path, 'wb') as f:
                    content = await file.read()
                    await f.write(content)
                
                # Process the file immediately
                try:
                    processed_content = file_processor.process_file(file_path)
                    processed = True
                    chunks = len(processed_content)
                    
                    # Save processed content for reindexing
                    processed_file = os.path.join(upload_dir, f"{safe_filename}_processed.json")
                    with open(processed_file, 'w', encoding='utf-8') as f:
                        json.dump(processed_content, f, ensure_ascii=False, indent=2)
                    
                except Exception as e:
                    print(f" Error processing {file.filename}: {e}")
                    processed = False
                    chunks = 0
                    failed_uploads += 1
                
                if processed:
                    successful_uploads += 1
                
                # Save file record to database
                file_data = {
                    'filename': safe_filename,
                    'file_path': file_path,
                    'file_type': os.path.splitext(safe_filename)[1][1:],
                    'file_size': len(content),
                    'upload_type': 'user_upload',
                    'processed': processed,
                    'chunk_count': chunks
                }
                db_manager.save_file_record(website_id, file_data)
                
                uploaded_files.append({
                    "original_filename": file.filename,
                    "saved_filename": safe_filename,
                    "size": len(content),
                    "saved_path": file_path,
                    "processed": processed,
                    "chunks": chunks,
                    "uploaded_at": datetime.now().isoformat(),
                    "success": processed
                })
                
                print(f" Uploaded: {file.filename} -> {safe_filename} ({len(content)} bytes, processed: {processed})")
                
            except Exception as e:
                print(f"  Error uploading {file.filename}: {e}")
                failed_uploads += 1
                uploaded_files.append({
                    "original_filename": file.filename,
                    "error": str(e),
                    "processed": False,
                    "success": False
                })
        
        # Save uploads metadata
        uploads_meta = os.path.join(upload_dir, "uploads_metadata.json")
        try:
            # Load existing metadata if exists
            existing_uploads = []
            if os.path.exists(uploads_meta):
                with open(uploads_meta, 'r', encoding='utf-8') as f:
                    existing_uploads = json.load(f)
            
            # Combine with new uploads
            all_uploads = existing_uploads + uploaded_files
            
            with open(uploads_meta, 'w', encoding='utf-8') as f:
                json.dump(all_uploads, f, ensure_ascii=False, indent=2)
            
            print(f"Saved uploads metadata for {website_id}")
            
        except Exception as e:
            print(f" Warning: Could not save uploads metadata: {e}")
        
        # Start background task to reindex embeddings with uploaded files
        if successful_uploads > 0 and background_tasks:
            background_tasks.add_task(reindex_with_uploads, website_id)
            message = f"Uploaded {successful_uploads} file(s) successfully! Files are being processed in the background..."
        else:
            message = f"Uploaded {successful_uploads} out of {len(files)} files successfully"
            if failed_uploads > 0:
                message += f", {failed_uploads} failed"
        
        return {
            "success": True,
            "message": message,
            "website_id": website_id,
            "uploaded_files": uploaded_files,
            "total_files": len(files),
            "successful_uploads": successful_uploads,
            "failed_uploads": failed_uploads,
            "upload_dir": upload_dir,
            "reindexing": successful_uploads > 0
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"  Upload error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Upload failed",
                "message": str(e)
            }
        )

async def reindex_with_uploads(website_id: str):
    """Reindex embeddings to include uploaded files"""
    try:
        print(f" Starting reindex for website: {website_id}")
        
        website_dir = os.path.join("data", website_id)
        upload_dir = os.path.join(website_dir, "uploads")
        
        if not os.path.exists(upload_dir):
            print(f" No uploads directory for {website_id}")
            return
        
        # Load website data
        data_file = os.path.join(website_dir, "website_data.json")
        if not os.path.exists(data_file):
            print(f" No website data found for {website_id}")
            return
        
        with open(data_file, 'r', encoding='utf-8') as f:
            website_data = json.load(f)
        
        # Load processed uploads
        all_documents = website_data.copy()
        
        # Find all processed upload files
        processed_files = []
        for filename in os.listdir(upload_dir):
            if filename.endswith('_processed.json'):
                processed_files.append(os.path.join(upload_dir, filename))
        
        for processed_file in processed_files:
            try:
                with open(processed_file, 'r', encoding='utf-8') as f:
                    uploaded_docs = json.load(f)
                    all_documents.extend(uploaded_docs)
            except Exception as e:
                print(f" Error loading processed file {processed_file}: {e}")
        
        print(f"   Reindexing with {len(all_documents)} total documents "
              f"({len(website_data)} website + {len(all_documents) - len(website_data)} uploaded)")
        
        # Create new embeddings with all documents
        embedding_info = embedding_handler.create_embeddings(website_id, all_documents)
        
        print(f" Reindex completed: {len(all_documents)} documents indexed")
        
        # Update training info
        info_file = os.path.join(website_dir, "training_info.json")
        if os.path.exists(info_file):
            with open(info_file, 'r', encoding='utf-8') as f:
                info = json.load(f)
            
            info["total_documents"] = len(all_documents)
            info["uploaded_documents"] = len(all_documents) - len(website_data)
            info["last_reindex"] = datetime.now().isoformat()
            
            with open(info_file, 'w', encoding='utf-8') as f:
                json.dump(info, f, ensure_ascii=False, indent=2)
        
        # Update database training log
        db_manager.save_training_log(website_id, {
            'status': 'completed',
            'message': 'Reindexing completed',
            'data_points': len(all_documents),
            'embedding_count': len(all_documents)
        })
        
        return True
        
    except Exception as e:
        print(f"  Reindex error: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

# In your Flask/FastAPI backend
@app.route('/api/preview-file/<website_id>', methods=['GET'])
def preview_file(website_id):
    filename = request.args.get('filename')
    if not filename:
        return jsonify({'success': False, 'message': 'Filename required'}), 400
    
    file_path = os.path.join(UPLOAD_FOLDER, website_id, 'uploads', filename)
    
    if not os.path.exists(file_path):
        return jsonify({'success': False, 'message': 'File not found'}), 404
    
    # Check if it's a text file
    ext = filename.split('.')[-1].lower()
    text_extensions = ['txt', 'md', 'json', 'js', 'py', 'html', 'css', 'xml', 'csv']
    
    if ext in text_extensions:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            return jsonify({'success': True, 'content': content})
        except Exception as e:
            return jsonify({'success': False, 'message': str(e)}), 500
    else:
        return jsonify({'success': False, 'message': 'Not a text file'}), 400

@app.get("/api/website-uploads/{website_id}")
async def get_website_uploads(website_id: str):
    """Get all uploads for a website"""
    try:
        website_dir = os.path.join("data", website_id)
        upload_dir = os.path.join(website_dir, "uploads")
        
        if not os.path.exists(upload_dir):
            return {
                "success": True,
                "website_id": website_id,
                "uploads": [],
                "files": [],
                "upload_count": 0
            }
        
        # Get uploads metadata
        uploads_meta = os.path.join(upload_dir, "uploads_metadata.json")
        uploads = []
        if os.path.exists(uploads_meta):
            with open(uploads_meta, 'r') as f:
                uploads = json.load(f)
        
        # Get actual files
        files = []
        for filename in os.listdir(upload_dir):
            if not filename.endswith(('_processed.json', '_metadata.json')):
                file_path = os.path.join(upload_dir, filename)
                if os.path.isfile(file_path):
                    files.append({
                        "filename": filename,
                        "path": file_path,
                        "size": os.path.getsize(file_path),
                        "type": filename.split('.')[-1].upper() if '.' in filename else "UNKNOWN",
                        "modified": datetime.fromtimestamp(os.path.getmtime(file_path)).isoformat()
                    })
        
        return {
            "success": True,
            "website_id": website_id,
            "uploads": uploads,
            "files": files,
            "upload_count": len(uploads)
        }
        
    except Exception as e:
        print(f"  Get uploads error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/delete-file/{website_id}")
async def delete_uploaded_file(website_id: str, request: Dict[str, Any]):
    """Delete uploaded file from both filesystem and database"""
    try:
        filename = request.get('filename')
        if not filename:
            raise HTTPException(status_code=400, detail={
                "success": False,
                "error": "Filename required",
                "message": "Please provide filename to delete"
            })
        
        website_dir = os.path.join("data", website_id)
        upload_dir = os.path.join(website_dir, "uploads")
        
        if not os.path.exists(upload_dir):
            raise HTTPException(status_code=404, detail={
                "success": False,
                "error": "Upload directory not found",
                "message": f"Upload directory not found for website {website_id}"
            })
        
        # Delete the file from filesystem
        file_path = os.path.join(upload_dir, filename)
        if os.path.exists(file_path):
            os.remove(file_path)
            print(f" Deleted file: {file_path}")
        
        # Delete processed file if exists
        processed_file = os.path.join(upload_dir, f"{filename}_processed.json")
        if os.path.exists(processed_file):
            os.remove(processed_file)
            print(f" Deleted processed file: {processed_file}")
        
        # Delete from database
        try:
            conn = db_manager.get_connection()
            cursor = conn.cursor()
            
            # Delete from website_files table
            cursor.execute(
                "DELETE FROM website_files WHERE website_id = %s AND filename = %s",
                (website_id, filename)
            )
            
            deleted_rows = cursor.rowcount
            
            conn.commit()
            cursor.close()
            
            if deleted_rows == 0:
                print(f" File {filename} not found in database")
            else:
                print(f" Deleted file {filename} from database")
                
        except Exception as db_error:
            print(f" Error deleting from database: {db_error}")
            # Continue even if database deletion fails
        
        # Update metadata
        uploads_meta = os.path.join(upload_dir, "uploads_metadata.json")
        if os.path.exists(uploads_meta):
            try:
                with open(uploads_meta, 'r') as f:
                    uploads_data = json.load(f)
                
                # Remove the deleted file from metadata
                original_count = len(uploads_data)
                uploads_data = [u for u in uploads_data if u.get('saved_filename') != filename]
                
                with open(uploads_meta, 'w') as f:
                    json.dump(uploads_data, f, indent=2)
                
                print(f"Updated metadata: Removed {original_count - len(uploads_data)} entries")
                
            except Exception as meta_error:
                print(f" Error updating metadata: {meta_error}")
        
        return {
            "success": True,
            "message": f"File {filename} deleted successfully from filesystem and database",
            "website_id": website_id,
            "filename": filename
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"  Delete file error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Deletion failed",
                "message": str(e)
            }
        )


# ======================
# SCRIPT GENERATION ROUTES
# ======================

@app.get("/api/generate-script/{website_id}")
async def generate_script(website_id: str):
    """Generate chatbot script for embedding - Qdrant Cloud only"""
    try:
        print(f" Generating script for website: {website_id}")
        
        # Check if website exists in database
        website = db_manager.get_website(website_id)
        if not website:
            raise HTTPException(
                status_code=404,
                detail={
                    "success": False,
                    "error": "Website not found",
                    "message": f"Website with ID {website_id} not found in database. Please train it first."
                }
            )
        
        # Check for embeddings in Qdrant Cloud
        try:
            from app.vectoredb.embedding_handler import EmbeddingHandler
            handler = EmbeddingHandler()
            
            # Try to search for a test query
            test_results = handler.search_similar_content(
                website_id=website_id,
                query="test",
                top_k=1
            )
            
            has_embeddings = len(test_results) > 0
            
            if not has_embeddings:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "success": False,
                        "error": "Embeddings not found",
                        "message": f"No embeddings found in Qdrant Cloud for website '{website.get('website_name', website_id)}'. Please train the website first.",
                        "website_id": website_id,
                        "website_name": website.get('website_name', website_id),
                        "storage": "Qdrant Cloud",
                        "resolution": "Use /api/train endpoint to train the website"
                    }
                )
            
            print(f" Verified embeddings in Qdrant Cloud for website: {website_id}")
            
        except Exception as e:
            print(f"  Error checking Qdrant: {e}")
            raise HTTPException(
                status_code=500,
                detail={
                    "success": False,
                    "error": "Qdrant connection failed",
                    "message": f"Could not verify embeddings in Qdrant: {str(e)}",
                    "website_id": website_id
                }
            )
        
        # Generate script
        try:
            generator = ChatbotGenerator()
            script_path = generator.generate_script_file(website_id)
            script_url = generator.generate_script_url(website_id)
            embed_code = generator.generate_embed_code(website_id)
            
            # Update database with script tag
            db_manager.update_website_script(website_id, embed_code)
            
            # Read script content to verify
            with open(script_path, 'r', encoding='utf-8') as f:
                script_content = f.read()
            
            print(f" Script generated successfully: {script_path}")
            
            # Get admin email for this website
            admin_email = website.get('admin_email')
            
            # Send notification email if admin exists
            if admin_email:
                try:
                    from app.services.email_service import email_service
                    email_service.send_training_completion_email(
                        website_id=website_id,
                        admin_email=admin_email,
                        website_name=website.get('website_name', website_id),
                        script_url=script_url,
                        embed_code=embed_code,
                        training_data={
                            'website_url': website.get('website_url', ''),
                            'data_points': website.get('stats', {}).get('total_documents', 0),
                            'training_time': 'Ready',
                            'storage': 'Qdrant Cloud'
                        }
                    )
                except Exception as email_error:
                    print(f" Email notification failed: {email_error}")
            
            return {
                "success": True,
                "message": "Script generated successfully",
                "website_id": website_id,
                "website_name": website.get('website_name', website_id),
                "script_url": script_url,
                "embed_code": embed_code,
                "script_path": script_path,
                "script_size": len(script_content),
                "storage": "Qdrant Cloud",
                "has_embeddings": True,
                "instructions": {
                    "step1": "Copy the embed code below",
                    "step2": "Paste it into your website's <head> section",
                    "step3": "The chatbot will appear in the bottom-right corner",
                    "step4": "Click the chat icon to start chatting"
                },
                "example_usage": f"""
<!DOCTYPE html>
<html>
<head>
    <title>Your Website</title>
    <!-- Chatbot Embed Code -->
    {embed_code}
    <!-- Other head elements -->
</head>
<body>
    <!-- Your website content -->
    <h1>Welcome to My Website</h1>
    <p>The AI chatbot will appear in the bottom-right corner.</p>
</body>
</html>
                """
            }
            
        except Exception as e:
            print(f"  Script generation error: {e}")
            raise HTTPException(
                status_code=500,
                detail={
                    "success": False,
                    "error": "Script generation failed",
                    "message": str(e),
                    "website_id": website_id
                }
            )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"  Generate script error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Internal server error",
                "message": str(e)
            }
        )

@app.get("/embed/{website_id}/script.js")
async def get_chatbot_script(website_id: str):
    """Serve the chatbot JavaScript file for embedding"""
    try:
        print(f" Serving script for website: {website_id}")
        
        # Check if script exists
        script_filename = f"chatbot_{website_id}.js"
        script_path = os.path.join("generated_scripts", script_filename)
        
        if not os.path.exists(script_path):
            # Check if website exists
            website_dir = os.path.join("data", website_id)
            if not os.path.exists(website_dir):
                raise HTTPException(
                    status_code=404,
                    detail={
                        "success": False,
                        "error": "Website not found",
                        "message": f"Website with ID {website_id} not found."
                    }
                )
            
            # Try to generate script
            try:
                print(f" Script not found, generating for {website_id}")
                script_path = chatbot_generator.generate_script_file(website_id)
            except Exception as e:
                raise HTTPException(
                    status_code=500,
                    detail={
                        "success": False,
                        "error": "Script generation failed",
                        "message": f"Failed to generate script: {str(e)}"
                    }
                )
        
        if not os.path.exists(script_path):
            raise HTTPException(
                status_code=404,
                detail={
                    "success": False,
                    "error": "Script not found",
                    "message": f"Script file not found for website {website_id}"
                }
            )
        
        # Read and return the file
        async with aiofiles.open(script_path, 'r', encoding='utf-8') as f:
            content = await f.read()
        
        print(f" Script served: {script_path} ({len(content)} bytes)")
        
        return HTMLResponse(
            content=content,
            media_type="application/javascript",
            headers={
                "Content-Type": "application/javascript; charset=utf-8",
                "Cache-Control": "public, max-age=3600",
                "Access-Control-Allow-Origin": "*",
                "X-Website-ID": website_id,
                "X-Script-Size": str(len(content))
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"  Script serve error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Internal server error",
                "message": str(e)
            }
        )


# ======================
# AUTHENTICATION ROUTES
# ======================

@app.post("/api/auth/register")
async def register_user(request: SignUpModel):
    """Register a new user"""
    # Validate passwords match
    if request.password != request.confirm_password:
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "error": "Passwords do not match"
            }
        )
    
    # Validate password strength
    if len(request.password) < 6:
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "error": "Password must be at least 6 characters long"
            }
        )
    
    # Register user
    result = auth_service.register_user({
        "full_name": request.full_name,
        "email": request.email,
        "mobile": request.mobile or "",
        "password": request.password
    })
    
    if not result['success']:
        raise HTTPException(
            status_code=400,
            detail=result
        )
    
    return result

@app.post("/api/auth/login")
async def login_user(request: UserLogin):
    """Login user or admin (checks both tables)"""
    # First try admin login
    admin_result = admin_auth_service.login_admin(request.email, request.password)
    
    if admin_result['success']:
        return admin_result
    
    # If not admin, try user login
    user_result = auth_service.login_user(request.email, request.password)
    
    if not user_result['success']:
        raise HTTPException(
            status_code=401,
            detail={
                "success": False,
                "error": "Invalid credentials",
                "message": "Please check your email and password"
            }
        )
    
    return user_result

@app.post("/api/auth/forgot-password")
async def forgot_password(request: ForgotPasswordRequest):
    """Initiate password reset process"""
    try:
        result = auth_service.initiate_password_reset(request.email)
        
        if not result['success']:
            raise HTTPException(
                status_code=400,
                detail=result
            )
        
        # Send OTP email (you'll need to implement email sending)
        # For now, we'll return the OTP in development mode
        # In production, remove the OTP from response
        otp = result.get('otp')
        
        # Get website info for email context
        # You may want to determine which website to use for email template
        # For simplicity, we'll use the first website or a default
        websites = db_manager.get_all_websites()
        website_id = websites[0]['website_id'] if websites else 'default'
        
        # Send OTP email
        email_service.send_password_reset_otp(
            website_id=website_id,
            user_email=request.email,
            user_name=result['user']['full_name'],
            otp=otp
        )
        
        # Remove OTP from response in production
        response_data = {
            "success": True,
            "message": "Password reset initiated. Check your email for OTP.",
            "reset_token": result['reset_token'],
            "expires_in": "10 minutes"
        }
        
        # In development, include OTP
        if os.getenv('ENVIRONMENT') == 'development':
            response_data['otp'] = otp
        
        return response_data
        
    except Exception as e:
        print(f"  Forgot password error: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Internal server error",
                "message": str(e)
            }
        )

@app.post("/api/auth/verify-otp")
async def verify_otp(request: VerifyOTPRequest):
    """Verify OTP for password reset"""
    try:
        result = auth_service.verify_otp(request.reset_token, request.otp)
        
        if not result['success']:
            raise HTTPException(
                status_code=400,
                detail=result
            )
        
        return {
            "success": True,
            "message": "OTP verified successfully",
            "reset_token": request.reset_token
        }
        
    except Exception as e:
        print(f"  OTP verification error: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Invalid OTP",
                "message": str(e)
            }
        )

@app.post("/api/auth/reset-password")
async def reset_password(request: ResetPasswordRequest):
    """Reset password with new password"""
    try:
        # Validate passwords match
        if request.new_password != request.confirm_password:
            raise HTTPException(
                status_code=400,
                detail={
                    "success": False,
                    "error": "Passwords do not match"
                }
            )
        
        # Validate password strength
        if len(request.new_password) < 6:
            raise HTTPException(
                status_code=400,
                detail={
                    "success": False,
                    "error": "New password must be at least 6 characters long"
                }
            )
        
        # Reset password
        result = auth_service.reset_password(
            request.reset_token,
            request.new_password
        )
        
        if not result['success']:
            raise HTTPException(
                status_code=400,
                detail=result
            )
        
        return {
            "success": True,
            "message": "Password reset successfully",
            "user": {
                "email": result['user']['email']
            }
        }
        
    except Exception as e:
        print(f"  Reset password error: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Internal server error",
                "message": str(e)
            }
        )

@app.get("/api/auth/me")
async def get_current_user_profile(user: dict = Depends(get_current_user)):
    """Get current user profile"""
    user_data = auth_service.get_user_by_id(user['id'])
    if not user_data:
        raise HTTPException(
            status_code=404,
            detail={"success": False, "error": "User not found"}
        )
    
    return {
        "success": True,
        "user": user_data
    }

@app.put("/api/auth/profile")
async def update_user_profile(
    request: UpdateProfile,
    user: dict = Depends(get_current_user)
):
    """Update user profile"""
    result = auth_service.update_user_profile(user['id'], request.dict(exclude_unset=True))
    
    if not result['success']:
        raise HTTPException(
            status_code=400,
            detail=result
        )
    
    return result

@app.put("/api/contact/form/{form_id}/status")
async def update_contact_form_status(
    form_id: int,
    request: Dict[str, str],
    user: dict = Depends(get_current_user)
):
    """Update contact form status"""
    try:
        new_status = request.get('status')
        if new_status not in ['pending', 'processed', 'spam']:
            raise HTTPException(status_code=400, detail="Invalid status")
        
        conn = db_manager.get_connection()
        cursor = conn.cursor()
        
        cursor.execute(
            "UPDATE contact_forms SET status = %s WHERE id = %s",
            (new_status, form_id)
        )
        
        conn.commit()
        cursor.close()
        conn.close()
        
        return {
            "success": True,
            "message": f"Form status updated to {new_status}",
            "form_id": form_id,
            "status": new_status
        }
        
    except Exception as e:
        print(f"Error updating contact form status: {e}")
        raise HTTPException(status_code=500, detail=str(e))    

@app.put("/api/auth/change-password")
async def change_password(
    request: ChangePassword,
    user: dict = Depends(get_current_user)
):
    """Change user password"""
    # Validate passwords match
    if request.new_password != request.confirm_password:
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "error": "New passwords do not match"
            }
        )
    
    # Validate password strength
    if len(request.new_password) < 6:
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "error": "New password must be at least 6 characters long"
            }
        )
    
    result = auth_service.change_password(
        user['id'],
        request.current_password,
        request.new_password
    )
    
    if not result['success']:
        raise HTTPException(
            status_code=400,
            detail=result
        )
    
    return result

@app.post("/api/auth/logout")
async def logout_user(user: dict = Depends(get_current_user)):
    """Logout user"""
    # Note: We need to get the token from the request
    # This requires a bit more work - we'll handle it in the frontend
    return {
        "success": True,
        "message": "Logout successful - please remove token from client"
    }


# ======================
# USER-SPECIFIC ROUTES
# ======================

@app.get("/api/user/websites")
async def get_user_websites(user: dict = Depends(get_current_user)):
    """Get all websites for current user"""
    try:
        # Use the new method that checks website_ids column
        websites = auth_service.get_user_websites_detailed(user['id'])
        
        return {
            "success": True,
            "websites": websites,
            "count": len(websites)
        }
    except Exception as e:
        print(f"  Get user websites error: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Internal server error",
                "message": str(e)
            }
        )

@app.get("/api/user/website-ids")
async def get_user_website_ids(user: dict = Depends(get_current_user)):
    """Get user's website IDs list"""
    try:
        user_data = auth_service.get_user_by_id(user['id'])
        if not user_data:
            raise HTTPException(
                status_code=404,
                detail={"success": False, "error": "User not found"}
            )
        
        return {
            "success": True,
            "website_ids": user_data.get('website_ids', []),
            "count": len(user_data.get('website_ids', []))
        }
    except Exception as e:
        print(f"  Get user website IDs error: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Internal server error",
                "message": str(e)
            }
        )

@app.get("/api/user/stats")
async def get_user_statistics(user: dict = Depends(get_current_user)):
    """Get user statistics"""
    try:
        stats = db_manager.get_user_stats(user['id'])
        
        return {
            "success": True,
            "user_id": user['id'],
            "statistics": stats
        }
    except Exception as e:
        print(f"  Get user stats error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ======================
# ADMIN ROUTES
# ======================

@app.get("/api/admin/users")
async def get_all_users(admin: dict = Depends(get_current_admin)):
    """Get all regular users (admin only)"""
    try:
        users = auth_service.get_all_users(admin['id'])
        
        return {
            "success": True,
            "users": users,
            "count": len(users)
        }
    except Exception as e:
        print(f"  Get all users error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/admin/admins")
async def get_all_admins(admin: dict = Depends(get_current_admin)):
    """Get all admins"""
    try:
        admins = admin_auth_service.get_all_admins(admin['id'])
        
        return {
            "success": True,
            "admins": admins,
            "count": len(admins)
        }
    except Exception as e:
        print(f"  Get all admins error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/admin/websites")
async def get_all_websites_admin(admin: dict = Depends(get_current_admin)):
    """Get all websites with owner info (admin only)"""
    try:
        conn = auth_service.get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute('''
            SELECT w.*, 
                   u.email as owner_email, 
                   u.full_name as owner_name,
                   u.id as owner_id
            FROM websites w
            LEFT JOIN users u ON w.user_id = u.id
            ORDER BY w.created_at DESC
        ''')
        
        websites = cursor.fetchall()
        cursor.close()
        conn.close()
        
        # Add stats to each website
        for website in websites:
            stats = db_manager.get_website_stats(website['website_id'])
            website['contact_forms_count'] = stats.get('contact_forms', 0)
            website['chat_messages_count'] = stats.get('chat_messages', 0)
            website['files_count'] = stats.get('files', 0)
        
        return {
            "success": True,
            "websites": websites,
            "count": len(websites)
        }
    except Exception as e:
        print(f"Error getting all websites admin: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/admin/stats")
async def get_admin_statistics(admin: dict = Depends(get_current_admin)):
    """Get admin dashboard statistics"""
    try:
        conn = auth_service.get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        stats = {}
        
        # Total users (from users table)
        cursor.execute("SELECT COUNT(*) as count FROM users WHERE is_active = TRUE")
        stats['total_users'] = cursor.fetchone()['count']
        
        # Total admins (from admins table)
        cursor.execute("SELECT COUNT(*) as count FROM admins WHERE is_active = TRUE")
        stats['total_admins'] = cursor.fetchone()['count']
        
        # Total websites
        cursor.execute("SELECT COUNT(*) as count FROM websites")
        stats['total_websites'] = cursor.fetchone()['count']
        
        # Active websites
        cursor.execute("SELECT COUNT(*) as count FROM websites WHERE status = 'active'")
        stats['active_websites'] = cursor.fetchone()['count']
        
        # Today's activity
        cursor.execute("SELECT COUNT(*) as count FROM websites WHERE DATE(created_at) = CURRENT_DATE")
        stats['websites_today'] = cursor.fetchone()['count']
        
        cursor.execute("SELECT COUNT(*) as count FROM contact_forms WHERE DATE(created_at) = CURRENT_DATE")
        stats['forms_today'] = cursor.fetchone()['count']
        
        cursor.execute("SELECT COUNT(*) as count FROM chat_history WHERE DATE(created_at) = CURRENT_DATE")
        stats['messages_today'] = cursor.fetchone()['count']
        
        cursor.close()
        conn.close()
        
        return {
            "success": True,
            "statistics": stats
        }
        
    except Error as e:
        print(f"  Get admin stats error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/admin/create-admin")
async def create_admin_user(
    request: CreateAdminRequest,
    admin: dict = Depends(get_current_admin)
):
    """Create a new admin user (admin only)"""
    result = admin_auth_service.create_admin(
        {
            "email": request.email,
            "full_name": request.full_name,
            "password": request.password
        },
        admin['id']  # Pass the creator admin ID
    )
    
    if not result['success']:
        raise HTTPException(
            status_code=400 if result.get('error') == 'Admin already exists with this email' else 500,
            detail=result
        )
    
    return result

@app.post("/api/admin/generate-hash")
async def generate_password_hash(
    request: GenerateHashRequest,
    admin: dict = Depends(get_current_admin)
):
    """Generate password hash for display purposes (admin only)"""
    result = admin_service.generate_password_hash(request.password)
    
    if not result['success']:
        raise HTTPException(status_code=500, detail=result)
    
    return result

@app.put("/api/admin/users/{user_id}/toggle")
async def toggle_user_status(
    user_id: int,
    request: Dict[str, Any],
    admin: dict = Depends(get_current_admin)
):
    """Toggle user active status (admin only)"""
    result = auth_service.toggle_user_status(user_id, admin['id'])
    
    if not result['success']:
        raise HTTPException(
            status_code=404 if result.get('error') == 'User not found' else 400,
            detail=result
        )
    
    return result

@app.put("/api/admin/admins/{admin_id}/toggle")
async def toggle_admin_status(
    admin_id: int,
    admin: dict = Depends(get_current_admin)
):
    """Toggle admin active status"""
    result = admin_auth_service.toggle_admin_status(admin_id, admin['id'])
    
    if not result['success']:
        raise HTTPException(
            status_code=404 if result.get('error') == 'Admin not found' else 400,
            detail=result
        )
    
    return result

@app.get("/api/admin/user-growth")
async def get_user_growth_data(admin: dict = Depends(get_current_admin)):
    """Get user growth data for charts (admin only)"""
    result = admin_service.get_user_growth_data()
    
    if not result['success']:
        raise HTTPException(status_code=500, detail=result)
    
    return result

@app.get("/api/admin/token-summary")
async def get_token_summary(
    days: int = 30,
    admin: dict = Depends(get_current_admin)
):
    """Get overall token usage summary (admin only)"""
    try:
        from app.tokens.token_counter import token_counter
        summary = token_counter.get_token_summary(days)
        
        return {
            "success": True,
            "summary": summary
        }
        
    except Exception as e:
        print(f"  Get token summary error: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Internal server error",
                "message": str(e)
            }
        )

@app.get("/api/admin/token/users")
async def get_all_users_token_usage(
    days: int = 30,
    admin: dict = Depends(get_current_admin)
):
    """Get token usage for all users (admin only)"""
    try:
        from app.tokens.token_counter import token_counter
        users = token_counter.get_all_users_token_usage(days)
        
        return {
            "success": True,
            "users": users,
            "count": len(users)
        }
        
    except Exception as e:
        print(f"  Get all users token usage error: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Internal server error",
                "message": str(e)
            }
        )

@app.get("/api/admin/token/user/{user_id}")
async def get_user_token_usage(
    user_id: int,
    days: int = 30,
    include_websites: bool = True,
    admin: dict = Depends(get_current_admin)
):
    """Get token usage for a specific user (admin only)"""
    try:
        from app.tokens.token_counter import token_counter
        usage = token_counter.get_user_token_usage(user_id, days, include_websites)
        
        if 'error' in usage:
            raise HTTPException(
                status_code=404,
                detail={
                    "success": False,
                    "error": usage['error']
                }
            )
        
        return {
            "success": True,
            "usage": usage
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"  Get user token usage error: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Internal server error",
                "message": str(e)
            }
        )

@app.get("/api/admin/token/website/{website_id}")
async def get_website_token_usage(
    website_id: str,
    days: int = 30,
    include_breakdown: bool = True,
    admin: dict = Depends(get_current_admin)
):
    """Get token usage for a specific website (admin only)"""
    try:
        from app.tokens.token_counter import token_counter
        usage = token_counter.get_website_token_usage(website_id, days, include_breakdown)
        
        if 'error' in usage:
            raise HTTPException(
                status_code=404,
                detail={
                    "success": False,
                    "error": usage['error']
                }
            )
        
        return {
            "success": True,
            "usage": usage
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"  Get website token usage error: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Internal server error",
                "message": str(e)
            }
        )

@app.get("/api/admin/token/user/{user_id}/websites")
async def get_user_websites_token_details(
    user_id: int,
    admin: dict = Depends(get_current_admin)
):
    """Get all websites for a user with their token details (for popup display)"""
    try:
        from app.tokens.token_counter import token_counter
        result = token_counter.get_user_websites_token_details(user_id)
        
        if not result['success']:
            raise HTTPException(
                status_code=404,
                detail={
                    "success": False,
                    "error": result.get('error', 'Failed to get website details')
                }
            )
        
        return result
        
    except Exception as e:
        print(f"  Get user websites token details error: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Internal server error",
                "message": str(e)
            }
        )

@app.post("/api/admin/token/recalculate")
async def recalculate_token_aggregates(
    website_id: Optional[str] = None,
    admin: dict = Depends(get_current_admin)
):
    """Recalculate token aggregates from raw data (admin only)"""
    try:
        from app.tokens.token_counter import token_counter
        success = token_counter.recalculate_aggregates(website_id)
        
        if success:
            return {
                "success": True,
                "message": f"Aggregates recalculated successfully for {'website ' + website_id if website_id else 'all websites'}"
            }
        else:
            raise HTTPException(
                status_code=500,
                detail={
                    "success": False,
                    "error": "Failed to recalculate aggregates"
                }
            )
        
    except Exception as e:
        print(f"  Recalculate token aggregates error: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Internal server error",
                "message": str(e)
            }
        )


# ======================
# PAYMENT ROUTES
# ======================

@app.get("/api/payments/plans")
async def get_subscription_plans():
    """Get all available subscription plans"""
    try:
        result = payment_service.get_subscription_plans()
        
        if not result['success']:
            raise HTTPException(
                status_code=400,
                detail=result
            )
        
        return result
        
    except Exception as e:
        print(f"  Get subscription plans error: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Internal server error",
                "message": str(e)
            }
        )

@app.post("/api/payments/create-order")
async def create_payment_order(
    request: CreateOrderRequest,
    user: dict = Depends(get_current_user)
):
    """Create a payment order for subscription"""
    try:
        result = payment_service.create_payment_order(user['id'], request.plan_id)
        
        if not result['success']:
            raise HTTPException(
                status_code=400,
                detail=result
            )
        
        return result
        
    except Exception as e:
        print(f"  Create payment order error: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Internal server error",
                "message": str(e)
            }
        )

@app.post("/api/payments/verify")
async def verify_payment(
    request: VerifyPaymentRequest,
    user: dict = Depends(get_current_user)
):
    """Verify payment and activate subscription"""
    try:
        payment_data = {
            'razorpay_payment_id': request.razorpay_payment_id,
            'razorpay_order_id': request.razorpay_order_id,
            'razorpay_signature': request.razorpay_signature
        }
        
        result = payment_service.verify_payment(payment_data)
        
        if not result['success']:
            raise HTTPException(
                status_code=400,
                detail=result
            )
        
        return result
        
    except Exception as e:
        print(f"  Verify payment error: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Internal server error",
                "message": str(e)
            }
        )

@app.get("/api/payments/user-subscription")
async def get_user_subscription(user: dict = Depends(get_current_user)):
    """Get user's active subscription"""
    try:
        result = payment_service.get_user_subscription(user['id'])
        
        if not result['success']:
            raise HTTPException(
                status_code=400,
                detail=result
            )
        
        return result
        
    except Exception as e:
        print(f"  Get user subscription error: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Internal server error",
                "message": str(e)
            }
        )

@app.get("/api/payments/check-access")
async def check_user_access(
    action: str = "train",
    user: dict = Depends(get_current_user)
):
    """Check if user can perform an action based on subscription"""
    try:
        result = payment_service.check_user_access(user['id'], action)
        
        if not result['success']:
            raise HTTPException(
                status_code=400,
                detail=result
            )
        
        return result
        
    except Exception as e:
        print(f"  Check user access error: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Internal server error",
                "message": str(e)
            }
        )

@app.get("/api/payments/history")
async def get_payment_history(
    limit: int = 10,
    user: dict = Depends(get_current_user)
):
    """Get user's payment history"""
    try:
        result = payment_service.get_payment_history(user['id'], limit)
        
        if not result['success']:
            raise HTTPException(
                status_code=400,
                detail=result
            )
        
        return result
        
    except Exception as e:
        print(f"  Get payment history error: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Internal server error",
                "message": str(e)
            }
        )

@app.post("/api/payments/cancel-subscription/{subscription_id}")
async def cancel_subscription(
    subscription_id: int,
    user: dict = Depends(get_current_user)
):
    """Cancel user subscription"""
    try:
        result = payment_service.cancel_subscription(user['id'], subscription_id)
        
        if not result['success']:
            raise HTTPException(
                status_code=400,
                detail=result
            )
        
        return result
        
    except Exception as e:
        print(f"  Cancel subscription error: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Internal server error",
                "message": str(e)
            }
        )

@app.post("/api/payments/test-verify")
async def test_verify_payment(
    request: VerifyPaymentRequest,
    user: dict = Depends(get_current_user)
):
    """Test endpoint for payment verification (for development)"""
    try:
        # Create a mock payment verification for testing
        payment_data = {
            'razorpay_payment_id': f"pay_test_{int(datetime.now().timestamp())}",
            'razorpay_order_id': request.razorpay_order_id,
            'razorpay_signature': request.razorpay_signature
        }
        
        # If order_id starts with "order_", find and update the subscription
        if request.razorpay_order_id.startswith('order_'):
            try:
                conn = auth_service.get_connection()
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                
                # Find subscription by payment_id
                cursor.execute('''
                    SELECT us.* FROM user_subscriptions us
                    WHERE us.payment_id = %s
                ''', (request.razorpay_order_id,))
                
                subscription = cursor.fetchone()
                
                if subscription:
                    # Update subscription
                    cursor.execute('''
                        UPDATE user_subscriptions 
                        SET payment_status = 'completed',
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = %s
                    ''', (subscription['id'],))
                    
                    # Update transaction
                    cursor.execute('''
                        UPDATE payment_transactions 
                        SET status = 'completed',
                            gateway_response = %s,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE subscription_id = %s
                    ''', (json.dumps(payment_data), subscription['id']))
                    
                    conn.commit()
                    
                    # Get updated subscription
                    cursor.execute('''
                        SELECT us.*, sp.plan_name, sp.price, sp.duration_days
                        FROM user_subscriptions us
                        JOIN subscription_plans sp ON us.plan_id = sp.id
                        WHERE us.id = %s
                    ''', (subscription['id'],))
                    
                    updated_subscription = cursor.fetchone()
                    
                    cursor.close()
                    conn.close()
                    
                    return {
                        "success": True,
                        "message": "Test payment verified successfully",
                        "subscription": updated_subscription,
                        "test_mode": True
                    }
                
                cursor.close()
                conn.close()
                
            except Error as e:
                print(f"  Test verification error: {e}")
        
        # Fallback response
        return {
            "success": True,
            "message": "Test payment verified (simulated)",
            "test_mode": True,
            "payment_data": payment_data
        }
        
    except Exception as e:
        print(f"  Test verify payment error: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Internal server error",
                "message": str(e)
            }
        )  


# ======================
# DEBUG/TEST ROUTES
# ======================



@app.post("/api/qdrant/create-index")
async def create_qdrant_index():
    """Create index for Qdrant collection (run this once)"""
    try:
        embedding_handler = EmbeddingHandler()
        success = embedding_handler.create_index_for_existing_collection()
        
        if success:
            return {
                "success": True,
                "message": "Index created successfully",
                "collection_name": embedding_handler.collection_name
            }
        else:
            raise HTTPException(
                status_code=500,
                detail={
                    "success": False,
                    "error": "Failed to create index"
                }
            )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": str(e)
            }
        )

@app.get("/api/debug-embeddings/{website_id}")
async def debug_embeddings(website_id: str):
    """Debug endpoint to check embeddings"""
    try:
        website_dir = os.path.join("data", website_id)
        
        if not os.path.exists(website_dir):
            return {
                "success": False,
                "error": "Website directory not found",
                "message": f"No data found for website ID: {website_id}"
            }
        
        # Check website_data.json
        data_file = os.path.join(website_dir, "website_data.json")
        if os.path.exists(data_file):
            with open(data_file, 'r', encoding='utf-8') as f:
                website_data = json.load(f)
            
            data_info = {
                "file_exists": True,
                "data_count": len(website_data),
                "sample_item": website_data[0] if website_data else None,
                "item_keys": list(website_data[0].keys()) if website_data else []
            }
        else:
            data_info = {"file_exists": False}
        
        # Check embeddings directory
        embedding_dir = os.path.join(website_dir, "embeddings")
        if os.path.exists(embedding_dir):
            documents_file = os.path.join(embedding_dir, "documents.pkl")
            if os.path.exists(documents_file):
                with open(documents_file, 'rb') as f:
                    documents = pickle.load(f)
                
                embeddings_info = {
                    "documents_count": len(documents),
                    "sample_document": {
                        "text_length": len(documents[0].get('text', '')) if documents else 0,
                        "metadata": documents[0].get('metadata', {}) if documents else {},
                        "text_preview": documents[0].get('text', '')[:200] + "..." if documents and documents[0].get('text') else ""
                    } if documents else None
                }
            else:
                embeddings_info = {"documents_file_exists": False}
        else:
            embeddings_info = {"embedding_dir_exists": False}
        
        # Check info.json
        info_file = os.path.join(website_dir, "info.json")
        if os.path.exists(info_file):
            with open(info_file, 'r') as f:
                info_data = json.load(f)
        else:
            info_data = {"file_exists": False}
        
        # Test Qdrant connection
        try:
            from app.vectoredb.embedding_handler import EmbeddingHandler
            handler = EmbeddingHandler()
            stats = handler.get_document_stats(website_id)
            qdrant_info = {
                "connected": True,
                "stats": stats
            }
        except Exception as e:
            qdrant_info = {
                "connected": False,
                "error": str(e)
            }
        
        # Test embedding search
        search_result = None
        if qdrant_info.get("connected"):
            try:
                search_result = handler.search_similar_content(
                    website_id=website_id,
                    query="test",
                    top_k=2
                )
            except Exception as e:
                search_result = {"error": str(e)}
        
        return {
            "success": True,
            "website_id": website_id,
            "website_data": data_info,
            "embeddings": embeddings_info,
            "info": info_data,
            "qdrant": qdrant_info,
            "search_test": search_result,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        print(f"  Debug embeddings error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Debug failed",
                "message": str(e)
            }
        )

@app.post("/api/test-embedding/{website_id}")
async def test_embedding_creation(website_id: str):
    """Test endpoint to recreate embeddings"""
    try:
        website_dir = os.path.join("data", website_id)
        
        if not os.path.exists(website_dir):
            raise HTTPException(
                status_code=404,
                detail={
                    "success": False,
                    "error": "Website not found",
                    "message": f"Website with ID {website_id} not found."
                }
            )
        
        # Load website data
        data_file = os.path.join(website_dir, "website_data.json")
        if not os.path.exists(data_file):
            raise HTTPException(
                status_code=404,
                detail={
                    "success": False,
                    "error": "Website data not found",
                    "message": f"No website_data.json found for {website_id}"
                }
            )
        
        with open(data_file, 'r', encoding='utf-8') as f:
            website_data = json.load(f)
        
        print(f"   Loaded {len(website_data)} documents from website_data.json")
        
        # Create embeddings
        from app.vectoredb.embedding_handler import EmbeddingHandler
        handler = EmbeddingHandler()
        
        result = handler.create_embeddings(website_id, website_data)
        
        return {
            "success": True,
            "message": "Embeddings recreated successfully",
            "result": result,
            "website_id": website_id,
            "data_count": len(website_data),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        print(f"  Test embedding error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Embedding test failed",
                "message": str(e)
            }
        )

@app.get("/api/debug/qdrant/{website_id}")
async def debug_qdrant(website_id: str):
    """Debug endpoint to check Qdrant status for a website"""
    try:
        from app.vectoredb.embedding_handler import EmbeddingHandler
        handler = EmbeddingHandler()
        
        # Check if embeddings exist
        has_embeddings = handler.check_embeddings_exist(website_id)
        
        # Get collection stats
        collection_stats = handler.get_collection_stats()
        
        # Try a test search
        test_results = []
        if has_embeddings:
            test_results = handler.search_similar_content(
                website_id=website_id,
                query="test",
                top_k=3
            )
        
        return {
            "success": True,
            "website_id": website_id,
            "has_embeddings": has_embeddings,
            "collection_stats": collection_stats,
            "test_search_results": len(test_results),
            "sample_result": test_results[0] if test_results else None,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "website_id": website_id
        }


# ======================
# FRONTEND/DEMO ROUTES
# ======================

@app.get("/demo/{website_id}")
async def demo_chatbot(website_id: str):
    """Demo page for chatbot"""
    try:
        # Check if website exists
        website = db_manager.get_website(website_id)
        if not website:
            raise HTTPException(
                status_code=404,
                detail={
                    "success": False,
                    "error": "Website not found",
                    "message": f"Website with ID {website_id} not found."
                }
            )
        
        # Get website info
        website_name = website.get('website_name', website_id)
        contact_email = website.get('contact_email', website.get('admin_email', 'Not specified'))
        
        html_content = f"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title> Chatbot Demo - {website_name}</title>
            <style>
                * {{
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }}
                
                body {{
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    padding: 20px;
                }}
                
                .container {{
                    max-width: 1200px;
                    margin: 0 auto;
                    background: white;
                    border-radius: 20px;
                    padding: 40px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                }}
                
                .header {{
                    text-align: center;
                    margin-bottom: 40px;
                    padding-bottom: 30px;
                    border-bottom: 2px solid #f0f0f0;
                }}
                
                .header h1 {{
                    color: #2d3748;
                    margin-bottom: 10px;
                    font-size: 2.5em;
                }}
                
                .header .badge {{
                    display: inline-block;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 8px 16px;
                    border-radius: 20px;
                    font-size: 14px;
                    font-weight: 600;
                    margin-top: 10px;
                }}
                
                .content-grid {{
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 40px;
                    margin-bottom: 40px;
                }}
                
                @media (max-width: 768px) {{
                    .content-grid {{
                        grid-template-columns: 1fr;
                    }}
                }}
                
                .card {{
                    background: #f8f9fa;
                    border-radius: 15px;
                    padding: 25px;
                    border-left: 5px solid #667eea;
                }}
                
                .card h2 {{
                    color: #2d3748;
                    margin-bottom: 15px;
                    font-size: 1.5em;
                }}
                
                .code-block {{
                    background: #1e1e1e;
                    color: #d4d4d4;
                    padding: 20px;
                    border-radius: 10px;
                    font-family: 'Courier New', monospace;
                    overflow-x: auto;
                    margin: 15px 0;
                    font-size: 14px;
                    line-height: 1.4;
                }}
                
                .btn {{
                    display: inline-block;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    text-decoration: none;
                    transition: transform 0.2s, box-shadow 0.2s;
                    margin: 5px;
                }}
                
                .btn:hover {{
                    transform: translateY(-2px);
                    box-shadow: 0 10px 20px rgba(0,0,0,0.2);
                }}
                
                .btn-secondary {{
                    background: #4a5568;
                }}
                
                .instructions {{
                    background: #e8f4f8;
                    border-radius: 15px;
                    padding: 25px;
                    margin: 30px 0;
                }}
                
                .instructions ol {{
                    margin-left: 20px;
                }}
                
                .instructions li {{
                    margin-bottom: 10px;
                }}
                
                .test-questions {{
                    background: #f0fff4;
                    border-radius: 15px;
                    padding: 25px;
                    margin: 30px 0;
                }}
                
                .test-questions ul {{
                    margin-left: 20px;
                }}
                
                .footer {{
                    text-align: center;
                    margin-top: 40px;
                    padding-top: 30px;
                    border-top: 2px solid #f0f0f0;
                    color: #666;
                    font-size: 14px;
                }}
                
                .api-info {{
                    background: #fffaf0;
                    border-radius: 15px;
                    padding: 20px;
                    margin: 20px 0;
                    font-size: 14px;
                }}
                
                .api-info code {{
                    background: #f4f4f4;
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-family: monospace;
                }}
                
                .stats-grid {{
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 15px;
                    margin: 20px 0;
                }}
                
                .stat-card {{
                    background: #f8f9fa;
                    padding: 15px;
                    border-radius: 10px;
                    text-align: center;
                    border: 1px solid #e9ecef;
                }}
                
                .stat-number {{
                    font-size: 24px;
                    font-weight: bold;
                    color: #667eea;
                }}
                
                .stat-label {{
                    font-size: 12px;
                    color: #6c757d;
                    margin-top: 5px;
                }}
                
                .contact-info {{
                    background: #f0f7ff;
                    border-radius: 15px;
                    padding: 20px;
                    margin: 20px 0;
                    border-left: 4px solid #3b82f6;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1> Chatbot Demo</h1>
                    <p>This page demonstrates the AI chatbot trained on <strong>{website_name}</strong></p>
                    <div class="badge">Website ID: {website_id}</div>
                    <div class="badge" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); margin-top: 5px;">
                        Contact Email: {contact_email}
                    </div>
                </div>
                
                <!-- Statistics -->
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-number">{website.get('stats', {}).get('chat_messages', 0)}</div>
                        <div class="stat-label">Chat Messages</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number">{website.get('stats', {}).get('conversations', 0)}</div>
                        <div class="stat-label">Conversations</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number">{website.get('stats', {}).get('contact_forms', 0)}</div>
                        <div class="stat-label">Contact Forms</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number">{website.get('upload_count', 0)}</div>
                        <div class="stat-label">Uploaded Files</div>
                    </div>
                </div>
                
                <div class="content-grid">
                    <div class="card">
                        <h2>Embed Code</h2>
                        <p>Add this code to your website's <code>&lt;head&gt;</code> section:</p>
                        <div class="code-block">
                            &lt;script src="{BASE_URL}/embed/{website_id}/script.js" defer&gt;&lt;/script&gt;
                        </div>
                        <p style="font-size: 14px; color: #666; margin-top: 10px;">
                            This script is <strong>{os.path.getsize(os.path.join('generated_scripts', f'chatbot_{website_id}.js')) if os.path.exists(os.path.join('generated_scripts', f'chatbot_{website_id}.js')) else 'unknown'}</strong> bytes
                        </p>
                    </div>
                    
                    <div class="card">
                        <h2> Quick Start</h2>
                        <div class="instructions">
                            <ol>
                                <li>Copy the embed code above</li>
                                <li>Paste it into your website's HTML</li>
                                <li>The chatbot icon appears in bottom-right</li>
                                <li>Click it to start chatting!</li>
                            </ol>
                        </div>
                    </div>
                </div>
                
                <div class="contact-info">
                    <h3> Email Notifications</h3>
                    <p>The following notifications will be sent to <strong>{contact_email}</strong>:</p>
                    <ul>
                        <li> User registration notifications</li>
                        <li> Contact form submissions</li>
                        <li> Chat session reports (including auto-reports when users close browser)</li>
                        <li> Training status updates</li>
                    </ul>
                </div>
                
                <div class="test-questions">
                    <h2> Try Asking:</h2>
                    <ul>
                        <li>"What services do you offer?"</li>
                        <li>"Tell me about your company"</li>
                        <li>"How can I contact support?"</li>
                        <li>"What are your business hours?"</li>
                        <li>"Do you have pricing information?"</li>
                    </ul>
                </div>
                
                <div class="api-info">
                    <h2> API Information</h2>
                    <p><strong>Chat Endpoint:</strong> <code>POST {BASE_URL}/api/chat</code></p>
                    <p><strong>Contact Form:</strong> <code>POST {BASE_URL}/api/contact</code></p>
                    <p><strong>Script URL:</strong> <code>{BASE_URL}/embed/{website_id}/script.js</code></p>
                    <p><strong>Training Status:</strong> <code>GET {BASE_URL}/api/training-status/{website_id}</code></p>
                    <p><strong>File Upload:</strong> <code>POST {BASE_URL}/api/upload/{website_id}</code></p>
                    <p><strong>Backend Running:</strong> <span style="color: green;"> Active</span></p>
                    <p><strong>Database:</strong> <span style="color: green;"> MySQL Connected</span></p>
                    <p><strong>Email:</strong> <span style="color: green;"> Enabled</span></p>
                    <p><strong>Auto-Reports:</strong> <span style="color: green;"> Enabled (browser close/reload)</span></p>
                </div>
                
                <div style="text-align: center; margin-top: 40px;">
                    <a href="{BASE_URL}/api/website/{website_id}" class="btn" target="_blank">   View Website Info</a>
                    <a href="{BASE_URL}/api/website/stats/{website_id}" class="btn" target="_blank"> View Statistics</a>
                    <a href="{BASE_URL}/api/upload/{website_id}" class="btn" target="_blank"> Upload Files</a>
                    <a href="{BASE_URL}/api/generate-script/{website_id}" class="btn" target="_blank"> Get Embed Code</a>
                    <a href="{BASE_URL}/api/docs" class="btn btn-secondary" target="_blank"> API Documentation</a>
                    <a href="/" class="btn btn-secondary" target="_blank"> Back to Home</a>
                </div>
                
                <div class="footer">
                    <p> Chatbot Generator API v3.0 | Running on {BASE_URL}</p>
                    <p style="font-size: 12px; margin-top: 10px; color: #888;">
                        The chatbot should appear in the bottom-right corner of this page.
                        If it doesn't appear, check the browser console (F12) for errors.
                    </p>
                </div>
            </div>
            
            <!-- Embedded Chatbot Script -->
            <script src="{BASE_URL}/embed/{website_id}/script.js" defer></script>
            
            <script>
                // Add some interactive features
                document.addEventListener('DOMContentLoaded', function() {{
                    console.log(' Chatbot Demo Loaded for Website ID: {website_id}');
                    
                    // Check if chatbot loaded
                    setTimeout(function() {{
                        if (document.getElementById('chatbot-widget')) {{
                            console.log(' Chatbot widget detected on page');
                        }} else {{
                            console.log(' Chatbot widget not detected. Check script loading.');
                        }}
                    }}, 2000);
                }});
            </script>
        </body>
        </html>
        """
        
        return HTMLResponse(content=html_content)
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"  Demo page error: {str(e)}")
        return HTMLResponse(content=f"<h1>Error loading demo page: {str(e)}</h1>", status_code=500)

@app.get("/test/{website_id}")
async def test_chatbot_page(website_id: str):
    """Test page with embedded chatbot - Qdrant Cloud version"""
    try:
        # Get base URL from environment or use default
        base_url = os.getenv("BASE_URL").rstrip('/')
        
        # Check if website exists in database
        website = db_manager.get_website(website_id)
        
        if not website:
            return HTMLResponse(
                content=f"""
                <!DOCTYPE html>
                <html>
                <head><title>Error</title></head>
                <body>
                    <h1>  Website Not Found</h1>
                    <p>Website with ID <code>{website_id}</code> not found in database.</p>
                    <p>Please train the website first using the <code>/api/train</code> endpoint.</p>
                    <a href="/">Back to Home</a>
                </body>
                </html>
                """,
                status_code=404
            )
        
        # Check embeddings in Qdrant
        has_embeddings = False
        embedding_error = None
        embeddings_count = 0
        
        try:
            from app.vectoredb.embedding_handler import EmbeddingHandler
            handler = EmbeddingHandler()
            
            # Use the dedicated method to check embeddings
            has_embeddings = handler.check_embeddings_exist(website_id)
            
            # Also try to get count
            try:
                stats = handler.get_document_stats(website_id)
                embeddings_count = stats.get('total_documents', 0)
            except:
                pass
                
        except Exception as e:
            embedding_error = str(e)
            print(f" Qdrant check error: {e}")
        
        # Determine status color and message
        if has_embeddings:
            status_color = "green"
            status_text = " Active - Ready to Chat"
            status_details = f"Storage: Qdrant Cloud | Total embeddings: {embeddings_count}"
        elif embedding_error:
            status_color = "orange"
            status_text = " Qdrant Connection Issue"
            status_details = f"Error: {embedding_error[:100]}..."
        else:
            status_color = "orange"
            status_text = " No Embeddings Found"
            status_details = "Please train the website first using the /api/train endpoint"
        
        website_name = website.get('website_name', website_id)
        website_url = website.get('website_url', 'N/A')
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Test Chatbot - {website_name}</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body>
            <!-- Embedded Chatbot Script -->
            <script src="{base_url}/embed/{website_id}/script.js" defer></script>
            
            <script>
                document.addEventListener('DOMContentLoaded', function() {{
                    console.log('🧪 Test page loaded for website: {website_id}');
                    console.log('   Embeddings status: {"Found" if has_embeddings else "Not found"}');
                    
                    // Check if chatbot loads
                    let checkCount = 0;
                    const maxChecks = 15;
                    
                    function checkChatbot() {{
                        checkCount++;
                        const chatbot = document.getElementById('chatbot-widget');
                        
                        if (chatbot) {{
                            console.log(' Chatbot widget loaded successfully');
                            console.log(' Storage: Qdrant Cloud');
                            
                            // Add status indicator
                            const statusDiv = document.createElement('div');
                            statusDiv.style.cssText = `
                                position: fixed;
                                bottom: 90px;
                                right: 20px;
                                background: {status_color};
                                color: white;
                                padding: 5px 10px;
                                border-radius: 5px;
                                font-size: 11px;
                                z-index: 9999;
                                opacity: 0.8;
                            `;
                            
                        }} else if (checkCount < maxChecks) {{
                            setTimeout(checkChatbot, 500);
                        }} else {{
                            console.log('  Chatbot widget not loaded');
                        }}
                    }}
                    
                    setTimeout(checkChatbot, 1000);
                }});
            </script>
        </body>
        </html>
        """
        
        return HTMLResponse(content=html_content)
        
    except Exception as e:
        print(f"  Test page error: {e}")
        import traceback
        traceback.print_exc()
        return HTMLResponse(
            content=f"<h1>Error: {str(e)}</h1><pre>{traceback.format_exc()}</pre>",
            status_code=500
        )

@app.get("/api/test-script/{website_id}")
async def test_generated_script(website_id: str):
    """Test page for generated script functionality"""
    try:
        # Get website info
        website = db_manager.get_website(website_id)
        if not website:
            raise HTTPException(status_code=404, detail="Website not found")
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Test Generated Chatbot - {website_id}</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {{
                    font-family: Arial, sans-serif;
                    max-width: 800px;
                    margin: 0 auto;
                    padding: 20px;
                    line-height: 1.6;
                    background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
                    min-height: 100vh;
                }}
                .header {{
                    text-align: center;
                    margin-bottom: 40px;
                    padding: 20px;
                    background: white;
                    border-radius: 15px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.1);
                }}
                .test-info {{
                    background: white;
                    border-radius: 15px;
                    padding: 25px;
                    margin: 20px 0;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.05);
                    border-left: 5px solid #3B82F6;
                }}
                .instructions {{
                    background: #F0F9FF;
                    border-radius: 10px;
                    padding: 20px;
                    margin: 20px 0;
                    border: 1px solid #BFDBFE;
                }}
                .features {{
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                    gap: 15px;
                    margin: 30px 0;
                }}
                .feature-card {{
                    background: white;
                    padding: 20px;
                    border-radius: 10px;
                    text-align: center;
                    box-shadow: 0 3px 10px rgba(0,0,0,0.08);
                    transition: transform 0.3s;
                }}
                .feature-card:hover {{
                    transform: translateY(-5px);
                }}
                .feature-icon {{
                    font-size: 30px;
                    margin-bottom: 10px;
                }}
                .test-buttons {{
                    display: flex;
                    gap: 15px;
                    justify-content: center;
                    margin: 30px 0;
                    flex-wrap: wrap;
                }}
                .btn {{
                    padding: 12px 24px;
                    border: none;
                    border-radius: 10px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s;
                    text-decoration: none;
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                }}
                .btn-primary {{
                    background: linear-gradient(135deg, #3B82F6, #1D4ED8);
                    color: white;
                }}
                .btn-secondary {{
                    background: white;
                    color: #3B82F6;
                    border: 2px solid #3B82F6;
                }}
                .btn:hover {{
                    transform: translateY(-2px);
                    box-shadow: 0 5px 15px rgba(0,0,0,0.2);
                }}
                .status {{
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 10px 15px;
                    border-radius: 8px;
                    margin: 10px 0;
                }}
                .status-success {{
                    background: #D1FAE5;
                    color: #065F46;
                    border: 1px solid #10B981;
                }}
                .status-error {{
                    background: #FEE2E2;
                    color: #991B1B;
                    border: 1px solid #EF4444;
                }}
            </style>
        </head>
        <body>
            <div class="header">
                <h1> Test Generated Chatbot</h1>
                <p>Testing the embedded chatbot for <strong>{website.get('website_name', website_id)}</strong></p>
                <div class="status status-success">
                     Chatbot script is active and ready
                </div>
            </div>
            
            <div class="test-info">
                <h2>Website Information</h2>
                <p><strong>ID:</strong> {website_id}</p>
                <p><strong>Name:</strong> {website.get('website_name', 'N/A')}</p>
                <p><strong>URL:</strong> {website.get('website_url', 'N/A')}</p>
                <p><strong>Status:</strong> <span style="color: #10B981;">{website.get('status', 'active')}</span></p>
            </div>
            
            <div class="instructions">
                <h3> Testing Instructions:</h3>
                <ol>
                    <li>The chatbot should appear in the <strong>bottom-right corner</strong></li>
                    <li>Click the chat icon to open the widget</li>
                    <li><strong>Complete registration</strong> (required before chatting)</li>
                    <li>Ask questions about the website</li>
                    <li>Test the <strong>contact form</strong> functionality</li>
                    <li>Check that <strong>auto-reports</strong> work (close browser)</li>
                </ol>
            </div>
            
            <div class="features">
                <div class="feature-card">
                    <div class="feature-icon"></div>
                    <h3>User Registration</h3>
                    <p>Full registration form with name, email, and mobile</p>
                </div>
                <div class="feature-card">
                    <div class="feature-icon"></div>
                    <h3>AI Chat</h3>
                    <p>Context-aware responses based on website content</p>
                </div>
                <div class="feature-card">
                    <div class="feature-icon"></div>
                    <h3>Contact Forms</h3>
                    <p>Integrated enquiry/contact forms with auto-fill</p>
                </div>
                <div class="feature-card">
                    <div class="feature-icon">  </div>
                    <h3>Auto Reports</h3>
                    <p>Chat history sent to admin when user closes browser</p>
                </div>
            </div>
            
            <div class="test-buttons">
                <a href="{BASE_URL}/embed/{website_id}/script.js" target="_blank" class="btn btn-primary">
                     View Generated Script
                </a>
                <a href="{BASE_URL}/api/generate-script/{website_id}" target="_blank" class="btn btn-secondary">
                     Get Embed Code
                </a>
                <a href="{BASE_URL}/api/website/{website_id}" target="_blank" class="btn btn-secondary">
                       View Website Stats
                </a>
            </div>
            
            <div style="text-align: center; margin-top: 40px; color: #6B7280; font-size: 14px;">
                <p>The chatbot widget should be visible in the bottom-right corner of this page.</p>
                <p>If not visible, check browser console for errors (F12  Console)</p>
            </div>
            
            <!-- This is the generated chatbot script -->
            <script src="{BASE_URL}/embed/{website_id}/script.js" defer></script>
            
            <script>
                document.addEventListener('DOMContentLoaded', function() {{
                    console.log('🧪 Testing generated chatbot for website: {website_id}');
                    
                    // Check if chatbot loads properly
                    setTimeout(() => {{
                        if (document.getElementById('chatbot-widget')) {{
                            console.log(' Chatbot widget loaded successfully');
                        }} else {{
                            console.log('  Chatbot widget not found');
                        }}
                    }}, 2000);
                    
                    // Add test instructions
                    const testDiv = document.createElement('div');
                    testDiv.innerHTML = `
                        <div style="margin-top: 30px; padding: 15px; background: #FEF3C7; border-radius: 10px; border: 1px solid #F59E0B;">
                            <h4 style="margin-top: 0; color: #92400E;">Test Cases:</h4>
                            <ul style="margin-bottom: 0;">
                                <li> Registration form should be first thing shown</li>
                                <li> After registration, chat input should appear</li>
                                <li> Contact button should show in footer</li>
                                <li> Enquiry button should appear for pricing/contact questions</li>
                            </ul>
                        </div>
                    `;
                    document.querySelector('.test-info').appendChild(testDiv);
                }});
            </script>
        </body>
        </html>
        """
        
        return HTMLResponse(content=html_content)
        
    except Exception as e:
        print(f"  Test script page error: {e}")
        return HTMLResponse(content=f"<h1>Error: {str(e)}</h1>", status_code=500)


# ======================
# EXCEPTION HANDLERS
# ======================

@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.detail if isinstance(exc.detail, dict) else {
            "success": False,
            "error": "HTTP Error",
            "message": str(exc.detail),
            "status_code": exc.status_code
        }
    )

@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    print(f"  Unhandled error: {exc}")
    import traceback
    traceback.print_exc()
    
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": "Internal Server Error",
            "message": str(exc),
            "timestamp": datetime.now().isoformat()
        }
    )


if __name__ == "__main__":
    import uvicorn
    
    print("=" * 70)
    print(" CHATBOT GENERATOR API v3.0")
    print("=" * 70)
    print(f" Local URL: {BASE_URL}")
    print(f" API Docs: {BASE_URL}/api/docs")
    print(f" Home Page: {BASE_URL}/")
    print(f"  Database: MySQL")
    print(f" Email: Enabled")
    print(f" Auto-Reports: Enabled (browser close/reload)")
    print(f" Data: {os.path.abspath('data')}")
    print(f" Scripts: {os.path.abspath('generated_scripts')}")
    print("=" * 70)
    print(" Starting server...")
    print("=" * 70)
    
    # Create necessary directories
    os.makedirs("data", exist_ok=True)
    os.makedirs("generated_scripts", exist_ok=True)
    os.makedirs("uploads", exist_ok=True)
    os.makedirs("user_sessions", exist_ok=True)
    
    # Check database connection and get stats
    try:
        websites = db_manager.get_all_websites()
        print(f"   Found {len(websites)} websites in database")
        
        total_messages = 0
        total_conversations = 0
        total_forms = 0
        total_uploads = 0
        
        for website in websites:
            stats = db_manager.get_website_stats(website['website_id'])
            total_messages += stats.get('chat_messages', 0)
            total_conversations += stats.get('conversations', 0)
            total_forms += stats.get('contact_forms', 0)
            
            # Count uploads
            upload_dir = os.path.join("data", website['website_id'], "uploads")
            if os.path.exists(upload_dir):
                uploads_meta = os.path.join(upload_dir, "uploads_metadata.json")
                if os.path.exists(uploads_meta):
                    with open(uploads_meta, 'r') as f:
                        uploads = json.load(f)
                        total_uploads += len(uploads)
        
        print(f"Total chat messages: {total_messages}")
        print(f" Total conversations: {total_conversations}")
        print(f"Total contact forms: {total_forms}")
        print(f" Total uploaded files: {total_uploads}")
        
    except Exception as e:
        print(f" Database check error: {e}")
    
    uvicorn.run(
        app,
        host=os.getenv("BACKEND_HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", 8000)),
        reload=True,
        log_level="info"
    )