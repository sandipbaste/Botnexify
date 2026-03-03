import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { FaUserShield, FaPlus, FaTimes, FaLock, FaKey } from 'react-icons/fa';

const AddAdminModal = React.memo(({ 
  isOpen, 
  onClose, 
  onCreateAdmin, 
  isCreatingAdmin 
}) => {
  const [newAdminData, setNewAdminData] = useState({
    full_name: '',
    email: '',
    password: '',
    confirm_password: ''
  });
  
  const modalRef = useRef(null);

  const handleNewAdminChange = useCallback((e) => {
    const { name, value } = e.target;
    setNewAdminData(prev => ({
      ...prev,
      [name]: value
    }));
  }, []);

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    onCreateAdmin(newAdminData);
  }, [newAdminData, onCreateAdmin]);

  const handleClose = useCallback(() => {
    if (isCreatingAdmin) return;
    setNewAdminData({
      full_name: '',
      email: '',
      password: '',
      confirm_password: ''
    });
    onClose();
  }, [isCreatingAdmin, onClose]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'auto';
    };
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm" 
        aria-hidden="true"
      />
      
      <div className="flex items-center justify-center min-h-screen p-4">
        <motion.div
          ref={modalRef}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md"
        >
          <div className="p-6">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg flex items-center justify-center">
                  <FaUserShield className="text-white text-lg" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Create New Admin</h3>
                  <p className="text-sm text-gray-600">Add a new administrator account</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isCreatingAdmin}
                type="button"
                aria-label="Close modal"
              >
                <FaTimes />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                {/* Full Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    name="full_name"
                    value={newAdminData.full_name}
                    onChange={handleNewAdminChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors outline-none focus:outline-none"
                    placeholder="Enter full name"
                    disabled={isCreatingAdmin}
                    autoComplete="name"
                    required
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={newAdminData.email}
                    onChange={handleNewAdminChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors outline-none focus:outline-none"
                    placeholder="admin@example.com"
                    disabled={isCreatingAdmin}
                    autoComplete="email"
                    required
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Password *
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      name="password"
                      value={newAdminData.password}
                      onChange={handleNewAdminChange}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors outline-none focus:outline-none pr-10"
                      placeholder="••••••••"
                      disabled={isCreatingAdmin}
                      autoComplete="new-password"
                      required
                    />
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <FaLock className="text-gray-400" />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Password must be at least 6 characters
                  </p>
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm Password *
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      name="confirm_password"
                      value={newAdminData.confirm_password}
                      onChange={handleNewAdminChange}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors outline-none focus:outline-none pr-10"
                      placeholder="••••••••"
                      disabled={isCreatingAdmin}
                      autoComplete="new-password"
                      required
                    />
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <FaKey className="text-gray-400" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex space-x-3 mt-6">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 py-2.5 px-4 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isCreatingAdmin}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingAdmin}
                  className="flex-1 py-2.5 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreatingAdmin ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <>
                      <FaPlus />
                      <span>Create Admin</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      </div>
    </div>
  );
});

AddAdminModal.displayName = 'AddAdminModal';

export default AddAdminModal;