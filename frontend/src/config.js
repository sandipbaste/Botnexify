// src/config.js
const getApiUrl = () => {
  // Priority 1: Environment variable from build
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // Priority 2: Production fallback
  if (window.location.hostname !== 'localhost') {
    return 'https://botrion.onrender.com';
  }
  
  // Priority 3: Local development
  return 'http://localhost:8000';
};

export const API_URL = getApiUrl();
export const isDevelopment = import.meta.env.MODE === 'development';
