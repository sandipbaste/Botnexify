// src/components/Auth/Signup.jsx
import React, { useState } from 'react';
import { FaUser, FaEnvelope, FaPhone, FaLock, FaEye, FaEyeSlash, FaCheck } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'https://botrion.onrender.com';

const Signup = ({ onSignup, onSwitchToLogin, onClose }) => {
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    mobile: '',
    password: '',
    confirm_password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [passwordStrength, setPasswordStrength] = useState(0);

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.full_name.trim()) {
      newErrors.full_name = 'Full name is required';
    }
    
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }
    
    if (formData.mobile && !/^[0-9+\-\s()]*$/.test(formData.mobile)) {
      newErrors.mobile = 'Mobile number is invalid';
    }
    
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }
    
    if (formData.password !== formData.confirm_password) {
      newErrors.confirm_password = 'Passwords do not match';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const checkPasswordStrength = (password) => {
    let strength = 0;
    if (password.length >= 6) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    return strength;
  };

  const handlePasswordChange = (value) => {
    setFormData(prev => ({ ...prev, password: value }));
    setPasswordStrength(checkPasswordStrength(value));
  };

  const handleSubmit = async (e) => {
  e.preventDefault();
  
  if (!validateForm()) {
    return;
  }
  
  setIsLoading(true);
  
  try {
    const response = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formData)
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Registration failed');
    }
    
    if (data.success) {
      // Store token and user info
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      toast.success(`Welcome ${data.user.full_name}! Registration successful.`);
      
      if (onSignup) {
        onSignup(data.user);
      }
      
      if (onClose) {
        onClose();
      }
    }
  } catch (error) {
    console.error('Signup error:', error);
    toast.error(error.message || 'Registration failed. Please try again.');
    setErrors({ general: error.message });
  } finally {
    setIsLoading(false);
  }
};

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    if (name === 'password') {
      handlePasswordChange(value);
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
    
    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: undefined
      }));
    }
  };

  const getPasswordStrengthColor = () => {
    switch (passwordStrength) {
      case 0: return 'bg-gray-200';
      case 1: return 'bg-red-500';
      case 2: return 'bg-yellow-500';
      case 3: return 'bg-blue-500';
      case 4: return 'bg-green-500';
      default: return 'bg-gray-200';
    }
  };

  const getPasswordStrengthText = () => {
    switch (passwordStrength) {
      case 0: return 'Very weak';
      case 1: return 'Weak';
      case 2: return 'Fair';
      case 3: return 'Good';
      case 4: return 'Strong';
      default: return 'Very weak';
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
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl"
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl p-2 rounded-full hover:bg-gray-100 transition-colors z-10"
            >
              &times;
            </button>
            
            {/* Header */}
            <div className="p-8 pb-0">
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FaUser className="text-white text-2xl" />
                </div>
                <h2 className="text-3xl font-bold text-gray-900 mb-2">
                  Create Account
                </h2>
                <p className="text-gray-600">
                  Sign up to start creating chatbots
                </p>
              </div>
            </div>
            
            {/* Form */}
            <form onSubmit={handleSubmit} className="p-8 pt-6">
              <div className="space-y-6">
                {/* Full Name Field */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Full Name *
                  </label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                      <FaUser />
                    </div>
                    <input
                      type="text"
                      name="full_name"
                      value={formData.full_name}
                      onChange={handleChange}
                      className={`w-full pl-10 pr-4 py-3 border ${
                        errors.full_name ? 'border-red-500' : 'border-gray-300'
                      } rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200`}
                      placeholder="John Doe"
                      disabled={isLoading}
                    />
                  </div>
                  {errors.full_name && (
                    <p className="mt-1 text-sm text-red-600">{errors.full_name}</p>
                  )}
                </div>
                
                {/* Email Field */}
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
                      } rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200`}
                      placeholder="you@example.com"
                      disabled={isLoading}
                    />
                  </div>
                  {errors.email && (
                    <p className="mt-1 text-sm text-red-600">{errors.email}</p>
                  )}
                </div>
                
                {/* Mobile Field */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Mobile Number (Optional)
                  </label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                      <FaPhone />
                    </div>
                    <input
                      type="tel"
                      name="mobile"
                      value={formData.mobile}
                      onChange={handleChange}
                      className={`w-full pl-10 pr-4 py-3 border ${
                        errors.mobile ? 'border-red-500' : 'border-gray-300'
                      } rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200`}
                      placeholder="+1 234 567 8900"
                      disabled={isLoading}
                    />
                  </div>
                  {errors.mobile && (
                    <p className="mt-1 text-sm text-red-600">{errors.mobile}</p>
                  )}
                </div>
                
                {/* Password Field */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Password *
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
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <FaEyeSlash /> : <FaEye />}
                    </button>
                  </div>
                  
                  {/* Password Strength Indicator */}
                  {formData.password && (
                    <div className="mt-3">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">Password strength:</span>
                        <span className={`font-medium ${
                          passwordStrength === 1 ? 'text-red-600' :
                          passwordStrength === 2 ? 'text-yellow-600' :
                          passwordStrength === 3 ? 'text-blue-600' :
                          passwordStrength === 4 ? 'text-green-600' :
                          'text-gray-600'
                        }`}>
                          {getPasswordStrengthText()}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${getPasswordStrengthColor()} transition-all duration-300`}
                          style={{ width: `${(passwordStrength / 4) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                  
                  {errors.password && (
                    <p className="mt-1 text-sm text-red-600">{errors.password}</p>
                  )}
                </div>
                
                {/* Confirm Password Field */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Confirm Password *
                  </label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                      <FaLock />
                    </div>
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      name="confirm_password"
                      value={formData.confirm_password}
                      onChange={handleChange}
                      className={`w-full pl-10 pr-12 py-3 border ${
                        errors.confirm_password ? 'border-red-500' : 'border-gray-300'
                      } rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200`}
                      placeholder="••••••••"
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
                    </button>
                  </div>
                  {errors.confirm_password && (
                    <p className="mt-1 text-sm text-red-600">{errors.confirm_password}</p>
                  )}
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
                  className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-medium rounded-xl hover:from-green-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center space-x-2 shadow-lg"
                >
                  {isLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Creating Account...</span>
                    </>
                  ) : (
                    <>
                      <FaCheck />
                      <span>Create Account</span>
                    </>
                  )}
                </button>
                
                {/* Switch to Login */}
                <div className="text-center pt-4 border-t border-gray-100">
                  <p className="text-gray-600">
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={onSwitchToLogin}
                      className="text-blue-600 hover:text-blue-800 font-medium transition-colors"
                    >
                      Sign in here
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

export default Signup;
