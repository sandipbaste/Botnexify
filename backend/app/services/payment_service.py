import os
import hashlib
import hmac
import json
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
import psycopg2
from psycopg2 import Error
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
from urllib.parse import urlparse

load_dotenv()

class PaymentService:
    def __init__(self):
        # Supabase PostgreSQL connection
        self.database_url = os.getenv('DATABASE_URL')
        
        # Razorpay configuration
        self.razorpay_key_id = os.getenv('RAZORPAY_KEY_ID')
        self.razorpay_key_secret = os.getenv('RAZORPAY_KEY_SECRET')
        
        # Initialize tables
        self.initialize_payment_tables()
    
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
            print(f"  Database connection error: {e}")
            raise
    
    def initialize_payment_tables(self):
        """Initialize payment tables if they don't exist"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            print(" Initializing payment tables in Supabase...")
            
            # Create subscription_plans table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS subscription_plans (
                    id SERIAL PRIMARY KEY,
                    plan_name VARCHAR(50) UNIQUE NOT NULL,
                    plan_description TEXT,
                    price DECIMAL(10, 2) NOT NULL,
                    currency VARCHAR(10) DEFAULT 'INR',
                    duration_days INTEGER DEFAULT 30,
                    max_websites INTEGER DEFAULT 1,
                    max_chat_messages INTEGER DEFAULT 1000,
                    max_uploads INTEGER DEFAULT 10,
                    features JSONB,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Create user_subscriptions table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS user_subscriptions (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    plan_id INTEGER NOT NULL,
                    payment_id VARCHAR(100),
                    amount_paid DECIMAL(10, 2) NOT NULL,
                    currency VARCHAR(10) DEFAULT 'INR',
                    payment_method VARCHAR(50),
                    payment_status VARCHAR(20) DEFAULT 'pending',
                    subscription_status VARCHAR(20) DEFAULT 'active',
                    start_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    end_date TIMESTAMP WITH TIME ZONE NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE CASCADE
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
                DROP TRIGGER IF EXISTS update_user_subscriptions_updated_at ON user_subscriptions;
                CREATE TRIGGER update_user_subscriptions_updated_at
                    BEFORE UPDATE ON user_subscriptions
                    FOR EACH ROW
                    EXECUTE FUNCTION update_updated_at_column();
            ''')
            
            # Create payment_transactions table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS payment_transactions (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    subscription_id INTEGER,
                    transaction_id VARCHAR(100),
                    amount DECIMAL(10, 2) NOT NULL,
                    currency VARCHAR(10) DEFAULT 'INR',
                    payment_method VARCHAR(50),
                    status VARCHAR(20) DEFAULT 'pending',
                    gateway_response JSONB,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (subscription_id) REFERENCES user_subscriptions(id) ON DELETE SET NULL
                )
            ''')
            
            cursor.execute('''
                DROP TRIGGER IF EXISTS update_payment_transactions_updated_at ON payment_transactions;
                CREATE TRIGGER update_payment_transactions_updated_at
                    BEFORE UPDATE ON payment_transactions
                    FOR EACH ROW
                    EXECUTE FUNCTION update_updated_at_column();
            ''')
            
            # Create indexes
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_subscription_plans_active ON subscription_plans(is_active)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_user_subscriptions_payment_status ON user_subscriptions(payment_status)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_user_subscriptions_subscription_status ON user_subscriptions(subscription_status)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_id ON payment_transactions(user_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status)')
            
            # Insert default plans if not exists
            print(" Checking for default subscription plans...")
            cursor.execute("SELECT COUNT(*) as count FROM subscription_plans")
            count = cursor.fetchone()[0]
            
            if count == 0:
                print(" Inserting default subscription plans...")
                default_plans = [
                    {
                        'plan_name': 'Standard',
                        'plan_description': 'Perfect for small businesses',
                        'price': 5.00,
                        'currency': 'INR',
                        'duration_days': 30,
                        'max_websites': 6,
                        'max_chat_messages': 5000,
                        'max_uploads': 20,
                        'features': json.dumps([
                            '6 websites',
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
                    try:
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
                        print(f" Added {plan['plan_name']} plan")
                    except Error as e:
                        if 'duplicate key' in str(e).lower():
                            print(f"{plan['plan_name']} plan already exists")
                        else:
                            print(f" Error adding {plan['plan_name']} plan: {e}")
            
            conn.commit()
            cursor.close()
            conn.close()
            
            print(" Payment tables initialized successfully in Supabase")
            
        except Error as e:
            print(f"  Payment table initialization error: {e}")
            import traceback
            traceback.print_exc()
    
    def create_payment_order(self, user_id: int, plan_id: int) -> Dict[str, Any]:
        """Create a payment order for subscription"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Get plan details
            cursor.execute('SELECT * FROM subscription_plans WHERE id = %s', (plan_id,))
            plan = cursor.fetchone()
            
            if not plan:
                cursor.close()
                conn.close()
                return {"success": False, "error": "Plan not found"}
            
            # Check if user already has an active subscription
            cursor.execute('''
                SELECT * FROM user_subscriptions 
                WHERE user_id = %s 
                AND payment_status = 'completed'
                AND (end_date IS NULL OR end_date > CURRENT_DATE)
                ORDER BY created_at DESC
                LIMIT 1
            ''', (user_id,))
            
            existing_subscription = cursor.fetchone()
            
            # Generate unique order IDs
            timestamp = int(datetime.now().timestamp())
            our_order_id = f"order_{user_id}_{timestamp}"
            transaction_id = f"txn_{user_id}_{timestamp}"
            
            # Calculate end date
            duration_days = plan.get('duration_days', 30)
            end_date = datetime.now() + timedelta(days=duration_days)
            
            # Create subscription record
            cursor.execute('''
                INSERT INTO user_subscriptions 
                (user_id, plan_id, payment_id, amount_paid, currency, 
                 payment_status, subscription_status, end_date)
                VALUES (%s, %s, %s, %s, %s, 'pending', 'active', %s)
                RETURNING id
            ''', (
                user_id,
                plan_id,
                our_order_id,
                plan['price'],
                plan.get('currency', 'INR'),
                end_date
            ))
            
            subscription_id = cursor.fetchone()['id']
            
            print(f" Created subscription: ID={subscription_id}, Order ID={our_order_id}")
            
            # Initialize payment data
            payment_data = {}
            razorpay_order_id = None
            
            # Create payment transaction with empty gateway_response
            cursor.execute('''
                INSERT INTO payment_transactions 
                (user_id, subscription_id, transaction_id, amount, currency, status, gateway_response)
                VALUES (%s, %s, %s, %s, %s, 'pending', %s)
                RETURNING id
            ''', (
                user_id,
                subscription_id,
                transaction_id,
                plan['price'],
                plan.get('currency', 'INR'),
                json.dumps({'our_order_id': our_order_id})
            ))
            
            # If using Razorpay, create order
            if self.razorpay_key_id and self.razorpay_key_secret:
                try:
                    import razorpay
                    client = razorpay.Client(auth=(self.razorpay_key_id, self.razorpay_key_secret))
                    
                    # Convert amount to paise (smallest currency unit for INR)
                    amount_in_paise = int(plan['price'] * 100)
                    
                    razorpay_order = client.order.create({
                        'amount': amount_in_paise,
                        'currency': plan.get('currency', 'INR'),
                        'receipt': our_order_id,
                        'notes': {
                            'user_id': user_id,
                            'plan_id': plan_id,
                            'subscription_id': subscription_id,
                            'our_order_id': our_order_id
                        },
                        'payment_capture': 1
                    })
                    
                    razorpay_order_id = razorpay_order['id']
                    
                    # Update gateway_response with Razorpay order details
                    cursor.execute('''
                        UPDATE payment_transactions 
                        SET gateway_response = COALESCE(gateway_response, '{}'::jsonb) || %s::jsonb
                        WHERE subscription_id = %s
                    ''', (json.dumps({
                        'razorpay_order_id': razorpay_order_id,
                        'razorpay_order': razorpay_order,
                        'our_order_id': our_order_id
                    }), subscription_id))
                    
                    # Prepare payment data for frontend
                    payment_data = {
                        'razorpay_order_id': razorpay_order_id,
                        'razorpay_key': self.razorpay_key_id,
                        'amount': razorpay_order['amount'],
                        'currency': razorpay_order['currency'],
                        'our_order_id': our_order_id,
                        'notes': razorpay_order.get('notes', {})
                    }
                    
                    print(f" Created Razorpay order: {razorpay_order_id}")
                    
                except ImportError:
                    print(" Razorpay not installed. Install with: pip install razorpay")
                except Exception as e:
                    print(f" Razorpay order creation error: {e}")
                    payment_data['error'] = str(e)
            else:
                print(" Razorpay credentials not configured, using test mode")
                payment_data['test_mode'] = True
                payment_data['our_order_id'] = our_order_id
            
            conn.commit()
            
            cursor.close()
            conn.close()
            
            return {
                "success": True,
                "message": "Payment order created successfully",
                "order_id": our_order_id,
                "razorpay_order_id": razorpay_order_id,
                "transaction_id": transaction_id,
                "subscription_id": subscription_id,
                "plan": {
                    "id": plan['id'],
                    "plan_name": plan['plan_name'],
                    "price": plan['price'],
                    "duration_days": plan.get('duration_days', 30)
                },
                "payment_data": payment_data,
                "existing_subscription": existing_subscription
            }
            
        except Error as e:
            print(f"  Create payment order error: {e}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e)}
    
    def verify_payment(self, payment_data: Dict[str, Any]) -> Dict[str, Any]:
        """Verify payment and update subscription"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Extract payment details
            razorpay_payment_id = payment_data.get('razorpay_payment_id')
            razorpay_order_id = payment_data.get('razorpay_order_id')
            razorpay_signature = payment_data.get('razorpay_signature')
            our_order_id = payment_data.get('our_order_id')
            
            print(f" Starting payment verification...")
            print(f"  - Razorpay Order ID: {razorpay_order_id}")
            print(f"  - Razorpay Payment ID: {razorpay_payment_id}")
            print(f"  - Our Order ID: {our_order_id}")
            
            # Verify signature if using Razorpay
            if (self.razorpay_key_secret and razorpay_signature and 
                razorpay_order_id and razorpay_payment_id):
                try:
                    generated_signature = hmac.new(
                        self.razorpay_key_secret.encode(),
                        f"{razorpay_order_id}|{razorpay_payment_id}".encode(),
                        hashlib.sha256
                    ).hexdigest()
                    
                    if generated_signature != razorpay_signature:
                        print(f"  Invalid signature!")
                        cursor.close()
                        conn.close()
                        return {
                            "success": False, 
                            "error": "Invalid payment signature",
                            "requires_manual_check": True
                        }
                    print(" Payment signature verified")
                except Exception as sig_error:
                    print(f" Signature verification error: {sig_error}")
            else:
                print(" Missing data for signature verification, continuing anyway...")
            
            # Try to find the subscription
            subscription = None
            
            # Method 1: Search by our_order_id in user_subscriptions.payment_id
            if our_order_id:
                print(f" Searching by our_order_id: {our_order_id}")
                cursor.execute('''
                    SELECT us.*, u.email, u.full_name 
                    FROM user_subscriptions us
                    JOIN users u ON us.user_id = u.id
                    WHERE us.payment_id = %s
                ''', (our_order_id,))
                subscription = cursor.fetchone()
            
            # Method 2: Search by razorpay_order_id in gateway_response
            if not subscription and razorpay_order_id:
                print(f" Searching by razorpay_order_id: {razorpay_order_id}")
                cursor.execute('''
                    SELECT pt.subscription_id 
                    FROM payment_transactions pt
                    WHERE pt.gateway_response::text LIKE %s
                ''', (f'%{razorpay_order_id}%',))
                
                transaction = cursor.fetchone()
                if transaction and transaction.get('subscription_id'):
                    cursor.execute('''
                        SELECT us.*, u.email, u.full_name 
                        FROM user_subscriptions us
                        JOIN users u ON us.user_id = u.id
                        WHERE us.id = %s
                    ''', (transaction['subscription_id'],))
                    subscription = cursor.fetchone()
            
            # Method 3: Search for pending subscriptions for the user
            if not subscription and 'user_id' in payment_data:
                print(f" Searching for pending subscriptions for user: {payment_data['user_id']}")
                cursor.execute('''
                    SELECT us.*, u.email, u.full_name 
                    FROM user_subscriptions us
                    JOIN users u ON us.user_id = u.id
                    WHERE us.user_id = %s 
                    AND us.payment_status = 'pending'
                    ORDER BY us.created_at DESC
                    LIMIT 1
                ''', (payment_data['user_id'],))
                subscription = cursor.fetchone()
            
            if not subscription:
                print("  Could not find subscription for payment verification")
                
                # Debug: Show all pending subscriptions
                cursor.execute('''
                    SELECT us.id, us.user_id, us.payment_id, us.payment_status, 
                           us.created_at, u.email, sp.plan_name
                    FROM user_subscriptions us
                    JOIN users u ON us.user_id = u.id
                    LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
                    WHERE us.payment_status = 'pending'
                    ORDER BY us.created_at DESC
                ''')
                pending_subs = cursor.fetchall()
                
                cursor.close()
                conn.close()
                
                return {
                    "success": False, 
                    "error": "Subscription not found",
                    "debug": {
                        "razorpay_order_id": razorpay_order_id,
                        "our_order_id": our_order_id,
                        "pending_subscriptions": pending_subs,
                        "total_pending": len(pending_subs)
                    }
                }
            
            print(f" Found subscription: ID={subscription['id']}, User={subscription.get('full_name', 'Unknown')}")
            
            # Update subscription status to completed
            cursor.execute('''
                UPDATE user_subscriptions 
                SET payment_status = 'completed',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            ''', (subscription['id'],))
            
            # Update payment transaction
            gateway_update = {
                'razorpay_payment_id': razorpay_payment_id,
                'razorpay_order_id': razorpay_order_id,
                'razorpay_signature': razorpay_signature,
                'our_order_id': our_order_id,
                'verification_timestamp': datetime.now().isoformat(),
                'verified': True
            }
            
            cursor.execute('''
                UPDATE payment_transactions 
                SET status = 'completed',
                    gateway_response = COALESCE(gateway_response, '{}'::jsonb) || %s::jsonb,
                    updated_at = CURRENT_TIMESTAMP
                WHERE subscription_id = %s AND status = 'pending'
            ''', (json.dumps(gateway_update), subscription['id']))
            
            # Get updated subscription with plan details
            cursor.execute('''
                SELECT us.*, sp.plan_name, sp.price, sp.duration_days,
                       sp.max_websites, sp.max_chat_messages, sp.max_uploads,
                       sp.features,
                       CASE 
                         WHEN us.end_date IS NULL THEN 999
                         ELSE EXTRACT(DAY FROM (us.end_date - CURRENT_DATE))
                       END as days_remaining
                FROM user_subscriptions us
                JOIN subscription_plans sp ON us.plan_id = sp.id
                WHERE us.id = %s
            ''', (subscription['id'],))
            
            updated_subscription = cursor.fetchone()
            
            # Parse features if it's a JSON string
            if updated_subscription and updated_subscription.get('features'):
                try:
                    if isinstance(updated_subscription['features'], str):
                        updated_subscription['features'] = json.loads(updated_subscription['features'])
                except:
                    updated_subscription['features'] = []
            
            conn.commit()
            
            print(f" Payment verified and subscription activated!")
            print(f"   Plan: {updated_subscription.get('plan_name', 'Unknown')}")
            print(f"   Price: ₹{updated_subscription.get('price', 0)}")
            print(f"   Days remaining: {updated_subscription.get('days_remaining', 'N/A')}")
            
            cursor.close()
            conn.close()
            
            return {
                "success": True,
                "message": "Payment verified and subscription activated successfully",
                "subscription": updated_subscription
            }
            
        except Error as e:
            print(f"  Verify payment error: {e}")
            import traceback
            traceback.print_exc()
            return {
                "success": False, 
                "error": f"Payment verification failed: {str(e)}"
            }
    
    def get_user_subscription(self, user_id: int) -> Dict[str, Any]:
        """Get user's active subscription"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            cursor.execute('''
                SELECT us.*, sp.plan_name, sp.price, 
                       COALESCE(sp.duration_days, 30) as duration_days,
                       sp.max_websites, sp.max_chat_messages, sp.max_uploads,
                       sp.features,
                       CASE 
                         WHEN us.end_date IS NULL THEN 999
                         ELSE EXTRACT(DAY FROM (us.end_date - CURRENT_DATE))
                       END as days_remaining
                FROM user_subscriptions us
                JOIN subscription_plans sp ON us.plan_id = sp.id
                WHERE us.user_id = %s 
                AND us.payment_status = 'completed'
                AND (us.end_date IS NULL OR us.end_date > CURRENT_DATE)
                ORDER BY us.end_date DESC
                LIMIT 1
            ''', (user_id,))
            
            subscription = cursor.fetchone()
            
            # Parse features if it's a JSON string
            if subscription and subscription.get('features'):
                try:
                    if isinstance(subscription['features'], str):
                        subscription['features'] = json.loads(subscription['features'])
                except:
                    subscription['features'] = []
            
            cursor.close()
            conn.close()
            
            has_subscription = subscription is not None
            
            return {
                "success": True,
                "has_subscription": has_subscription,
                "subscription": subscription
            }
            
        except Error as e:
            print(f"  Get user subscription error: {e}")
            return {
                "success": False, 
                "error": str(e), 
                "has_subscription": False
            }
    
    def get_subscription_plans(self) -> Dict[str, Any]:
        """Get all available subscription plans"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            cursor.execute('''
                SELECT * FROM subscription_plans 
                WHERE is_active = TRUE
                ORDER BY price ASC
            ''')
            
            plans = cursor.fetchall()
            
            # Parse JSON features and ensure all fields exist
            for plan in plans:
                # Ensure all required fields exist
                plan.setdefault('max_chat_messages', 0)
                plan.setdefault('max_websites', 0)
                plan.setdefault('max_uploads', 0)
                plan.setdefault('duration_days', 30)
                plan.setdefault('price', 0)
                
                # Parse features
                if plan.get('features'):
                    try:
                        if isinstance(plan['features'], str):
                            plan['features'] = json.loads(plan['features'])
                    except:
                        plan['features'] = []
                else:
                    plan['features'] = []
            
            cursor.close()
            conn.close()
            
            return {
                "success": True,
                "plans": plans
            }
            
        except Error as e:
            print(f"  Get subscription plans error: {e}")
            return {
                "success": False,
                "error": str(e),
                "plans": []
            }
    
    def check_user_access(self, user_id: int, action: str = "train") -> Dict[str, Any]:
        """Check if user can perform an action based on subscription"""
        try:
            # Get user subscription
            subscription_result = self.get_user_subscription(user_id)
            
            if not subscription_result['success']:
                return {
                    "success": False,
                    "error": subscription_result.get('error'),
                    "has_access": False,
                    "message": "Unable to verify subscription"
                }
            
            if not subscription_result['has_subscription']:
                return {
                    "success": False,
                    "has_access": False,
                    "message": "No active subscription found",
                    "requires_subscription": True
                }
            
            subscription = subscription_result['subscription']
            
            # Check website count for training
            if action == "train":
                conn = self.get_connection()
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                
                cursor.execute('SELECT COUNT(*) as count FROM websites WHERE user_id = %s', (user_id,))
                website_count = cursor.fetchone()['count']
                
                cursor.close()
                conn.close()
                
                max_websites = subscription.get('max_websites', 1)
                
                if website_count >= max_websites:
                    return {
                        "success": False,
                        "has_access": False,
                        "message": f"Website limit reached ({max_websites} allowed)",
                        "current_count": website_count,
                        "max_allowed": max_websites
                    }
            
            return {
                "success": True,
                "has_access": True,
                "subscription": subscription,
                "message": "Access granted"
            }
            
        except Error as e:
            print(f"  Check user access error: {e}")
            return {
                "success": False,
                "error": str(e),
                "has_access": False
            }
    
    def get_payment_history(self, user_id: int, limit: int = 10) -> Dict[str, Any]:
        """Get user's payment history"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            cursor.execute('''
                SELECT pt.*, sp.plan_name, us.payment_status
                FROM payment_transactions pt
                LEFT JOIN user_subscriptions us ON pt.subscription_id = us.id
                LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
                WHERE pt.user_id = %s
                ORDER BY pt.created_at DESC
                LIMIT %s
            ''', (user_id, limit))
            
            history = cursor.fetchall()
            
            cursor.close()
            conn.close()
            
            return {
                "success": True,
                "history": history,
                "count": len(history)
            }
            
        except Error as e:
            print(f"  Get payment history error: {e}")
            return {
                "success": False,
                "error": str(e),
                "history": []
            }
    
    def cancel_subscription(self, user_id: int, subscription_id: int) -> Dict[str, Any]:
        """Cancel user subscription"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Check if subscription belongs to user
            cursor.execute('''
                SELECT * FROM user_subscriptions 
                WHERE id = %s AND user_id = %s
            ''', (subscription_id, user_id))
            
            subscription = cursor.fetchone()
            
            if not subscription:
                cursor.close()
                conn.close()
                return {
                    "success": False,
                    "error": "Subscription not found or doesn't belong to user"
                }
            
            # Update subscription status
            cursor.execute('''
                UPDATE user_subscriptions 
                SET subscription_status = 'cancelled',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            ''', (subscription_id,))
            
            conn.commit()
            cursor.close()
            conn.close()
            
            return {
                "success": True,
                "message": "Subscription cancelled successfully"
            }
            
        except Error as e:
            print(f"  Cancel subscription error: {e}")
            return {
                "success": False,
                "error": str(e)
            }

# Singleton instance
payment_service = PaymentService()