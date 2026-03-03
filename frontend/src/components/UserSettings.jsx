// src/components/UserSettings.jsx (Placeholder)
import React from 'react';

const UserSettings = ({ user }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Settings Page</h1>
        <p className="text-gray-600 mb-6">
          Welcome to settings, {user?.full_name}! 
          This feature is under development.
        </p>
        <div className="p-4 bg-yellow-50 rounded-lg">
          <p className="text-yellow-800 text-sm">
            Coming soon: Customize your notification preferences, 
            display settings, and privacy options.
          </p>
        </div>
      </div>
    </div>
  );
};

export default UserSettings;