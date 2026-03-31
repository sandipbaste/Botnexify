import os
import jwt
import bcrypt
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from dotenv import load_dotenv
import psycopg2
from psycopg2 import Error
from psycopg2.extras import RealDictCursor
from urllib.parse import urlparse

load_dotenv()

class AdminAuthService:
    def __init__(self):
        self.jwt_secret = os.getenv('JWT_SECRET')
        self.jwt_algorithm = os.getenv('JWT_ALGORITHM')
        self.jwt_expiry_hours = int(os.getenv('JWT_EXPIRY_HOURS'))
        
        # Supabase PostgreSQL connection
        self.database_url = os.getenv('DATABASE_URL')
        
        # Default admin credentials
        self.default_admin_email = os.getenv('DEFAULT_ADMIN_EMAIL')
        self.default_admin_password = os.getenv('DEFAULT_ADMIN_PASSWORD')
        
        self.initialize_admin_tables()
        self.create_default_admin()
    
    def get_connection(self):
        """Get database connection from Supabase URL"""
        try:
            # Parse Supabase URL
            result = urlparse(self.database_url)
            host = result.hostname
            port = result.port or 5432
            database = result.path.lstrip('/')
            user = result.username
            password = result.password
            
            conn = psycopg2.connect(
                host=host,
                port=port,
                user=user,
                password=password,
                database=database,
                options='-c timezone=UTC'
            )
            return conn
        except Error as e:
            print(f"  Database connection error: {e}")
            raise
    
    def initialize_admin_tables(self):
        """Initialize admin tables in Supabase"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            # Create admins table (ADMINS ONLY - separate from users)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS admins (
                    id SERIAL PRIMARY KEY,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    full_name VARCHAR(255) NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    created_by INTEGER NULL,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (created_by) REFERENCES admins(id) ON DELETE SET NULL
                )
            ''')
            
            # Create updated_at trigger function
            cursor.execute('''
                CREATE OR REPLACE FUNCTION update_updated_at_column()
                RETURNS TRIGGER AS $$
                BEGIN
                    NEW.updated_at = CURRENT_TIMESTAMP;
                    RETURN NEW;
                END;
                $$ language 'plpgsql';
            ''')
            
            # Create trigger for admins table
            cursor.execute('''
                DROP TRIGGER IF EXISTS update_admins_updated_at ON admins;
                CREATE TRIGGER update_admins_updated_at
                    BEFORE UPDATE ON admins
                    FOR EACH ROW
                    EXECUTE FUNCTION update_updated_at_column();
            ''')
            
            # Create admin_sessions table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS admin_sessions (
                    id SERIAL PRIMARY KEY,
                    admin_id INTEGER NOT NULL,
                    session_token VARCHAR(500) NOT NULL,
                    device_info TEXT,
                    ip_address VARCHAR(100),
                    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
                )
            ''')
            
            # Create indexes
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_admins_email ON admins(email)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_admins_active ON admins(is_active)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_id ON admin_sessions(admin_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(session_token)')
            
            conn.commit()
            cursor.close()
            conn.close()
            
            print(" Admin tables initialized successfully in Supabase")
            
        except Exception as e:
            print(f"  Admin table initialization error: {e}")
            raise
    
    def create_default_admin(self):
        """Create default admin account from .env"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Check if default admin already exists
            cursor.execute("SELECT id FROM admins WHERE email = %s", (self.default_admin_email,))
            if cursor.fetchone():
                print(f" Default admin already exists: {self.default_admin_email}")
                cursor.close()
                conn.close()
                return
            
            # Hash default password
            password_hash = self.hash_password(self.default_admin_password)
            
            # Insert default admin (created_by is NULL for default admin)
            cursor.execute('''
                INSERT INTO admins (email, full_name, password_hash, created_by, is_active)
                VALUES (%s, %s, %s, NULL, TRUE)
                RETURNING id
            ''', (
                self.default_admin_email,
                "System Administrator",
                password_hash
            ))
            
            admin_id = cursor.fetchone()['id']
            
            conn.commit()
            cursor.close()
            conn.close()
            
            print(f" Default admin created: {self.default_admin_email} (ID: {admin_id})")
            
        except Error as e:
            print(f"  Default admin creation error: {e}")
    
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
            print("  Token expired")
            return None
        except jwt.InvalidTokenError:
            print("  Invalid token")
            return None
    
    def login_admin(self, email: str, password: str) -> Dict[str, Any]:
        """Login admin (checks admins table only)"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Get admin from admins table
            cursor.execute('''
                SELECT id, email, full_name, password_hash, is_active 
                FROM admins WHERE email = %s
            ''', (email,))
            admin = cursor.fetchone()
            
            if not admin:
                cursor.close()
                conn.close()
                return {"success": False, "error": "Admin not found"}
            
            if not admin['is_active']:
                cursor.close()
                conn.close()
                return {"success": False, "error": "Admin account is deactivated"}
            
            # Verify password
            if not self.verify_password(password, admin['password_hash']):
                cursor.close()
                conn.close()
                return {"success": False, "error": "Invalid password"}
            
            # Create access token
            token = self.create_access_token(admin['id'], admin['email'])
            
            # Save session
            cursor.execute('''
                INSERT INTO admin_sessions (admin_id, session_token, expires_at)
                VALUES (%s, %s, %s)
            ''', (
                admin['id'],
                token,
                datetime.utcnow() + timedelta(hours=self.jwt_expiry_hours)
            ))
            
            conn.commit()
            cursor.close()
            conn.close()
            
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
            
        except Error as e:
            print(f"  Admin login error: {e}")
            return {"success": False, "error": str(e)}
    
    def create_admin(self, admin_data: Dict[str, Any], created_by_admin_id: int) -> Dict[str, Any]:
        """Create a new admin account (only by existing admin)"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Check if admin already exists
            cursor.execute("SELECT id FROM admins WHERE email = %s", (admin_data['email'],))
            if cursor.fetchone():
                cursor.close()
                conn.close()
                return {"success": False, "error": "Admin already exists with this email"}
            
            # Hash password
            password_hash = self.hash_password(admin_data['password'])
            
            # Insert admin
            cursor.execute('''
                INSERT INTO admins (email, full_name, password_hash, created_by, is_active)
                VALUES (%s, %s, %s, %s, TRUE)
                RETURNING id
            ''', (
                admin_data['email'],
                admin_data['full_name'],
                password_hash,
                created_by_admin_id
            ))
            
            admin_id = cursor.fetchone()['id']
            
            # Get created admin
            cursor.execute('''
                SELECT a.*, creator.email as created_by_email, creator.full_name as created_by_name
                FROM admins a
                LEFT JOIN admins creator ON a.created_by = creator.id
                WHERE a.id = %s
            ''', (admin_id,))
            admin = cursor.fetchone()
            
            # Create access token for the new admin
            token = self.create_access_token(admin_id, admin['email'])
            
            # Save session
            cursor.execute('''
                INSERT INTO admin_sessions (admin_id, session_token, expires_at)
                VALUES (%s, %s, %s)
            ''', (
                admin_id,
                token,
                datetime.utcnow() + timedelta(hours=self.jwt_expiry_hours)
            ))
            
            conn.commit()
            cursor.close()
            conn.close()
            
            return {
                "success": True,
                "admin": {
                    "id": admin['id'],
                    "email": admin['email'],
                    "full_name": admin['full_name'],
                    "role": "admin",
                    "created_by": {
                        "id": created_by_admin_id,
                        "email": admin['created_by_email'],
                        "name": admin['created_by_name']
                    } if admin['created_by'] else None,
                    "created_at": admin['created_at']
                },
                "access_token": token,
                "message": "Admin created successfully"
            }
            
        except Error as e:
            print(f"  Admin creation error: {e}")
            return {"success": False, "error": str(e)}
    
    def get_admin_by_id(self, admin_id: int) -> Optional[Dict[str, Any]]:
        """Get admin by ID"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            cursor.execute('''
                SELECT a.*, creator.email as created_by_email, creator.full_name as created_by_name
                FROM admins a
                LEFT JOIN admins creator ON a.created_by = creator.id
                WHERE a.id = %s AND a.is_active = TRUE
            ''', (admin_id,))
            
            admin = cursor.fetchone()
            
            cursor.close()
            conn.close()
            
            if admin:
                admin['role'] = 'admin'
            return admin
            
        except Error as e:
            print(f"  Get admin error: {e}")
            return None
    
    def get_all_admins(self, current_admin_id: int = None) -> list:
        """Get all admins"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            query = '''
                SELECT a.*, creator.email as created_by_email, creator.full_name as created_by_name
                FROM admins a
                LEFT JOIN admins creator ON a.created_by = creator.id
                WHERE 1=1
            '''
            params = []
            
            # Exclude current admin if provided
            if current_admin_id:
                query += " AND a.id != %s"
                params.append(current_admin_id)
            
            query += " ORDER BY a.created_at DESC"
            
            cursor.execute(query, params)
            admins = cursor.fetchall()
            
            cursor.close()
            conn.close()
            
            # Add role to each admin
            for admin in admins:
                admin['role'] = 'admin'
            
            return admins
            
        except Error as e:
            print(f"  Get all admins error: {e}")
            return []
    
    def toggle_admin_status(self, admin_id: int, current_admin_id: int) -> Dict[str, Any]:
        """Toggle admin active status"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Check if admin exists
            cursor.execute("SELECT id, is_active FROM admins WHERE id = %s", (admin_id,))
            admin = cursor.fetchone()
            
            if not admin:
                cursor.close()
                conn.close()
                return {"success": False, "error": "Admin not found"}
            
            # Prevent self-deactivation
            if admin_id == current_admin_id:
                cursor.close()
                conn.close()
                return {"success": False, "error": "Cannot deactivate your own account"}
            
            # Toggle status
            new_status = not admin['is_active']
            cursor.execute("UPDATE admins SET is_active = %s WHERE id = %s", (new_status, admin_id))
            
            conn.commit()
            cursor.close()
            conn.close()
            
            return {
                "success": True,
                "message": f"Admin {'activated' if new_status else 'deactivated'} successfully",
                "is_active": new_status
            }
            
        except Error as e:
            print(f"  Toggle admin status error: {e}")
            return {"success": False, "error": str(e)}
    
    def update_admin_profile(self, admin_id: int, update_data: Dict[str, Any]) -> Dict[str, Any]:
        """Update admin profile"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            # Build update query
            update_fields = []
            params = []
            
            if 'full_name' in update_data:
                update_fields.append("full_name = %s")
                params.append(update_data['full_name'])
            
            if 'email' in update_data:
                # Check if email already exists
                cursor.execute("SELECT id FROM admins WHERE email = %s AND id != %s", 
                             (update_data['email'], admin_id))
                if cursor.fetchone():
                    cursor.close()
                    conn.close()
                    return {"success": False, "error": "Email already in use"}
                
                update_fields.append("email = %s")
                params.append(update_data['email'])
            
            if update_fields:
                update_fields.append("updated_at = CURRENT_TIMESTAMP")
                query = f"UPDATE admins SET {', '.join(update_fields)} WHERE id = %s"
                params.append(admin_id)
                
                cursor.execute(query, params)
            
            conn.commit()
            cursor.close()
            conn.close()
            
            return {"success": True, "message": "Profile updated successfully"}
            
        except Error as e:
            print(f"  Update admin profile error: {e}")
            return {"success": False, "error": str(e)}
    
    def change_admin_password(self, admin_id: int, current_password: str, new_password: str) -> Dict[str, Any]:
        """Change admin password"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Get current password hash
            cursor.execute("SELECT password_hash FROM admins WHERE id = %s", (admin_id,))
            result = cursor.fetchone()
            
            if not result:
                cursor.close()
                conn.close()
                return {"success": False, "error": "Admin not found"}
            
            # Verify current password
            if not self.verify_password(current_password, result['password_hash']):
                cursor.close()
                conn.close()
                return {"success": False, "error": "Current password is incorrect"}
            
            # Update password
            new_hash = self.hash_password(new_password)
            cursor.execute("UPDATE admins SET password_hash = %s WHERE id = %s", (new_hash, admin_id))
            
            # Invalidate all sessions
            cursor.execute("DELETE FROM admin_sessions WHERE admin_id = %s", (admin_id,))
            
            conn.commit()
            cursor.close()
            conn.close()
            
            return {"success": True, "message": "Password changed successfully"}
            
        except Error as e:
            print(f"  Change admin password error: {e}")
            return {"success": False, "error": str(e)}
    
    def logout_admin(self, token: str) -> Dict[str, Any]:
        """Logout admin by deleting session"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            cursor.execute("DELETE FROM admin_sessions WHERE session_token = %s", (token,))
            
            conn.commit()
            cursor.close()
            conn.close()
            
            return {"success": True, "message": "Logged out successfully"}
            
        except Error as e:
            print(f"  Admin logout error: {e}")
            return {"success": False, "error": str(e)}

# Singleton instance
admin_auth_service = AdminAuthService()