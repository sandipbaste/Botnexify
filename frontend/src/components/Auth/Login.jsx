// src/components/Auth/Login.jsx - UPDATED
import React, { useState } from 'react';
import { FaEnvelope, FaLock, FaUser, FaEye, FaEyeSlash, FaSignInAlt } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL;

const Login = ({ onLogin, onSwitchToSignup, onForgotPassword, onClose }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }
    
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
  e.preventDefault();
  
  if (!validateForm()) {
    return;
  }
  
  setIsLoading(true);
  
  try {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formData)
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Login failed');
    }
    
    if (data.success) {
      // Store token and user info
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('user', JSON.stringify(data.user || data.admin)); // Handle both user and admin
      
      // Check if user is admin
      const userData = data.user || data.admin;
      if (userData.role === 'admin') {
        toast.success(`Welcome Admin, ${userData.full_name}!`);
      } else {
        toast.success(`Welcome back, ${userData.full_name}!`);
      }
      
      if (onLogin) {
        onLogin(userData);
      }
      
      if (onClose) {
        onClose();
      }
    }
  } catch (error) {
    console.error('Login error:', error);
    
    // Check for specific backend connection error
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      toast.error('Cannot connect to backend server. Please make sure it is running on port 8000.');
    } else {
      toast.error(error.message || 'Login failed. Please check your credentials.');
    }
    
    setErrors({ general: error.message });
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
            
            {/* Header */}
            <div className="p-8 pb-0">
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FaSignInAlt className="text-white text-2xl" />
                </div>
                <h2 className="text-3xl font-bold text-gray-900 mb-2">
                  Sign In
                </h2>
                <p className="text-gray-600">
                  Welcome back! Please sign in to your account
                </p>
              </div>
            </div>
            
            {/* Form */}
            <form onSubmit={handleSubmit} className="p-8 pt-6">
              <div className="space-y-6">
                {/* Email Field */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address
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
                      } rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200`}
                      placeholder="you@example.com"
                      disabled={isLoading}
                      autoComplete="email"
                    />
                  </div>
                  {errors.email && (
                    <p className="mt-1 text-sm text-red-600">{errors.email}</p>
                  )}
                </div>
                
                {/* Password Field */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                      <FaLock />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      className={`w-full pl-10 pr-12 py-3 border ${
                        errors.password ? 'border-red-500' : 'border-gray-300'
                      } rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200`}
                      placeholder="••••••••"
                      disabled={isLoading}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      disabled={isLoading}
                    >
                      {showPassword ? <FaEyeSlash /> : <FaEye />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="mt-1 text-sm text-red-600">{errors.password}</p>
                  )}
                  
                  {/* Forgot Password Link */}
                  <div className="flex justify-end mt-2">
                    <button
                      type="button"
                      onClick={onForgotPassword}
                      className="text-sm text-blue-600 hover:text-blue-800 transition-colors font-medium"
                      disabled={isLoading}
                    >
                      Forgot password?
                    </button>
                  </div>
                </div>
                
                {/* Error Message */}
                {errors.general && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                    <p className="text-sm text-red-600">{errors.general}</p>
                  </div>
                )}
                
                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center space-x-2 shadow-lg"
                >
                  {isLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Signing in...</span>
                    </>
                  ) : (
                    <>
                      <FaSignInAlt />
                      <span>Sign In</span>
                    </>
                  )}
                </button>
                
                {/* Switch to Signup */}
                <div className="text-center pt-4 border-t border-gray-100">
                  <p className="text-gray-600">
                    Don't have an account?{' '}
                    <button
                      type="button"
                      onClick={onSwitchToSignup}
                      className="text-blue-600 hover:text-blue-800 font-medium transition-colors"
                      disabled={isLoading}
                    >
                      Sign up here
                    </button>
                  </p>
                </div>
              </div>
            </form>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default Login;