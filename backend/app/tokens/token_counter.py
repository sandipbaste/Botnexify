import os
import json
import time
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
import psycopg2
from psycopg2 import Error
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
import threading
from urllib.parse import urlparse

load_dotenv()

class TokenCounter:
    """Track token usage for websites and users"""
    
    def __init__(self):
        # Supabase PostgreSQL connection
        self.database_url = os.getenv('DATABASE_URL')
        
        # Token estimation rates
        self.INPUT_TOKEN_RATE = 0.00000125
        self.OUTPUT_TOKEN_RATE = 0.00000500
        self.EMBEDDING_TOKEN_RATE = 0.00000013
        
        # Initialize tables
        self._init_token_tables()
        
        # Start background cleanup thread
        self._start_cleanup_thread()
    
    def get_connection(self):
        """Get database connection from Supabase URL"""
        try:
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
            print(f"  TokenCounter DB connection error: {e}")
            raise
    
    def _table_exists(self, cursor, table_name):
        """Check if a table exists"""
        cursor.execute("""
            SELECT COUNT(*)
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = %s
        """, (table_name,))
        return cursor.fetchone()[0] > 0
    
    def _column_exists(self, cursor, table_name, column_name):
        """Check if a column exists in a table"""
        cursor.execute("""
            SELECT COUNT(*)
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = %s AND column_name = %s
        """, (table_name, column_name))
        return cursor.fetchone()[0] > 0
    
    def _create_updated_at_trigger(self, cursor, table_name):
        """Create trigger for updated_at column"""
        try:
            # Create the function if it doesn't exist
            cursor.execute("""
                CREATE OR REPLACE FUNCTION update_updated_at_column()
                RETURNS TRIGGER AS $$
                BEGIN
                    NEW.updated_at = CURRENT_TIMESTAMP;
                    RETURN NEW;
                END;
                $$ language 'plpgsql';
            """)
            
            # Create trigger for the specific table
            trigger_name = f"update_{table_name}_updated_at"
            cursor.execute(f"""
                DROP TRIGGER IF EXISTS {trigger_name} ON {table_name};
                CREATE TRIGGER {trigger_name}
                    BEFORE UPDATE ON {table_name}
                    FOR EACH ROW
                    EXECUTE FUNCTION update_updated_at_column();
            """)
        except Exception as e:
            print(f"  Error creating trigger for {table_name}: {e}")
    
    def _init_token_tables(self):
        """Initialize token tracking tables"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            print(" Initializing PostgreSQL token tracking tables...")
            
            # Token usage table - per website
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS token_usage (
                    id SERIAL PRIMARY KEY,
                    website_id VARCHAR(100) NOT NULL,
                    user_id INTEGER,
                    token_type VARCHAR(20) NOT NULL CHECK (token_type IN ('input', 'output', 'embedding')),
                    tokens INTEGER NOT NULL DEFAULT 0,
                    cost DECIMAL(10,8) DEFAULT 0,
                    model VARCHAR(100) DEFAULT 'gemini-2.5-flash',
                    operation_type VARCHAR(50) DEFAULT 'chat',
                    metadata JSONB,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Token aggregates table - daily summary per website
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS token_aggregates_daily (
                    id SERIAL PRIMARY KEY,
                    website_id VARCHAR(100) NOT NULL,
                    user_id INTEGER,
                    date DATE NOT NULL,
                    input_tokens INTEGER DEFAULT 0,
                    output_tokens INTEGER DEFAULT 0,
                    embedding_tokens INTEGER DEFAULT 0,
                    total_tokens INTEGER DEFAULT 0,
                    input_cost DECIMAL(10,8) DEFAULT 0,
                    output_cost DECIMAL(10,8) DEFAULT 0,
                    embedding_cost DECIMAL(10,8) DEFAULT 0,
                    total_cost DECIMAL(10,8) DEFAULT 0,
                    chat_count INTEGER DEFAULT 0,
                    training_count INTEGER DEFAULT 0,
                    search_count INTEGER DEFAULT 0,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(website_id, date)
                )
            ''')
            
            # Token aggregates table - monthly summary per website
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS token_aggregates_monthly (
                    id SERIAL PRIMARY KEY,
                    website_id VARCHAR(100) NOT NULL,
                    user_id INTEGER,
                    year_month VARCHAR(7) NOT NULL,
                    input_tokens INTEGER DEFAULT 0,
                    output_tokens INTEGER DEFAULT 0,
                    embedding_tokens INTEGER DEFAULT 0,
                    total_tokens INTEGER DEFAULT 0,
                    input_cost DECIMAL(10,8) DEFAULT 0,
                    output_cost DECIMAL(10,8) DEFAULT 0,
                    embedding_cost DECIMAL(10,8) DEFAULT 0,
                    total_cost DECIMAL(10,8) DEFAULT 0,
                    chat_count INTEGER DEFAULT 0,
                    training_count INTEGER DEFAULT 0,
                    search_count INTEGER DEFAULT 0,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(website_id, year_month)
                )
            ''')
            
            # Token aggregates table - total per user
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS token_aggregates_user (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL UNIQUE,
                    input_tokens INTEGER DEFAULT 0,
                    output_tokens INTEGER DEFAULT 0,
                    embedding_tokens INTEGER DEFAULT 0,
                    total_tokens INTEGER DEFAULT 0,
                    input_cost DECIMAL(10,8) DEFAULT 0,
                    output_cost DECIMAL(10,8) DEFAULT 0,
                    embedding_cost DECIMAL(10,8) DEFAULT 0,
                    total_cost DECIMAL(10,8) DEFAULT 0,
                    website_count INTEGER DEFAULT 0,
                    chat_count INTEGER DEFAULT 0,
                    training_count INTEGER DEFAULT 0,
                    search_count INTEGER DEFAULT 0,
                    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Token usage archive table - for historical data
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS token_usage_archive (
                    id SERIAL PRIMARY KEY,
                    website_id VARCHAR(100) NOT NULL,
                    user_id INTEGER,
                    token_type VARCHAR(20) NOT NULL CHECK (token_type IN ('input', 'output', 'embedding')),
                    tokens INTEGER NOT NULL DEFAULT 0,
                    cost DECIMAL(10,8),
                    model VARCHAR(100),
                    operation_type VARCHAR(50),
                    metadata JSONB,
                    created_at TIMESTAMP WITH TIME ZONE,
                    archived_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Create indexes for performance
            print(" Creating indexes...")
            
            # token_usage indexes
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_token_usage_website ON token_usage(website_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_token_usage_user ON token_usage(user_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_token_usage_type ON token_usage(token_type)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_token_usage_created ON token_usage(created_at)')
            
            # token_aggregates_daily indexes
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_agg_daily_website_date ON token_aggregates_daily(website_id, date)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_agg_daily_user_date ON token_aggregates_daily(user_id, date)')
            
            # token_aggregates_monthly indexes
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_agg_monthly_website_month ON token_aggregates_monthly(website_id, year_month)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_agg_monthly_user_id ON token_aggregates_monthly(user_id)')
            
            # token_aggregates_user indexes
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_agg_user_user_id ON token_aggregates_user(user_id)')
            
            # token_usage_archive indexes
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_archive_website_archived ON token_usage_archive(website_id, archived_at)')
            
            # Create triggers for updated_at columns
            print(" Creating triggers...")
            self._create_updated_at_trigger(cursor, 'token_aggregates_daily')
            self._create_updated_at_trigger(cursor, 'token_aggregates_monthly')
            
            # Create foreign key constraints (if not exists)
            try:
                cursor.execute("""
                    DO $$ 
                    BEGIN
                        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                                       WHERE constraint_name = 'fk_token_usage_user' 
                                       AND table_name = 'token_usage') THEN
                            ALTER TABLE token_usage 
                            ADD CONSTRAINT fk_token_usage_user 
                            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
                        END IF;
                    END $$;
                """)
                
                cursor.execute("""
                    DO $$ 
                    BEGIN
                        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                                       WHERE constraint_name = 'fk_agg_daily_user' 
                                       AND table_name = 'token_aggregates_daily') THEN
                            ALTER TABLE token_aggregates_daily 
                            ADD CONSTRAINT fk_agg_daily_user 
                            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
                        END IF;
                    END $$;
                """)
                
                cursor.execute("""
                    DO $$ 
                    BEGIN
                        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                                       WHERE constraint_name = 'fk_agg_monthly_user' 
                                       AND table_name = 'token_aggregates_monthly') THEN
                            ALTER TABLE token_aggregates_monthly 
                            ADD CONSTRAINT fk_agg_monthly_user 
                            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
                        END IF;
                    END $$;
                """)
                
                cursor.execute("""
                    DO $$ 
                    BEGIN
                        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                                       WHERE constraint_name = 'fk_agg_user_user' 
                                       AND table_name = 'token_aggregates_user') THEN
                            ALTER TABLE token_aggregates_user 
                            ADD CONSTRAINT fk_agg_user_user 
                            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
                        END IF;
                    END $$;
                """)
                
            except Exception as e:
                print(f"  Note: Foreign key constraints may already exist or tables not ready: {e}")
            
            conn.commit()
            cursor.close()
            conn.close()
            
            print(" PostgreSQL token tracking tables initialized successfully")
            
        except Error as e:
            print(f"  Token table initialization error: {e}")
            import traceback
            traceback.print_exc()
    
    def _start_cleanup_thread(self):
        """Start background thread for cleaning old token data"""
        def cleanup_old_tokens():
            while True:
                try:
                    time.sleep(86400)  # Run once per day
                    self.archive_old_tokens(days=90)  # Archive tokens older than 90 days
                except Exception as e:
                    print(f"  Token cleanup error: {e}")
        
        thread = threading.Thread(target=cleanup_old_tokens, daemon=True)
        thread.start()
    
    def count_tokens(self, text: str) -> int:
        """
        Estimate token count for a text
        Rough approximation: 1 token ≈ 4 characters for English text
        """
        if not text:
            return 0
        return len(text) // 4
    
    def track_chat_tokens(
        self,
        website_id: str,
        user_id: Optional[int],
        input_text: str,
        output_text: str,
        model: str = "gemini-2.5-flash",
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Track tokens used in a chat interaction"""
        try:
            input_tokens = self.count_tokens(input_text)
            output_tokens = self.count_tokens(output_text)
            
            input_cost = input_tokens * self.INPUT_TOKEN_RATE
            output_cost = output_tokens * self.OUTPUT_TOKEN_RATE
            
            print(f" Chat token calculation:")
            print(f"   Input tokens: {input_tokens} (cost: ${input_cost:.8f})")
            print(f"   Output tokens: {output_tokens} (cost: ${output_cost:.8f})")
            
            token_data = {
                'input_tokens': input_tokens,
                'output_tokens': output_tokens,
                'input_cost': input_cost,
                'output_cost': output_cost,
                'total_tokens': input_tokens + output_tokens,
                'total_cost': input_cost + output_cost
            }
            
            # Save input tokens
            self._save_token_usage(
                website_id=website_id,
                user_id=user_id,
                token_type='input',
                tokens=input_tokens,
                cost=input_cost,
                model=model,
                operation_type='chat',
                metadata={**(metadata or {}), 'text_preview': input_text[:100]}
            )
            
            # Save output tokens
            self._save_token_usage(
                website_id=website_id,
                user_id=user_id,
                token_type='output',
                tokens=output_tokens,
                cost=output_cost,
                model=model,
                operation_type='chat',
                metadata={**(metadata or {}), 'text_preview': output_text[:100]}
            )
            
            # Update aggregates
            self._update_aggregates(
                website_id=website_id,
                user_id=user_id,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                embedding_tokens=0,
                chat_count=1
            )
            
            return token_data
            
        except Exception as e:
            print(f"  Track chat tokens error: {e}")
            import traceback
            traceback.print_exc()
            return {
                'input_tokens': 0,
                'output_tokens': 0,
                'total_tokens': 0,
                'error': str(e)
            }
    
    def track_embedding_tokens(
        self,
        website_id: str,
        user_id: Optional[int],
        texts: List[str],
        model: str = "sentence-transformers/all-MiniLM-L6-v2",
        operation_type: str = "embedding",
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Track tokens used in embedding generation"""
        try:
            total_tokens = sum(self.count_tokens(text) for text in texts)
            cost = total_tokens * self.EMBEDDING_TOKEN_RATE
            
            print(f"   Saving {total_tokens} embedding tokens for website {website_id}")
            
            self._save_token_usage(
                website_id=website_id,
                user_id=user_id,
                token_type='embedding',
                tokens=total_tokens,
                cost=cost,
                model=model,
                operation_type=operation_type,
                metadata={**(metadata or {}), 'text_count': len(texts)}
            )
            
            # Update aggregates
            update_kwargs = {
                'website_id': website_id,
                'user_id': user_id,
                'input_tokens': 0,
                'output_tokens': 0,
                'embedding_tokens': total_tokens
            }
            
            if operation_type == 'training':
                update_kwargs['training_count'] = 1
            elif operation_type == 'search':
                update_kwargs['search_count'] = 1
            
            self._update_aggregates(**update_kwargs)
            
            return {
                'embedding_tokens': total_tokens,
                'embedding_cost': cost,
                'texts_processed': len(texts)
            }
            
        except Exception as e:
            print(f"  Track embedding tokens error: {e}")
            import traceback
            traceback.print_exc()
            return {
                'embedding_tokens': 0,
                'error': str(e)
            }
    
    def track_training_tokens(
        self,
        website_id: str,
        user_id: Optional[int],
        website_data: List[Dict[str, Any]],
        model: str = "sentence-transformers/all-MiniLM-L6-v2"
    ) -> Dict[str, Any]:
        """Track tokens used in website training"""
        try:
            # Extract all text content
            texts = []
            for item in website_data:
                if isinstance(item, dict):
                    for key, value in item.items():
                        if isinstance(value, str) and len(value) > 50:
                            texts.append(value)
                elif isinstance(item, str):
                    texts.append(item)
            
            result = self.track_embedding_tokens(
                website_id=website_id,
                user_id=user_id,
                texts=texts,
                model=model,
                operation_type='training',
                metadata={'data_points': len(website_data)}
            )
            
            return result
            
        except Exception as e:
            print(f"  Track training tokens error: {e}")
            return {'embedding_tokens': 0}
    
    def _save_token_usage(
        self,
        website_id: str,
        user_id: Optional[int],
        token_type: str,
        tokens: int,
        cost: float,
        model: str,
        operation_type: str,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """Save token usage to database"""
        try:
            if tokens == 0:
                return
                
            conn = self.get_connection()
            cursor = conn.cursor()
            
            # PostgreSQL INSERT with all fields
            query = '''
                INSERT INTO token_usage 
                (website_id, user_id, token_type, tokens, cost, model, operation_type, metadata)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            '''
            
            cursor.execute(query, (
                website_id,
                user_id,
                token_type,
                tokens,
                cost,
                model,
                operation_type,
                json.dumps(metadata) if metadata else None
            ))
            
            print(f" Saved token usage: {tokens} {token_type} tokens for website {website_id}")
            
            conn.commit()
            cursor.close()
            conn.close()
            
        except Error as e:
            print(f"  Save token usage error: {e}")
            import traceback
            traceback.print_exc()
    
    def _update_aggregates(
        self,
        website_id: str,
        user_id: Optional[int],
        input_tokens: int,
        output_tokens: int,
        embedding_tokens: int,
        chat_count: int = 0,
        training_count: int = 0,
        search_count: int = 0
    ):
        """Update daily, monthly, and user aggregates"""
        try:
            today = datetime.now().date()
            year_month = today.strftime('%Y-%m')
            
            conn = self.get_connection()
            cursor = conn.cursor()
            
            total_tokens = input_tokens + output_tokens + embedding_tokens
            input_cost = input_tokens * self.INPUT_TOKEN_RATE
            output_cost = output_tokens * self.OUTPUT_TOKEN_RATE
            embedding_cost = embedding_tokens * self.EMBEDDING_TOKEN_RATE
            total_cost = input_cost + output_cost + embedding_cost
            
            print(f"   Updating aggregates for website {website_id}, user {user_id}:")
            print(f"   Input: {input_tokens} tokens (${input_cost:.8f})")
            print(f"   Output: {output_tokens} tokens (${output_cost:.8f})")
            print(f"   Embedding: {embedding_tokens} tokens (${embedding_cost:.8f})")
            
            # Update daily aggregate using PostgreSQL ON CONFLICT
            cursor.execute('''
                INSERT INTO token_aggregates_daily 
                (website_id, user_id, date, input_tokens, output_tokens, embedding_tokens, 
                total_tokens, input_cost, output_cost, embedding_cost, total_cost,
                chat_count, training_count, search_count)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (website_id, date) DO UPDATE SET
                    input_tokens = token_aggregates_daily.input_tokens + EXCLUDED.input_tokens,
                    output_tokens = token_aggregates_daily.output_tokens + EXCLUDED.output_tokens,
                    embedding_tokens = token_aggregates_daily.embedding_tokens + EXCLUDED.embedding_tokens,
                    total_tokens = token_aggregates_daily.total_tokens + EXCLUDED.total_tokens,
                    input_cost = token_aggregates_daily.input_cost + EXCLUDED.input_cost,
                    output_cost = token_aggregates_daily.output_cost + EXCLUDED.output_cost,
                    embedding_cost = token_aggregates_daily.embedding_cost + EXCLUDED.embedding_cost,
                    total_cost = token_aggregates_daily.total_cost + EXCLUDED.total_cost,
                    chat_count = token_aggregates_daily.chat_count + EXCLUDED.chat_count,
                    training_count = token_aggregates_daily.training_count + EXCLUDED.training_count,
                    search_count = token_aggregates_daily.search_count + EXCLUDED.search_count
            ''', (
                website_id,
                user_id,
                today,
                input_tokens,
                output_tokens,
                embedding_tokens,
                total_tokens,
                input_cost,
                output_cost,
                embedding_cost,
                total_cost,
                chat_count,
                training_count,
                search_count
            ))
            
            # Update monthly aggregate
            cursor.execute('''
                INSERT INTO token_aggregates_monthly 
                (website_id, user_id, year_month, input_tokens, output_tokens, embedding_tokens,
                total_tokens, input_cost, output_cost, embedding_cost, total_cost,
                chat_count, training_count, search_count)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (website_id, year_month) DO UPDATE SET
                    input_tokens = token_aggregates_monthly.input_tokens + EXCLUDED.input_tokens,
                    output_tokens = token_aggregates_monthly.output_tokens + EXCLUDED.output_tokens,
                    embedding_tokens = token_aggregates_monthly.embedding_tokens + EXCLUDED.embedding_tokens,
                    total_tokens = token_aggregates_monthly.total_tokens + EXCLUDED.total_tokens,
                    input_cost = token_aggregates_monthly.input_cost + EXCLUDED.input_cost,
                    output_cost = token_aggregates_monthly.output_cost + EXCLUDED.output_cost,
                    embedding_cost = token_aggregates_monthly.embedding_cost + EXCLUDED.embedding_cost,
                    total_cost = token_aggregates_monthly.total_cost + EXCLUDED.total_cost,
                    chat_count = token_aggregates_monthly.chat_count + EXCLUDED.chat_count,
                    training_count = token_aggregates_monthly.training_count + EXCLUDED.training_count,
                    search_count = token_aggregates_monthly.search_count + EXCLUDED.search_count
            ''', (
                website_id,
                user_id,
                year_month,
                input_tokens,
                output_tokens,
                embedding_tokens,
                total_tokens,
                input_cost,
                output_cost,
                embedding_cost,
                total_cost,
                chat_count,
                training_count,
                search_count
            ))
            
            # Update user aggregate if user_id provided
            if user_id:
                # Get current totals for this user from monthly table
                cursor.execute('''
                    SELECT 
                        COALESCE(SUM(input_tokens), 0) as total_input,
                        COALESCE(SUM(output_tokens), 0) as total_output,
                        COALESCE(SUM(embedding_tokens), 0) as total_embedding,
                        COALESCE(SUM(total_tokens), 0) as total_tokens,
                        COALESCE(SUM(input_cost), 0) as total_input_cost,
                        COALESCE(SUM(output_cost), 0) as total_output_cost,
                        COALESCE(SUM(embedding_cost), 0) as total_embedding_cost,
                        COALESCE(SUM(total_cost), 0) as total_cost,
                        COALESCE(SUM(chat_count), 0) as total_chats,
                        COUNT(DISTINCT website_id) as website_count
                    FROM token_aggregates_monthly
                    WHERE user_id = %s
                ''', (user_id,))
                
                totals = cursor.fetchone()
                
                if totals:
                    # Update user aggregates using ON CONFLICT
                    cursor.execute('''
                        INSERT INTO token_aggregates_user 
                        (user_id, input_tokens, output_tokens, embedding_tokens, total_tokens,
                        input_cost, output_cost, embedding_cost, total_cost,
                        chat_count, website_count, last_updated)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                        ON CONFLICT (user_id) DO UPDATE SET
                            input_tokens = EXCLUDED.input_tokens,
                            output_tokens = EXCLUDED.output_tokens,
                            embedding_tokens = EXCLUDED.embedding_tokens,
                            total_tokens = EXCLUDED.total_tokens,
                            input_cost = EXCLUDED.input_cost,
                            output_cost = EXCLUDED.output_cost,
                            embedding_cost = EXCLUDED.embedding_cost,
                            total_cost = EXCLUDED.total_cost,
                            chat_count = EXCLUDED.chat_count,
                            website_count = EXCLUDED.website_count,
                            last_updated = CURRENT_TIMESTAMP
                    ''', (
                        user_id,
                        totals[0],  # input_tokens
                        totals[1],  # output_tokens
                        totals[2],  # embedding_tokens
                        totals[3],  # total_tokens
                        totals[4],  # input_cost
                        totals[5],  # output_cost
                        totals[6],  # embedding_cost
                        totals[7],  # total_cost
                        totals[8],  # chat_count
                        totals[9]   # website_count
                    ))
                    
                    print(f" Updated user aggregates for user {user_id} from monthly totals")
            
            conn.commit()
            cursor.close()
            conn.close()
            
        except Error as e:
            print(f"  Update aggregates error: {e}")
            import traceback
            traceback.print_exc()
    
    def get_user_websites_token_details(self, user_id: int) -> Dict[str, Any]:
        """
        Get all websites for a user with their token details from token_aggregates_monthly
        """
        try:
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Get all websites for this user from token_aggregates_monthly
            cursor.execute('''
                SELECT 
                    tam.website_id,
                    w.website_name,
                    w.website_url,
                    COALESCE(SUM(tam.input_tokens), 0) as total_input_tokens,
                    COALESCE(SUM(tam.output_tokens), 0) as total_output_tokens,
                    COALESCE(SUM(tam.embedding_tokens), 0) as total_embedding_tokens,
                    COALESCE(SUM(tam.total_tokens), 0) as total_tokens,
                    COALESCE(SUM(tam.input_cost), 0) as total_input_cost,
                    COALESCE(SUM(tam.output_cost), 0) as total_output_cost,
                    COALESCE(SUM(tam.embedding_cost), 0) as total_embedding_cost,
                    COALESCE(SUM(tam.total_cost), 0) as total_cost,
                    COALESCE(SUM(tam.chat_count), 0) as total_chats,
                    COUNT(DISTINCT tam.year_month) as months_active
                FROM token_aggregates_monthly tam
                LEFT JOIN websites w ON tam.website_id = w.website_id
                WHERE tam.user_id = %s
                GROUP BY tam.website_id, w.website_name, w.website_url
                ORDER BY total_tokens DESC
            ''', (user_id,))
            
            websites = cursor.fetchall()
            
            # Calculate overall totals
            overall_totals = {
                'total_input_tokens': 0,
                'total_output_tokens': 0,
                'total_embedding_tokens': 0,
                'total_tokens': 0,
                'total_input_cost': 0.0,
                'total_output_cost': 0.0,
                'total_embedding_cost': 0.0,
                'total_cost': 0.0,
                'total_chats': 0,
                'website_count': len(websites)
            }
            
            formatted_websites = []
            for website in websites:
                website_data = {
                    'website_id': website['website_id'],
                    'website_name': website['website_name'] or website['website_id'],
                    'website_url': website['website_url'] or '',
                    'input_tokens': int(website['total_input_tokens'] or 0),
                    'output_tokens': int(website['total_output_tokens'] or 0),
                    'embedding_tokens': int(website['total_embedding_tokens'] or 0),
                    'total_tokens': int(website['total_tokens'] or 0),
                    'input_cost': float(website['total_input_cost'] or 0),
                    'output_cost': float(website['total_output_cost'] or 0),
                    'embedding_cost': float(website['total_embedding_cost'] or 0),
                    'total_cost': float(website['total_cost'] or 0),
                    'chats': int(website['total_chats'] or 0),
                    'months_active': int(website['months_active'] or 0)
                }
                
                # Add to overall totals
                overall_totals['total_input_tokens'] += website_data['input_tokens']
                overall_totals['total_output_tokens'] += website_data['output_tokens']
                overall_totals['total_embedding_tokens'] += website_data['embedding_tokens']
                overall_totals['total_tokens'] += website_data['total_tokens']
                overall_totals['total_input_cost'] += website_data['input_cost']
                overall_totals['total_output_cost'] += website_data['output_cost']
                overall_totals['total_embedding_cost'] += website_data['embedding_cost']
                overall_totals['total_cost'] += website_data['total_cost']
                overall_totals['total_chats'] += website_data['chats']
                
                formatted_websites.append(website_data)
            
            cursor.close()
            conn.close()
            
            return {
                'success': True,
                'user_id': user_id,
                'websites': formatted_websites,
                'overall_totals': overall_totals
            }
            
        except Exception as e:
            print(f"  Get user websites token details error: {e}")
            import traceback
            traceback.print_exc()
            return {
                'success': False,
                'error': str(e)
            }
    
    def get_website_token_usage(
        self,
        website_id: str,
        days: int = 30,
        include_breakdown: bool = True
    ) -> Dict[str, Any]:
        """Get token usage for a specific website"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            since_date = (datetime.now() - timedelta(days=days)).date()
            
            # Get aggregate data
            cursor.execute('''
                SELECT 
                    COALESCE(SUM(input_tokens), 0) as total_input_tokens,
                    COALESCE(SUM(output_tokens), 0) as total_output_tokens,
                    COALESCE(SUM(embedding_tokens), 0) as total_embedding_tokens,
                    COALESCE(SUM(total_tokens), 0) as total_tokens,
                    COALESCE(SUM(input_cost), 0) as total_input_cost,
                    COALESCE(SUM(output_cost), 0) as total_output_cost,
                    COALESCE(SUM(embedding_cost), 0) as total_embedding_cost,
                    COALESCE(SUM(total_cost), 0) as total_cost,
                    COALESCE(SUM(chat_count), 0) as total_chats,
                    COALESCE(SUM(training_count), 0) as total_trainings,
                    COALESCE(SUM(search_count), 0) as total_searches
                FROM token_aggregates_daily
                WHERE website_id = %s AND date >= %s
            ''', (website_id, since_date))
            
            totals = cursor.fetchone() or {}
            
            result = {
                'website_id': website_id,
                'period_days': days,
                'since_date': since_date.isoformat(),
                'totals': {
                    'input_tokens': int(totals.get('total_input_tokens', 0) or 0),
                    'output_tokens': int(totals.get('total_output_tokens', 0) or 0),
                    'embedding_tokens': int(totals.get('total_embedding_tokens', 0) or 0),
                    'total_tokens': int(totals.get('total_tokens', 0) or 0),
                    'input_cost': float(totals.get('total_input_cost', 0) or 0),
                    'output_cost': float(totals.get('total_output_cost', 0) or 0),
                    'embedding_cost': float(totals.get('total_embedding_cost', 0) or 0),
                    'total_cost': float(totals.get('total_cost', 0) or 0),
                    'chats': int(totals.get('total_chats', 0) or 0),
                    'trainings': int(totals.get('total_trainings', 0) or 0),
                    'searches': int(totals.get('total_searches', 0) or 0)
                }
            }
            
            if include_breakdown:
                # Get daily breakdown
                cursor.execute('''
                    SELECT 
                        date,
                        input_tokens,
                        output_tokens,
                        embedding_tokens,
                        total_tokens,
                        total_cost,
                        chat_count,
                        training_count,
                        search_count
                    FROM token_aggregates_daily
                    WHERE website_id = %s AND date >= %s
                    ORDER BY date DESC
                ''', (website_id, since_date))
                
                daily = cursor.fetchall()
                result['daily_breakdown'] = [
                    {
                        'date': row['date'].isoformat(),
                        'input_tokens': row['input_tokens'],
                        'output_tokens': row['output_tokens'],
                        'embedding_tokens': row['embedding_tokens'],
                        'total_tokens': row['total_tokens'],
                        'total_cost': float(row['total_cost']),
                        'chats': row['chat_count'],
                        'trainings': row['training_count'],
                        'searches': row['search_count']
                    }
                    for row in daily
                ]
                
                # Get monthly breakdown
                cursor.execute('''
                    SELECT 
                        year_month,
                        input_tokens,
                        output_tokens,
                        embedding_tokens,
                        total_tokens,
                        total_cost
                    FROM token_aggregates_monthly
                    WHERE website_id = %s
                    ORDER BY year_month DESC
                    LIMIT 12
                ''', (website_id,))
                
                monthly = cursor.fetchall()
                result['monthly_breakdown'] = [
                    {
                        'month': row['year_month'],
                        'input_tokens': row['input_tokens'],
                        'output_tokens': row['output_tokens'],
                        'embedding_tokens': row['embedding_tokens'],
                        'total_tokens': row['total_tokens'],
                        'total_cost': float(row['total_cost'])
                    }
                    for row in monthly
                ]
            
            cursor.close()
            conn.close()
            
            return result
            
        except Exception as e:
            print(f"  Get website token usage error: {e}")
            import traceback
            traceback.print_exc()
            return {'error': str(e)}
    
    def get_user_token_usage(
        self,
        user_id: int,
        days: int = 30,
        include_websites: bool = True
    ) -> Dict[str, Any]:
        """Get token usage for a specific user from token_aggregates_monthly table"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            since_date = (datetime.now() - timedelta(days=days)).date()
            
            # Get monthly aggregates from token_aggregates_monthly
            cursor.execute('''
                SELECT 
                    year_month,
                    COALESCE(SUM(input_tokens), 0) as input_tokens,
                    COALESCE(SUM(output_tokens), 0) as output_tokens,
                    COALESCE(SUM(embedding_tokens), 0) as embedding_tokens,
                    COALESCE(SUM(total_tokens), 0) as total_tokens,
                    COALESCE(SUM(input_cost), 0) as input_cost,
                    COALESCE(SUM(output_cost), 0) as output_cost,
                    COALESCE(SUM(embedding_cost), 0) as embedding_cost,
                    COALESCE(SUM(total_cost), 0) as total_cost,
                    COALESCE(SUM(chat_count), 0) as chat_count
                FROM token_aggregates_monthly
                WHERE user_id = %s
                GROUP BY year_month
                ORDER BY year_month DESC
            ''', (user_id,))
            
            monthly_rows = cursor.fetchall()
            
            # Calculate totals from monthly data
            lifetime = {
                'input_tokens': 0,
                'output_tokens': 0,
                'embedding_tokens': 0,
                'total_tokens': 0,
                'input_cost': 0.0,
                'output_cost': 0.0,
                'embedding_cost': 0.0,
                'total_cost': 0.0,
                'chats': 0,
                'websites': 0
            }
            
            monthly_breakdown = []
            for row in monthly_rows:
                # Add to lifetime totals
                lifetime['input_tokens'] += int(row['input_tokens'] or 0)
                lifetime['output_tokens'] += int(row['output_tokens'] or 0)
                lifetime['embedding_tokens'] += int(row['embedding_tokens'] or 0)
                lifetime['total_tokens'] += int(row['total_tokens'] or 0)
                lifetime['input_cost'] += float(row['input_cost'] or 0)
                lifetime['output_cost'] += float(row['output_cost'] or 0)
                lifetime['embedding_cost'] += float(row['embedding_cost'] or 0)
                lifetime['total_cost'] += float(row['total_cost'] or 0)
                lifetime['chats'] += int(row['chat_count'] or 0)
                
                # Add to monthly breakdown
                monthly_breakdown.append({
                    'month': row['year_month'],
                    'input_tokens': int(row['input_tokens'] or 0),
                    'output_tokens': int(row['output_tokens'] or 0),
                    'embedding_tokens': int(row['embedding_tokens'] or 0),
                    'total_tokens': int(row['total_tokens'] or 0),
                    'input_cost': float(row['input_cost'] or 0),
                    'output_cost': float(row['output_cost'] or 0),
                    'embedding_cost': float(row['embedding_cost'] or 0),
                    'total_cost': float(row['total_cost'] or 0),
                    'chats': int(row['chat_count'] or 0)
                })
            
            # Get website count
            cursor.execute('''
                SELECT COUNT(DISTINCT website_id) as website_count
                FROM token_aggregates_monthly
                WHERE user_id = %s
            ''', (user_id,))
            
            website_count_row = cursor.fetchone()
            lifetime['websites'] = website_count_row['website_count'] if website_count_row else 0
            
            # Get recent usage (last X days) from token_aggregates_daily
            cursor.execute('''
                SELECT 
                    COALESCE(SUM(input_tokens), 0) as recent_input_tokens,
                    COALESCE(SUM(output_tokens), 0) as recent_output_tokens,
                    COALESCE(SUM(embedding_tokens), 0) as recent_embedding_tokens,
                    COALESCE(SUM(total_tokens), 0) as recent_total_tokens,
                    COALESCE(SUM(input_cost), 0) as recent_input_cost,
                    COALESCE(SUM(output_cost), 0) as recent_output_cost,
                    COALESCE(SUM(embedding_cost), 0) as recent_embedding_cost,
                    COALESCE(SUM(total_cost), 0) as recent_total_cost,
                    COALESCE(SUM(chat_count), 0) as recent_chats
                FROM token_aggregates_daily
                WHERE user_id = %s AND date >= %s
            ''', (user_id, since_date))
            
            recent_row = cursor.fetchone() or {}
            
            recent = {
                'period_days': days,
                'input_tokens': int(recent_row.get('recent_input_tokens', 0) or 0),
                'output_tokens': int(recent_row.get('recent_output_tokens', 0) or 0),
                'embedding_tokens': int(recent_row.get('recent_embedding_tokens', 0) or 0),
                'total_tokens': int(recent_row.get('recent_total_tokens', 0) or 0),
                'input_cost': float(recent_row.get('recent_input_cost', 0) or 0),
                'output_cost': float(recent_row.get('recent_output_cost', 0) or 0),
                'embedding_cost': float(recent_row.get('recent_embedding_cost', 0) or 0),
                'total_cost': float(recent_row.get('recent_total_cost', 0) or 0),
                'chats': int(recent_row.get('recent_chats', 0) or 0)
            }
            
            result = {
                'user_id': user_id,
                'lifetime': lifetime,
                'recent': recent,
                'monthly_breakdown': monthly_breakdown
            }
            
            if include_websites:
                # Get websites for this user from token_aggregates_monthly
                cursor.execute('''
                    SELECT DISTINCT website_id
                    FROM token_aggregates_monthly
                    WHERE user_id = %s
                ''', (user_id,))
                
                websites = cursor.fetchall()
                website_usage = []
                
                for website in websites:
                    # Get totals for this website from monthly aggregates
                    cursor.execute('''
                        SELECT 
                            COALESCE(SUM(input_tokens), 0) as input_tokens,
                            COALESCE(SUM(output_tokens), 0) as output_tokens,
                            COALESCE(SUM(embedding_tokens), 0) as embedding_tokens,
                            COALESCE(SUM(total_tokens), 0) as total_tokens,
                            COALESCE(SUM(input_cost), 0) as input_cost,
                            COALESCE(SUM(output_cost), 0) as output_cost,
                            COALESCE(SUM(embedding_cost), 0) as embedding_cost,
                            COALESCE(SUM(total_cost), 0) as total_cost
                        FROM token_aggregates_monthly
                        WHERE website_id = %s AND user_id = %s
                    ''', (website['website_id'], user_id))
                    
                    totals = cursor.fetchone() or {}
                    
                    website_usage.append({
                        'website_id': website['website_id'],
                        'totals': {
                            'input_tokens': int(totals.get('input_tokens', 0) or 0),
                            'output_tokens': int(totals.get('output_tokens', 0) or 0),
                            'embedding_tokens': int(totals.get('embedding_tokens', 0) or 0),
                            'total_tokens': int(totals.get('total_tokens', 0) or 0),
                            'input_cost': float(totals.get('input_cost', 0) or 0),
                            'output_cost': float(totals.get('output_cost', 0) or 0),
                            'embedding_cost': float(totals.get('embedding_cost', 0) or 0),
                            'total_cost': float(totals.get('total_cost', 0) or 0)
                        }
                    })
                
                result['websites'] = website_usage
            
            cursor.close()
            conn.close()
            
            return result
            
        except Exception as e:
            print(f"  Get user token usage error: {e}")
            import traceback
            traceback.print_exc()
            return {'error': str(e)}
    
    def get_all_users_token_usage(self, days: int = 30) -> List[Dict[str, Any]]:
        """Get token usage for all users from token_aggregates_monthly table"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            since_date = (datetime.now() - timedelta(days=days)).date()
            
            # Get all users with their monthly aggregated data
            cursor.execute('''
                SELECT 
                    u.id as user_id,
                    u.email,
                    u.full_name,
                    COALESCE(SUM(tam.input_tokens), 0) as input_tokens,
                    COALESCE(SUM(tam.output_tokens), 0) as output_tokens,
                    COALESCE(SUM(tam.embedding_tokens), 0) as embedding_tokens,
                    COALESCE(SUM(tam.total_tokens), 0) as total_tokens,
                    COALESCE(SUM(tam.input_cost), 0) as input_cost,
                    COALESCE(SUM(tam.output_cost), 0) as output_cost,
                    COALESCE(SUM(tam.embedding_cost), 0) as embedding_cost,
                    COALESCE(SUM(tam.total_cost), 0) as total_cost,
                    COUNT(DISTINCT tam.website_id) as websites,
                    COALESCE(SUM(tam.chat_count), 0) as chats
                FROM users u
                LEFT JOIN token_aggregates_monthly tam ON u.id = tam.user_id
                WHERE u.is_active = TRUE
                GROUP BY u.id, u.email, u.full_name
                ORDER BY total_tokens DESC
            ''')
            
            users_data = cursor.fetchall()
            
            result = []
            for user in users_data:
                # Get recent data from daily aggregates
                cursor.execute('''
                    SELECT 
                        COALESCE(SUM(input_tokens), 0) as recent_input_tokens,
                        COALESCE(SUM(output_tokens), 0) as recent_output_tokens,
                        COALESCE(SUM(embedding_tokens), 0) as recent_embedding_tokens,
                        COALESCE(SUM(total_tokens), 0) as recent_total_tokens,
                        COALESCE(SUM(input_cost), 0) as recent_input_cost,
                        COALESCE(SUM(output_cost), 0) as recent_output_cost,
                        COALESCE(SUM(embedding_cost), 0) as recent_embedding_cost,
                        COALESCE(SUM(total_cost), 0) as recent_total_cost,
                        COALESCE(SUM(chat_count), 0) as recent_chats
                    FROM token_aggregates_daily
                    WHERE user_id = %s AND date >= %s
                ''', (user['user_id'], since_date))
                
                recent = cursor.fetchone() or {}
                
                result.append({
                    'user_id': user['user_id'],
                    'email': user['email'],
                    'full_name': user['full_name'],
                    'lifetime': {
                        'input_tokens': int(user['input_tokens'] or 0),
                        'output_tokens': int(user['output_tokens'] or 0),
                        'embedding_tokens': int(user['embedding_tokens'] or 0),
                        'total_tokens': int(user['total_tokens'] or 0),
                        'input_cost': float(user['input_cost'] or 0),
                        'output_cost': float(user['output_cost'] or 0),
                        'embedding_cost': float(user['embedding_cost'] or 0),
                        'total_cost': float(user['total_cost'] or 0),
                        'websites': int(user['websites'] or 0),
                        'chats': int(user['chats'] or 0)
                    },
                    'recent': {
                        'period_days': days,
                        'input_tokens': int(recent.get('recent_input_tokens', 0) or 0),
                        'output_tokens': int(recent.get('recent_output_tokens', 0) or 0),
                        'embedding_tokens': int(recent.get('recent_embedding_tokens', 0) or 0),
                        'total_tokens': int(recent.get('recent_total_tokens', 0) or 0),
                        'input_cost': float(recent.get('recent_input_cost', 0) or 0),
                        'output_cost': float(recent.get('recent_output_cost', 0) or 0),
                        'embedding_cost': float(recent.get('recent_embedding_cost', 0) or 0),
                        'total_cost': float(recent.get('recent_total_cost', 0) or 0),
                        'chats': int(recent.get('recent_chats', 0) or 0)
                    }
                })
            
            cursor.close()
            conn.close()
            
            return result
            
        except Exception as e:
            print(f"  Get all users token usage error: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    def get_token_summary(self, days: int = 30) -> Dict[str, Any]:
        """Get overall token usage summary from token_aggregates_monthly"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            since_date = (datetime.now() - timedelta(days=days)).date()
            
            # Get totals from monthly aggregates
            cursor.execute('''
                SELECT 
                    COUNT(DISTINCT website_id) as total_websites,
                    COUNT(DISTINCT user_id) as total_users,
                    COALESCE(SUM(input_tokens), 0) as total_input_tokens,
                    COALESCE(SUM(output_tokens), 0) as total_output_tokens,
                    COALESCE(SUM(embedding_tokens), 0) as total_embedding_tokens,
                    COALESCE(SUM(total_tokens), 0) as total_tokens,
                    COALESCE(SUM(input_cost), 0) as total_input_cost,
                    COALESCE(SUM(output_cost), 0) as total_output_cost,
                    COALESCE(SUM(embedding_cost), 0) as total_embedding_cost,
                    COALESCE(SUM(total_cost), 0) as total_cost,
                    COALESCE(SUM(chat_count), 0) as total_chats
                FROM token_aggregates_monthly
            ''')
            
            lifetime_totals = cursor.fetchone() or {}
            
            # Get recent totals from daily aggregates
            cursor.execute('''
                SELECT 
                    COUNT(DISTINCT website_id) as active_websites,
                    COUNT(DISTINCT user_id) as active_users,
                    COALESCE(SUM(input_tokens), 0) as recent_input_tokens,
                    COALESCE(SUM(output_tokens), 0) as recent_output_tokens,
                    COALESCE(SUM(embedding_tokens), 0) as recent_embedding_tokens,
                    COALESCE(SUM(total_tokens), 0) as recent_total_tokens,
                    COALESCE(SUM(input_cost), 0) as recent_input_cost,
                    COALESCE(SUM(output_cost), 0) as recent_output_cost,
                    COALESCE(SUM(embedding_cost), 0) as recent_embedding_cost,
                    COALESCE(SUM(total_cost), 0) as recent_total_cost,
                    COALESCE(SUM(chat_count), 0) as recent_chats
                FROM token_aggregates_daily
                WHERE date >= %s
            ''', (since_date,))
            
            recent = cursor.fetchone() or {}
            
            # Get top users from monthly aggregates
            cursor.execute('''
                SELECT 
                    tam.user_id,
                    u.full_name,
                    u.email,
                    COALESCE(SUM(tam.total_tokens), 0) as total_tokens,
                    COALESCE(SUM(tam.total_cost), 0) as total_cost
                FROM token_aggregates_monthly tam
                JOIN users u ON tam.user_id = u.id
                GROUP BY tam.user_id, u.full_name, u.email
                ORDER BY total_tokens DESC
                LIMIT 10
            ''')
            
            top_users = cursor.fetchall()
            
            # Get usage by type from raw token_usage
            cursor.execute('''
                SELECT 
                    operation_type,
                    COALESCE(SUM(tokens), 0) as total_tokens,
                    COALESCE(SUM(cost), 0) as total_cost
                FROM token_usage
                WHERE created_at >= %s
                GROUP BY operation_type
            ''', (since_date,))
            
            usage_by_type = cursor.fetchall()
            
            cursor.close()
            conn.close()
            
            return {
                'period_days': days,
                'active_websites': int(recent.get('active_websites', 0) or 0),
                'active_users': int(recent.get('active_users', 0) or 0),
                'recent': {
                    'input_tokens': int(recent.get('recent_input_tokens', 0) or 0),
                    'output_tokens': int(recent.get('recent_output_tokens', 0) or 0),
                    'embedding_tokens': int(recent.get('recent_embedding_tokens', 0) or 0),
                    'total_tokens': int(recent.get('recent_total_tokens', 0) or 0),
                    'input_cost': float(recent.get('recent_input_cost', 0) or 0),
                    'output_cost': float(recent.get('recent_output_cost', 0) or 0),
                    'embedding_cost': float(recent.get('recent_embedding_cost', 0) or 0),
                    'total_cost': float(recent.get('recent_total_cost', 0) or 0),
                    'chats': int(recent.get('recent_chats', 0) or 0)
                },
                'lifetime': {
                    'input_tokens': int(lifetime_totals.get('total_input_tokens', 0) or 0),
                    'output_tokens': int(lifetime_totals.get('total_output_tokens', 0) or 0),
                    'embedding_tokens': int(lifetime_totals.get('total_embedding_tokens', 0) or 0),
                    'total_tokens': int(lifetime_totals.get('total_tokens', 0) or 0),
                    'input_cost': float(lifetime_totals.get('total_input_cost', 0) or 0),
                    'output_cost': float(lifetime_totals.get('total_output_cost', 0) or 0),
                    'embedding_cost': float(lifetime_totals.get('total_embedding_cost', 0) or 0),
                    'total_cost': float(lifetime_totals.get('total_cost', 0) or 0)
                },
                'top_users': [
                    {
                        'user_id': u['user_id'],
                        'full_name': u['full_name'],
                        'email': u['email'],
                        'total_tokens': int(u['total_tokens']),
                        'total_cost': float(u['total_cost'])
                    }
                    for u in top_users
                ],
                'usage_by_type': [
                    {
                        'type': u['operation_type'],
                        'tokens': int(u['total_tokens']),
                        'cost': float(u['total_cost'])
                    }
                    for u in usage_by_type
                ]
            }
            
        except Exception as e:
            print(f"  Get token summary error: {e}")
            import traceback
            traceback.print_exc()
            return {'error': str(e)}
    
    def archive_old_tokens(self, days: int = 90):
        """Archive token usage older than specified days"""
        try:
            archive_date = datetime.now() - timedelta(days=days)
            
            conn = self.get_connection()
            cursor = conn.cursor()
            
            # Move old records to archive
            cursor.execute('''
                INSERT INTO token_usage_archive 
                (website_id, user_id, token_type, tokens, cost, model, operation_type, metadata, created_at)
                SELECT website_id, user_id, token_type, tokens, cost, model, operation_type, metadata, created_at
                FROM token_usage
                WHERE created_at < %s
            ''', (archive_date,))
            
            archived_count = cursor.rowcount
            
            # Delete old records
            cursor.execute('''
                DELETE FROM token_usage
                WHERE created_at < %s
            ''', (archive_date,))
            
            conn.commit()
            cursor.close()
            conn.close()
            
            print(f" Archived {archived_count} old token records")
            return archived_count
            
        except Exception as e:
            print(f"  Archive old tokens error: {e}")
            return 0
    
    def recalculate_aggregates(self, website_id: Optional[str] = None):
        """Recalculate aggregates from raw token usage"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            if website_id:
                # Clear existing aggregates for this website
                cursor.execute('DELETE FROM token_aggregates_daily WHERE website_id = %s', (website_id,))
                cursor.execute('DELETE FROM token_aggregates_monthly WHERE website_id = %s', (website_id,))
                where_clause = "WHERE website_id = %s"
                params = (website_id,)
            else:
                # Clear all aggregates
                cursor.execute('DELETE FROM token_aggregates_daily')
                cursor.execute('DELETE FROM token_aggregates_monthly')
                cursor.execute('DELETE FROM token_aggregates_user')
                where_clause = ""
                params = ()
            
            # Get raw usage data
            cursor.execute(f'''
                SELECT 
                    website_id,
                    user_id,
                    DATE(created_at) as usage_date,
                    TO_CHAR(created_at, 'YYYY-MM') as usage_month,
                    token_type,
                    SUM(tokens) as total_tokens,
                    SUM(cost) as total_cost,
                    operation_type,
                    COUNT(*) as record_count
                FROM token_usage
                {where_clause}
                GROUP BY website_id, user_id, DATE(created_at), TO_CHAR(created_at, 'YYYY-MM'), token_type, operation_type
                ORDER BY usage_date
            ''', params if params else ())
            
            records = cursor.fetchall()
            
            # Rebuild aggregates
            for record in records:
                website_id_val = record['website_id']
                user_id_val = record['user_id']
                date_val = record['usage_date']
                month_val = record['usage_month']
                token_type = record['token_type']
                tokens = record['total_tokens']
                cost = record['total_cost']
                operation = record['operation_type']
                
                # Determine counts
                chat_count = 1 if operation == 'chat' else 0
                training_count = 1 if operation == 'training' else 0
                search_count = 1 if operation == 'search' else 0
                
                # Update daily using ON CONFLICT
                cursor.execute('''
                    INSERT INTO token_aggregates_daily 
                    (website_id, user_id, date, input_tokens, output_tokens, embedding_tokens,
                    total_tokens, input_cost, output_cost, embedding_cost, total_cost,
                    chat_count, training_count, search_count)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (website_id, date) DO UPDATE SET
                    input_tokens = token_aggregates_daily.input_tokens + EXCLUDED.input_tokens,
                    output_tokens = token_aggregates_daily.output_tokens + EXCLUDED.output_tokens,
                    embedding_tokens = token_aggregates_daily.embedding_tokens + EXCLUDED.embedding_tokens,
                    total_tokens = token_aggregates_daily.total_tokens + EXCLUDED.total_tokens,
                    input_cost = token_aggregates_daily.input_cost + EXCLUDED.input_cost,
                    output_cost = token_aggregates_daily.output_cost + EXCLUDED.output_cost,
                    embedding_cost = token_aggregates_daily.embedding_cost + EXCLUDED.embedding_cost,
                    total_cost = token_aggregates_daily.total_cost + EXCLUDED.total_cost,
                    chat_count = token_aggregates_daily.chat_count + EXCLUDED.chat_count,
                    training_count = token_aggregates_daily.training_count + EXCLUDED.training_count,
                    search_count = token_aggregates_daily.search_count + EXCLUDED.search_count
                ''', (
                    website_id_val,
                    user_id_val,
                    date_val,
                    tokens if token_type == 'input' else 0,
                    tokens if token_type == 'output' else 0,
                    tokens if token_type == 'embedding' else 0,
                    tokens,
                    cost if token_type == 'input' else 0,
                    cost if token_type == 'output' else 0,
                    cost if token_type == 'embedding' else 0,
                    cost,
                    chat_count,
                    training_count,
                    search_count
                ))
                
                # Update monthly using ON CONFLICT
                cursor.execute('''
                    INSERT INTO token_aggregates_monthly 
                    (website_id, user_id, year_month, input_tokens, output_tokens, embedding_tokens,
                    total_tokens, input_cost, output_cost, embedding_cost, total_cost,
                    chat_count, training_count, search_count)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (website_id, year_month) DO UPDATE SET
                    input_tokens = token_aggregates_monthly.input_tokens + EXCLUDED.input_tokens,
                    output_tokens = token_aggregates_monthly.output_tokens + EXCLUDED.output_tokens,
                    embedding_tokens = token_aggregates_monthly.embedding_tokens + EXCLUDED.embedding_tokens,
                    total_tokens = token_aggregates_monthly.total_tokens + EXCLUDED.total_tokens,
                    input_cost = token_aggregates_monthly.input_cost + EXCLUDED.input_cost,
                    output_cost = token_aggregates_monthly.output_cost + EXCLUDED.output_cost,
                    embedding_cost = token_aggregates_monthly.embedding_cost + EXCLUDED.embedding_cost,
                    total_cost = token_aggregates_monthly.total_cost + EXCLUDED.total_cost,
                    chat_count = token_aggregates_monthly.chat_count + EXCLUDED.chat_count,
                    training_count = token_aggregates_monthly.training_count + EXCLUDED.training_count,
                    search_count = token_aggregates_monthly.search_count + EXCLUDED.search_count
                ''', (
                    website_id_val,
                    user_id_val,
                    month_val,
                    tokens if token_type == 'input' else 0,
                    tokens if token_type == 'output' else 0,
                    tokens if token_type == 'embedding' else 0,
                    tokens,
                    cost if token_type == 'input' else 0,
                    cost if token_type == 'output' else 0,
                    cost if token_type == 'embedding' else 0,
                    cost,
                    chat_count,
                    training_count,
                    search_count
                ))
            
            # Recalculate user aggregates
            cursor.execute('''
                INSERT INTO token_aggregates_user 
                (user_id, input_tokens, output_tokens, embedding_tokens, total_tokens,
                input_cost, output_cost, embedding_cost, total_cost,
                chat_count, training_count, search_count, website_count, last_updated)
                SELECT 
                    user_id,
                    COALESCE(SUM(input_tokens), 0) as input_tokens,
                    COALESCE(SUM(output_tokens), 0) as output_tokens,
                    COALESCE(SUM(embedding_tokens), 0) as embedding_tokens,
                    COALESCE(SUM(total_tokens), 0) as total_tokens,
                    COALESCE(SUM(input_cost), 0) as input_cost,
                    COALESCE(SUM(output_cost), 0) as output_cost,
                    COALESCE(SUM(embedding_cost), 0) as embedding_cost,
                    COALESCE(SUM(total_cost), 0) as total_cost,
                    COALESCE(SUM(chat_count), 0) as chat_count,
                    COALESCE(SUM(training_count), 0) as training_count,
                    COALESCE(SUM(search_count), 0) as search_count,
                    COUNT(DISTINCT website_id) as website_count,
                    CURRENT_TIMESTAMP
                FROM token_aggregates_monthly
                WHERE user_id IS NOT NULL
                GROUP BY user_id
                ON CONFLICT (user_id) DO UPDATE SET
                    input_tokens = EXCLUDED.input_tokens,
                    output_tokens = EXCLUDED.output_tokens,
                    embedding_tokens = EXCLUDED.embedding_tokens,
                    total_tokens = EXCLUDED.total_tokens,
                    input_cost = EXCLUDED.input_cost,
                    output_cost = EXCLUDED.output_cost,
                    embedding_cost = EXCLUDED.embedding_cost,
                    total_cost = EXCLUDED.total_cost,
                    chat_count = EXCLUDED.chat_count,
                    training_count = EXCLUDED.training_count,
                    search_count = EXCLUDED.search_count,
                    website_count = EXCLUDED.website_count,
                    last_updated = CURRENT_TIMESTAMP
            ''')
            
            conn.commit()
            cursor.close()
            conn.close()
            
            print(f" Recalculated aggregates for {'website ' + website_id if website_id else 'all'}")
            return True
            
        except Exception as e:
            print(f"  Recalculate aggregates error: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def fix_user_aggregates(self):
        """Fix existing user aggregates (run once)"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            print(" Fixing existing token_aggregates_user data...")
            
            cursor.execute('''
                SELECT 
                    user_id,
                    COALESCE(SUM(input_tokens), 0) as total_input,
                    COALESCE(SUM(output_tokens), 0) as total_output,
                    COALESCE(SUM(embedding_tokens), 0) as total_embedding,
                    COALESCE(SUM(total_tokens), 0) as total_tokens,
                    COALESCE(SUM(input_cost), 0) as total_input_cost,
                    COALESCE(SUM(output_cost), 0) as total_output_cost,
                    COALESCE(SUM(embedding_cost), 0) as total_embedding_cost,
                    COALESCE(SUM(total_cost), 0) as total_cost,
                    COALESCE(SUM(chat_count), 0) as total_chats,
                    COUNT(DISTINCT website_id) as website_count
                FROM token_aggregates_monthly
                WHERE user_id IS NOT NULL
                GROUP BY user_id
            ''')
            
            users = cursor.fetchall()
            fixed_count = 0
            
            for user in users:
                cursor.execute('''
                    INSERT INTO token_aggregates_user 
                    (user_id, input_tokens, output_tokens, embedding_tokens, total_tokens,
                    input_cost, output_cost, embedding_cost, total_cost,
                    chat_count, website_count, last_updated)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                    ON CONFLICT (user_id) DO UPDATE SET
                        input_tokens = EXCLUDED.input_tokens,
                        output_tokens = EXCLUDED.output_tokens,
                        embedding_tokens = EXCLUDED.embedding_tokens,
                        total_tokens = EXCLUDED.total_tokens,
                        input_cost = EXCLUDED.input_cost,
                        output_cost = EXCLUDED.output_cost,
                        embedding_cost = EXCLUDED.embedding_cost,
                        total_cost = EXCLUDED.total_cost,
                        chat_count = EXCLUDED.chat_count,
                        website_count = EXCLUDED.website_count,
                        last_updated = CURRENT_TIMESTAMP
                ''', (
                    user['user_id'],
                    user['total_input'] or 0,
                    user['total_output'] or 0,
                    user['total_embedding'] or 0,
                    user['total_tokens'] or 0,
                    user['total_input_cost'] or 0,
                    user['total_output_cost'] or 0,
                    user['total_embedding_cost'] or 0,
                    user['total_cost'] or 0,
                    user['total_chats'] or 0,
                    user['website_count'] or 0
                ))
                fixed_count += 1
            
            conn.commit()
            cursor.close()
            conn.close()
            
            print(f" Fixed {fixed_count} users in token_aggregates_user")
            return fixed_count
            
        except Exception as e:
            print(f"  Error fixing user aggregates: {e}")
            return 0

# Singleton instance
token_counter = TokenCounter()

if __name__ == "__main__":
    token_counter = TokenCounter()
    token_counter.fix_user_aggregates()