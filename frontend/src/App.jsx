import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Toaster, toast } from 'react-hot-toast';

// Components
import Navbar from './components/Navbar';
import Login from './components/Auth/Login';
import Signup from './components/Auth/Signup';
import ForgotPassword from './components/ForgotPassword';
import UserDashboard from './components/UserDashboard';
import AdminPanel from './components/AdminPanel';
import HomePage from './components/HomePage';
import UserProfile from './components/UserProfile';
import UserSettings from './components/UserSettings';
import SubscriptionPlans from './components/Payment/SubscriptionPlans';

const API_URL = import.meta.env.VITE_API_URL || 'https://botrion.onrender.com';

// Custom hook for navigation
const useQuery = () => {
  return new URLSearchParams(useLocation().search);
};

function App() {
  const [user, setUser] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [backendStatus, setBackendStatus] = useState('checking');
  const [subscriptionStatus, setSubscriptionStatus] = useState({
    hasSubscription: false,
    isLoading: true
  });
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const query = useQuery();

  useEffect(() => {
    // Check for payment success in URL
    const paymentSuccessParam = query.get('payment_success');
    if (paymentSuccessParam === 'true') {
      toast.success('Payment successful! Loading your dashboard...');
      setPaymentSuccess(true);
      
      // Remove the parameter from URL
      const newSearch = new URLSearchParams(location.search);
      newSearch.delete('payment_success');
      navigate(`${location.pathname}?${newSearch.toString()}`, { replace: true });
      
      // Refresh subscription status
      const token = localStorage.getItem('access_token');
      if (token) {
        checkUserSubscription(token);
      }
    }
  }, [location.search]);

  useEffect(() => {
    // Check if user is already logged in
    const storedUser = localStorage.getItem('user');
    const token = localStorage.getItem('access_token');
    
    console.log('App startup - storedUser:', storedUser, 'token:', token ? 'present' : 'missing');
    
    if (storedUser && token) {
      try {
        const userData = JSON.parse(storedUser);
        console.log('Parsed user data:', userData);
        
        // For admin, redirect to admin panel immediately
        if (userData.role === 'admin') {
          setUser(userData);
          setSubscriptionStatus({
            hasSubscription: true, // Admin doesn't need subscription
            isLoading: false,
            subscription: {
              plan_name: 'Admin',
              max_websites: 999,
              max_chat_messages: 999999,
              max_uploads: 999,
              is_admin: true
            }
          });
          setIsLoading(false);
          navigate('/admin');
          return;
        }
        
        // Verify token for regular users
        verifyToken(token);
      } catch (error) {
        console.error('Error parsing stored user:', error);
        // Clear invalid data
        localStorage.removeItem('user');
        localStorage.removeItem('access_token');
        setIsLoading(false);
        setSubscriptionStatus(prev => ({ ...prev, isLoading: false }));
      }
    } else {
      console.log('No stored user or token found');
      setIsLoading(false);
      setSubscriptionStatus(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  const verifyToken = async (token) => {
    try {
      console.log('Verifying token...');
      
      // First test backend connection
      const connectionTest = await fetch(`${API_URL}/health`);
      if (!connectionTest.ok) {
        throw new Error('Backend server is not running');
      }
      
      const response = await fetch(`${API_URL}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Token verification response:', data);
        
        if (data.success) {
          const storedUser = localStorage.getItem('user');
          if (storedUser) {
            try {
              const userData = JSON.parse(storedUser);
              setUser(userData);
              
              // Check subscription status only for regular users
              if (userData.role === 'user') {
                await checkUserSubscription(token);
              } else {
                // Admin doesn't need subscription
                setSubscriptionStatus({
                  hasSubscription: true,
                  isLoading: false,
                  subscription: {
                    plan_name: 'Admin',
                    max_websites: 999,
                    max_chat_messages: 999999,
                    max_uploads: 999,
                    is_admin: true
                  }
                });
              }
            } catch (parseError) {
              console.error('Error parsing stored user:', parseError);
              localStorage.removeItem('user');
              localStorage.removeItem('access_token');
            }
          }
        } else {
          // Token invalid, clear storage
          console.log('Token invalid, clearing storage');
          localStorage.removeItem('access_token');
          localStorage.removeItem('user');
        }
      } else {
        // Token invalid, clear storage
        console.log('Token verification failed, clearing storage');
        localStorage.removeItem('access_token');
        localStorage.removeItem('user');
      }
    } catch (error) {
      console.error('Token verification error:', error);
      
      // Show a user-friendly message
      if (error.message === 'Backend server is not running') {
        toast.error('Backend server is not running. Please start the server on port 8000.');
      }
      
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
    } finally {
      setIsLoading(false);
    }
  };

  const checkUserSubscription = async (token) => {
    try {
      console.log('Checking user subscription...');
      const response = await fetch(`${API_URL}/api/payments/user-subscription`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Subscription check response:', data);
        
        const newStatus = {
          hasSubscription: data.has_subscription || false,
          isLoading: false,
          subscription: data.subscription
        };
        setSubscriptionStatus(newStatus);
        
        // If payment was successful and now has subscription, redirect to dashboard
        if (paymentSuccess && newStatus.hasSubscription) {
          setTimeout(() => {
            navigate('/dashboard');
            setPaymentSuccess(false);
          }, 1500);
        }
        
        return newStatus;
      } else {
        console.log('Subscription check failed');
        const newStatus = {
          hasSubscription: false,
          isLoading: false
        };
        setSubscriptionStatus(newStatus);
        return newStatus;
      }
    } catch (error) {
      console.error('Subscription check error:', error);
      const newStatus = {
        hasSubscription: false,
        isLoading: false
      };
      setSubscriptionStatus(newStatus);
      return newStatus;
    }
  };

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const response = await fetch(`${API_URL}/health`);
        if (response.ok) {
          setBackendStatus('connected');
        } else {
          setBackendStatus('disconnected');
        }
      } catch (error) {
        setBackendStatus('disconnected');
      }
    };

    checkBackend();
    // Check every 10 seconds
    const interval = setInterval(checkBackend, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleLogin = async (userData) => {
    console.log('Login successful, user data:', userData);
    setUser(userData);
    setShowLogin(false);
    
    // Store user data safely
    try {
      localStorage.setItem('user', JSON.stringify(userData));
    } catch (error) {
      console.error('Error storing user data:', error);
    }
    
    // For admin, redirect to admin panel immediately
    if (userData.role === 'admin') {
      toast.success(`Welcome Admin, ${userData.full_name}!`);
      navigate('/admin');
      return;
    }
    
    // For regular users, check subscription
    const token = localStorage.getItem('access_token');
    if (token) {
      const subscriptionResult = await checkUserSubscription(token);
      
      // If user doesn't have subscription, redirect to pricing
      if (!subscriptionResult.hasSubscription) {
        toast.success('Welcome! Please choose a subscription plan to continue.');
        setTimeout(() => {
          navigate('/pricing');
        }, 1000);
      } else {
        // User has subscription, redirect to dashboard
        navigate('/dashboard');
      }
    }
  };

  const handleSignup = async (userData) => {
    console.log('Signup successful, user data:', userData);
    setUser(userData);
    setShowSignup(false);
    
    // Store user data safely
    try {
      localStorage.setItem('user', JSON.stringify(userData));
    } catch (error) {
      console.error('Error storing user data:', error);
    }
    
    // After signup, check if user is admin
    if (userData.role === 'admin') {
      toast.success(`Welcome Admin, ${userData.full_name}!`);
      navigate('/admin');
      return;
    }
    
    // For regular users, always redirect to pricing page
    toast.success('Account created successfully! Please choose a subscription plan.');
    setTimeout(() => {
      navigate('/pricing');
    }, 1500);
  };

  const handleLogout = () => {
    console.log('Logging out...');
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    localStorage.removeItem('user_subscription');
    setUser(null);
    setSubscriptionStatus({
      hasSubscription: false,
      isLoading: false
    });
    navigate('/');
  };

  const handleSubscriptionPurchased = async () => {
    const token = localStorage.getItem('access_token');
    if (token) {
      await checkUserSubscription(token);
    }
  };

  const handleBackToDashboard = () => {
    if (subscriptionStatus.hasSubscription) {
      navigate('/dashboard');
    } else {
      navigate('/');
    }
  };

  if (isLoading || subscriptionStatus.isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="relative mb-12">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="absolute w-20 h-20 rounded-full bg-gradient-to-r from-blue-100 to-indigo-100 animate-float"
                style={{
                  left: `${i * 30}px`,
                  top: `${i * 15}px`,
                  animationDelay: `${i * 0.3}s`
                }}
              ></div>
            ))}
            
            <div className="relative w-24 h-24 mx-auto">
              <svg className="w-full h-full animate-spin" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke="url(#gradient)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray="283"
                  strokeDashoffset="75"
                />
                <defs>
                  <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="100%" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
              </svg>
              
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center shadow-lg">
                  <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd"/>
                  </svg>
                </div>
              </div>
            </div>
          </div>
          
          <h2 className="text-2xl font-semibold text-gray-800 mb-3">Botrion</h2>
          <p className="text-gray-600 mb-8">Loading...</p>
          
          <div className="flex justify-center gap-2 mb-6">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"
                style={{ animationDelay: `${i * 0.1}s` }}
              ></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <Toaster 
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#363636',
            color: '#fff',
          },
          success: {
            style: {
              background: '#10B981',
            },
          },
          error: {
            style: {
              background: '#EF4444',
            },
          },
          loading: {
            style: {
              background: '#3B82F6',
            },
          },
        }}
      />
      
      {/* Navbar - Show always except on auth modals */}
      <Navbar 
        user={user}
        onLogout={handleLogout}
        onLoginClick={() => setShowLogin(true)}
        onSignupClick={() => setShowSignup(true)}
        subscriptionStatus={subscriptionStatus}
        currentPath={location.pathname}
      />
      
      {/* Auth Modals */}
      {showLogin && (
        <Login 
          onLogin={handleLogin}
          onSwitchToSignup={() => {
            setShowLogin(false);
            setShowSignup(true);
          }}
          onForgotPassword={() => {
            setShowLogin(false);
            setShowForgotPassword(true);
          }}
          onClose={() => setShowLogin(false)}
        />
      )}
      
      {showSignup && (
        <Signup 
          onSignup={handleSignup}
          onSwitchToLogin={() => {
            setShowSignup(false);
            setShowLogin(true);
          }}
          onClose={() => setShowSignup(false)}
        />
      )}
      
      {showForgotPassword && (
        <ForgotPassword 
          onBackToLogin={() => {
            setShowForgotPassword(false);
            setShowLogin(true);
          }}
          onClose={() => setShowForgotPassword(false)}
        />
      )}
      
      {/* Routes */}
      <Routes>
        {/* Home Page - Public */}
        <Route 
          path="/" 
          element={
            user ? (
              user.role === 'admin' ? (
                <Navigate to="/admin" />
              ) : subscriptionStatus.hasSubscription ? (
                <Navigate to="/dashboard" />
              ) : (
                <HomePage 
                  onLoginClick={() => setShowLogin(true)}
                  onSignupClick={() => setShowSignup(true)}
                  user={user}
                  subscriptionStatus={subscriptionStatus}
                />
              )
            ) : (
              <HomePage 
                onLoginClick={() => setShowLogin(true)}
                onSignupClick={() => setShowSignup(true)}
              />
            )
          } 
        />
        
        {/* Pricing/Subscription Page - Requires login (users only, not admins) */}
        <Route 
          path="/pricing" 
          element={
            user ? (
              user.role === 'admin' ? (
                <Navigate to="/admin" />
              ) : (
                <SubscriptionPlans 
                  user={user}
                  currentSubscription={subscriptionStatus.subscription}
                  onSubscriptionPurchased={handleSubscriptionPurchased}
                  onBackToDashboard={handleBackToDashboard}
                />
              )
            ) : (
              <Navigate to="/" />
            )
          } 
        />
        
        {/* User Dashboard - Requires subscription (users only) */}
        <Route 
          path="/dashboard" 
          element={
            user ? (
              user.role === 'admin' ? (
                <Navigate to="/admin" />
              ) : subscriptionStatus.hasSubscription ? (
                <UserDashboard 
                  user={user} 
                  onSubscriptionCheck={() => {
                    const token = localStorage.getItem('access_token');
                    if (token) checkUserSubscription(token);
                  }}
                />
              ) : (
                <Navigate to="/pricing" />
              )
            ) : (
              <Navigate to="/" />
            )
          } 
        />
        
        {/* Protected Admin Routes */}
        <Route 
          path="/admin" 
          element={
            user && user.role === 'admin' ? (
              <AdminPanel user={user} />
            ) : (
              <Navigate to="/" />
            )
          } 
        />
        
        {/* Profile Routes - Requires subscription for users, admin can access */}
        <Route 
          path="/profile" 
          element={
            user ? (
              user.role === 'admin' || subscriptionStatus.hasSubscription ? (
                <UserProfile user={user} />
              ) : user.role === 'user' ? (
                <Navigate to="/pricing" />
              ) : (
                <Navigate to="/" />
              )
            ) : (
              <Navigate to="/" />
            )
          } 
        />
        
        {/* Settings Routes - Requires subscription for users, admin can access */}
        <Route 
          path="/settings" 
          element={
            user ? (
              user.role === 'admin' || subscriptionStatus.hasSubscription ? (
                <UserSettings user={user} />
              ) : user.role === 'user' ? (
                <Navigate to="/pricing" />
              ) : (
                <Navigate to="/" />
              )
            ) : (
              <Navigate to="/" />
            )
          } 
        />
        
        {/* Catch-all route */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  );
}

// Wrap App with Router and navigation hooks
const AppWrapper = () => {
  return (
    <Router>
      <App />
    </Router>
  );
};

export default AppWrapper;
