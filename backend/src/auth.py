import os
import json
import jwt
import bcrypt
import secrets
import random
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from dotenv import load_dotenv
from src.database import pg_pool

load_dotenv()

class AuthService:
    def __init__(self):
        self.jwt_secret = os.getenv('JWT_SECRET')
        self.jwt_algorithm = os.getenv('JWT_ALGORITHM')
        self.jwt_expiry_hours = int(os.getenv('JWT_EXPIRY_HOURS', 24))
        self.otp_expiry_minutes = int(os.getenv('OTP_EXPIRY_MINUTES', 10))

    def get_connection(self):
        """Get database connection"""
        return pg_pool.get_connection()

    def return_connection(self, conn):
        """Return connection to pool"""
        pg_pool.return_connection(conn)

    def execute_query(self, query, params=None, fetch_one=False, fetch_all=False, commit=False):
        """Execute a query with automatic connection management"""
        conn = None
        cursor = None
        try:
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Set statement timeout
            cursor.execute("SET statement_timeout = '30s'")
            
            cursor.execute(query, params or ())
            
            if commit:
                conn.commit()
            
            if fetch_one:
                return cursor.fetchone()
            elif fetch_all:
                return cursor.fetchall()
            else:
                return None
                
        except Exception as e:
            if conn and commit:
                try:
                    conn.rollback()
                except:
                    pass
            raise e
        finally:
            if cursor:
                try:
                    cursor.close()
                except:
                    pass
            if conn:
                try:
                    self.return_connection(conn)
                except:
                    pass
    
    def hash_password(self, password: str) -> str:
        """Hash a password using bcrypt"""
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
        return hashed.decode('utf-8')
    
    def verify_password(self, password: str, hashed_password: str) -> bool:
        """Verify a password against its hash"""
        try:
            return bcrypt.checkpw(password.encode('utf-8'), hashed_password.encode('utf-8'))
        except:
            return False
    
    def create_access_token(self, user_id: int, email: str, user_type: str = 'user') -> str:
        """Create JWT access token"""
        payload = {
            'user_id': user_id,
            'email': email,
            'user_type': user_type,
            'exp': datetime.utcnow() + timedelta(hours=self.jwt_expiry_hours),
            'iat': datetime.utcnow()
        }
        token = jwt.encode(payload, self.jwt_secret, algorithm=self.jwt_algorithm)
        return token
    
    def verify_access_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Verify JWT token and return payload"""
        try:
            payload = jwt.decode(token, self.jwt_secret, algorithms=[self.jwt_algorithm])
            return payload
        except jwt.ExpiredSignatureError:
            print("❌ Token expired")
            return None
        except jwt.InvalidTokenError:
            print("❌ Invalid token")
            return None
    
    # =========================
    # FORGOT PASSWORD METHODS
    # =========================
    def generate_otp(self, length: int = 6) -> str:
        """Generate a random OTP"""
        digits = "0123456789"
        otp = ''.join(random.choice(digits) for _ in range(length))
        return otp
    
    def initiate_password_reset(self, email: str) -> Dict[str, Any]:
        """Initiate password reset process for users"""
        try:
            print(f"🔍 Looking for user with email: {email}")
            
            # Check if user exists in users table
            user = self.execute_query(
                "SELECT id, email, full_name FROM users WHERE email = %s AND is_active = TRUE",
                (email,), fetch_one=True
            )
            
            if not user:
                print(f"❌ User not found: {email}")
                return {"success": False, "error": "User not found"}
            
            user_id = user['id']
            print(f"✅ Found user: {user['full_name']} (ID: {user_id})")
            
            # Generate OTP
            otp = self.generate_otp()
            print(f"🔢 Generated OTP: {otp}")
            
            # Generate reset token
            reset_token = secrets.token_urlsafe(32)
            print(f"🔐 Generated reset token: {reset_token[:20]}...")
            
            # Expiry time
            expires_at = datetime.utcnow() + timedelta(minutes=self.otp_expiry_minutes)
            print(f"⏰ OTP expires at: {expires_at}")
            
            # Invalidate any existing reset tokens for this user
            self.execute_query(
                "UPDATE password_resets SET used = TRUE WHERE user_id = %s AND used = FALSE",
                (user_id,), commit=True
            )
            print(f"🗑️  Invalidated previous reset tokens for user {user_id}")
            
            # Create new reset request
            result = self.execute_query('''
                INSERT INTO password_resets (user_id, reset_token, otp, expires_at, verified, used)
                VALUES (%s, %s, %s, %s, FALSE, FALSE)
                RETURNING id
            ''', (user_id, reset_token, otp, expires_at), fetch_one=True, commit=True)
            
            reset_id = result['id'] if result else None
            print(f"💾 Saved reset request with ID: {reset_id}")
            
            return {
                "success": True,
                "message": "Password reset initiated",
                "reset_token": reset_token,
                "otp": otp,
                "expires_at": expires_at.isoformat(),
                "user": {
                    "id": user_id,
                    "email": user['email'],
                    "full_name": user['full_name']
                }
            }
            
        except Exception as e:
            print(f"❌ Password reset initiation error: {e}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e)}
    
    def verify_otp(self, reset_token: str, otp: str) -> Dict[str, Any]:
        """Verify OTP for password reset"""
        try:
            print(f"\n🔍 Verifying OTP...")
            print(f"  Reset Token: {reset_token[:20]}...")
            print(f"  OTP to verify: {otp}")
            
            # Check if reset token exists and is valid
            reset_request = self.execute_query('''
                SELECT pr.*, u.email, u.full_name
                FROM password_resets pr
                JOIN users u ON pr.user_id = u.id
                WHERE pr.reset_token = %s 
                AND pr.used = FALSE 
                AND pr.verified = FALSE
                AND pr.expires_at > CURRENT_TIMESTAMP
            ''', (reset_token,), fetch_one=True)
            
            if not reset_request:
                print(f"❌ Reset token not found or invalid")
                return {"success": False, "error": "Invalid or expired reset token"}
            
            print(f"✅ Found reset request:")
            print(f"   ID: {reset_request['id']}")
            print(f"   User: {reset_request['full_name']}")
            print(f"   Stored OTP: {reset_request['otp']}")
            print(f"   Input OTP: {otp}")
            print(f"   Expires at: {reset_request['expires_at']}")
            
            # Verify OTP
            if reset_request['otp'] != otp:
                print(f"❌ OTP mismatch!")
                return {"success": False, "error": "Invalid OTP"}
            
            print(f"✅ OTP matched!")
            
            # Mark OTP as verified
            self.execute_query('''
                UPDATE password_resets 
                SET verified = TRUE 
                WHERE id = %s
            ''', (reset_request['id'],), commit=True)
            
            print(f"✅ OTP verified successfully!")
            
            return {
                "success": True,
                "message": "OTP verified successfully",
                "reset_token": reset_token,
                "user": {
                    "id": reset_request['user_id'],
                    "email": reset_request['email'],
                    "full_name": reset_request['full_name']
                }
            }
            
        except Exception as e:
            print(f"❌ OTP verification error: {e}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e)}
    
    def reset_password(self, reset_token: str, new_password: str) -> Dict[str, Any]:
        """Reset password using verified reset token"""
        try:
            # Check if reset token is verified and valid
            reset_request = self.execute_query('''
                SELECT pr.*, u.id as user_id, u.email
                FROM password_resets pr
                JOIN users u ON pr.user_id = u.id
                WHERE pr.reset_token = %s 
                AND pr.used = FALSE 
                AND pr.verified = TRUE
                AND pr.expires_at > CURRENT_TIMESTAMP
                AND u.is_active = TRUE
            ''', (reset_token,), fetch_one=True)
            
            if not reset_request:
                return {"success": False, "error": "Invalid or expired reset token"}
            
            user_id = reset_request['user_id']
            
            # Hash new password
            new_password_hash = self.hash_password(new_password)
            
            # Update user password
            self.execute_query(
                "UPDATE users SET password_hash = %s WHERE id = %s",
                (new_password_hash, user_id), commit=True
            )
            
            # Mark reset token as used
            self.execute_query(
                "UPDATE password_resets SET used = TRUE WHERE id = %s",
                (reset_request['id'],), commit=True
            )
            
            # Invalidate all sessions for this user
            self.execute_query(
                "DELETE FROM user_sessions WHERE user_id = %s",
                (user_id,), commit=True
            )
            
            return {
                "success": True,
                "message": "Password reset successfully",
                "user": {
                    "id": user_id,
                    "email": reset_request['email']
                }
            }
            
        except Exception as e:
            print(f"❌ Password reset error: {e}")
            return {"success": False, "error": str(e)}
    
    # =========================
    # USER REGISTRATION & LOGIN
    # =========================
    def register_user(self, user_data: Dict[str, Any]) -> Dict[str, Any]:
        """Register a new regular user"""
        try:
            # Check if user already exists
            existing = self.execute_query(
                "SELECT id FROM users WHERE email = %s",
                (user_data['email'],), fetch_one=True
            )
            
            if existing:
                return {"success": False, "error": "User already exists with this email"}
            
            # Hash password
            password_hash = self.hash_password(user_data['password'])
            
            # Insert user
            user = self.execute_query('''
                INSERT INTO users (email, full_name, mobile, password_hash, website_ids)
                VALUES (%s, %s, %s, %s, '[]'::jsonb)
                RETURNING id, email, full_name, mobile, created_at
            ''', (
                user_data['email'],
                user_data['full_name'],
                user_data.get('mobile', ''),
                password_hash
            ), fetch_one=True, commit=True)
            
            # Create access token (user_type = 'user')
            token = self.create_access_token(user['id'], user['email'], 'user')
            
            # Save session
            expires_at = datetime.utcnow() + timedelta(hours=self.jwt_expiry_hours)
            self.execute_query('''
                INSERT INTO user_sessions (user_id, session_token, expires_at)
                VALUES (%s, %s, %s)
            ''', (
                user['id'],
                token,
                expires_at
            ), commit=True)
            
            return {
                "success": True,
                "user": {
                    "id": user['id'],
                    "email": user['email'],
                    "full_name": user['full_name'],
                    "mobile": user['mobile'],
                    "role": "user"
                },
                "access_token": token,
                "message": "User registered successfully"
            }
            
        except Exception as e:
            print(f"❌ User registration error: {e}")
            return {"success": False, "error": str(e)}
    
    def login_user(self, email: str, password: str) -> Dict[str, Any]:
        """Login regular user (checks users table only)"""
        try:
            # Get user from users table
            user = self.execute_query('''
                SELECT id, email, full_name, mobile, password_hash, is_active 
                FROM users WHERE email = %s
            ''', (email,), fetch_one=True)
            
            if not user:
                return {"success": False, "error": "User not found"}
            
            if not user['is_active']:
                return {"success": False, "error": "Account is deactivated"}
            
            # Verify password
            if not self.verify_password(password, user['password_hash']):
                return {"success": False, "error": "Invalid password"}
            
            # Create access token
            token = self.create_access_token(user['id'], user['email'], 'user')
            
            # Save session
            expires_at = datetime.utcnow() + timedelta(hours=self.jwt_expiry_hours)
            self.execute_query('''
                INSERT INTO user_sessions (user_id, session_token, expires_at)
                VALUES (%s, %s, %s)
            ''', (
                user['id'],
                token,
                expires_at
            ), commit=True)
            
            return {
                "success": True,
                "user": {
                    "id": user['id'],
                    "email": user['email'],
                    "full_name": user['full_name'],
                    "mobile": user['mobile'],
                    "role": "user"
                },
                "access_token": token,
                "message": "Login successful"
            }
            
        except Exception as e:
            print(f"❌ Login error: {e}")
            return {"success": False, "error": str(e)}
    
    def verify_token(self, token: str) -> Dict[str, Any]:
        """Verify token and get user info (checks both users and admins)"""
        try:
            payload = self.verify_access_token(token)
            if not payload:
                return {"success": False, "error": "Invalid or expired token"}
            
            user_type = payload.get('user_type', 'user')
            user_id = payload['user_id']
            
            if user_type == 'user':
                # Check if user exists in users table
                session = self.execute_query('''
                    SELECT s.*, u.email, u.full_name, u.is_active
                    FROM user_sessions s
                    JOIN users u ON s.user_id = u.id
                    WHERE s.session_token = %s AND s.expires_at > CURRENT_TIMESTAMP AND u.is_active = TRUE
                    AND u.id = %s
                ''', (token, user_id), fetch_one=True)
                
            elif user_type == 'admin':
                # Check if admin exists in admins table
                session = self.execute_query('''
                    SELECT s.*, a.email, a.full_name, a.is_active
                    FROM admin_sessions s
                    JOIN admins a ON s.admin_id = a.id
                    WHERE s.session_token = %s AND s.expires_at > CURRENT_TIMESTAMP AND a.is_active = TRUE
                    AND a.id = %s
                ''', (token, user_id), fetch_one=True)
                
            else:
                return {"success": False, "error": "Invalid user type"}
            
            if not session:
                return {"success": False, "error": "Session expired or invalid"}
            
            return {
                "success": True,
                "user": {
                    "id": payload['user_id'],
                    "email": payload['email'],
                    "role": payload.get('user_type', 'user'),
                    "exp": payload['exp']
                }
            }
            
        except Exception as e:
            print(f"❌ Token verification error: {e}")
            return {"success": False, "error": str(e)}
    
    # =========================
    # USER MANAGEMENT METHODS
    # =========================
    def get_user_by_id(self, user_id: int) -> Optional[Dict[str, Any]]:
        """Get user by ID from users table"""
        try:
            user = self.execute_query('''
                SELECT id, email, full_name, mobile, website_ids, created_at
                FROM users WHERE id = %s AND is_active = TRUE
            ''', (user_id,), fetch_one=True)
            
            if user:
                user['role'] = 'user'
                # Parse website_ids from JSON if needed
                if user.get('website_ids') and isinstance(user['website_ids'], str):
                    try:
                        user['website_ids'] = json.loads(user['website_ids'])
                    except:
                        user['website_ids'] = []
                elif user.get('website_ids') is None:
                    user['website_ids'] = []
            return user
            
        except Exception as e:
            print(f"❌ Get user error: {e}")
            return None
    
    def add_website_to_user(self, user_id: int, website_id: str) -> Dict[str, Any]:
        """Add a website ID to user's website_ids list"""
        try:
            # Get current website_ids
            result = self.execute_query(
                "SELECT website_ids FROM users WHERE id = %s",
                (user_id,), fetch_one=True
            )
            
            if not result:
                return {"success": False, "error": "User not found"}
            
            # Parse existing website_ids
            current_website_ids = result.get('website_ids', [])
            if isinstance(current_website_ids, str):
                try:
                    current_website_ids = json.loads(current_website_ids)
                except:
                    current_website_ids = []
            elif current_website_ids is None:
                current_website_ids = []
            
            # Add new website_id if not already present
            if website_id not in current_website_ids:
                current_website_ids.append(website_id)
                
                # Update database
                self.execute_query(
                    "UPDATE users SET website_ids = %s::jsonb WHERE id = %s",
                    (json.dumps(current_website_ids), user_id), commit=True
                )
                updated = True
            else:
                updated = False
            
            return {
                "success": True,
                "updated": updated,
                "message": f"Website ID {'added' if updated else 'already exists'}",
                "website_ids": current_website_ids
            }
            
        except Exception as e:
            print(f"❌ Add website to user error: {e}")
            return {"success": False, "error": str(e)}
    
    def remove_website_from_user(self, user_id: int, website_id: str) -> Dict[str, Any]:
        """Remove a website ID from user's website_ids list"""
        try:
            # Get current website_ids
            result = self.execute_query(
                "SELECT website_ids FROM users WHERE id = %s",
                (user_id,), fetch_one=True
            )
            
            if not result:
                return {"success": False, "error": "User not found"}
            
            # Parse existing website_ids
            current_website_ids = result.get('website_ids', [])
            if isinstance(current_website_ids, str):
                try:
                    current_website_ids = json.loads(current_website_ids)
                except:
                    current_website_ids = []
            elif current_website_ids is None:
                current_website_ids = []
            
            # Remove website_id if present
            if website_id in current_website_ids:
                current_website_ids.remove(website_id)
                
                # Update database
                self.execute_query(
                    "UPDATE users SET website_ids = %s::jsonb WHERE id = %s",
                    (json.dumps(current_website_ids), user_id), commit=True
                )
                removed = True
            else:
                removed = False
            
            return {
                "success": True,
                "removed": removed,
                "message": f"Website ID {'removed' if removed else 'not found'}",
                "website_ids": current_website_ids
            }
            
        except Exception as e:
            print(f"❌ Remove website from user error: {e}")
            return {"success": False, "error": str(e)}
    
    def get_user_websites(self, user_id: int) -> list:
        """Get all websites for a user"""
        try:
            websites = self.execute_query('''
                SELECT w.*, 
                       (SELECT COUNT(*) FROM contact_forms WHERE website_id = w.website_id) as contact_forms_count,
                       (SELECT COUNT(*) FROM chat_history WHERE website_id = w.website_id) as chat_messages_count,
                       (SELECT COUNT(*) FROM website_files WHERE website_id = w.website_id) as files_count
                FROM websites w
                WHERE w.user_id = %s
                ORDER BY w.created_at DESC
            ''', (user_id,), fetch_all=True)
            
            return websites or []
            
        except Exception as e:
            print(f"❌ Get user websites error: {e}")
            return []
    
    def get_user_websites_detailed(self, user_id: int) -> list:
        """Get detailed website information for a user"""
        try:
            # Get user's website_ids
            result = self.execute_query(
                "SELECT website_ids FROM users WHERE id = %s",
                (user_id,), fetch_one=True
            )
            
            if not result or not result.get('website_ids'):
                return []
            
            # Parse website_ids
            website_ids = result['website_ids']
            if isinstance(website_ids, str):
                try:
                    website_ids = json.loads(website_ids)
                except:
                    website_ids = []
            
            if not website_ids:
                return []
            
            # Get detailed website info for each website_id
            websites = []
            for website_id in website_ids:
                website = self.execute_query('''
                    SELECT w.*, 
                        (SELECT COUNT(*) FROM contact_forms WHERE website_id = w.website_id) as contact_forms_count,
                        (SELECT COUNT(*) FROM chat_history WHERE website_id = w.website_id) as chat_messages_count,
                        (SELECT COUNT(*) FROM website_files WHERE website_id = w.website_id) as files_count
                    FROM websites w
                    WHERE w.website_id = %s
                ''', (website_id,), fetch_one=True)
                
                if website:
                    websites.append(website)
            
            return websites
            
        except Exception as e:
            print(f"❌ Get user websites detailed error: {e}")
            return []
    
    def get_all_users(self, current_user_id: int = None) -> list:
        """Get all regular users (admin only)"""
        try:
            query = '''
                SELECT id, email, full_name, mobile, is_active, created_at
                FROM users
                WHERE 1=1
            '''
            params = []
            
            if current_user_id:
                query += " AND id != %s"
                params.append(current_user_id)
            
            query += " ORDER BY created_at DESC"
            
            users = self.execute_query(query, params, fetch_all=True) or []
            
            # Add website count for each user
            for user in users:
                count_result = self.execute_query(
                    "SELECT COUNT(*) as count FROM websites WHERE user_id = %s",
                    (user['id'],), fetch_one=True
                )
                user['website_count'] = count_result['count'] if count_result else 0
                user['role'] = 'user'
            
            return users
            
        except Exception as e:
            print(f"❌ Get all users error: {e}")
            return []
    
    def update_user_profile(self, user_id: int, update_data: Dict[str, Any]) -> Dict[str, Any]:
        """Update user profile"""
        try:
            update_fields = []
            params = []
            
            if 'full_name' in update_data:
                update_fields.append("full_name = %s")
                params.append(update_data['full_name'])
            
            if 'mobile' in update_data:
                update_fields.append("mobile = %s")
                params.append(update_data['mobile'])
            
            if 'email' in update_data:
                # Check if email already exists
                existing = self.execute_query(
                    "SELECT id FROM users WHERE email = %s AND id != %s",
                    (update_data['email'], user_id), fetch_one=True
                )
                
                if existing:
                    return {"success": False, "error": "Email already in use"}
                
                update_fields.append("email = %s")
                params.append(update_data['email'])
            
            if update_fields:
                query = f"UPDATE users SET {', '.join(update_fields)} WHERE id = %s"
                params.append(user_id)
                self.execute_query(query, params, commit=True)
            
            return {"success": True, "message": "Profile updated successfully"}
            
        except Exception as e:
            print(f"❌ Update profile error: {e}")
            return {"success": False, "error": str(e)}
    
    def change_password(self, user_id: int, current_password: str, new_password: str) -> Dict[str, Any]:
        """Change user password"""
        try:
            # Get current password hash
            result = self.execute_query(
                "SELECT password_hash FROM users WHERE id = %s",
                (user_id,), fetch_one=True
            )
            
            if not result:
                return {"success": False, "error": "User not found"}
            
            # Verify current password
            if not self.verify_password(current_password, result['password_hash']):
                return {"success": False, "error": "Current password is incorrect"}
            
            # Update password
            new_hash = self.hash_password(new_password)
            self.execute_query(
                "UPDATE users SET password_hash = %s WHERE id = %s",
                (new_hash, user_id), commit=True
            )
            
            # Invalidate all sessions
            self.execute_query(
                "DELETE FROM user_sessions WHERE user_id = %s",
                (user_id,), commit=True
            )
            
            return {"success": True, "message": "Password changed successfully"}
            
        except Exception as e:
            print(f"❌ Change password error: {e}")
            return {"success": False, "error": str(e)}
    
    def toggle_user_status(self, user_id: int, current_user_id: int) -> Dict[str, Any]:
        """Toggle user active status (admin only)"""
        try:
            # Check if user exists
            user = self.execute_query(
                "SELECT id, is_active FROM users WHERE id = %s",
                (user_id,), fetch_one=True
            )
            
            if not user:
                return {"success": False, "error": "User not found"}
            
            # Prevent self-deactivation
            if user_id == current_user_id:
                return {"success": False, "error": "Cannot deactivate your own account"}
            
            # Toggle status
            new_status = not user['is_active']
            self.execute_query(
                "UPDATE users SET is_active = %s WHERE id = %s",
                (new_status, user_id), commit=True
            )
            
            return {
                "success": True,
                "message": f"User {'activated' if new_status else 'deactivated'} successfully",
                "is_active": new_status
            }
            
        except Exception as e:
            print(f"❌ Toggle user status error: {e}")
            return {"success": False, "error": str(e)}

# Import RealDictCursor for use in execute_query
from psycopg2.extras import RealDictCursor

# Singleton instance
auth_service = AuthService()