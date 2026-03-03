// src/components/Auth/ForgotPassword.jsx
import React, { useState } from 'react';
import { FaEnvelope, FaKey, FaCheck, FaArrowLeft, FaClock } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL;

const ForgotPassword = ({ onBackToLogin, onClose }) => {
  const [step, setStep] = useState(1); // 1: Email, 2: OTP, 3: New Password
  const [formData, setFormData] = useState({
    email: '',
    otp: '',
    new_password: '',
    confirm_password: ''
  });
  const [resetToken, setResetToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [otpSent, setOtpSent] = useState(false);
  const [timer, setTimer] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Timer for OTP expiry
  React.useEffect(() => {
    let interval;
    if (timer > 0) {
      interval = setInterval(() => {
        setTimer(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timer]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const validateEmail = () => {
    if (!formData.email) {
      setErrors({ email: 'Email is required' });
      return false;
    }
    if (!/\S+@\S+\.\S+/.test(formData.email)) {
      setErrors({ email: 'Email is invalid' });
      return false;
    }
    return true;
  };

  const validateOTP = () => {
    if (!formData.otp) {
      setErrors({ otp: 'OTP is required' });
      return false;
    }
    if (formData.otp.length !== 6) {
      setErrors({ otp: 'OTP must be 6 digits' });
      return false;
    }
    if (!/^\d+$/.test(formData.otp)) {
      setErrors({ otp: 'OTP must contain only numbers' });
      return false;
    }
    return true;
  };

  const validatePassword = () => {
    const newErrors = {};
    
    if (!formData.new_password) {
      newErrors.new_password = 'New password is required';
    } else if (formData.new_password.length < 6) {
      newErrors.new_password = 'Password must be at least 6 characters';
    }
    
    if (formData.new_password !== formData.confirm_password) {
      newErrors.confirm_password = 'Passwords do not match';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSendOTP = async () => {
    if (!validateEmail()) return;
    
    setIsLoading(true);
    
    try {
      const response = await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: formData.email })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send OTP');
      }
      
      setResetToken(data.reset_token);
      setOtpSent(true);
      setTimer(600); // 10 minutes
      setStep(2);
      
      toast.success('OTP sent to your email!');
      
      // In development, show OTP in console
      if (data.otp) {
        console.log('Development OTP:', data.otp);
      }
      
    } catch (error) {
      console.error('Send OTP error:', error);
      toast.error(error.message || 'Failed to send OTP');
      setErrors({ general: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!validateOTP()) return;
    
    setIsLoading(true);
    
    try {
      const response = await fetch(`${API_URL}/api/auth/verify-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reset_token: resetToken,
          otp: formData.otp
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Invalid OTP');
      }
      
      setStep(3);
      toast.success('OTP verified! Now set your new password.');
      
    } catch (error) {
      console.error('Verify OTP error:', error);
      toast.error(error.message || 'Invalid OTP');
      setErrors({ otp: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!validatePassword()) return;
    
    setIsLoading(true);
    
    try {
      const response = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reset_token: resetToken,
          new_password: formData.new_password,
          confirm_password: formData.confirm_password
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to reset password');
      }
      
      toast.success('Password reset successfully!');
      
      // Return to login
      if (onBackToLogin) {
        onBackToLogin();
      }
      
      if (onClose) {
        onClose();
      }
      
    } catch (error) {
      console.error('Reset password error:', error);
      toast.error(error.message || 'Failed to reset password');
      setErrors({ general: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOTP = async () => {
    setIsLoading(true);
    
    try {
      const response = await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: formData.email })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to resend OTP');
      }
      
      setResetToken(data.reset_token);
      setTimer(600); // 10 minutes
      
      toast.success('New OTP sent!');
      
      // In development, show OTP in console
      if (data.otp) {
        console.log('Development OTP:', data.otp);
      }
      
    } catch (error) {
      console.error('Resend OTP error:', error);
      toast.error(error.message || 'Failed to resend OTP');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: undefined
      }));
    }
  };

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-gradient-to-r from-orange-500 to-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <FaKey className="text-white text-2xl" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Reset Your Password
        </h2>
        <p className="text-gray-600">
          Enter your email address and we'll send you an OTP to reset your password.
        </p>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Email Address *
        </label>
        <div className="relative">
          <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
            <FaEnvelope />
          </div>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            className={`w-full pl-10 pr-4 py-3 border ${
              errors.email ? 'border-red-500' : 'border-gray-300'
            } rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all duration-200`}
            placeholder="you@example.com"
            disabled={isLoading}
          />
        </div>
        {errors.email && (
          <p className="mt-1 text-sm text-red-600">{errors.email}</p>
        )}
      </div>
      
      {errors.general && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm text-red-600">{errors.general}</p>
        </div>
      )}
      
      <button
        type="button"
        onClick={handleSendOTP}
        disabled={isLoading}
        className="w-full py-3 bg-gradient-to-r from-orange-500 to-amber-600 text-white font-medium rounded-xl hover:from-orange-600 hover:to-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center space-x-2 shadow-lg"
      >
        {isLoading ? (
          <>
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span>Sending OTP...</span>
          </>
        ) : (
          <>
            <FaKey />
            <span>Send OTP</span>
          </>
        )}
      </button>
      
      <div className="text-center pt-4 border-t border-gray-100">
        <button
          type="button"
          onClick={onBackToLogin}
          className="text-blue-600 hover:text-blue-800 font-medium flex items-center justify-center space-x-2"
          disabled={isLoading}
        >
          <FaArrowLeft />
          <span>Back to Sign In</span>
        </button>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <FaCheck className="text-white text-2xl" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Verify OTP
        </h2>
        <p className="text-gray-600">
          Enter the 6-digit OTP sent to <strong>{formData.email}</strong>
        </p>
        
        {timer > 0 && (
          <div className="mt-3 inline-flex items-center space-x-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm">
            <FaClock />
            <span>Expires in: {formatTime(timer)}</span>
          </div>
        )}
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          6-Digit OTP *
        </label>
        <input
          type="text"
          name="otp"
          value={formData.otp}
          onChange={handleChange}
          maxLength="6"
          className={`w-full text-center text-2xl tracking-widest py-4 border ${
            errors.otp ? 'border-red-500' : 'border-gray-300'
          } rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200`}
          placeholder="000000"
          disabled={isLoading}
        />
        {errors.otp && (
          <p className="mt-1 text-sm text-red-600">{errors.otp}</p>
        )}
      </div>
      
      {timer === 0 && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-xl">
          <p className="text-sm text-yellow-700">
            OTP has expired. Please request a new one.
          </p>
        </div>
      )}
      
      <button
        type="button"
        onClick={handleVerifyOTP}
        disabled={isLoading || timer === 0}
        className="w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium rounded-xl hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center space-x-2 shadow-lg"
      >
        {isLoading ? (
          <>
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span>Verifying...</span>
          </>
        ) : (
          <>
            <FaCheck />
            <span>Verify OTP</span>
          </>
        )}
      </button>
      
      <div className="flex flex-col space-y-3">
        <button
          type="button"
          onClick={handleResendOTP}
          disabled={isLoading || timer > 540} // Don't allow resend in last minute
          className="w-full py-2 text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Resend OTP
        </button>
        
        <button
          type="button"
          onClick={() => {
            setStep(1);
            setErrors({});
          }}
          disabled={isLoading}
          className="w-full py-2 text-gray-600 hover:text-gray-800 font-medium flex items-center justify-center space-x-2"
        >
          <FaArrowLeft />
          <span>Change Email</span>
        </button>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <FaKey className="text-white text-2xl" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Set New Password
        </h2>
        <p className="text-gray-600">
          Create a strong new password for your account.
        </p>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          New Password *
        </label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            name="new_password"
            value={formData.new_password}
            onChange={handleChange}
            className={`w-full px-4 py-3 border ${
              errors.new_password ? 'border-red-500' : 'border-gray-300'
            } rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200`}
            placeholder="••••••••"
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            disabled={isLoading}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
        {errors.new_password && (
          <p className="mt-1 text-sm text-red-600">{errors.new_password}</p>
        )}
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Confirm New Password *
        </label>
        <div className="relative">
          <input
            type={showConfirmPassword ? 'text' : 'password'}
            name="confirm_password"
            value={formData.confirm_password}
            onChange={handleChange}
            className={`w-full px-4 py-3 border ${
              errors.confirm_password ? 'border-red-500' : 'border-gray-300'
            } rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200`}
            placeholder="••••••••"
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            disabled={isLoading}
          >
            {showConfirmPassword ? 'Hide' : 'Show'}
          </button>
        </div>
        {errors.confirm_password && (
          <p className="mt-1 text-sm text-red-600">{errors.confirm_password}</p>
        )}
      </div>
      
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
        <p className="text-sm text-blue-700">
          <strong>Password Requirements:</strong> At least 6 characters long.
        </p>
      </div>
      
      <button
        type="button"
        onClick={handleResetPassword}
        disabled={isLoading}
        className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-medium rounded-xl hover:from-green-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center space-x-2 shadow-lg"
      >
        {isLoading ? (
          <>
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span>Resetting Password...</span>
          </>
        ) : (
          <>
            <FaCheck />
            <span>Reset Password</span>
          </>
        )}
      </button>
      
      <div className="text-center pt-4 border-t border-gray-100">
        <button
          type="button"
          onClick={() => {
            setStep(2);
            setErrors({});
          }}
          disabled={isLoading}
          className="text-blue-600 hover:text-blue-800 font-medium flex items-center justify-center space-x-2"
        >
          <FaArrowLeft />
          <span>Back to OTP</span>
        </button>
      </div>
    </div>
  );

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 z-50 overflow-y-auto"
      >
        {/* Overlay */}
        <div className="fixed inset-0 bg-black/10 backdrop-blur-xs" onClick={onClose} />
        
        {/* Modal */}
        <div className="flex items-center justify-center min-h-screen p-4">
          <motion.div
            initial={{ y: 20 }}
            animate={{ y: 0 }}
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md"
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl p-2 rounded-full hover:bg-gray-100 transition-colors z-10"
              disabled={isLoading}
            >
              &times;
            </button>
            
            {/* Content */}
            <div className="p-8">
              <form onSubmit={(e) => e.preventDefault()}>
                {step === 1 && renderStep1()}
                {step === 2 && renderStep2()}
                {step === 3 && renderStep3()}
              </form>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ForgotPassword;