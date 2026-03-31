import os
import json
from typing import Optional, Dict, Any, List
import psycopg2
from psycopg2 import sql
from psycopg2.extras import RealDictCursor
from psycopg2.pool import SimpleConnectionPool
from dotenv import load_dotenv
from contextlib import contextmanager
from psycopg2.pool import SimpleConnectionPool, PoolError
from psycopg2.extras import RealDictCursor
import time
import threading

load_dotenv()

# PostgreSQL connection pool
class PostgresConnection:
    def __init__(self):
        self.database_url = os.getenv('DATABASE_URL')
        self.min_connections = int(os.getenv('DB_MIN_CONNECTIONS', 2))
        self.max_connections = int(os.getenv('DB_MAX_CONNECTIONS', 20))
        self.pool = None
        self._lock = threading.Lock()
        self.init_pool()

    def init_pool(self):
        """Initialize connection pool with better error handling"""
        try:
            self.pool = SimpleConnectionPool(
                self.min_connections,
                self.max_connections,
                self.database_url,
                keepalives=1,
                keepalives_idle=30,
                keepalives_interval=10,
                keepalives_count=5,
                options="-c statement_timeout=30000"  # 30 second timeout
            )
            print(f"✅ PostgreSQL connection pool initialized (min={self.min_connections}, max={self.max_connections})")
        except Exception as e:
            print(f"❌ PostgreSQL connection pool error: {e}")
            raise

    def get_connection(self, timeout=5):
        """Get connection from pool with timeout and retry logic"""
        start_time = time.time()
        retry_count = 0
        max_retries = 3
        
        while retry_count < max_retries:
            try:
                with self._lock:
                    if self.pool:
                        return self.pool.getconn()
                    else:
                        raise Exception("Connection pool not initialized")
            except PoolError as e:
                # Pool exhausted - wait and retry
                if time.time() - start_time > timeout:
                    raise Exception(f"Connection pool exhausted after {timeout}s timeout")
                
                retry_count += 1
                print(f"⚠️ Connection pool exhausted, retry {retry_count}/{max_retries}...")
                time.sleep(0.5 * retry_count)  # Exponential backoff
                
            except Exception as e:
                print(f"❌ Error getting connection from pool: {e}")
                raise
        
        raise Exception("Failed to get connection after max retries")

    def return_connection(self, conn):
        """Return connection to pool with validation"""
        try:
            if conn and self.pool:
                # Ensure connection is still alive before returning
                try:
                    # Test the connection
                    with conn.cursor() as cur:
                        cur.execute("SELECT 1")
                except:
                    # Connection is dead, close it properly
                    try:
                        conn.close()
                    except:
                        pass
                    return
                
                self.pool.putconn(conn)
        except Exception as e:
            print(f"❌ Error returning connection to pool: {e}")
            # Try to close the connection if we can't return it
            try:
                conn.close()
            except:
                pass

    @contextmanager
    def connection(self):
        """Context manager for safe connection handling"""
        conn = None
        try:
            conn = self.get_connection()
            yield conn
        finally:
            if conn:
                self.return_connection(conn)

    def close_all(self):
        """Close all connections"""
        if self.pool:
            self.pool.closeall()

# Global connection pool
pg_pool = PostgresConnection()


class DatabaseManager:
    def __init__(self):
        # Don't initialize database in constructor to avoid timeout during import
        self._initialized = False

    def ensure_initialized(self):
        """Ensure database is initialized (lazy initialization)"""
        if not self._initialized:
            self.initialize_database()
            self._initialized = True

    def get_connection(self):
        """Get database connection"""
        # Ensure initialization before getting connection
        self.ensure_initialized()
        return pg_pool.get_connection()

    def return_connection(self, conn):
        """Return connection to pool"""
        pg_pool.return_connection(conn)

    def execute_query(self, query, params=None, fetch_one=False, fetch_all=False, commit=False):
        """Execute a query with automatic connection management"""
        conn = None
        cursor = None
        try:
            # Ensure initialization before executing query
            self.ensure_initialized()
            
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Set statement timeout for this session
            cursor.execute("SET statement_timeout = '30s'")
            
            cursor.execute(query, params or ())
            
            if commit:
                conn.commit()
            
            if fetch_one:
                result = cursor.fetchone()
                return result
            elif fetch_all:
                result = cursor.fetchall()
                return result
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

    def initialize_database(self):
        """Initialize database and create tables if they don't exist"""
        conn = None
        cursor = None
        try:
            conn = pg_pool.get_connection()
            
            # Set statement timeout to a higher value (30 seconds) for this session
            cursor = conn.cursor()
            cursor.execute("SET statement_timeout = '30s';")
            
            # Enable UUID extension if needed
            cursor.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";')
            
            # Create users table (if it doesn't exist)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    full_name VARCHAR(255) NOT NULL,
                    mobile VARCHAR(50),
                    password_hash VARCHAR(255) NOT NULL,
                    website_ids JSONB DEFAULT '[]',
                    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Create websites table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS websites (
                    id SERIAL PRIMARY KEY,
                    website_id VARCHAR(100) UNIQUE NOT NULL,
                    website_name VARCHAR(255) NOT NULL,
                    website_url VARCHAR(500) NOT NULL,
                    script_tag TEXT,
                    admin_email VARCHAR(255),
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'training')),
                    data_directory VARCHAR(500),
                    user_id INT REFERENCES users(id) ON DELETE SET NULL
                )
            ''')
            
            # Create contact_forms table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS contact_forms (
                    id SERIAL PRIMARY KEY,
                    website_id VARCHAR(100) NOT NULL REFERENCES websites(website_id) ON DELETE CASCADE,
                    name VARCHAR(255) NOT NULL,
                    email VARCHAR(255) NOT NULL,
                    phone VARCHAR(50),
                    message TEXT NOT NULL,
                    form_data JSONB,
                    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'spam')),
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Create chat_history table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS chat_history (
                    id SERIAL PRIMARY KEY,
                    website_id VARCHAR(100) NOT NULL REFERENCES websites(website_id) ON DELETE CASCADE,
                    conversation_id VARCHAR(100) NOT NULL,
                    session_id VARCHAR(100),
                    user_name VARCHAR(255),
                    user_email VARCHAR(255),
                    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
                    message TEXT NOT NULL,
                    metadata JSONB,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Create indexes for chat_history
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_website_conversation ON chat_history(website_id, conversation_id)')
            
            # Create website_files table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS website_files (
                    id SERIAL PRIMARY KEY,
                    website_id VARCHAR(100) NOT NULL REFERENCES websites(website_id) ON DELETE CASCADE,
                    filename VARCHAR(255) NOT NULL,
                    file_path VARCHAR(500),
                    file_type VARCHAR(50),
                    file_size BIGINT,
                    upload_type VARCHAR(20) DEFAULT 'user_upload' CHECK (upload_type IN ('website', 'user_upload')),
                    processed BOOLEAN DEFAULT FALSE,
                    chunk_count INT DEFAULT 0,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Create training_logs table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS training_logs (
                    id SERIAL PRIMARY KEY,
                    website_id VARCHAR(100) NOT NULL REFERENCES websites(website_id) ON DELETE CASCADE,
                    status VARCHAR(20) NOT NULL CHECK (status IN ('started', 'processing', 'completed', 'failed')),
                    message TEXT,
                    data_points INT DEFAULT 0,
                    embedding_count INT DEFAULT 0,
                    training_time FLOAT DEFAULT 0.0,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Create subscription_plans table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS subscription_plans (
                    id SERIAL PRIMARY KEY,
                    plan_name VARCHAR(50) UNIQUE NOT NULL,
                    plan_description TEXT,
                    price DECIMAL(10, 2) NOT NULL,
                    currency VARCHAR(10) DEFAULT 'INR',
                    duration_days INT NOT NULL,
                    max_websites INT DEFAULT 1,
                    max_chat_messages INT DEFAULT 1000,
                    max_uploads INT DEFAULT 10,
                    features JSONB,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Create user_subscriptions table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS user_subscriptions (
                    id SERIAL PRIMARY KEY,
                    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    plan_id INT NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
                    payment_id VARCHAR(100) UNIQUE,
                    amount_paid DECIMAL(10, 2) NOT NULL,
                    currency VARCHAR(10) DEFAULT 'INR',
                    payment_method VARCHAR(50),
                    payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded')),
                    subscription_status VARCHAR(20) DEFAULT 'active' CHECK (subscription_status IN ('active', 'expired', 'cancelled')),
                    start_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    end_date TIMESTAMP WITH TIME ZONE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Create payment_transactions table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS payment_transactions (
                    id SERIAL PRIMARY KEY,
                    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    subscription_id INT REFERENCES user_subscriptions(id) ON DELETE SET NULL,
                    transaction_id VARCHAR(100) UNIQUE,
                    amount DECIMAL(10, 2) NOT NULL,
                    currency VARCHAR(10) DEFAULT 'INR',
                    payment_method VARCHAR(50),
                    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
                    gateway_response JSONB,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Create indexes for better performance
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_user_subscriptions_payment_status ON user_subscriptions(payment_status)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_user_subscriptions_subscription_status ON user_subscriptions(subscription_status)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_id ON payment_transactions(user_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status)')
            
            # Create update trigger function for updated_at
            cursor.execute('''
                CREATE OR REPLACE FUNCTION update_updated_at_column()
                RETURNS TRIGGER AS $$
                BEGIN
                    NEW.updated_at = CURRENT_TIMESTAMP;
                    RETURN NEW;
                END;
                $$ language 'plpgsql';
            ''')
            
            # Create triggers for tables with updated_at
            tables_with_updated_at = ['users', 'websites', 'user_subscriptions', 'payment_transactions']
            for table in tables_with_updated_at:
                # Check if trigger exists before creating
                cursor.execute(f'''
                    SELECT COUNT(*) FROM pg_trigger 
                    WHERE tgname = 'update_{table}_updated_at'
                ''')
                if cursor.fetchone()[0] == 0:
                    cursor.execute(f'''
                        CREATE TRIGGER update_{table}_updated_at
                            BEFORE UPDATE ON {table}
                            FOR EACH ROW
                            EXECUTE FUNCTION update_updated_at_column();
                    ''')
            
            conn.commit()
            print("✅ Database tables created successfully")
            
            # Insert default subscription plans
            self.insert_default_plans_with_connection(conn)
            
            cursor.close()
            pg_pool.return_connection(conn)
            
            print("✅ Database initialized successfully with PostgreSQL")
            
        except Exception as e:
            if conn:
                conn.rollback()
                pg_pool.return_connection(conn)
            print(f"❌ Database initialization error: {e}")
            # Don't raise the exception to allow the application to continue
            # But mark as not initialized so we can retry later
            self._initialized = False

    def insert_default_plans_with_connection(self, conn):
        """Insert default subscription plans using an existing connection"""
        cursor = None
        try:
            cursor = conn.cursor()
            
            # Check if plans exist
            cursor.execute("SELECT COUNT(*) as count FROM subscription_plans")
            result = cursor.fetchone()
            
            if result and result[0] == 0:
                default_plans = [
                    {
                        'plan_name': 'Standard',
                        'plan_description': 'Perfect for small businesses',
                        'price': 5.00,
                        'currency': 'INR',
                        'duration_days': 30,
                        'max_websites': 3,
                        'max_chat_messages': 5000,
                        'max_uploads': 20,
                        'features': json.dumps([
                            '3 websites',
                            '5000 chat messages/month',
                            '20 file uploads',
                            'Basic support',
                            'Email notifications'
                        ])
                    },
                    {
                        'plan_name': 'Premium',
                        'plan_description': 'For growing businesses',
                        'price': 10.00,
                        'currency': 'INR',
                        'duration_days': 30,
                        'max_websites': 10,
                        'max_chat_messages': 20000,
                        'max_uploads': 50,
                        'features': json.dumps([
                            '10 websites',
                            '20000 chat messages/month',
                            '50 file uploads',
                            'Priority support',
                            'Advanced analytics',
                            'Custom branding',
                            'API access'
                        ])
                    }
                ]
                
                for plan in default_plans:
                    cursor.execute('''
                        INSERT INTO subscription_plans 
                        (plan_name, plan_description, price, currency, duration_days, 
                         max_websites, max_chat_messages, max_uploads, features)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ''', (
                        plan['plan_name'],
                        plan['plan_description'],
                        plan['price'],
                        plan['currency'],
                        plan['duration_days'],
                        plan['max_websites'],
                        plan['max_chat_messages'],
                        plan['max_uploads'],
                        plan['features']
                    ))
                
                conn.commit()
                print("✅ Default subscription plans inserted")
                
        except Exception as e:
            conn.rollback()
            print(f"⚠️ Error inserting default plans: {e}")
        finally:
            if cursor:
                cursor.close()

    def insert_default_plans(self):
        """Insert default subscription plans (wrapper for backward compatibility)"""
        conn = None
        try:
            conn = self.get_connection()
            self.insert_default_plans_with_connection(conn)
        except Exception as e:
            print(f"⚠️ Error in insert_default_plans: {e}")
        finally:
            if conn:
                self.return_connection(conn)

    # =========================
    # WEBSITE MANAGEMENT
    # =========================
    def save_website(self, website_data: Dict[str, Any]) -> Dict[str, Any]:
        """Save website information to database"""
        try:
            query = '''
                INSERT INTO websites 
                (website_id, website_name, website_url, script_tag, admin_email, 
                 data_directory, status, user_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (website_id) 
                DO UPDATE SET
                    website_name = EXCLUDED.website_name,
                    website_url = EXCLUDED.website_url,
                    script_tag = EXCLUDED.script_tag,
                    admin_email = EXCLUDED.admin_email,
                    data_directory = EXCLUDED.data_directory,
                    status = EXCLUDED.status,
                    user_id = EXCLUDED.user_id,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING *
            '''
            
            values = (
                website_data['website_id'],
                website_data.get('website_name', ''),
                website_data.get('website_url', ''),
                website_data.get('script_tag', ''),
                website_data.get('admin_email', ''),
                website_data.get('data_directory', ''),
                website_data.get('status', 'active'),
                website_data.get('user_id', None)
            )
            
            result = self.execute_query(query, values, fetch_one=True, commit=True)
            return result
            
        except Exception as e:
            print(f"❌ Error saving website: {e}")
            raise

    def save_website_with_user(self, website_data: Dict[str, Any], user_id: int) -> Dict[str, Any]:
        """Save website information with user ID"""
        website_data['user_id'] = user_id
        return self.save_website(website_data)

    def get_website(self, website_id: str) -> Optional[Dict[str, Any]]:
        """Get website by ID"""
        try:
            query = "SELECT * FROM websites WHERE website_id = %s"
            result = self.execute_query(query, (website_id,), fetch_one=True)
            return result
        except Exception as e:
            print(f"❌ Error getting website: {e}")
            return None

    def get_all_websites(self) -> list:
        """Get all websites"""
        try:
            query = "SELECT * FROM websites ORDER BY created_at DESC"
            results = self.execute_query(query, fetch_all=True)
            return results or []
        except Exception as e:
            print(f"❌ Error getting websites: {e}")
            return []

    def update_website_script(self, website_id: str, script_tag: str) -> bool:
        """Update website script tag"""
        try:
            query = "UPDATE websites SET script_tag = %s, updated_at = CURRENT_TIMESTAMP WHERE website_id = %s"
            self.execute_query(query, (script_tag, website_id), commit=True)
            return True
        except Exception as e:
            print(f"❌ Error updating website script: {e}")
            return False

    # =========================
    # TRAINING LOGS MANAGEMENT
    # =========================
    def save_training_log(self, website_id: str, log_data: Dict[str, Any]) -> int:
        """Save training log with training time"""
        try:
            query = '''
                INSERT INTO training_logs 
                (website_id, status, message, data_points, embedding_count, training_time)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id
            '''
            
            training_time = float(log_data.get('training_time', 0.0))
            
            values = (
                website_id,
                log_data.get('status', 'started'),
                log_data.get('message', ''),
                log_data.get('data_points', 0),
                log_data.get('embedding_count', 0),
                training_time
            )
            
            result = self.execute_query(query, values, fetch_one=True, commit=True)
            return result['id'] if result else 0
            
        except Exception as e:
            print(f"❌ Error saving training log: {e}")
            raise

    def update_training_time(self, website_id: str, training_time: float) -> bool:
        """Update training time for the latest training log"""
        try:
            query = '''
                UPDATE training_logs 
                SET training_time = %s 
                WHERE id = (
                    SELECT id FROM training_logs 
                    WHERE website_id = %s 
                    ORDER BY created_at DESC 
                    LIMIT 1
                )
            '''
            self.execute_query(query, (training_time, website_id), commit=True)
            return True
        except Exception as e:
            print(f"❌ Error updating training time: {e}")
            return False

    def get_training_logs(self, website_id: str, limit: int = 10) -> list:
        """Get training logs for a website"""
        try:
            query = '''
                SELECT * FROM training_logs 
                WHERE website_id = %s
                ORDER BY created_at DESC
                LIMIT %s
            '''
            results = self.execute_query(query, (website_id, limit), fetch_all=True)
            return results or []
        except Exception as e:
            print(f"❌ Error getting training logs: {e}")
            return []

    # =========================
    # CONTACT FORM MANAGEMENT
    # =========================
    def save_contact_form(self, website_id: str, form_data: Dict[str, Any]) -> int:
        """Save contact form submission"""
        try:
            query = '''
                INSERT INTO contact_forms 
                (website_id, name, email, phone, message, form_data)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id
            '''
            
            values = (
                website_id,
                form_data.get('name', ''),
                form_data.get('email', ''),
                form_data.get('phone', ''),
                form_data.get('message', ''),
                json.dumps(form_data)
            )
            
            result = self.execute_query(query, values, fetch_one=True, commit=True)
            return result['id'] if result else 0
            
        except Exception as e:
            print(f"❌ Error saving contact form: {e}")
            raise

    def get_contact_forms(self, website_id: str, limit: int = 100) -> list:
        """Get contact forms for a website"""
        try:
            query = '''
                SELECT * FROM contact_forms 
                WHERE website_id = %s 
                ORDER BY created_at DESC 
                LIMIT %s
            '''
            results = self.execute_query(query, (website_id, limit), fetch_all=True)
            return results or []
        except Exception as e:
            print(f"❌ Error getting contact forms: {e}")
            return []

    # =========================
    # CHAT HISTORY MANAGEMENT
    # =========================
    def save_chat_message(self, chat_data: Dict[str, Any]) -> int:
        """Save a single chat message"""
        try:
            query = '''
                INSERT INTO chat_history 
                (website_id, conversation_id, session_id, user_name, user_email, 
                 role, message, metadata)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            '''
            
            values = (
                chat_data['website_id'],
                chat_data.get('conversation_id', ''),
                chat_data.get('session_id', ''),
                chat_data.get('user_name', ''),
                chat_data.get('user_email', ''),
                chat_data.get('role', 'user'),
                chat_data.get('message', ''),
                json.dumps(chat_data.get('metadata', {}))
            )
            
            result = self.execute_query(query, values, fetch_one=True, commit=True)
            return result['id'] if result else 0
            
        except Exception as e:
            print(f"❌ Error saving chat message: {e}")
            raise

    def get_chat_history(self, website_id: str, conversation_id: str = None, 
                        limit: int = 50) -> list:
        """Get chat history for a website or conversation"""
        try:
            if conversation_id:
                query = '''
                    SELECT * FROM chat_history 
                    WHERE website_id = %s AND conversation_id = %s
                    ORDER BY created_at ASC
                    LIMIT %s
                '''
                params = (website_id, conversation_id, limit)
            else:
                query = '''
                    SELECT * FROM chat_history 
                    WHERE website_id = %s
                    ORDER BY created_at DESC
                    LIMIT %s
                '''
                params = (website_id, limit)
            
            results = self.execute_query(query, params, fetch_all=True)
            return results or []
            
        except Exception as e:
            print(f"❌ Error getting chat history: {e}")
            return []

    def get_conversations(self, website_id: str, limit: int = 20) -> list:
        """Get all conversations for a website"""
        try:
            query = '''
                SELECT DISTINCT conversation_id, 
                       MAX(created_at) as last_activity,
                       COUNT(*) as message_count,
                       MAX(user_name) as user_name,
                       MAX(user_email) as user_email
                FROM chat_history 
                WHERE website_id = %s
                GROUP BY conversation_id
                ORDER BY last_activity DESC
                LIMIT %s
            '''
            results = self.execute_query(query, (website_id, limit), fetch_all=True)
            return results or []
            
        except Exception as e:
            print(f"❌ Error getting conversations: {e}")
            return []

    def get_full_conversation(self, conversation_id: str) -> list:
        """Get full conversation by conversation ID"""
        try:
            query = '''
                SELECT * FROM chat_history 
                WHERE conversation_id = %s
                ORDER BY created_at ASC
            '''
            results = self.execute_query(query, (conversation_id,), fetch_all=True)
            return results or []
            
        except Exception as e:
            print(f"❌ Error getting conversation: {e}")
            return []

    def get_chat_history_by_session(self, session_id: str, limit: int = 100) -> list:
        """Get chat history by session ID"""
        try:
            query = '''
                SELECT * FROM chat_history 
                WHERE session_id = %s
                ORDER BY created_at ASC
                LIMIT %s
            '''
            results = self.execute_query(query, (session_id, limit), fetch_all=True)
            return results or []
            
        except Exception as e:
            print(f"❌ Error getting chat history by session: {e}")
            return []

    def get_conversation_messages(self, conversation_id: str, limit: int = 100) -> list:
        """Get chat messages by conversation ID"""
        try:
            query = '''
                SELECT * FROM chat_history 
                WHERE conversation_id = %s
                ORDER BY created_at ASC
                LIMIT %s
            '''
            results = self.execute_query(query, (conversation_id, limit), fetch_all=True)
            return results or []
            
        except Exception as e:
            print(f"❌ Error getting conversation messages: {e}")
            return []

    # =========================
    # FILE MANAGEMENT
    # =========================
    def save_file_record(self, website_id: str, file_data: Dict[str, Any]) -> int:
        """Save file upload record"""
        try:
            query = '''
                INSERT INTO website_files 
                (website_id, filename, file_path, file_type, file_size, 
                 upload_type, processed, chunk_count)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            '''
            
            values = (
                website_id,
                file_data.get('filename', ''),
                file_data.get('file_path', ''),
                file_data.get('file_type', ''),
                file_data.get('file_size', 0),
                file_data.get('upload_type', 'user_upload'),
                file_data.get('processed', False),
                file_data.get('chunk_count', 0)
            )
            
            result = self.execute_query(query, values, fetch_one=True, commit=True)
            return result['id'] if result else 0
            
        except Exception as e:
            print(f"❌ Error saving file record: {e}")
            raise

    def get_website_files(self, website_id: str, file_type: str = None) -> list:
        """Get files for a website"""
        try:
            if file_type:
                query = '''
                    SELECT * FROM website_files 
                    WHERE website_id = %s AND file_type = %s
                    ORDER BY created_at DESC
                '''
                params = (website_id, file_type)
            else:
                query = '''
                    SELECT * FROM website_files 
                    WHERE website_id = %s
                    ORDER BY created_at DESC
                '''
                params = (website_id,)
            
            results = self.execute_query(query, params, fetch_all=True)
            return results or []
            
        except Exception as e:
            print(f"❌ Error getting website files: {e}")
            return []

    # =========================
    # USER MANAGEMENT
    # =========================
    def get_user_websites(self, user_id: int) -> list:
        """Get all websites for a specific user"""
        try:
            query = '''
                SELECT w.*, 
                    (SELECT COUNT(*) FROM contact_forms WHERE website_id = w.website_id) as contact_forms_count,
                    (SELECT COUNT(*) FROM chat_history WHERE website_id = w.website_id) as chat_messages_count,
                    (SELECT COUNT(*) FROM website_files WHERE website_id = w.website_id) as files_count
                FROM websites w
                WHERE w.user_id = %s
                ORDER BY w.created_at DESC
            '''
            results = self.execute_query(query, (user_id,), fetch_all=True)
            return results or []
            
        except Exception as e:
            print(f"❌ Error getting user websites: {e}")
            return []

    def get_website_with_owner(self, website_id: str) -> Optional[Dict[str, Any]]:
        """Get website with owner info"""
        try:
            query = '''
                SELECT w.*, u.email as owner_email, u.full_name as owner_name
                FROM websites w
                LEFT JOIN users u ON w.user_id = u.id
                WHERE w.website_id = %s
            '''
            result = self.execute_query(query, (website_id,), fetch_one=True)
            return result
            
        except Exception as e:
            print(f"❌ Error getting website with owner: {e}")
            return None

    # =========================
    # STATISTICS
    # =========================
    def get_website_stats(self, website_id: str) -> Dict[str, Any]:
        """Get website statistics"""
        try:
            stats = {}
            
            # Total contact forms
            result = self.execute_query(
                "SELECT COUNT(*) as count FROM contact_forms WHERE website_id = %s",
                (website_id,), fetch_one=True
            )
            stats['contact_forms'] = result['count'] if result else 0
            
            # Total chat messages
            result = self.execute_query(
                "SELECT COUNT(*) as count FROM chat_history WHERE website_id = %s",
                (website_id,), fetch_one=True
            )
            stats['chat_messages'] = result['count'] if result else 0
            
            # Total conversations
            result = self.execute_query(
                "SELECT COUNT(DISTINCT conversation_id) as count FROM chat_history WHERE website_id = %s",
                (website_id,), fetch_one=True
            )
            stats['conversations'] = result['count'] if result else 0
            
            # Total files
            result = self.execute_query(
                "SELECT COUNT(*) as count FROM website_files WHERE website_id = %s",
                (website_id,), fetch_one=True
            )
            stats['files'] = result['count'] if result else 0
            
            # Latest training time
            result = self.execute_query('''
                SELECT training_time, created_at 
                FROM training_logs 
                WHERE website_id = %s AND status = 'completed'
                ORDER BY created_at DESC 
                LIMIT 1
            ''', (website_id,), fetch_one=True)
            
            if result:
                stats['latest_training_time'] = result['training_time']
                stats['last_trained'] = result['created_at']
            
            return stats
            
        except Exception as e:
            print(f"❌ Error getting website stats: {e}")
            return {}

    def get_user_stats(self, user_id: int) -> Dict[str, Any]:
        """Get statistics for a user"""
        try:
            stats = {}
            
            # Total websites
            result = self.execute_query(
                "SELECT COUNT(*) as count FROM websites WHERE user_id = %s",
                (user_id,), fetch_one=True
            )
            stats['total_websites'] = result['count'] if result else 0
            
            # Active websites
            result = self.execute_query(
                "SELECT COUNT(*) as count FROM websites WHERE user_id = %s AND status = 'active'",
                (user_id,), fetch_one=True
            )
            stats['active_websites'] = result['count'] if result else 0
            
            # Total contact forms
            result = self.execute_query('''
                SELECT COUNT(*) as count FROM contact_forms cf
                JOIN websites w ON cf.website_id = w.website_id
                WHERE w.user_id = %s
            ''', (user_id,), fetch_one=True)
            stats['contact_forms'] = result['count'] if result else 0
            
            # Total chat messages
            result = self.execute_query('''
                SELECT COUNT(*) as count FROM chat_history ch
                JOIN websites w ON ch.website_id = w.website_id
                WHERE w.user_id = %s
            ''', (user_id,), fetch_one=True)
            stats['chat_messages'] = result['count'] if result else 0
            
            # Total conversations
            result = self.execute_query('''
                SELECT COUNT(DISTINCT conversation_id) as count FROM chat_history ch
                JOIN websites w ON ch.website_id = w.website_id
                WHERE w.user_id = %s
            ''', (user_id,), fetch_one=True)
            stats['conversations'] = result['count'] if result else 0
            
            # Total files
            result = self.execute_query('''
                SELECT COUNT(*) as count FROM website_files wf
                JOIN websites w ON wf.website_id = w.website_id
                WHERE w.user_id = %s
            ''', (user_id,), fetch_one=True)
            stats['files'] = result['count'] if result else 0
            
            return stats
            
        except Exception as e:
            print(f"❌ Error getting user stats: {e}")
            return {}

    def get_admin_stats(self) -> Dict[str, Any]:
        """Get admin dashboard statistics"""
        try:
            stats = {}
            
            # Total users
            result = self.execute_query(
                "SELECT COUNT(*) as count FROM users WHERE is_active = TRUE",
                fetch_one=True
            )
            stats['total_users'] = result['count'] if result else 0
            
            # Total admins
            result = self.execute_query(
                "SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND is_active = TRUE",
                fetch_one=True
            )
            stats['total_admins'] = result['count'] if result else 0
            
            # Total websites
            result = self.execute_query(
                "SELECT COUNT(*) as count FROM websites",
                fetch_one=True
            )
            stats['total_websites'] = result['count'] if result else 0
            
            # Active websites
            result = self.execute_query(
                "SELECT COUNT(*) as count FROM websites WHERE status = 'active'",
                fetch_one=True
            )
            stats['active_websites'] = result['count'] if result else 0
            
            # Today's activity
            result = self.execute_query(
                "SELECT COUNT(*) as count FROM websites WHERE DATE(created_at) = CURRENT_DATE",
                fetch_one=True
            )
            stats['websites_today'] = result['count'] if result else 0
            
            result = self.execute_query(
                "SELECT COUNT(*) as count FROM contact_forms WHERE DATE(created_at) = CURRENT_DATE",
                fetch_one=True
            )
            stats['forms_today'] = result['count'] if result else 0
            
            result = self.execute_query(
                "SELECT COUNT(*) as count FROM chat_history WHERE DATE(created_at) = CURRENT_DATE",
                fetch_one=True
            )
            stats['messages_today'] = result['count'] if result else 0
            
            # Recent activity (last 7 days)
            result = self.execute_query('''
                SELECT DATE(created_at) as date, COUNT(*) as count
                FROM websites 
                WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
                GROUP BY DATE(created_at)
                ORDER BY date DESC
            ''', fetch_all=True)
            stats['recent_websites'] = result or []
            
            # Average training time
            result = self.execute_query('''
                SELECT AVG(training_time) as avg_training_time
                FROM training_logs 
                WHERE status = 'completed' AND training_time > 0
            ''', fetch_one=True)
            
            avg_time = result['avg_training_time'] if result else 0
            stats['avg_training_time'] = round(avg_time, 2) if avg_time else 0
            
            return stats
            
        except Exception as e:
            print(f"❌ Error getting admin stats: {e}")
            return {}

    def reconnect(self):
        """Reconnect to database - not needed with connection pool"""
        try:
            if pg_pool.pool:
                pg_pool.close_all()
            pg_pool.init_pool()
            return True
        except Exception as e:
            print(f"❌ Database reconnection error: {e}")
            return False

    def close(self):
        """Close all database connections"""
        pg_pool.close_all()

# Singleton instance - with lazy initialization
db_manager = DatabaseManager()