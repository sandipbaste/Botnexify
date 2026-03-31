// src/components/UserProfile.jsx
import React, { useState, useEffect, useRef } from 'react';
import { 
  FaUser, FaEnvelope, FaPhone, FaCalendar, FaShieldAlt, 
  FaGlobe, FaRobot, FaFileAlt, FaComments, FaHistory,
  FaEdit, FaLock, FaBell, FaCog, FaSignOutAlt, FaCheckCircle,
  FaExclamationTriangle, FaEye, FaEyeSlash, FaCreditCard,
  FaCrown, FaDatabase, FaCloudUploadAlt, FaUserFriends,
  FaChartLine, FaPaperPlane, FaSave, FaTimes, FaSync,
  FaKey, FaEnvelopeOpenText, FaLockOpen, FaArrowUp
} from 'react-icons/fa';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || "https://botrion.onrender.com";

const UserProfile = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState('profile');
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [userStats, setUserStats] = useState(null);
  const [userWebsites, setUserWebsites] = useState([]);
  const [subscription, setSubscription] = useState(null);
  
  // Forgot Password States
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordStep, setForgotPasswordStep] = useState('email');
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [otpTimer, setOtpTimer] = useState(60);
  const [canResendOtp, setCanResendOtp] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Refs for auto-focusing
  const emailInputRef = useRef(null);
  const otpInputRef = useRef(null);
  const newPasswordRef = useRef(null);

  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    mobile: '',
    current_password: '',
    new_password: '',
    confirm_password: ''
  });

  const [errors, setErrors] = useState({});
  const [successMessage, setSuccessMessage] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      setFormData({
        ...formData,
        full_name: user.full_name || '',
        email: user.email || '',
        mobile: user.mobile || ''
      });
      setResetEmail(user.email || '');
      loadUserData();
      loadSubscriptionData();
    }
  }, [user]);

  useEffect(() => {
    let interval;
    if (forgotPasswordStep === 'otp' && otpTimer > 0 && !canResendOtp) {
      interval = setInterval(() => {
        setOtpTimer((prev) => {
          if (prev <= 1) {
            setCanResendOtp(true);
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [forgotPasswordStep, otpTimer, canResendOtp]);

  // Handle focus when step changes
  useEffect(() => {
    if (showForgotPassword) {
      setTimeout(() => {
        if (forgotPasswordStep === 'email' && emailInputRef.current) {
          emailInputRef.current.focus();
        } else if (forgotPasswordStep === 'otp' && otpInputRef.current) {
          otpInputRef.current.focus();
        } else if (forgotPasswordStep === 'reset' && newPasswordRef.current) {
          newPasswordRef.current.focus();
        }
      }, 50);
    }
  }, [showForgotPassword, forgotPasswordStep]);

  const loadUserData = async () => {
    try {
      const token = localStorage.getItem('access_token');
      
      const statsResponse = await fetch(`${API_URL}/api/user/stats`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        if (statsData.success) {
          setUserStats(statsData.statistics);
        }
      }
      
      const websitesResponse = await fetch(`${API_URL}/api/user/websites`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (websitesResponse.ok) {
        const websitesData = await websitesResponse.json();
        if (websitesData.success) {
          setUserWebsites(websitesData.websites || []);
        }
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  const loadSubscriptionData = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_URL}/api/payments/user-subscription`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.has_subscription) {
          setSubscription(data.subscription);
          // Store in localStorage for other components
          localStorage.setItem('user_subscription', JSON.stringify(data.subscription));
        } else {
          // Check localStorage for cached subscription
          const cachedSubscription = localStorage.getItem('user_subscription');
          if (cachedSubscription) {
            setSubscription(JSON.parse(cachedSubscription));
          }
        }
      }
    } catch (error) {
      console.error('Error loading subscription:', error);
      // Fallback to localStorage
      const cachedSubscription = localStorage.getItem('user_subscription');
      if (cachedSubscription) {
        setSubscription(JSON.parse(cachedSubscription));
      }
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateProfileForm = () => {
    const newErrors = {};
    
    if (!formData.full_name?.trim()) {
      newErrors.full_name = 'Full name is required';
    }
    
    if (!formData.email?.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }
    
    if (formData.mobile && !/^[\d\+\-\s]{10,15}$/.test(formData.mobile.replace(/\D/g, ''))) {
      newErrors.mobile = 'Please enter a valid phone number';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validatePasswordForm = () => {
    const newErrors = {};
    
    if (!formData.current_password) {
      newErrors.current_password = 'Current password is required';
    }
    
    if (!formData.new_password) {
      newErrors.new_password = 'New password is required';
    } else if (formData.new_password.length < 6) {
      newErrors.new_password = 'Password must be at least 6 characters';
    }
    
    if (!formData.confirm_password) {
      newErrors.confirm_password = 'Please confirm your password';
    } else if (formData.new_password !== formData.confirm_password) {
      newErrors.confirm_password = 'Passwords do not match';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleProfileUpdate = async (e) => {
    e?.preventDefault();
    if (isLoading) return; 
    
    if (!validateProfileForm()) {
      toast.error('Enter Correct Credential');
      return;
    }
    
    setIsLoading(true);
    setSuccessMessage('');
    
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_URL}/api/auth/profile`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          full_name: formData.full_name,
          email: formData.email,
          mobile: formData.mobile
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success('Profile updated successfully!');
        setSuccessMessage('Your profile has been updated');
        setIsEditing(false);
        if (user) {
          user.full_name = formData.full_name;
          user.email = formData.email;
          user.mobile = formData.mobile;
        }
      } else {
        throw new Error(data.message || 'Failed to update profile');
      }
    } catch (error) {
      toast.error(error.message || 'Failed to update profile');
      setErrors({ submit: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e?.preventDefault();
    if (isLoading) return;
    
    if (!validatePasswordForm()) {
      toast.error('Enter Correct Credential');
      return;
    }
    
    setIsLoading(true);
    setErrors({});
    
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_URL}/api/auth/change-password`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          current_password: formData.current_password,
          new_password: formData.new_password,
          confirm_password: formData.confirm_password
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success('Password changed successfully!');
        setFormData(prev => ({
          ...prev,
          current_password: '',
          new_password: '',
          confirm_password: ''
        }));
        setSuccessMessage('Your password has been changed');
      } else {
        const errorMsg = data.message?.toLowerCase() || '';
        if (errorMsg.includes('current') || errorMsg.includes('incorrect') || errorMsg.includes('wrong') || errorMsg.includes('match')) {
          setErrors({ current_password: data.message || 'Current password is wrong' });
          toast.error(data.message || 'Current password is wrong');
        } else {
          throw new Error(data.message || 'Failed to change password');
        }
      }
    } catch (error) {
      toast.error(error.message || 'Failed to change password');
      setErrors({ password: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenForgotPassword = () => {
    if (user?.email) {
      setResetEmail(user.email);
    }
    setShowForgotPassword(true);
    setForgotPasswordStep('email');
    setOtp(['', '', '', '', '', '']);
    setNewPassword('');
    setConfirmNewPassword('');
    setResetToken('');
    setOtpTimer(60);
    setCanResendOtp(false);
  };

  const handleForgotPassword = async (e) => {
    e?.preventDefault();
    if (isLoading) return;

    if (!resetEmail) {
      toast.error('Please enter your email address');
      return;
    }

    if (user?.email && resetEmail.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
      toast.error('Invalid credential');
      return;
    }

    setIsLoading(true);
    
    try {
      const email = resetEmail;

      const response = await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
      });

      const data = await response.json();

      if (data.success) {
        setResetToken(data.reset_token);
        setForgotPasswordStep('otp');
        setOtpTimer(60);
        setCanResendOtp(false);
        toast.success(`OTP sent to ${email}!`);
      } else {
        throw new Error(data.message || 'Failed to send OTP');
      }
    } catch (error) {
      toast.error(error.message || 'Failed to process request');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e?.preventDefault();
    if (isLoading) return;
    
    const otpValue = otp.join('');
    if (otpValue.length !== 6) {
      toast.error('Please enter complete 6-digit OTP');
      return;
    }

    setIsLoading(true);
    
    try {
      const response = await fetch(`${API_URL}/api/auth/verify-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reset_token: resetToken,
          otp: otpValue
        })
      });

      const data = await response.json();

      if (data.success) {
        setForgotPasswordStep('reset');
        toast.success('OTP verified successfully!');
      } else {
        throw new Error(data.message || 'Invalid OTP');
      }
    } catch (error) {
      toast.error(error.message || 'Failed to verify OTP');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e?.preventDefault();
    if (isLoading) return;

    if (!newPassword) {
      toast.error('New password is required');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setIsLoading(true);
    
    try {
      const response = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reset_token: resetToken,
          new_password: newPassword,
          confirm_password: confirmNewPassword
        })
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Password reset successfully!');
        setShowForgotPassword(false);
        setForgotPasswordStep('email');
        setResetEmail(user?.email || '');
        setOtp(['', '', '', '', '', '']);
        setNewPassword('');
        setConfirmNewPassword('');
        setResetToken('');
        setActiveTab('security');
      } else {
        throw new Error(data.message || 'Failed to reset password');
      }
    } catch (error) {
      toast.error(error.message || 'Failed to reset password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!canResendOtp) return;
    setIsLoading(true);
    try {
      const email = resetEmail;
      const response = await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
      });

      const data = await response.json();

      if (data.success) {
        setResetToken(data.reset_token);
        setOtpTimer(60);
        setCanResendOtp(false);
        toast.success('OTP resent successfully!');
      } else {
        throw new Error(data.message || 'Failed to resend OTP');
      }
    } catch (error) {
      toast.error(error.message || 'Failed to resend OTP');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelForgotPassword = () => {
    setShowForgotPassword(false);
    setForgotPasswordStep('email');
    setResetEmail(user?.email || '');
    setOtp(['', '', '', '', '', '']);
    setNewPassword('');
    setConfirmNewPassword('');
    setResetToken('');
  };

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    } else {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      localStorage.removeItem('user_subscription');
      navigate('/login');
    }
    toast.success('Logged out successfully');
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setFormData({
      ...formData,
      full_name: user?.full_name || '',
      email: user?.email || '',
      mobile: user?.mobile || ''
    });
    setErrors({});
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleModalOtpChange = (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    const newOtp = value.split('');
    while (newOtp.length < 6) newOtp.push('');
    setOtp(newOtp);
  };

  // Function to handle upgrade plan navigation
  const handleUpgradePlan = () => {
    navigate('/pricing');
    toast.info('Choose Premium plan to upgrade and get 10 websites limit!');
  };

  // Determine if user is on Standard plan
  const isOnStandardPlan = subscription && subscription.plan_name === 'Standard';
  const isOnPremiumPlan = subscription && subscription.plan_name === 'Premium';

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Profile Navigation Tabs */}
        <div className="bg-white rounded-2xl shadow-lg mb-6">
          <nav className="flex overflow-x-auto py-2 px-4">
            {[
              { id: 'profile', label: 'Profile', icon: <FaUser /> },
              { id: 'security', label: 'Security', icon: <FaLock /> },
              { id: 'subscription', label: 'Subscription', icon: <FaCrown /> },
              { id: 'stats', label: 'Statistics', icon: <FaChartLine /> }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`cursor-pointer relative px-4 py-3 mx-1 flex items-center space-x-2 text-sm font-medium rounded-lg transition-all ${
                  activeTab === tab.id
                    ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Profile Tab Content */}
        {activeTab === 'profile' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            {/* Profile Information Card */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-gray-900 flex items-center">
                    <FaUser className="mr-2 text-blue-600" />
                    Personal Information
                  </h2>
                  {!isEditing ? (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="px-4 py-2 bg-blue-50 text-blue-600 font-medium rounded-lg hover:bg-blue-100 transition-colors flex items-center space-x-2"
                    >
                      <FaEdit />
                      <span>Edit Profile</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleCancelEdit}
                      className="px-4 py-2 bg-gray-100 text-gray-600 font-medium rounded-lg hover:bg-gray-200 transition-colors flex items-center space-x-2"
                    >
                      <FaTimes />
                      <span>Cancel</span>
                    </button>
                  )}
                </div>

                {successMessage && (
                  <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center text-green-700">
                    <FaCheckCircle className="mr-2" />
                    {successMessage}
                  </div>
                )}

                {errors.submit && (
                  <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center text-red-700">
                    <FaExclamationTriangle className="mr-2" />
                    {errors.submit}
                  </div>
                )}

                <form onSubmit={handleProfileUpdate}>
                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Full Name
                      </label>
                      {isEditing ? (
                        <>
                          <div className="relative">
                            <FaUser className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                            <input
                              type="text"
                              name="full_name"
                              value={formData.full_name}
                              onChange={handleInputChange}
                              className={`w-full pl-10 pr-4 py-3 border ${
                                errors.full_name ? 'border-red-500' : 'border-gray-300'
                              } rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors`}
                              placeholder="Enter your full name"
                            />
                          </div>
                          {errors.full_name && (
                            <p className="mt-1 text-sm text-red-600">{errors.full_name}</p>
                          )}
                        </>
                      ) : (
                        <div className="p-3 bg-gray-50 rounded-lg text-gray-900">
                          {user?.full_name || 'Not set'}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Email Address
                      </label>
                      {isEditing ? (
                        <>
                          <div className="relative">
                            <FaEnvelope className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                            <input
                              type="email"
                              name="email"
                              value={formData.email}
                              onChange={handleInputChange}
                              className={`w-full pl-10 pr-4 py-3 border ${
                                errors.email ? 'border-red-500' : 'border-gray-300'
                              } rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors`}
                              placeholder="Enter your email"
                            />
                          </div>
                          {errors.email && (
                            <p className="mt-1 text-sm text-red-600">{errors.email}</p>
                          )}
                        </>
                      ) : (
                        <div className="p-3 bg-gray-50 rounded-lg text-gray-900 flex items-center">
                          <FaEnvelope className="mr-2 text-gray-500" />
                          {user?.email || 'Not set'}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Phone Number
                      </label>
                      {isEditing ? (
                        <>
                          <div className="relative">
                            <FaPhone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                            <input
                              type="tel"
                              name="mobile"
                              value={formData.mobile}
                              onChange={handleInputChange}
                              className={`w-full pl-10 pr-4 py-3 border ${
                                errors.mobile ? 'border-red-500' : 'border-gray-300'
                              } rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors`}
                              placeholder="Enter your phone number"
                            />
                          </div>
                          {errors.mobile && (
                            <p className="mt-1 text-sm text-red-600">{errors.mobile}</p>
                          )}
                        </>
                      ) : (
                        <div className="p-3 bg-gray-50 rounded-lg text-gray-900 flex items-center">
                          <FaPhone className="mr-2 text-gray-500" />
                          {user?.mobile || 'Not set'}
                        </div>
                      )}
                    </div>

                    {isEditing && (
                      <div className="pt-4">
                        <button
                          type="submit"
                          disabled={isLoading}
                          className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                          {isLoading ? (
                            <>
                              <FaSync className="animate-spin" />
                              <span>Saving...</span>
                            </>
                          ) : (
                            <>
                              <FaSave />
                              <span>Save Changes</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </form>
              </div>
            </div>

            {/* Account Overview Card */}
            <div className="lg:col-span-1">
              <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl shadow-lg p-6 text-white">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <FaShieldAlt className="mr-2" />
                  Account Overview
                </h3>
                
                <div className="space-y-4">
                  <div className="pt-4 border-t border-blue-400">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-blue-100">Websites</span>
                      <span className="text-2xl font-bold">{userWebsites.length}</span>
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-blue-100">Chat Messages</span>
                      <span className="text-2xl font-bold">{userStats?.chat_messages || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-blue-100">Uploads</span>
                      <span className="text-2xl font-bold">{userStats?.files || 0}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="bg-white rounded-2xl shadow-lg p-6 mt-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
                <div className="space-y-3">
                  <button
                    onClick={() => navigate('/dashboard?tab=train')}
                    className="cursor-pointer w-full px-4 py-3 bg-blue-50 text-blue-700 font-medium rounded-lg hover:bg-blue-100 transition-colors flex items-center justify-center space-x-2"
                  >
                    <FaRobot />
                    <span>Train New Chatbot</span>
                  </button>
                  <button
                    onClick={() => navigate('/dashboard?tab=uploads')}
                    className="cursor-pointer w-full px-4 py-3 bg-green-50 text-green-700 font-medium rounded-lg hover:bg-green-100 transition-colors flex items-center justify-center space-x-2"
                  >
                    <FaCloudUploadAlt />
                    <span>Upload Files</span>
                  </button>
                  
                  {/* SHOW UPGRADE BUTTON ONLY FOR STANDARD PLAN USERS */}
                  {isOnStandardPlan && (
                    <button
                      onClick={handleUpgradePlan}
                      className="cursor-pointer w-full px-4 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-medium rounded-lg hover:from-yellow-600 hover:to-orange-600 transition-all duration-200 flex items-center justify-center space-x-2 shadow-md"
                    >
                      <FaArrowUp className="animate-pulse" />
                      <span>Upgrade to Premium</span>
                      <FaCrown className="text-yellow-200" />
                    </button>
                  )}
                  
                  {/* NO UPGRADE BUTTON FOR PREMIUM USERS - Just show plan info */}
                  {isOnPremiumPlan && (
                    <div className="w-full px-4 py-3 bg-gradient-to-r from-purple-100 to-indigo-100 text-purple-700 font-medium rounded-lg flex items-center justify-center space-x-2 border border-purple-200">
                      <FaCrown className="text-yellow-600" />
                      <span>Premium Plan Active</span>
                      <FaCheckCircle className="text-green-600" />
                    </div>
                  )}
                  
                  {/* Show subscribe button if no subscription */}
                  {!subscription && (
                    <button
                      onClick={() => navigate('/pricing')}
                      className="cursor-pointer w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-medium rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all duration-200 flex items-center justify-center space-x-2"
                    >
                      <FaCrown />
                      <span>Subscribe Now</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Security Tab Content */}
        {activeTab === 'security' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6"
          >
            {/* Change Password */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
                <FaLock className="mr-2 text-blue-600" />
                Change Password
              </h2>

              {errors.password && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center text-red-700">
                  <FaExclamationTriangle className="mr-2" />
                  {errors.password}
                </div>
              )}

              <form onSubmit={handlePasswordChange}>
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Current Password
                    </label>
                    <div className="relative">
                      {showPassword ? (
                        <FaEyeSlash
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 cursor-pointer hover:text-gray-600"
                          onClick={() => setShowPassword(false)}
                        />
                      ) : (
                        <FaEye
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 cursor-pointer hover:text-gray-600"
                          onClick={() => setShowPassword(true)}
                        />
                      )}
                      <input
                        type={showPassword ? 'text' : 'password'}
                        name="current_password"
                        value={formData.current_password}
                        onChange={handleInputChange}
                        className={`w-full px-4 py-3 border ${
                          errors.current_password ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300'
                        } rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors`}
                        placeholder="Enter current password"
                      />
                    </div>
                    {errors.current_password && (
                      <p className="mt-1 text-sm text-red-600 flex items-center">
                        <FaExclamationTriangle className="mr-1" />
                        {errors.current_password}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      New Password
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="new_password"
                      value={formData.new_password}
                      onChange={handleInputChange}
                      className={`w-full px-4 py-3 border ${
                        errors.new_password ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300'
                      } rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors`}
                      placeholder="Enter new password"
                    />
                    {errors.new_password && (
                      <p className="mt-1 text-sm text-red-600 flex items-center">
                        <FaExclamationTriangle className="mr-1" />
                        {errors.new_password}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-gray-500">
                      Password must be at least 6 characters long
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Confirm New Password
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="confirm_password"
                      value={formData.confirm_password}
                      onChange={handleInputChange}
                      className={`w-full px-4 py-3 border ${
                        errors.confirm_password ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300'
                      } rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors`}
                      placeholder="Confirm new password"
                    />
                    {errors.confirm_password && (
                      <p className="mt-1 text-sm text-red-600 flex items-center">
                        <FaExclamationTriangle className="mr-1" />
                        {errors.confirm_password}
                      </p>
                    )}
                  </div>

                  <div className="pt-4">
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="cursor-pointer w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {isLoading ? (
                        <>
                          <FaSync className="animate-spin" />
                          <span>Updating...</span>
                        </>
                      ) : (
                        <>
                          <FaLock />
                          <span>Update Password</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>

            {/* Security Recommendations & Forgot Password */}
            <div className="space-y-6">
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <FaShieldAlt className="mr-2 text-green-600" />
                  Security Status
                </h3>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <FaCheckCircle className="text-green-600" />
                      <span className="text-sm text-gray-700">Password strength</span>
                    </div>
                    <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-1 rounded-full">
                      Strong
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <FaExclamationTriangle className="text-yellow-600" />
                      <span className="text-sm text-gray-700">Two-factor authentication</span>
                    </div>
                    <button className="text-xs font-medium text-yellow-700 bg-yellow-100 px-3 py-1 rounded-full hover:bg-yellow-200">
                      Enable
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <FaHistory className="text-blue-600" />
                      <span className="text-sm text-gray-700">Last password change</span>
                    </div>
                    <span className="text-xs text-gray-600">30 days ago</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <FaKey className="mr-2 text-blue-600" />
                  Forgot Password?
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  If you don't remember your current password, you can reset it using OTP verification.
                </p>
                <button
                  onClick={handleOpenForgotPassword}
                  className="cursor-pointer w-full px-4 py-3 bg-blue-50 text-blue-700 font-medium rounded-lg hover:bg-blue-100 transition-colors flex items-center justify-center space-x-2"
                >
                  <FaLockOpen />
                  <span>Reset Password</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Subscription Tab Content */}
        {activeTab === 'subscription' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            {/* Current Plan */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
                  <FaCrown className="mr-2 text-yellow-500" />
                  Current Subscription
                </h2>

                {subscription ? (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-2xl font-bold text-gray-900">
                          {subscription.plan_name || 'Premium Plan'}
                        </span>
                        <p className="text-gray-600 mt-1">
                          {subscription.days_remaining > 0
                            ? `${subscription.days_remaining} days remaining`
                            : 'Expires today'}
                        </p>
                      </div>
                      <span className="px-4 py-2 bg-green-100 text-green-800 font-medium rounded-full">
                        Active
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-4 bg-blue-50 rounded-lg">
                        <FaRobot className="text-blue-600 text-xl mb-2" />
                        <p className="text-sm text-gray-600">Websites</p>
                        <p className="text-2xl font-bold text-gray-900">
                          {userWebsites.length} / {subscription.max_websites || '∞'}
                        </p>
                        {isOnStandardPlan && (
                          <p className="text-xs text-blue-600 mt-1">
                            Upgrade to Premium to get 10 websites limit
                          </p>
                        )}
                      </div>
                      <div className="p-4 bg-green-50 rounded-lg">
                        <FaComments className="text-green-600 text-xl mb-2" />
                        <p className="text-sm text-gray-600">Chat Messages</p>
                        <p className="text-2xl font-bold text-gray-900">
                          {userStats?.chat_messages || 0} / {subscription.max_chat_messages?.toLocaleString() || '∞'}
                        </p>
                      </div>
                      <div className="p-4 bg-purple-50 rounded-lg">
                        <FaFileAlt className="text-purple-600 text-xl mb-2" />
                        <p className="text-sm text-gray-600">Uploads</p>
                        <p className="text-2xl font-bold text-gray-900">
                          {userStats?.files || 0} / {subscription.max_uploads || '∞'}
                        </p>
                      </div>
                    </div>

                    {/* Upgrade button in subscription tab ONLY for Standard plan users */}
                    {isOnStandardPlan && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <button
                          onClick={handleUpgradePlan}
                          className="w-full px-6 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-medium rounded-xl hover:from-yellow-600 hover:to-orange-600 transition-all duration-200 flex items-center justify-center space-x-2 shadow-md"
                        >
                          <FaArrowUp />
                          <span>Upgrade to Premium Plan</span>
                          <FaCrown />
                        </button>
                        <p className="text-sm text-gray-500 text-center mt-3">
                          Premium plan gives you 10 websites (up from 6), 20,000 chat messages, and priority support
                        </p>
                      </div>
                    )}
                    
                    {/* Show premium plan message without upgrade button */}
                    {isOnPremiumPlan && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-4 text-center">
                          <FaCrown className="text-yellow-600 text-2xl mx-auto mb-2" />
                          <p className="text-purple-800 font-medium">You're on the Premium Plan!</p>
                          <p className="text-sm text-gray-600 mt-1">
                            Enjoy 10 websites, 20,000 chat messages, and priority support
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <FaCrown className="text-6xl text-yellow-500 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">No Active Subscription</h3>
                    <p className="text-gray-600 mb-6">
                      Subscribe to a plan to unlock all features
                    </p>
                    <button
                      onClick={() => navigate('/pricing')}
                      className="px-6 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-medium rounded-lg hover:from-yellow-600 hover:to-orange-600 transition-all duration-200"
                    >
                      View Plans
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Billing Info */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <FaCreditCard className="mr-2 text-blue-600" />
                  Billing Information
                </h3>

                {subscription ? (
                  <div className="space-y-4">
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500 mb-1">Plan Price</p>
                      <p className="text-xl font-bold text-gray-900">
                        ₹{subscription.price || '0'}/month
                      </p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500 mb-1">Next Billing Date</p>
                      <p className="font-medium text-gray-900">
                        {subscription.end_date
                          ? formatDate(subscription.end_date)
                          : 'N/A'}
                      </p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500 mb-1">Payment Method</p>
                      <p className="font-medium text-gray-900">Razorpay</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-600 text-center py-4">
                    No billing information available
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Statistics Tab Content */}
        {activeTab === 'stats' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl shadow-lg p-6 text-white">
              <FaRobot className="text-3xl mb-4 opacity-80" />
              <p className="text-blue-100 text-sm">Total Websites</p>
              <p className="text-4xl font-bold mt-2">{userWebsites.length}</p>
            </div>

            <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl shadow-lg p-6 text-white">
              <FaComments className="text-3xl mb-4 opacity-80" />
              <p className="text-green-100 text-sm">Chat Messages</p>
              <p className="text-4xl font-bold mt-2">{userStats?.chat_messages || 0}</p>
            </div>

            <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl shadow-lg p-6 text-white">
              <FaUserFriends className="text-3xl mb-4 opacity-80" />
              <p className="text-purple-100 text-sm">Contact Forms</p>
              <p className="text-4xl font-bold mt-2">{userStats?.contact_forms || 0}</p>
            </div>

            <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-2xl shadow-lg p-6 text-white">
              <FaFileAlt className="text-3xl mb-4 opacity-80" />
              <p className="text-yellow-100 text-sm">Uploaded Files</p>
              <p className="text-4xl font-bold mt-2">{userStats?.files || 0}</p>
            </div>
          </motion.div>
        )}
      </div>

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-900 flex items-center">
                  <FaLockOpen className="mr-2 text-blue-600" />
                  Reset Password
                </h3>
                <button
                  onClick={handleCancelForgotPassword}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  &times;
                </button>
              </div>

              {/* Email Step */}
              {forgotPasswordStep === 'email' && (
                <form onSubmit={handleForgotPassword}>
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email Address
                    </label>
                    <div className="relative">
                      <FaEnvelope className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                      <input
                        ref={emailInputRef}
                        type="email"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        placeholder="Enter your email"
                        required
                        autoComplete="off"
                        spellCheck="false"
                      />
                    </div>
                    <p className="mt-2 text-sm text-gray-500">
                      We'll send a 6-digit OTP to this email address
                    </p>
                    {user?.email && (
                      <p className="mt-2 text-xs text-green-600">
                        Using your registered email: {user.email}
                      </p>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-70"
                  >
                    {isLoading ? (
                      <>
                        <FaSync className="animate-spin" />
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <FaEnvelopeOpenText />
                        <span>Send OTP</span>
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* OTP Step */}
              {forgotPasswordStep === 'otp' && (
                <form onSubmit={handleVerifyOtp}>
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-4">
                      Enter 6-Digit OTP
                    </label>
                    
                    <div className="flex flex-col items-center">
                      <input
                        ref={otpInputRef}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        value={otp.join('')}
                        onChange={handleModalOtpChange}
                        className="w-full px-4 py-4 text-center text-2xl font-semibold tracking-[0.5em] border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        placeholder="000000"
                        autoComplete="off"
                        spellCheck="false"
                      />
                      
                      <div className="flex justify-between gap-2 w-full mt-4">
                        {[0, 1, 2, 3, 4, 5].map((index) => (
                          <div
                            key={index}
                            className="w-12 h-14 flex items-center justify-center text-xl font-bold rounded-lg border-2"
                            style={{
                              backgroundColor: otp[index] ? '#dbeafe' : '#f3f4f6',
                              borderColor: otp[index] ? '#2563eb' : '#e5e7eb',
                              color: otp[index] ? '#1e40af' : '#9ca3af',
                            }}
                          >
                            {otp[index] || '○'}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 flex justify-between items-center">
                      <p className="text-sm text-gray-600">
                        {otpTimer > 0 ? (
                          <>Resend OTP in <span className="font-semibold text-gray-900">{otpTimer}s</span></>
                        ) : (
                          <button
                            type="button"
                            onClick={handleResendOtp}
                            disabled={!canResendOtp || isLoading}
                            className="text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50"
                          >
                            Resend OTP
                          </button>
                        )}
                      </p>
                      <p className="text-sm text-gray-500">
                        {otp.join('').length}/6 digits
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex space-x-3">
                    <button
                      type="button"
                      onClick={() => setForgotPasswordStep('email')}
                      className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading || otp.join('').length !== 6}
                      className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-lg hover:from-blue-700 hover:to-indigo-700 disabled:opacity-70"
                    >
                      {isLoading ? (
                        <>
                          <FaSync className="animate-spin" />
                          <span>Verifying...</span>
                        </>
                      ) : (
                        <>
                          <FaCheckCircle />
                          <span>Verify</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* Reset Password Step */}
              {forgotPasswordStep === 'reset' && (
                <form onSubmit={handleResetPassword}>
                  <div className="space-y-4 mb-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        New Password
                      </label>
                      <div className="relative">
                        {showNewPassword ? (
                          <FaEyeSlash
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 cursor-pointer hover:text-gray-600"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                          />
                        ) : (
                          <FaEye
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 cursor-pointer hover:text-gray-600"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                          />
                        )}
                        <input
                          ref={newPasswordRef}
                          type={showNewPassword ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          placeholder="Enter new password"
                          autoComplete="new-password"
                          spellCheck="false"
                        />
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        Password must be at least 6 characters long
                      </p>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Confirm New Password
                      </label>
                      <div className="relative">
                        {showConfirmPassword ? (
                          <FaEyeSlash
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 cursor-pointer hover:text-gray-600"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          />
                        ) : (
                          <FaEye
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 cursor-pointer hover:text-gray-600"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          />
                        )}
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={confirmNewPassword}
                          onChange={(e) => setConfirmNewPassword(e.target.value)}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          placeholder="Confirm new password"
                          autoComplete="new-password"
                          spellCheck="false"
                        />
                      </div>
                    </div>
                    
                    {newPassword && (
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <p className="text-xs font-medium text-gray-700 mb-2">Password strength:</p>
                        <div className="flex gap-1 mb-2">
                          {[1, 2, 3].map((level) => (
                            <div
                              key={level}
                              className="h-1 flex-1 rounded-full"
                              style={{
                                backgroundColor: newPassword.length >= 6 && level <= Math.min(3, Math.floor(newPassword.length / 2))
                                  ? '#10b981'
                                  : '#e5e7eb'
                              }}
                            />
                          ))}
                        </div>
                        <p className="text-xs text-gray-500">
                          {newPassword.length < 6
                            ? `Need ${6 - newPassword.length} more characters`
                            : newPassword !== confirmNewPassword
                            ? 'Passwords do not match'
                            : 'Strong enough password'}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex space-x-3">
                    <button
                      type="button"
                      onClick={() => setForgotPasswordStep('otp')}
                      className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading || !newPassword || newPassword.length < 6 || newPassword !== confirmNewPassword}
                      className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-lg hover:from-blue-700 hover:to-indigo-700 disabled:opacity-70"
                    >
                      {isLoading ? (
                        <>
                          <FaSync className="animate-spin" />
                          <span>Resetting...</span>
                        </>
                      ) : (
                        <>
                          <FaLockOpen />
                          <span>Reset Password</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserProfile;