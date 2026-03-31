import os
import json
import jwt
import bcrypt
import secrets
import random
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from dotenv import load_dotenv
import psycopg2
from psycopg2 import Error
from psycopg2.extras import RealDictCursor
from urllib.parse import urlparse

load_dotenv()

class AuthService:
    def __init__(self):
        self.jwt_secret = os.getenv('JWT_SECRET')
        self.jwt_algorithm = os.getenv('JWT_ALGORITHM')
        self.jwt_expiry_hours = int(os.getenv('JWT_EXPIRY_HOURS'))
        self.otp_expiry_minutes = int(os.getenv('OTP_EXPIRY_MINUTES'))
        
        # Supabase PostgreSQL connection
        self.database_url = os.getenv('DATABASE_URL')
        
        self.initialize_user_tables()
    
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
    
    def initialize_user_tables(self):
        """Initialize user tables in Supabase"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            # Create users table (REGULAR USERS ONLY)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    full_name VARCHAR(255) NOT NULL,
                    mobile VARCHAR(50),
                    password_hash VARCHAR(255) NOT NULL,
                    website_ids TEXT,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Create updated_at trigger
            cursor.execute('''
                CREATE OR REPLACE FUNCTION update_updated_at_column()
                RETURNS TRIGGER AS $$
                BEGIN
                    NEW.updated_at = CURRENT_TIMESTAMP;
                    RETURN NEW;
                END;
                $$ language 'plpgsql';
            ''')
            
            cursor.execute('''
                DROP TRIGGER IF EXISTS update_users_updated_at ON users;
                CREATE TRIGGER update_users_updated_at
                    BEFORE UPDATE ON users
                    FOR EACH ROW
                    EXECUTE FUNCTION update_updated_at_column();
            ''')
            
            # Create user_sessions table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS user_sessions (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    session_token VARCHAR(500) NOT NULL,
                    device_info TEXT,
                    ip_address VARCHAR(100),
                    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            ''')
            
            # Create password_resets table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS password_resets (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    reset_token VARCHAR(500) NOT NULL,
                    otp VARCHAR(10) DEFAULT NULL,
                    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    verified BOOLEAN DEFAULT FALSE,
                    used BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            ''')
            
            # Create indexes
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(reset_token)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON password_resets(user_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_password_resets_otp ON password_resets(otp)')
            
            conn.commit()
            cursor.close()
            conn.close()
            
            print(" User tables initialized successfully in Supabase")
            
        except Exception as e:
            print(f"  User table initialization error: {e}")
            raise
    
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
            print("  Token expired")
            return None
        except jwt.InvalidTokenError:
            print("  Invalid token")
            return None
    
    def generate_otp(self, length: int = 6) -> str:
        """Generate a random OTP"""
        digits = "0123456789"
        otp = ''.join(random.choice(digits) for _ in range(length))
        return otp
    
    def initiate_password_reset(self, email: str) -> Dict[str, Any]:
        """Initiate password reset process for users"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            print(f" Looking for user with email: {email}")
            
            # Check if user exists in users table
            cursor.execute("SELECT id, email, full_name FROM users WHERE email = %s AND is_active = TRUE", (email,))
            user = cursor.fetchone()
            
            if not user:
                cursor.close()
                conn.close()
                print(f"  User not found: {email}")
                return {"success": False, "error": "User not found"}
            
            user_id = user['id']
            print(f" Found user: {user['full_name']} (ID: {user_id})")
            
            # Generate OTP
            otp = self.generate_otp()
            print(f" Generated OTP: {otp}")
            
            # Generate reset token
            reset_token = secrets.token_urlsafe(32)
            print(f" Generated reset token: {reset_token[:20]}...")
            
            # Expiry time
            expires_at = datetime.utcnow() + timedelta(minutes=self.otp_expiry_minutes)
            print(f" OTP expires at: {expires_at}")
            
            # Invalidate any existing reset tokens for this user
            cursor.execute("UPDATE password_resets SET used = TRUE WHERE user_id = %s AND used = FALSE", (user_id,))
            print(f"  Invalidated previous reset tokens for user {user_id}")
            
            # Create new reset request
            cursor.execute('''
                INSERT INTO password_resets (user_id, reset_token, otp, expires_at, verified, used)
                VALUES (%s, %s, %s, %s, FALSE, FALSE)
                RETURNING id
            ''', (user_id, reset_token, otp, expires_at))
            
            reset_id = cursor.fetchone()['id']
            print(f" Saved reset request with ID: {reset_id}")
            
            conn.commit()
            cursor.close()
            conn.close()
            
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
            
        except Error as e:
            print(f"  Password reset initiation error: {e}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e)}
    
    def verify_otp(self, reset_token: str, otp: str) -> Dict[str, Any]:
        """Verify OTP for password reset"""
        try:
            print(f"\n Verifying OTP...")
            print(f"  Reset Token: {reset_token[:20]}...")
            print(f"  OTP to verify: {otp}")
            
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Check if reset token exists and is valid
            print(f" Searching for reset token in database...")
            cursor.execute('''
                SELECT pr.*, u.email, u.full_name
                FROM password_resets pr
                JOIN users u ON pr.user_id = u.id
                WHERE pr.reset_token = %s 
                AND pr.used = FALSE 
                AND pr.verified = FALSE
                AND pr.expires_at > CURRENT_TIMESTAMP
            ''', (reset_token,))
            
            reset_request = cursor.fetchone()
            
            if not reset_request:
                print(f"  Reset token not found or invalid")
                cursor.close()
                conn.close()
                return {"success": False, "error": "Invalid or expired reset token"}
            
            print(f" Found reset request:")
            print(f"   ID: {reset_request['id']}")
            print(f"   User: {reset_request['full_name']}")
            print(f"   Stored OTP: {reset_request['otp']}")
            print(f"   Input OTP: {otp}")
            print(f"   Expires at: {reset_request['expires_at']}")
            
            # Verify OTP
            if reset_request['otp'] != otp:
                print(f"  OTP mismatch!")
                cursor.close()
                conn.close()
                return {"success": False, "error": "Invalid OTP"}
            
            print(f" OTP matched!")
            
            # Mark OTP as verified
            cursor.execute('''
                UPDATE password_resets 
                SET verified = TRUE 
                WHERE id = %s
            ''', (reset_request['id'],))
            
            conn.commit()
            cursor.close()
            conn.close()
            
            print(f" OTP verified successfully!")
            
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
            
        except Error as e:
            print(f"  OTP verification error: {e}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e)}
    
    def reset_password(self, reset_token: str, new_password: str) -> Dict[str, Any]:
        """Reset password using verified reset token"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Check if reset token is verified and valid
            cursor.execute('''
                SELECT pr.*, u.id as user_id, u.email
                FROM password_resets pr
                JOIN users u ON pr.user_id = u.id
                WHERE pr.reset_token = %s 
                AND pr.used = FALSE 
                AND pr.verified = TRUE
                AND pr.expires_at > CURRENT_TIMESTAMP
                AND u.is_active = TRUE
            ''', (reset_token,))
            
            reset_request = cursor.fetchone()
            
            if not reset_request:
                cursor.close()
                conn.close()
                return {"success": False, "error": "Invalid or expired reset token"}
            
            user_id = reset_request['user_id']
            
            # Hash new password
            new_password_hash = self.hash_password(new_password)
            
            # Update user password
            cursor.execute("UPDATE users SET password_hash = %s WHERE id = %s", (new_password_hash, user_id))
            
            # Mark reset token as used
            cursor.execute("UPDATE password_resets SET used = TRUE WHERE id = %s", (reset_request['id'],))
            
            # Invalidate all sessions for this user
            cursor.execute("DELETE FROM user_sessions WHERE user_id = %s", (user_id,))
            
            conn.commit()
            cursor.close()
            conn.close()
            
            return {
                "success": True,
                "message": "Password reset successfully",
                "user": {
                    "id": user_id,
                    "email": reset_request['email']
                }
            }
            
        except Error as e:
            print(f"  Password reset error: {e}")
            return {"success": False, "error": str(e)}
    
    def register_user(self, user_data: Dict[str, Any]) -> Dict[str, Any]:
        """Register a new regular user"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Check if user already exists
            cursor.execute("SELECT id FROM users WHERE email = %s", (user_data['email'],))
            if cursor.fetchone():
                cursor.close()
                conn.close()
                return {"success": False, "error": "User already exists with this email"}
            
            # Hash password
            password_hash = self.hash_password(user_data['password'])
            
            # Insert user
            cursor.execute('''
                INSERT INTO users (email, full_name, mobile, password_hash)
                VALUES (%s, %s, %s, %s)
                RETURNING id, email, full_name, mobile
            ''', (
                user_data['email'],
                user_data['full_name'],
                user_data.get('mobile', ''),
                password_hash
            ))
            
            user = cursor.fetchone()
            user_id = user['id']
            
            # Create access token
            token = self.create_access_token(user_id, user['email'], 'user')
            
            # Save session
            cursor.execute('''
                INSERT INTO user_sessions (user_id, session_token, expires_at)
                VALUES (%s, %s, %s)
            ''', (
                user_id,
                token,
                datetime.utcnow() + timedelta(hours=self.jwt_expiry_hours)
            ))
            
            conn.commit()
            cursor.close()
            conn.close()
            
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
            
        except Error as e:
            print(f"  User registration error: {e}")
            return {"success": False, "error": str(e)}
    
    def login_user(self, email: str, password: str) -> Dict[str, Any]:
        """Login regular user (checks users table only)"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Get user from users table
            cursor.execute('''
                SELECT id, email, full_name, mobile, password_hash, is_active 
                FROM users WHERE email = %s
            ''', (email,))
            user = cursor.fetchone()
            
            if not user:
                cursor.close()
                conn.close()
                return {"success": False, "error": "User not found"}
            
            if not user['is_active']:
                cursor.close()
                conn.close()
                return {"success": False, "error": "Account is deactivated"}
            
            # Verify password
            if not self.verify_password(password, user['password_hash']):
                cursor.close()
                conn.close()
                return {"success": False, "error": "Invalid password"}
            
            # Create access token
            token = self.create_access_token(user['id'], user['email'], 'user')
            
            # Save session
            cursor.execute('''
                INSERT INTO user_sessions (user_id, session_token, expires_at)
                VALUES (%s, %s, %s)
            ''', (
                user['id'],
                token,
                datetime.utcnow() + timedelta(hours=self.jwt_expiry_hours)
            ))
            
            conn.commit()
            cursor.close()
            conn.close()
            
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
            
        except Error as e:
            print(f"  Login error: {e}")
            return {"success": False, "error": str(e)}
    
    def verify_token(self, token: str) -> Dict[str, Any]:
        """Verify token and get user info (checks both users and admins)"""
        try:
            payload = self.verify_access_token(token)
            if not payload:
                return {"success": False, "error": "Invalid or expired token"}
            
            user_type = payload.get('user_type', 'user')
            user_id = payload['user_id']
            
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            if user_type == 'user':
                # Check if user exists in users table
                cursor.execute('''
                    SELECT s.*, u.email, u.full_name, u.is_active
                    FROM user_sessions s
                    JOIN users u ON s.user_id = u.id
                    WHERE s.session_token = %s AND s.expires_at > CURRENT_TIMESTAMP AND u.is_active = TRUE
                    AND u.id = %s
                ''', (token, user_id))
            elif user_type == 'admin':
                # Check if admin exists in admins table
                cursor.execute('''
                    SELECT s.*, a.email, a.full_name, a.is_active
                    FROM admin_sessions s
                    JOIN admins a ON s.admin_id = a.id
                    WHERE s.session_token = %s AND s.expires_at > CURRENT_TIMESTAMP AND a.is_active = TRUE
                    AND a.id = %s
                ''', (token, user_id))
            else:
                cursor.close()
                conn.close()
                return {"success": False, "error": "Invalid user type"}
            
            session = cursor.fetchone()
            
            cursor.close()
            conn.close()
            
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
            print(f"  Token verification error: {e}")
            return {"success": False, "error": str(e)}
    
    def get_user_by_id(self, user_id: int) -> Optional[Dict[str, Any]]:
        """Get user by ID from users table"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            cursor.execute('''
                SELECT id, email, full_name, mobile, website_ids, created_at
                FROM users WHERE id = %s AND is_active = TRUE
            ''', (user_id,))
            
            user = cursor.fetchone()
            
            cursor.close()
            conn.close()
            
            if user:
                user['role'] = 'user'
                # Parse website_ids from JSON string if exists
                if user.get('website_ids'):
                    try:
                        user['website_ids'] = json.loads(user['website_ids'])
                    except:
                        user['website_ids'] = []
                else:
                    user['website_ids'] = []
            return user
            
        except Error as e:
            print(f"  Get user error: {e}")
            return None
        
    def add_website_to_user(self, user_id: int, website_id: str) -> Dict[str, Any]:
        """Add a website ID to user's website_ids list"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            # Get current website_ids
            cursor.execute("SELECT website_ids FROM users WHERE id = %s", (user_id,))
            result = cursor.fetchone()
            
            if not result:
                cursor.close()
                conn.close()
                return {"success": False, "error": "User not found"}
            
            # Parse existing website_ids
            current_website_ids = []
            if result[0]:
                try:
                    # Handle both JSON string and already parsed list
                    if isinstance(result[0], str):
                        current_website_ids = json.loads(result[0])
                    elif isinstance(result[0], list):
                        current_website_ids = result[0]
                    else:
                        current_website_ids = []
                except:
                    current_website_ids = []
            
            # Add new website_id if not already present
            if website_id not in current_website_ids:
                current_website_ids.append(website_id)
                
                # Update database - ensure it's stored as JSON string
                website_ids_json = json.dumps(current_website_ids)
                cursor.execute(
                    "UPDATE users SET website_ids = %s WHERE id = %s",
                    (website_ids_json, user_id)
                )
                conn.commit()
                updated = True
            else:
                updated = False
            
            cursor.close()
            conn.close()
            
            return {
                "success": True,
                "updated": updated,
                "message": f"Website ID {'added' if updated else 'already exists'}",
                "website_ids": current_website_ids
            }
            
        except Error as e:
            print(f"  Add website to user error: {e}")
            return {"success": False, "error": str(e)}   
    
    def remove_website_from_user(self, user_id: int, website_id: str):
        """Remove website ID from user's website_ids array"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            # Get current website_ids
            cursor.execute("SELECT website_ids FROM users WHERE id = %s", (user_id,))
            result = cursor.fetchone()
            
            if result and result[0]:
                website_ids = result[0]
                if isinstance(website_ids, str):
                    import json
                    try:
                        website_ids = json.loads(website_ids)
                    except:
                        website_ids = website_ids.split(',') if website_ids else []
                
                # Remove the website_id
                if website_id in website_ids:
                    website_ids.remove(website_id)
                
                # Save back as JSON
                import json
                website_ids_json = json.dumps(website_ids)
                
                cursor.execute(
                    "UPDATE users SET website_ids = %s WHERE id = %s",
                    (website_ids_json, user_id)
                )
                
                conn.commit()
                print(f" Removed website {website_id} from user {user_id}")
            
            cursor.close()
            conn.close()
            return True
            
        except Exception as e:
            print(f"  Error removing website from user: {e}")
            return False
    
    def get_user_websites(self, user_id: int) -> list:
        """Get all websites for a user"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # First, get the user to check their website_ids
            cursor.execute("SELECT website_ids FROM users WHERE id = %s", (user_id,))
            user_result = cursor.fetchone()
            
            if not user_result:
                cursor.close()
                conn.close()
                return []
            
            website_ids = []
            if user_result['website_ids']:
                try:
                    # Parse the JSON string if it's a string
                    if isinstance(user_result['website_ids'], str):
                        website_ids = json.loads(user_result['website_ids'])
                    elif isinstance(user_result['website_ids'], list):
                        website_ids = user_result['website_ids']
                except:
                    website_ids = []
            
            # If user has no website IDs, return empty list
            if not website_ids:
                cursor.close()
                conn.close()
                return []
            
            # Fetch all websites that belong to this user
            # Use parameterized query with list of IDs
            placeholders = ','.join(['%s'] * len(website_ids))
            query = f"""
                SELECT w.*, 
                    (SELECT COUNT(*) FROM contact_forms WHERE website_id = w.website_id) as contact_forms_count,
                    (SELECT COUNT(*) FROM chat_history WHERE website_id = w.website_id) as chat_messages_count,
                    (SELECT COUNT(*) FROM website_files WHERE website_id = w.website_id) as files_count
                FROM websites w
                WHERE w.website_id IN ({placeholders})
                ORDER BY w.created_at DESC
            """
            
            cursor.execute(query, website_ids)
            websites = cursor.fetchall()
            
            cursor.close()
            conn.close()
            
            return websites
            
        except Error as e:
            print(f"  Get user websites error: {e}")
            return []
    
    def get_user_websites_detailed(self, user_id: int) -> list:
        """Get detailed website information for a user"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Get user's website_ids
            cursor.execute("SELECT website_ids FROM users WHERE id = %s", (user_id,))
            result = cursor.fetchone()
            
            if not result or not result['website_ids']:
                cursor.close()
                conn.close()
                return []
            
            # Parse website_ids
            try:
                if isinstance(result['website_ids'], str):
                    website_ids = json.loads(result['website_ids'])
                elif isinstance(result['website_ids'], list):
                    website_ids = result['website_ids']
                else:
                    website_ids = []
            except:
                website_ids = []
            
            if not website_ids:
                cursor.close()
                conn.close()
                return []
            
            # Get detailed website info for each website_id
            websites = []
            for website_id in website_ids:
                cursor.execute('''
                    SELECT w.*, 
                        (SELECT COUNT(*) FROM contact_forms WHERE website_id = w.website_id) as contact_forms_count,
                        (SELECT COUNT(*) FROM chat_history WHERE website_id = w.website_id) as chat_messages_count,
                        (SELECT COUNT(*) FROM website_files WHERE website_id = w.website_id) as files_count
                    FROM websites w
                    WHERE w.website_id = %s
                ''', (website_id,))
                
                website = cursor.fetchone()
                if website:
                    websites.append(website)
            
            cursor.close()
            conn.close()
            
            return websites
            
        except Error as e:
            print(f"  Get user websites detailed error: {e}")
            return []
    
    def get_all_users(self, current_user_id: int = None) -> list:
        """Get all regular users (admin only)"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            query = '''
                SELECT id, email, full_name, mobile, is_active, created_at
                FROM users
                WHERE 1=1
            '''
            params = []
            
            # Exclude current user if provided
            if current_user_id:
                query += " AND id != %s"
                params.append(current_user_id)
            
            query += " ORDER BY created_at DESC"
            
            cursor.execute(query, params)
            users = cursor.fetchall()
            
            # Add website count for each user
            for user in users:
                cursor.execute("SELECT COUNT(*) as count FROM websites WHERE user_id = %s", (user['id'],))
                count_result = cursor.fetchone()
                user['website_count'] = count_result['count'] if count_result else 0
                user['role'] = 'user'
            
            cursor.close()
            conn.close()
            
            return users
            
        except Error as e:
            print(f"  Get all users error: {e}")
            return []
    
    def update_user_profile(self, user_id: int, update_data: Dict[str, Any]) -> Dict[str, Any]:
        """Update user profile"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            # Build update query
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
                cursor.execute("SELECT id FROM users WHERE email = %s AND id != %s", 
                             (update_data['email'], user_id))
                if cursor.fetchone():
                    cursor.close()
                    conn.close()
                    return {"success": False, "error": "Email already in use"}
                
                update_fields.append("email = %s")
                params.append(update_data['email'])
            
            if update_fields:
                update_fields.append("updated_at = CURRENT_TIMESTAMP")
                query = f"UPDATE users SET {', '.join(update_fields)} WHERE id = %s"
                params.append(user_id)
                
                cursor.execute(query, params)
            
            conn.commit()
            cursor.close()
            conn.close()
            
            return {"success": True, "message": "Profile updated successfully"}
            
        except Error as e:
            print(f"  Update profile error: {e}")
            return {"success": False, "error": str(e)}
    
    def change_password(self, user_id: int, current_password: str, new_password: str) -> Dict[str, Any]:
        """Change user password"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Get current password hash
            cursor.execute("SELECT password_hash FROM users WHERE id = %s", (user_id,))
            result = cursor.fetchone()
            
            if not result:
                cursor.close()
                conn.close()
                return {"success": False, "error": "User not found"}
            
            # Verify current password
            if not self.verify_password(current_password, result['password_hash']):
                cursor.close()
                conn.close()
                return {"success": False, "error": "Current password is incorrect"}
            
            # Update password
            new_hash = self.hash_password(new_password)
            cursor.execute("UPDATE users SET password_hash = %s WHERE id = %s", (new_hash, user_id))
            
            # Invalidate all sessions
            cursor.execute("DELETE FROM user_sessions WHERE user_id = %s", (user_id,))
            
            conn.commit()
            cursor.close()
            conn.close()
            
            return {"success": True, "message": "Password changed successfully"}
            
        except Error as e:
            print(f"  Change password error: {e}")
            return {"success": False, "error": str(e)}
    
    def toggle_user_status(self, user_id: int, current_user_id: int) -> Dict[str, Any]:
        """Toggle user active status (admin only)"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Check if user exists
            cursor.execute("SELECT id, is_active FROM users WHERE id = %s", (user_id,))
            user = cursor.fetchone()
            
            if not user:
                cursor.close()
                conn.close()
                return {"success": False, "error": "User not found"}
            
            # Prevent self-deactivation
            if user_id == current_user_id:
                cursor.close()
                conn.close()
                return {"success": False, "error": "Cannot deactivate your own account"}
            
            # Toggle status
            new_status = not user['is_active']
            cursor.execute("UPDATE users SET is_active = %s WHERE id = %s", (new_status, user_id))
            
            conn.commit()
            cursor.close()
            conn.close()
            
            return {
                "success": True,
                "message": f"User {'activated' if new_status else 'deactivated'} successfully",
                "is_active": new_status
            }
            
        except Error as e:
            print(f"  Toggle user status error: {e}")
            return {"success": False, "error": str(e)}

# Singleton instance
auth_service = AuthService()