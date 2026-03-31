# src/addAdmin.py
import bcrypt
import json
import os
from typing import Dict, Any
from pydantic import BaseModel
from fastapi import HTTPException
from fastapi.responses import JSONResponse
from mysql.connector import Error
from dotenv import load_dotenv

from app.auth.auth import auth_service
from app.services.email_service import email_service

load_dotenv()

BACKEND_URL = os.getenv("BACKEND_URL").rstrip('/')

# Pydantic models
class CreateAdminRequest(BaseModel):
    full_name: str
    email: str
    password: str

class GenerateHashRequest(BaseModel):
    password: str

class AdminService:
    def __init__(self, auth_service, email_service):
        self.auth_service = auth_service
        self.email_service = email_service
    
    def create_admin_user(self, request: CreateAdminRequest, current_admin: Dict[str, Any]):
        """Create a new admin user"""
        try:
            conn = self.auth_service.get_connection()
            cursor = conn.cursor(dictionary=True)
            
            # Check if user already exists
            cursor.execute("SELECT id FROM users WHERE email = %s", (request.email,))
            existing_user = cursor.fetchone()
            
            if existing_user:
                cursor.close()
                conn.close()
                return {
                    "success": False,
                    "error": "User already exists",
                    "message": f"A user with email {request.email} already exists"
                }
            
            # Hash password using bcrypt
            password_hash = self.auth_service.hash_password(request.password)
            
            # Create admin user
            cursor.execute('''
                INSERT INTO users (email, full_name, password_hash, role)
                VALUES (%s, %s, %s, 'admin')
            ''', (request.email, request.full_name, password_hash))
            
            user_id = cursor.lastrowid
            
            # Get created user
            cursor.execute('''
                SELECT id, email, full_name, role, created_at 
                FROM users WHERE id = %s
            ''', (user_id,))
            user = cursor.fetchone()
            
            # Log the admin creation
            cursor.execute('''
                INSERT INTO admin_actions (admin_id, action_type, target_user_id, details)
                VALUES (%s, 'create_admin', %s, %s)
            ''', (
                current_admin['id'], 
                user_id, 
                json.dumps({
                    'admin_email': current_admin['email'],
                    'new_admin_email': request.email,
                    'new_admin_name': request.full_name
                })
            ))
            
            conn.commit()
            cursor.close()
            conn.close()
            
            # Send notification email to new admin
            self._send_admin_notification_email(request.email, request.full_name)
            
            return {
                "success": True,
                "message": "Admin user created successfully",
                "user": user,
                "hash_used": "bcrypt",
                "admin_created_by": current_admin['email']
            }
            
        except Error as e:
            print(f"  Create admin error: {e}")
            return {
                "success": False,
                "error": "Failed to create admin user",
                "message": str(e)
            }
    
    def generate_password_hash(self, password: str):
        """Generate password hash for display purposes"""
        try:
            # Generate hash using the same method as in auth_service
            password_hash = self.auth_service.hash_password(password)
            
            return {
                "success": True,
                "hash": password_hash,
                "algorithm": "bcrypt",
                "password_length": len(password),
                "note": "This is the bcrypt hash that will be stored in the database"
            }
            
        except Exception as e:
            print(f"  Generate hash error: {e}")
            return {
                "success": False,
                "error": "Failed to generate hash",
                "message": str(e)
            }
    
    def toggle_user_status(self, user_id: int, current_admin: Dict[str, Any], request: Dict[str, Any]):
        """Toggle user active status"""
        try:
            conn = self.auth_service.get_connection()
            cursor = conn.cursor(dictionary=True)
            
            # Get current user status
            cursor.execute("SELECT is_active, email, full_name FROM users WHERE id = %s", (user_id,))
            user = cursor.fetchone()
            
            if not user:
                cursor.close()
                conn.close()
                return {
                    "success": False,
                    "error": "User not found"
                }
            
            # Prevent admin from deactivating themselves
            if user_id == current_admin['id']:
                cursor.close()
                conn.close()
                return {
                    "success": False,
                    "error": "Cannot deactivate your own account"
                }
            
            new_status = request.get('is_active', not user['is_active'])
            
            # Update user status
            cursor.execute(
                "UPDATE users SET is_active = %s WHERE id = %s",
                (new_status, user_id)
            )
            
            # Log the action
            cursor.execute('''
                INSERT INTO admin_actions (admin_id, action_type, target_user_id, details)
                VALUES (%s, %s, %s, %s)
            ''', (
                current_admin['id'],
                'toggle_user_status',
                user_id,
                json.dumps({
                    'previous_status': user['is_active'],
                    'new_status': new_status,
                    'user_email': user['email']
                })
            ))
            
            conn.commit()
            cursor.close()
            conn.close()
            
            return {
                "success": True,
                "message": f"User {'activated' if new_status else 'deactivated'} successfully",
                "user_id": user_id,
                "is_active": new_status
            }
            
        except Error as e:
            print(f"  Toggle user status error: {e}")
            return {
                "success": False,
                "error": "Failed to update user status",
                "message": str(e)
            }
    
    def get_user_growth_data(self):
        """Get user growth data for charts - FIXED SQL queries"""
        try:
            conn = self.auth_service.get_connection()
            cursor = conn.cursor(dictionary=True)
            
            # Get monthly growth data for last 6 months - FIXED QUERY
            cursor.execute('''
                SELECT 
                    DATE_FORMAT(MIN(created_at), '%b %Y') as month,
                    COUNT(*) as new_users
                FROM users
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
                GROUP BY YEAR(created_at), MONTH(created_at)
                ORDER BY YEAR(created_at), MONTH(created_at)
            ''')
            
            monthly_data = cursor.fetchall()
            
            # Get yearly growth data for last 5 years - FIXED QUERY
            cursor.execute('''
                SELECT 
                    YEAR(created_at) as year,
                    COUNT(*) as new_users
                FROM users
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 5 YEAR)
                GROUP BY YEAR(created_at)
                ORDER BY YEAR(created_at)
            ''')
            
            yearly_data = cursor.fetchall()
            
            cursor.close()
            conn.close()
            
            return {
                "success": True,
                "monthly": {
                    "labels": [item['month'] for item in monthly_data],
                    "values": [item['new_users'] for item in monthly_data]
                },
                "yearly": {
                    "labels": [str(item['year']) for item in yearly_data],
                    "values": [item['new_users'] for item in yearly_data]
                }
            }
            
        except Error as e:
            print(f"  Get user growth data error: {e}")
            return {
                "success": False,
                "error": "Failed to get growth data",
                "message": str(e)
            }
    
    def _send_admin_notification_email(self, email: str, full_name: str):
        """Send notification email to new admin"""
        try:
            self.email_service.send_email(
                to_email=email,
                subject=" You've been granted Admin access to Botrion",
                body=f"""Dear {full_name},

You have been granted administrative access to the Botrion system.

Your admin account has been created with the following details:
- Email: {email}
- Role: Administrator
- Access: Full administrative privileges

You can now log in to the admin panel at: {BACKEND_URL}

Admin privileges include:
- User management
- Website management
- System configuration
- Viewing analytics and reports

Please keep your credentials secure and change your password after first login.

Best regards,
Botrion Admin Team
""",
                website_id="admin_portal"
            )
        except Exception as email_error:
            print(f" Could not send admin notification email: {email_error}")
    
    def initialize_admin_tables(self):
        """Initialize admin-related tables"""
        try:
            conn = self.auth_service.get_connection()
            cursor = conn.cursor()
            
            # Create admin_actions table for logging admin activities
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS admin_actions (
                    id SERIAL PRIMARY KEY,
                    admin_id INT NOT NULL,
                    action_type VARCHAR(100) NOT NULL,
                    target_user_id INT,
                    details JSON,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL,
                    INDEX idx_admin_id (admin_id),
                    INDEX idx_action_type (action_type),
                    INDEX idx_created_at (created_at)
                )
            ''')
            
            conn.commit()
            cursor.close()
            print(" Admin tables initialized successfully")
            
        except Error as e:
            print(f"  Admin table initialization error: {e}")
            raise

# Initialize admin service
admin_service = AdminService(auth_service, email_service)