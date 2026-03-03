import os
import jwt
import bcrypt
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from dotenv import load_dotenv
from src.database import pg_pool

load_dotenv()

class AdminAuthService:
    def __init__(self):
        self.jwt_secret = os.getenv('JWT_SECRET')
        self.jwt_algorithm = os.getenv('JWT_ALGORITHM')
        self.jwt_expiry_hours = int(os.getenv('JWT_EXPIRY_HOURS', 24))
        
        # Default admin credentials
        self.default_admin_email = os.getenv('DEFAULT_ADMIN_EMAIL', 'admin@example.com')
        self.default_admin_password = os.getenv('DEFAULT_ADMIN_PASSWORD', 'Admin@123')
        
        self.create_default_admin()

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
                conn.rollback()
            raise e
        finally:
            if cursor:
                cursor.close()
            if conn:
                self.return_connection(conn)

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
    
    def create_access_token(self, admin_id: int, email: str) -> str:
        """Create JWT access token for admin"""
        payload = {
            'user_id': admin_id,
            'email': email,
            'user_type': 'admin',
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

    def create_default_admin(self):
        """Create default admin account from .env"""
        try:
            # Check if default admin already exists
            result = self.execute_query(
                "SELECT id FROM admins WHERE email = %s",
                (self.default_admin_email,), fetch_one=True
            )
            
            if result:
                print(f"✅ Default admin already exists: {self.default_admin_email}")
                return
            
            # Hash default password
            password_hash = self.hash_password(self.default_admin_password)
            
            # Insert default admin
            self.execute_query('''
                INSERT INTO admins (email, full_name, password_hash, created_by, is_active)
                VALUES (%s, %s, %s, NULL, TRUE)
            ''', (
                self.default_admin_email,
                "System Administrator",
                password_hash
            ), commit=True)
            
            print(f"✅ Default admin created: {self.default_admin_email}")
            
        except Exception as e:
            print(f"❌ Default admin creation error: {e}")
    
    # =========================
    # ADMIN LOGIN
    # =========================
    def login_admin(self, email: str, password: str) -> Dict[str, Any]:
        """Login admin (checks admins table only)"""
        try:
            # Get admin from admins table
            admin = self.execute_query('''
                SELECT id, email, full_name, password_hash, is_active 
                FROM admins WHERE email = %s
            ''', (email,), fetch_one=True)
            
            if not admin:
                return {"success": False, "error": "Admin not found"}
            
            if not admin['is_active']:
                return {"success": False, "error": "Admin account is deactivated"}
            
            # Verify password
            if not self.verify_password(password, admin['password_hash']):
                return {"success": False, "error": "Invalid password"}
            
            # Create access token
            token = self.create_access_token(admin['id'], admin['email'])
            
            # Save session
            expires_at = datetime.utcnow() + timedelta(hours=self.jwt_expiry_hours)
            self.execute_query('''
                INSERT INTO admin_sessions (admin_id, session_token, expires_at)
                VALUES (%s, %s, %s)
            ''', (
                admin['id'],
                token,
                expires_at
            ), commit=True)
            
            return {
                "success": True,
                "admin": {
                    "id": admin['id'],
                    "email": admin['email'],
                    "full_name": admin['full_name'],
                    "role": "admin"
                },
                "access_token": token,
                "message": "Admin login successful"
            }
            
        except Exception as e:
            print(f"❌ Admin login error: {e}")
            return {"success": False, "error": str(e)}
    
    # =========================
    # ADMIN MANAGEMENT
    # =========================
    def create_admin(self, admin_data: Dict[str, Any], created_by_admin_id: int) -> Dict[str, Any]:
        """Create a new admin account (only by existing admin)"""
        try:
            # Check if admin already exists
            existing = self.execute_query(
                "SELECT id FROM admins WHERE email = %s",
                (admin_data['email'],), fetch_one=True
            )
            
            if existing:
                return {"success": False, "error": "Admin already exists with this email"}
            
            # Hash password
            password_hash = self.hash_password(admin_data['password'])
            
            # Insert admin
            result = self.execute_query('''
                INSERT INTO admins (email, full_name, password_hash, created_by, is_active)
                VALUES (%s, %s, %s, %s, TRUE)
                RETURNING id, email, full_name, created_at
            ''', (
                admin_data['email'],
                admin_data['full_name'],
                password_hash,
                created_by_admin_id
            ), fetch_one=True, commit=True)
            
            # Create access token for the new admin
            token = self.create_access_token(result['id'], result['email'])
            
            # Save session
            expires_at = datetime.utcnow() + timedelta(hours=self.jwt_expiry_hours)
            self.execute_query('''
                INSERT INTO admin_sessions (admin_id, session_token, expires_at)
                VALUES (%s, %s, %s)
            ''', (
                result['id'],
                token,
                expires_at
            ), commit=True)
            
            return {
                "success": True,
                "admin": {
                    "id": result['id'],
                    "email": result['email'],
                    "full_name": result['full_name'],
                    "role": "admin",
                    "created_at": result['created_at']
                },
                "access_token": token,
                "message": "Admin created successfully"
            }
            
        except Exception as e:
            print(f"❌ Admin creation error: {e}")
            return {"success": False, "error": str(e)}
    
    def get_admin_by_id(self, admin_id: int) -> Optional[Dict[str, Any]]:
        """Get admin by ID"""
        try:
            admin = self.execute_query('''
                SELECT a.*, creator.email as created_by_email, creator.full_name as created_by_name
                FROM admins a
                LEFT JOIN admins creator ON a.created_by = creator.id
                WHERE a.id = %s AND a.is_active = TRUE
            ''', (admin_id,), fetch_one=True)
            
            if admin:
                admin['role'] = 'admin'
            return admin
            
        except Exception as e:
            print(f"❌ Get admin error: {e}")
            return None
    
    def get_all_admins(self, current_admin_id: int = None) -> list:
        """Get all admins"""
        try:
            query = '''
                SELECT a.*, creator.email as created_by_email, creator.full_name as created_by_name
                FROM admins a
                LEFT JOIN admins creator ON a.created_by = creator.id
                WHERE 1=1
            '''
            params = []
            
            if current_admin_id:
                query += " AND a.id != %s"
                params.append(current_admin_id)
            
            query += " ORDER BY a.created_at DESC"
            
            admins = self.execute_query(query, params, fetch_all=True) or []
            
            # Add role to each admin
            for admin in admins:
                admin['role'] = 'admin'
            
            return admins
            
        except Exception as e:
            print(f"❌ Get all admins error: {e}")
            return []
    
    def toggle_admin_status(self, admin_id: int, current_admin_id: int) -> Dict[str, Any]:
        """Toggle admin active status"""
        try:
            # Check if admin exists
            admin = self.execute_query(
                "SELECT id, is_active FROM admins WHERE id = %s",
                (admin_id,), fetch_one=True
            )
            
            if not admin:
                return {"success": False, "error": "Admin not found"}
            
            # Prevent self-deactivation
            if admin_id == current_admin_id:
                return {"success": False, "error": "Cannot deactivate your own account"}
            
            # Toggle status
            new_status = not admin['is_active']
            self.execute_query(
                "UPDATE admins SET is_active = %s WHERE id = %s",
                (new_status, admin_id), commit=True
            )
            
            return {
                "success": True,
                "message": f"Admin {'activated' if new_status else 'deactivated'} successfully",
                "is_active": new_status
            }
            
        except Exception as e:
            print(f"❌ Toggle admin status error: {e}")
            return {"success": False, "error": str(e)}
    
    def update_admin_profile(self, admin_id: int, update_data: Dict[str, Any]) -> Dict[str, Any]:
        """Update admin profile"""
        try:
            update_fields = []
            params = []
            
            if 'full_name' in update_data:
                update_fields.append("full_name = %s")
                params.append(update_data['full_name'])
            
            if 'email' in update_data:
                # Check if email already exists
                existing = self.execute_query(
                    "SELECT id FROM admins WHERE email = %s AND id != %s",
                    (update_data['email'], admin_id), fetch_one=True
                )
                
                if existing:
                    return {"success": False, "error": "Email already in use"}
                
                update_fields.append("email = %s")
                params.append(update_data['email'])
            
            if update_fields:
                query = f"UPDATE admins SET {', '.join(update_fields)} WHERE id = %s"
                params.append(admin_id)
                self.execute_query(query, params, commit=True)
            
            return {"success": True, "message": "Profile updated successfully"}
            
        except Exception as e:
            print(f"❌ Update admin profile error: {e}")
            return {"success": False, "error": str(e)}
    
    def change_admin_password(self, admin_id: int, current_password: str, new_password: str) -> Dict[str, Any]:
        """Change admin password"""
        try:
            # Get current password hash
            result = self.execute_query(
                "SELECT password_hash FROM admins WHERE id = %s",
                (admin_id,), fetch_one=True
            )
            
            if not result:
                return {"success": False, "error": "Admin not found"}
            
            # Verify current password
            if not self.verify_password(current_password, result['password_hash']):
                return {"success": False, "error": "Current password is incorrect"}
            
            # Update password
            new_hash = self.hash_password(new_password)
            self.execute_query(
                "UPDATE admins SET password_hash = %s WHERE id = %s",
                (new_hash, admin_id), commit=True
            )
            
            # Invalidate all sessions
            self.execute_query(
                "DELETE FROM admin_sessions WHERE admin_id = %s",
                (admin_id,), commit=True
            )
            
            return {"success": True, "message": "Password changed successfully"}
            
        except Exception as e:
            print(f"❌ Change admin password error: {e}")
            return {"success": False, "error": str(e)}
    
    def logout_admin(self, token: str) -> Dict[str, Any]:
        """Logout admin by deleting session"""
        try:
            self.execute_query(
                "DELETE FROM admin_sessions WHERE session_token = %s",
                (token,), commit=True
            )
            return {"success": True, "message": "Logged out successfully"}
            
        except Exception as e:
            print(f"❌ Admin logout error: {e}")
            return {"success": False, "error": str(e)}

# Import RealDictCursor for use in execute_query
from psycopg2.extras import RealDictCursor

# Singleton instance
admin_auth_service = AdminAuthService()