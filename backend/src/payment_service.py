import os
import json
import hashlib
import hmac
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from dotenv import load_dotenv
from src.database import pg_pool

load_dotenv()

class PaymentService:
    def __init__(self):
        # Razorpay configuration
        self.razorpay_key_id = os.getenv('RAZORPAY_KEY_ID')
        self.razorpay_key_secret = os.getenv('RAZORPAY_KEY_SECRET')

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
    
    def create_payment_order(self, user_id: int, plan_id: int) -> Dict[str, Any]:
        """Create a payment order for subscription"""
        try:
            # Get plan details
            plan = self.execute_query(
                'SELECT * FROM subscription_plans WHERE id = %s',
                (plan_id,), fetch_one=True
            )
            
            if not plan:
                return {"success": False, "error": "Plan not found"}
            
            # Check if user already has an active subscription
            existing_subscription = self.execute_query('''
                SELECT * FROM user_subscriptions 
                WHERE user_id = %s 
                AND payment_status = 'completed'
                AND (end_date IS NULL OR end_date > CURRENT_DATE)
                ORDER BY created_at DESC
                LIMIT 1
            ''', (user_id,), fetch_one=True)
            
            # Generate unique order IDs
            timestamp = int(datetime.now().timestamp())
            our_order_id = f"order_{user_id}_{timestamp}"
            transaction_id = f"txn_{user_id}_{timestamp}"
            
            # Calculate end date
            duration_days = plan.get('duration_days', 30)
            end_date = datetime.now() + timedelta(days=duration_days)
            
            # Create subscription record
            subscription_result = self.execute_query('''
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
            ), fetch_one=True, commit=True)
            
            subscription_id = subscription_result['id']
            
            print(f"📦 Created subscription: ID={subscription_id}, Order ID={our_order_id}")
            
            # Initialize payment data
            payment_data = {}
            razorpay_order_id = None
            
            # Create payment transaction
            self.execute_query('''
                INSERT INTO payment_transactions 
                (user_id, subscription_id, transaction_id, amount, currency, status, gateway_response)
                VALUES (%s, %s, %s, %s, %s, 'pending', %s::jsonb)
            ''', (
                user_id,
                subscription_id,
                transaction_id,
                plan['price'],
                plan.get('currency', 'INR'),
                json.dumps({'our_order_id': our_order_id})
            ), commit=True)
            
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
                    self.execute_query('''
                        UPDATE payment_transactions 
                        SET gateway_response = gateway_response || %s::jsonb
                        WHERE subscription_id = %s
                    ''', (json.dumps({
                        'razorpay_order_id': razorpay_order_id,
                        'razorpay_order': razorpay_order,
                        'our_order_id': our_order_id
                    }), subscription_id), commit=True)
                    
                    # Prepare payment data for frontend
                    payment_data = {
                        'razorpay_order_id': razorpay_order_id,
                        'razorpay_key': self.razorpay_key_id,
                        'amount': razorpay_order['amount'],
                        'currency': razorpay_order['currency'],
                        'our_order_id': our_order_id,
                        'notes': razorpay_order.get('notes', {})
                    }
                    
                    print(f"💰 Created Razorpay order: {razorpay_order_id}")
                    
                except ImportError:
                    print("⚠️ Razorpay not installed. Install with: pip install razorpay")
                except Exception as e:
                    print(f"⚠️ Razorpay order creation error: {e}")
                    payment_data['error'] = str(e)
            else:
                print("⚠️ Razorpay credentials not configured, using test mode")
                payment_data['test_mode'] = True
                payment_data['our_order_id'] = our_order_id
            
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
            
        except Exception as e:
            print(f"❌ Create payment order error: {e}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e)}
    
    def verify_payment(self, payment_data: Dict[str, Any]) -> Dict[str, Any]:
        """Verify payment and update subscription"""
        try:
            # Extract payment details
            razorpay_payment_id = payment_data.get('razorpay_payment_id')
            razorpay_order_id = payment_data.get('razorpay_order_id')
            razorpay_signature = payment_data.get('razorpay_signature')
            our_order_id = payment_data.get('our_order_id')
            
            print(f"🔍 Starting payment verification...")
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
                        print(f"❌ Invalid signature!")
                        return {
                            "success": False, 
                            "error": "Invalid payment signature",
                            "requires_manual_check": True
                        }
                    print("✅ Payment signature verified")
                except Exception as sig_error:
                    print(f"⚠️ Signature verification error: {sig_error}")
            else:
                print("⚠️ Missing data for signature verification, continuing anyway...")
            
            # Try to find the subscription
            subscription = None
            
            # Method 1: Search by our_order_id in user_subscriptions.payment_id
            if our_order_id:
                print(f"🔍 Searching by our_order_id: {our_order_id}")
                subscription = self.execute_query('''
                    SELECT us.*, u.email, u.full_name 
                    FROM user_subscriptions us
                    JOIN users u ON us.user_id = u.id
                    WHERE us.payment_id = %s
                ''', (our_order_id,), fetch_one=True)
            
            # Method 2: Search by razorpay_order_id in gateway_response
            if not subscription and razorpay_order_id:
                print(f"🔍 Searching by razorpay_order_id: {razorpay_order_id}")
                transaction = self.execute_query('''
                    SELECT subscription_id 
                    FROM payment_transactions 
                    WHERE gateway_response->>'razorpay_order_id' = %s
                    OR gateway_response->>'our_order_id' = %s
                ''', (razorpay_order_id, our_order_id or ''), fetch_one=True)
                
                if transaction and transaction.get('subscription_id'):
                    subscription = self.execute_query('''
                        SELECT us.*, u.email, u.full_name 
                        FROM user_subscriptions us
                        JOIN users u ON us.user_id = u.id
                        WHERE us.id = %s
                    ''', (transaction['subscription_id'],), fetch_one=True)
            
            # Method 3: Search for pending subscriptions for the user
            if not subscription and 'user_id' in payment_data:
                print(f"🔍 Searching for pending subscriptions for user: {payment_data['user_id']}")
                subscription = self.execute_query('''
                    SELECT us.*, u.email, u.full_name 
                    FROM user_subscriptions us
                    JOIN users u ON us.user_id = u.id
                    WHERE us.user_id = %s 
                    AND us.payment_status = 'pending'
                    ORDER BY us.created_at DESC
                    LIMIT 1
                ''', (payment_data['user_id'],), fetch_one=True)
            
            if not subscription:
                print("❌ Could not find subscription for payment verification")
                
                # Debug: Show all pending subscriptions
                pending_subs = self.execute_query('''
                    SELECT us.id, us.user_id, us.payment_id, us.payment_status, 
                           us.created_at, u.email, sp.plan_name
                    FROM user_subscriptions us
                    JOIN users u ON us.user_id = u.id
                    LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
                    WHERE us.payment_status = 'pending'
                    ORDER BY us.created_at DESC
                ''', fetch_all=True)
                
                return {
                    "success": False, 
                    "error": "Subscription not found",
                    "debug": {
                        "razorpay_order_id": razorpay_order_id,
                        "our_order_id": our_order_id,
                        "pending_subscriptions": pending_subs,
                        "total_pending": len(pending_subs) if pending_subs else 0
                    }
                }
            
            print(f"✅ Found subscription: ID={subscription['id']}, User={subscription.get('full_name', 'Unknown')}")
            
            # Update subscription status to completed
            self.execute_query('''
                UPDATE user_subscriptions 
                SET payment_status = 'completed',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            ''', (subscription['id'],), commit=True)
            
            # Update payment transaction
            gateway_update = {
                'razorpay_payment_id': razorpay_payment_id,
                'razorpay_order_id': razorpay_order_id,
                'razorpay_signature': razorpay_signature,
                'our_order_id': our_order_id,
                'verification_timestamp': datetime.now().isoformat(),
                'verified': True
            }
            
            self.execute_query('''
                UPDATE payment_transactions 
                SET status = 'completed',
                    gateway_response = gateway_response || %s::jsonb,
                    updated_at = CURRENT_TIMESTAMP
                WHERE subscription_id = %s AND status = 'pending'
            ''', (json.dumps(gateway_update), subscription['id']), commit=True)
            
            # Get updated subscription with plan details
            updated_subscription = self.execute_query('''
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
            ''', (subscription['id'],), fetch_one=True)
            
            # Parse features if needed
            if updated_subscription and updated_subscription.get('features'):
                if isinstance(updated_subscription['features'], str):
                    try:
                        updated_subscription['features'] = json.loads(updated_subscription['features'])
                    except:
                        updated_subscription['features'] = []
            
            print(f"✅ Payment verified and subscription activated!")
            print(f"   Plan: {updated_subscription.get('plan_name', 'Unknown')}")
            print(f"   Price: ₹{updated_subscription.get('price', 0)}")
            print(f"   Days remaining: {updated_subscription.get('days_remaining', 'N/A')}")
            
            return {
                "success": True,
                "message": "Payment verified and subscription activated successfully",
                "subscription": updated_subscription
            }
            
        except Exception as e:
            print(f"❌ Verify payment error: {e}")
            import traceback
            traceback.print_exc()
            return {
                "success": False, 
                "error": f"Payment verification failed: {str(e)}"
            }
    
    def get_user_subscription(self, user_id: int) -> Dict[str, Any]:
        """Get user's active subscription"""
        try:
            subscription = self.execute_query('''
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
            ''', (user_id,), fetch_one=True)
            
            # Parse features if needed
            if subscription and subscription.get('features'):
                if isinstance(subscription['features'], str):
                    try:
                        subscription['features'] = json.loads(subscription['features'])
                    except:
                        subscription['features'] = []
            
            has_subscription = subscription is not None
            
            return {
                "success": True,
                "has_subscription": has_subscription,
                "subscription": subscription
            }
            
        except Exception as e:
            print(f"❌ Get user subscription error: {e}")
            return {
                "success": False, 
                "error": str(e), 
                "has_subscription": False
            }
    
    def get_subscription_plans(self) -> Dict[str, Any]:
        """Get all available subscription plans"""
        try:
            plans = self.execute_query('''
                SELECT * FROM subscription_plans 
                WHERE is_active = TRUE
                ORDER BY price ASC
            ''', fetch_all=True) or []
            
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
                    if isinstance(plan['features'], str):
                        try:
                            plan['features'] = json.loads(plan['features'])
                        except:
                            plan['features'] = []
                else:
                    plan['features'] = []
            
            return {
                "success": True,
                "plans": plans
            }
            
        except Exception as e:
            print(f"❌ Get subscription plans error: {e}")
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
                website_count_result = self.execute_query(
                    'SELECT COUNT(*) as count FROM websites WHERE user_id = %s',
                    (user_id,), fetch_one=True
                )
                website_count = website_count_result['count'] if website_count_result else 0
                
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
            
        except Exception as e:
            print(f"❌ Check user access error: {e}")
            return {
                "success": False,
                "error": str(e),
                "has_access": False
            }
    
    def get_payment_history(self, user_id: int, limit: int = 10) -> Dict[str, Any]:
        """Get user's payment history"""
        try:
            history = self.execute_query('''
                SELECT pt.*, sp.plan_name, us.payment_status
                FROM payment_transactions pt
                LEFT JOIN user_subscriptions us ON pt.subscription_id = us.id
                LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
                WHERE pt.user_id = %s
                ORDER BY pt.created_at DESC
                LIMIT %s
            ''', (user_id, limit), fetch_all=True) or []
            
            return {
                "success": True,
                "history": history,
                "count": len(history)
            }
            
        except Exception as e:
            print(f"❌ Get payment history error: {e}")
            return {
                "success": False,
                "error": str(e),
                "history": []
            }
    
    def cancel_subscription(self, user_id: int, subscription_id: int) -> Dict[str, Any]:
        """Cancel user subscription"""
        try:
            # Check if subscription belongs to user
            subscription = self.execute_query('''
                SELECT * FROM user_subscriptions 
                WHERE id = %s AND user_id = %s
            ''', (subscription_id, user_id), fetch_one=True)
            
            if not subscription:
                return {
                    "success": False,
                    "error": "Subscription not found or doesn't belong to user"
                }
            
            # Update subscription status
            self.execute_query('''
                UPDATE user_subscriptions 
                SET subscription_status = 'cancelled',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            ''', (subscription_id,), commit=True)
            
            return {
                "success": True,
                "message": "Subscription cancelled successfully"
            }
            
        except Exception as e:
            print(f"❌ Cancel subscription error: {e}")
            return {
                "success": False,
                "error": str(e)
            }

# Import RealDictCursor for use in execute_query
from psycopg2.extras import RealDictCursor

# Singleton instance
payment_service = PaymentService()