# src/addAdmin.py
import bcrypt
import json
from typing import Dict, Any
from pydantic import BaseModel
from fastapi import HTTPException
from fastapi.responses import JSONResponse
from psycopg2 import Error
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
import os

from src.auth import auth_service
from src.email_service import email_service

load_dotenv()

BACKEND_URL = os.getenv("BASE_URL").rstrip('/')

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
        conn = None
        cursor = None
        try:
            conn = self.auth_service.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Check if user already exists
            cursor.execute("SELECT id, is_active FROM users WHERE email = %s", (request.email,))
            existing_user = cursor.fetchone()
            
            if existing_user:
                # If user exists but is inactive, we could reactivate them
                if not existing_user['is_active']:
                    # Update existing user to admin role and reactivate
                    cursor.execute('''
                        UPDATE users 
                        SET role = 'admin', 
                            is_active = TRUE,
                            full_name = %s,
                            password_hash = %s,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = %s
                        RETURNING id, email, full_name, role, created_at, updated_at
                    ''', (request.full_name, self.auth_service.hash_password(request.password), existing_user['id']))
                    
                    updated_user = cursor.fetchone()
                    
                    # Log the admin promotion
                    cursor.execute('''
                        INSERT INTO admin_actions (admin_id, action_type, target_user_id, details)
                        VALUES (%s, 'promote_to_admin', %s, %s)
                    ''', (
                        current_admin['id'], 
                        existing_user['id'], 
                        json.dumps({
                            'admin_email': current_admin['email'],
                            'promoted_email': request.email,
                            'promoted_name': request.full_name,
                            'action': 'user_reactivated_and_promoted'
                        })
                    ))
                    
                    conn.commit()
                    
                    # Send notification email
                    self._send_admin_notification_email(request.email, request.full_name)
                    
                    return {
                        "success": True,
                        "message": "User reactivated and promoted to admin successfully",
                        "user": updated_user,
                        "hash_used": "bcrypt",
                        "admin_created_by": current_admin['email'],
                        "was_existing": True
                    }
                else:
                    return {
                        "success": False,
                        "error": "User already exists",
                        "message": f"A user with email {request.email} already exists"
                    }
            
            # Hash password using bcrypt
            password_hash = self.auth_service.hash_password(request.password)
            
            # Create admin user - PostgreSQL uses RETURNING instead of lastrowid
            cursor.execute('''
                INSERT INTO users (email, full_name, password_hash, role, is_active, created_at, updated_at)
                VALUES (%s, %s, %s, 'admin', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                RETURNING id, email, full_name, role, created_at
            ''', (request.email, request.full_name, password_hash))
            
            result = cursor.fetchone()
            user_id = result['id']
            user = result
            
            # Check if admin_actions table exists before inserting
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'admin_actions'
                );
            """)
            admin_actions_exists = cursor.fetchone()['exists']
            
            if admin_actions_exists:
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
                        'new_admin_name': request.full_name,
                        'timestamp': datetime.now().isoformat()
                    })
                ))
            
            conn.commit()
            
            # Send notification email to new admin
            self._send_admin_notification_email(request.email, request.full_name, current_admin)
            
            return {
                "success": True,
                "message": "Admin user created successfully",
                "user": user,
                "hash_used": "bcrypt",
                "admin_created_by": current_admin['email'],
                "admin_created_by_id": current_admin['id']
            }
            
        except Exception as e:
            if conn:
                conn.rollback()
            print(f"❌ Create admin error: {e}")
            import traceback
            traceback.print_exc()
            return {
                "success": False,
                "error": "Failed to create admin user",
                "message": str(e)
            }
        finally:
            if cursor:
                cursor.close()
            if conn:
                self.auth_service.return_connection(conn)
    
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
            print(f"❌ Generate hash error: {e}")
            return {
                "success": False,
                "error": "Failed to generate hash",
                "message": str(e)
            }
    
    def toggle_user_status(self, user_id: int, current_admin: Dict[str, Any], request: Dict[str, Any]):
        """Toggle user active status"""
        conn = None
        cursor = None
        try:
            conn = self.auth_service.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Get current user status with more details
            cursor.execute("""
                SELECT id, is_active, email, full_name, role, created_at 
                FROM users 
                WHERE id = %s
            """, (user_id,))
            user = cursor.fetchone()
            
            if not user:
                return {
                    "success": False,
                    "error": "User not found",
                    "message": f"No user found with ID {user_id}"
                }
            
            # Prevent admin from deactivating themselves
            if user_id == current_admin['id']:
                return {
                    "success": False,
                    "error": "Self-deactivation not allowed",
                    "message": "Administrators cannot deactivate their own account"
                }
            
            # Check if trying to deactivate another admin
            if user['role'] == 'admin' and user_id != current_admin['id']:
                # Only super admins or higher privileges can deactivate other admins
                # You might want to add a role hierarchy check here
                cursor.execute("SELECT role FROM users WHERE id = %s", (current_admin['id'],))
                admin_role = cursor.fetchone()
                
                if admin_role and admin_role['role'] != 'super_admin':
                    return {
                        "success": False,
                        "error": "Insufficient privileges",
                        "message": "You don't have permission to deactivate another administrator"
                    }
            
            # Determine new status
            new_status = request.get('is_active')
            if new_status is None:
                new_status = not user['is_active']
            elif not isinstance(new_status, bool):
                return {
                    "success": False,
                    "error": "Invalid parameter",
                    "message": "is_active must be a boolean value"
                }
            
            # Update user status with RETURNING to get updated record
            cursor.execute('''
                UPDATE users 
                SET is_active = %s, 
                    updated_at = CURRENT_TIMESTAMP 
                WHERE id = %s
                RETURNING id, email, full_name, is_active, role, updated_at
            ''', (new_status, user_id))
            
            updated_user = cursor.fetchone()
            
            # Check if admin_actions table exists before inserting
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'admin_actions'
                );
            """)
            admin_actions_exists = cursor.fetchone()['exists']
            
            if admin_actions_exists:
                # Log the action with detailed information
                cursor.execute('''
                    INSERT INTO admin_actions (
                        admin_id, 
                        action_type, 
                        target_user_id, 
                        details,
                        created_at
                    )
                    VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP)
                ''', (
                    current_admin['id'],
                    'toggle_user_status',
                    user_id,
                    json.dumps({
                        'previous_status': user['is_active'],
                        'new_status': new_status,
                        'user_email': user['email'],
                        'user_name': user['full_name'],
                        'admin_email': current_admin['email'],
                        'admin_name': current_admin.get('full_name', 'Unknown'),
                        'timestamp': datetime.now().isoformat(),
                        'action': 'deactivate' if not new_status else 'activate',
                        'reason': request.get('reason', 'No reason provided')
                    })
                ))
            
            conn.commit()
            
            # Send notification email to user about status change (optional)
            if request.get('notify_user', True):
                self._send_status_change_email(
                    user_email=user['email'],
                    user_name=user['full_name'],
                    new_status=new_status,
                    admin_name=current_admin.get('full_name', 'Administrator'),
                    reason=request.get('reason')
                )
            
            # Prepare response message
            action = "activated" if new_status else "deactivated"
            message = f"User {user['email']} has been {action} successfully"
            if request.get('reason'):
                message += f" (Reason: {request['reason']})"
            
            return {
                "success": True,
                "message": message,
                "user_id": user_id,
                "user_email": user['email'],
                "previous_status": user['is_active'],
                "is_active": new_status,
                "updated_user": updated_user,
                "action_taken": "activate" if new_status else "deactivate",
                "action_by": current_admin['email'],
                "action_at": datetime.now().isoformat()
            }
            
        except Exception as e:
            if conn:
                conn.rollback()
            print(f"❌ Toggle user status error: {e}")
            import traceback
            traceback.print_exc()
            return {
                "success": False,
                "error": "Failed to update user status",
                "message": str(e)
            }
        finally:
            if cursor:
                cursor.close()
            if conn:
                self.auth_service.return_connection(conn)
    
    def get_user_growth_data(self):
        """Get user growth data for charts - FIXED SQL queries"""
        try:
            conn = self.auth_service.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Get monthly growth data for last 6 months - FIXED QUERY
            cursor.execute("""
                SELECT 
                    TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY') AS month,
                    COUNT(*) AS new_users
                FROM users
                WHERE created_at >= NOW() - INTERVAL '6 months'
                GROUP BY DATE_TRUNC('month', created_at)
                ORDER BY DATE_TRUNC('month', created_at)
            """)
            
            monthly_data = cursor.fetchall()
            
            # Get yearly growth data for last 5 years - FIXED QUERY
            cursor.execute("""
                SELECT 
                    EXTRACT(YEAR FROM created_at) AS year,
                    COUNT(*) AS new_users
                FROM users
                WHERE created_at >= NOW() - INTERVAL '5 months'
                GROUP BY EXTRACT(YEAR FROM created_at)
                ORDER BY EXTRACT(YEAR FROM created_at)
            """)
            
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
            print(f"❌ Get user growth data error: {e}")
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
                subject="🎉 You've been granted Admin access to Botrion",
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
            print(f"⚠️ Could not send admin notification email: {email_error}")
    
    def initialize_admin_tables(self):
        """Initialize admin-related tables"""
        try:
            conn = self.auth_service.get_connection()
            cursor = conn.cursor()
            
            # Create admin_actions table for logging admin activities
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS admin_actions (
                    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                    admin_id INT NOT NULL,
                    action_type VARCHAR(100) NOT NULL,
                    target_user_id INT,
                    details JSONB,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                    CONSTRAINT fk_admin
                        FOREIGN KEY (admin_id)
                        REFERENCES users(id)
                        ON DELETE CASCADE,

                    CONSTRAINT fk_target_user
                        FOREIGN KEY (target_user_id)
                        REFERENCES users(id)
                        ON DELETE SET NULL
                );
                """)
            
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_action_type
                ON admin_actions(action_type);
                """)

            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_created_at
                ON admin_actions(created_at);
                """)
            
            conn.commit()
            cursor.close()
            print("✅ Admin tables initialized successfully")
            
        except Error as e:
            print(f"❌ Admin table initialization error: {e}")
            raise

# Initialize admin service
admin_service = AdminService(auth_service, email_service)