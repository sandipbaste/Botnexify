import React, { useState, useEffect } from 'react';
import { FaCheck, FaRobot, FaBolt, FaCrown, FaCreditCard, FaRocket, FaUserShield } from 'react-icons/fa';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL;

const SubscriptionPlans = ({ user, onSubscriptionPurchased, onBackToDashboard }) => {
  const [plans, setPlans] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [userSubscription, setUserSubscription] = useState(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [successfulSubscription, setSuccessfulSubscription] = useState(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // If user is admin, redirect to admin panel
    if (user?.role === 'admin') {
      toast('Admins don\'t need subscriptions');
      navigate('/admin');
      return;
    }
    
    loadPlans();
    checkUserSubscription();
    
    // Check for payment success in URL
    const searchParams = new URLSearchParams(window.location.search);
    const paymentSuccessParam = searchParams.get('payment_success');
    
    if (paymentSuccessParam === 'true') {
      handlePaymentSuccess();
    }
  }, []);

  const handlePaymentSuccess = () => {
    toast.success('Payment successful! Loading your subscription...');
    setPaymentSuccess(true);
    
    // Clear the URL parameter
    const newUrl = window.location.pathname;
    window.history.replaceState({}, document.title, newUrl);
    
    // Refresh subscription status
    checkUserSubscription();
  };

  const loadPlans = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/payments/plans`);
      const data = await response.json();
      
      if (data.success) {
        // Ensure all plans have required properties
        const formattedPlans = data.plans.map(plan => ({
          ...plan,
          max_chat_messages: plan.max_chat_messages || 0,
          max_websites: plan.max_websites || 0,
          max_uploads: plan.max_uploads || 0,
          price: plan.price || 0,
          duration_days: plan.duration_days || 30,
          features: Array.isArray(plan.features) ? plan.features : 
                   typeof plan.features === 'string' ? JSON.parse(plan.features || '[]') : []
        }));
        setPlans(formattedPlans);
      } else {
        toast.error('Failed to load subscription plans');
        // Set default plans if API fails
        setDefaultPlans();
      }
    } catch (error) {
      console.error('Error loading plans:', error);
      toast.error('Error loading subscription plans');
      // Set default plans on error
      setDefaultPlans();
    } finally {
      setIsLoading(false);
    }
  };

  // Default plans in case API fails
  const setDefaultPlans = () => {
    const defaultPlans = [
      {
        id: 1,
        plan_name: 'Standard',
        plan_description: 'Perfect for small businesses',
        price: 5,
        currency: 'INR',
        duration_days: 30,
        max_websites: 3,
        max_chat_messages: 5000,
        max_uploads: 20,
        features: [
          '3 websites',
          '5000 chat messages/month',
          '20 file uploads',
          'Basic support',
          'Email notifications'
        ]
      },
      {
        id: 2,
        plan_name: 'Premium',
        plan_description: 'For growing businesses',
        price: 10,
        currency: 'INR',
        duration_days: 30,
        max_websites: 10,
        max_chat_messages: 20000,
        max_uploads: 50,
        features: [
          '10 websites',
          '20000 chat messages/month',
          '50 file uploads',
          'Priority support',
          'Advanced analytics',
          'Custom branding',
          'API access'
        ]
      }
    ];
    setPlans(defaultPlans);
  };

  const checkUserSubscription = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        console.error('No access token found');
        return;
      }
      
      const response = await fetch(`${API_URL}/api/payments/user-subscription`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.has_subscription) {
          setUserSubscription(data.subscription);
          setSuccessfulSubscription(data.subscription);
          
          // If payment was just successful, trigger redirect
          if (paymentSuccess) {
            setTimeout(() => {
              redirectToDashboard();
            }, 2000);
          }
        }
      } else {
        console.error('Failed to check subscription:', response.status);
      }
    } catch (error) {
      console.error('Error checking subscription:', error);
    }
  };

  const initiatePayment = async (plan) => {
    setIsProcessing(true);
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        toast.error('Please login first');
        setIsProcessing(false);
        return;
      }
      
      console.log(`💰 Creating order for ${plan.plan_name} plan...`);
      
      const response = await fetch(`${API_URL}/api/payments/create-order`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ plan_id: plan.id })
      });
      
      const data = await response.json();
      
      if (data.success) {
        console.log('✅ Order created successfully:', data);
        
        // Store our order ID for verification
        const ourOrderId = data.order_id;
        localStorage.setItem(`order_${plan.id}`, ourOrderId);
        
        // If using Razorpay
        if (data.payment_data && data.payment_data.razorpay_order_id) {
          console.log('🎯 Opening Razorpay checkout...');
          
          const options = {
            key: data.payment_data.razorpay_key,
            amount: data.payment_data.amount,
            currency: data.payment_data.currency || 'INR',
            name: "Botrion",
            description: `Subscribe to ${plan.plan_name} Plan`,
            order_id: data.payment_data.razorpay_order_id,
            handler: async function (response) {
              console.log('🔄 Razorpay payment completed:', response);
              await verifyPayment(response, plan, ourOrderId);
            },
            prefill: {
              name: user?.full_name || '',
              email: user?.email || '',
              contact: user?.mobile || ''
            },
            theme: {
              color: '#4F46E5'
            },
            modal: {
              ondismiss: function() {
                console.log('Payment modal dismissed');
                setIsProcessing(false);
                toast('Payment cancelled');
              }
            }
          };
          
          const razorpay = new window.Razorpay(options);
          razorpay.on('payment.failed', function(response) {
            console.error('❌ Payment failed:', response.error);
            toast.error(`Payment failed: ${response.error.description}`);
            setIsProcessing(false);
            
            // Clear stored order ID on failure
            localStorage.removeItem(`order_${plan.id}`);
          });
          
          razorpay.open();
        } else {
          // Manual payment flow or test mode
          toast.success(`Order created for ${plan.plan_name} plan`);
          // You can add manual payment flow here
        }
      } else {
        console.error('❌ Failed to create order:', data);
        toast.error(data.error || 'Failed to create payment order');
        setIsProcessing(false);
      }
    } catch (error) {
      console.error('❌ Payment initiation error:', error);
      toast.error('Failed to initiate payment');
      setIsProcessing(false);
    }
  };

  const verifyPayment = async (paymentResponse, plan, ourOrderId) => {
    try {
      const token = localStorage.getItem('access_token');
      
      console.log('🔄 Starting payment verification...');
      console.log('Razorpay Order ID:', paymentResponse.razorpay_order_id);
      console.log('Our Order ID:', ourOrderId);
      
      const response = await fetch(`${API_URL}/api/payments/verify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          razorpay_payment_id: paymentResponse.razorpay_payment_id,
          razorpay_order_id: paymentResponse.razorpay_order_id,
          razorpay_signature: paymentResponse.razorpay_signature,
          our_order_id: ourOrderId,
          plan_id: plan.id,
          user_id: user?.id
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        console.log('✅ Payment verified successfully:', data);
        
        setSuccessfulSubscription(data.subscription);
        setPaymentSuccess(true);
        
        // Show success message
        toast.success(`🎉 Successfully subscribed to ${plan.plan_name} plan!`);
        
        // Clear stored order ID
        localStorage.removeItem(`order_${plan.id}`);
        
        // Store subscription info
        localStorage.setItem('user_subscription', JSON.stringify(data.subscription));
        
        // Update user subscription state
        setUserSubscription(data.subscription);
        
        // Call the subscription purchased callback
        if (onSubscriptionPurchased) {
          onSubscriptionPurchased();
        }
        
        // Auto-redirect after 2 seconds
        setTimeout(() => {
          redirectToDashboard();
        }, 2000);
        
      } else {
        console.error('❌ Payment verification failed:', data);
        toast.error(data.error || 'Payment verification failed');
        
        // Clear stored order ID on failure
        localStorage.removeItem(`order_${plan.id}`);
      }
    } catch (error) {
      console.error('❌ Payment verification error:', error);
      toast.error('Payment verification failed');
      
      // Clear stored order ID on error
      localStorage.removeItem(`order_${plan.id}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const redirectToDashboard = () => {
    setIsRedirecting(true);
    console.log('🚀 Redirecting to dashboard...');
    
    // Use React Router navigation instead of window.location
    navigate('/dashboard');
    
    // Also call the back to dashboard callback if provided
    if (onBackToDashboard) {
      onBackToDashboard();
    }
  };

  const PlanCard = ({ plan, index, isFeatured = false }) => {
    const isCurrentPlan = userSubscription && userSubscription.plan_name === plan.plan_name;
    
    // Ensure all properties exist
    const maxChatMessages = plan.max_chat_messages || 0;
    const maxWebsites = plan.max_websites || 0;
    const maxUploads = plan.max_uploads || 0;
    const price = plan.price || 0;
    const features = Array.isArray(plan.features) ? plan.features : [];
    
    return (
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: index * 0.1 }}
        className={`relative rounded-2xl p-8 ${
          isFeatured 
            ? 'bg-gradient-to-br from-purple-600 to-indigo-700 text-white transform scale-105 shadow-2xl' 
            : 'bg-white border-2 border-gray-200 hover:border-blue-300 shadow-lg'
        } hover:shadow-2xl transition-all duration-300`}
      >
        {isFeatured && (
          <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
            <span className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg">
              MOST POPULAR
            </span>
          </div>
        )}
        
        {isCurrentPlan && (
          <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
            <span className="bg-gradient-to-r from-green-500 to-emerald-600 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg">
              CURRENT PLAN
            </span>
          </div>
        )}
        
        <div className="text-center mb-6">
          <div className={`inline-flex p-4 rounded-2xl mb-4 ${
            isFeatured ? 'bg-white/20' : 'bg-blue-100'
          }`}>
            {plan.plan_name === 'Standard' ? (
              <FaBolt className={`text-3xl ${isFeatured ? 'text-white' : 'text-blue-600'}`} />
            ) : plan.plan_name === 'Premium' ? (
              <FaCrown className={`text-3xl ${isFeatured ? 'text-white' : 'text-yellow-600'}`} />
            ) : (
              <FaRobot className={`text-3xl ${isFeatured ? 'text-white' : 'text-gray-600'}`} />
            )}
          </div>
          
          <h3 className={`text-2xl font-bold mb-2 ${isFeatured ? 'text-white' : 'text-gray-900'}`}>
            {plan.plan_name || 'Plan'}
          </h3>
          
          <div className="mb-4">
            <span className={`text-4xl font-bold ${isFeatured ? 'text-white' : 'text-gray-900'}`}>
              ₹{price}
            </span>
            <span className={`${isFeatured ? 'text-white/80' : 'text-gray-600'} ml-2`}>
              /month
            </span>
          </div>
          
          <p className={`${isFeatured ? 'text-white/90' : 'text-gray-600'} mb-6`}>
            {plan.plan_description || 'Perfect for your business'}
          </p>
        </div>
        
        <div className="space-y-4 mb-8">
          <div className="flex items-center justify-between">
            <span className={isFeatured ? 'text-white/90' : 'text-gray-700'}>
              Websites
            </span>
            <span className={`font-bold ${isFeatured ? 'text-white' : 'text-gray-900'}`}>
              {maxWebsites}
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className={isFeatured ? 'text-white/90' : 'text-gray-700'}>
              Chat Messages
            </span>
            <span className={`font-bold ${isFeatured ? 'text-white' : 'text-gray-900'}`}>
              {maxChatMessages.toLocaleString()}/mo
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className={isFeatured ? 'text-white/90' : 'text-gray-700'}>
              File Uploads
            </span>
            <span className={`font-bold ${isFeatured ? 'text-white' : 'text-gray-900'}`}>
              {maxUploads}
            </span>
          </div>
          
          {/* Features list */}
          {features.length > 0 && (
            <div className="pt-4 border-t border-gray-300">
              <h4 className={`font-semibold mb-3 ${isFeatured ? 'text-white' : 'text-gray-900'}`}>
                Features
              </h4>
              <ul className="space-y-2">
                {features.map((feature, idx) => (
                  <li key={idx} className="flex items-center">
                    <FaCheck className={`mr-3 ${isFeatured ? 'text-green-300' : 'text-green-500'}`} />
                    <span className={isFeatured ? 'text-white/90' : 'text-gray-700'}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        
        {isCurrentPlan ? (
          <button
            disabled
            className={`w-full py-3 rounded-xl font-bold ${
              isFeatured 
                ? 'bg-white text-purple-600 cursor-default' 
                : 'bg-green-100 text-green-800 cursor-default'
            }`}
          >
            Current Plan
          </button>
        ) : (
          <button
            onClick={() => initiatePayment(plan)}
            disabled={isProcessing}
            className={`w-full py-3 rounded-xl font-bold transition-all duration-200 ${
              isFeatured
                ? 'bg-white text-purple-600 hover:bg-gray-100'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700'
            } disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl`}
          >
            {isProcessing ? 'Processing...' : `Subscribe for ₹${price}`}
          </button>
        )}
        
        {isFeatured && (
          <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-sm text-white/80">
            {plan.duration_days || 30} day plan
          </div>
        )}
      </motion.div>
    );
  };

  const PaymentSuccessModal = ({ subscription, onClose }) => (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        <div className="p-8 text-center">
          <div className="w-20 h-20 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Payment Successful! 🎉
          </h2>
          
          <p className="text-gray-600 mb-6">
            You have successfully subscribed to the <span className="font-semibold text-blue-600">{subscription?.plan_name}</span> plan.
          </p>
          
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-700">Plan</span>
              <span className="font-bold text-gray-900">{subscription?.plan_name}</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-700">Amount</span>
              <span className="font-bold text-green-600">₹{subscription?.price}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-700">Validity</span>
              <span className="font-bold text-gray-900">{subscription?.days_remaining || 30} days</span>
            </div>
          </div>
          
          <div className="flex space-x-4">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
            >
              Stay Here
            </button>
            <button
              onClick={redirectToDashboard}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200"
            >
              Go to Dashboard
            </button>
          </div>
          
          <p className="text-sm text-gray-500 mt-4">
            Auto-redirecting in 2 seconds...
          </p>
        </div>
      </motion.div>
    </div>
  );

  // If user is admin, show admin message
  if (user?.role === 'admin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <FaUserShield className="text-white text-3xl" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Welcome Admin!
          </h1>
          <p className="text-gray-600 mb-6">
            As an administrator, you have full access to all features without any subscription.
          </p>
          <button
            onClick={() => navigate('/admin')}
            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-medium rounded-xl hover:from-purple-700 hover:to-indigo-700 transition-all duration-200"
          >
            Go to Admin Panel
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="w-full h-full border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <FaCreditCard className="text-blue-600 text-2xl" />
            </div>
          </div>
          <h3 className="text-xl font-semibold text-gray-800 mb-2">Loading Plans</h3>
          <p className="text-gray-600">Fetching subscription options...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Payment Success Modal */}
        {paymentSuccess && successfulSubscription && (
          <PaymentSuccessModal 
            subscription={successfulSubscription}
            onClose={() => setPaymentSuccess(false)}
          />
        )}
        
        {/* Redirecting Overlay */}
        {isRedirecting && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-8 text-center">
              <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Redirecting to Dashboard</h3>
              <p className="text-gray-600">Please wait while we prepare your workspace...</p>
            </div>
          </div>
        )}
        
        {/* Header */}
        <div className="text-center mb-12">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex p-3 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl mb-4"
          >
            <FaRocket className="text-white text-2xl" />
          </motion.div>
          
          <motion.h1
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-4xl font-bold text-gray-900 mb-4"
          >
            Choose Your Plan
          </motion.h1>
          
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-lg text-gray-600 max-w-2xl mx-auto"
          >
            Select the perfect plan to unlock all features and start creating amazing chatbots
          </motion.p>
          
          {userSubscription && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mt-6 inline-flex items-center px-4 py-2 bg-green-100 text-green-800 rounded-full"
            >
              <FaCheck className="mr-2" />
              <span>
                Current: <strong>{userSubscription.plan_name}</strong> 
                {userSubscription.days_remaining > 0 && (
                  <span> • {userSubscription.days_remaining} days remaining</span>
                )}
              </span>
            </motion.div>
          )}
        </div>
        
        {/* Plans Grid */}
        {plans.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {plans.map((plan, index) => (
              <PlanCard 
                key={plan.id || index} 
                plan={plan} 
                index={index}
                isFeatured={plan.plan_name === 'Premium'}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FaCreditCard className="text-gray-400 text-2xl" />
            </div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">No Plans Available</h3>
            <p className="text-gray-600 mb-6">Subscription plans are currently being set up.</p>
            <button
              onClick={onBackToDashboard}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-xl hover:from-blue-700 hover:to-indigo-700"
            >
              Back to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SubscriptionPlans;