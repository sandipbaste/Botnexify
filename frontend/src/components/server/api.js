const API_URL = import.meta.env.VITE_API_URL || 'https://botrion.onrender.com';
// const API_URL = 'http://192.168.1.5:8000';


const getAuthHeaders = () => {
  const token = localStorage.getItem('access_token');
  if (!token) {
    throw new Error('No authentication token found');
  }
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
};

export const api = {
  // Test connection
  async testConnection() {
    try {
      const response = await fetch(`${API_URL}/health`);
      const data = await response.json();
      return { connected: true, message: data.message || 'Connected' };
    } catch (error) {
      return { connected: false, message: error.message };
    }
  },

  // Register user
  async registerUser(websiteId, userInfo) {
    const response = await fetch(`${API_URL}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        website_id: websiteId,
        ...userInfo
      })
    });
    
    if (!response.ok) {
      throw new Error('Registration failed');
    }
    
    return response.json();
  },

  // Get user session
  async getUserSession(websiteId, sessionId) {
    const response = await fetch(`${API_URL}/api/user/${websiteId}/${sessionId}`);
    
    if (!response.ok) {
      throw new Error('Session not found');
    }
    
    return response.json();
  },

  // Chat with website
  async chatWithWebsite(websiteId, question, conversationId = null, userInfo = null) {
    const response = await fetch(`${API_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        website_id: websiteId,
        question: question,
        conversation_id: conversationId,
        user_info: userInfo
      })
    });
    
    if (!response.ok) {
      throw new Error('Chat failed');
    }
    
    return response.json();
  },


  // In api.js, add these methods
async forgotPassword(email) {
  const response = await fetch(`${API_URL}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  
  if (!response.ok) {
    throw new Error('Failed to initiate password reset');
  }
  
  return response.json();
},

async verifyOTP(resetToken, otp) {
  const response = await fetch(`${API_URL}/api/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reset_token: resetToken, otp })
  });
  
  if (!response.ok) {
    throw new Error('Failed to verify OTP');
  }
  
  return response.json();
},

async resetPassword(resetToken, newPassword, confirmPassword) {
  const response = await fetch(`${API_URL}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reset_token: resetToken,
      new_password: newPassword,
      confirm_password: confirmPassword
    })
  });
  
  if (!response.ok) {
    throw new Error('Failed to reset password');
  }
  
  return response.json();
},

  // Upload files with progress support
  async uploadFiles(websiteId, files, onProgress = null) {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      
      files.forEach(file => {
        formData.append('files', file);
      });
      
      const xhr = new XMLHttpRequest();
      
      // Get token for authorization
      const token = localStorage.getItem('access_token');
      
      if (onProgress) {
        xhr.upload.addEventListener('progress', onProgress);
      }
      
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            resolve(data);
          } catch (e) {
            reject(new Error('Invalid response from server'));
          }
        } else {
          reject(new Error(`Upload failed: ${xhr.statusText}`));
        }
      });
      
      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload'));
      });
      
      xhr.open('POST', `${API_URL}/api/upload/${websiteId}`);
      
      // Add authorization header
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }
      
      xhr.send(formData);
    });
  },

  // Get website uploads
  async getWebsiteUploads(websiteId) {
    const response = await fetch(`${API_URL}/api/website/${websiteId}`);
    
    if (!response.ok) {
      throw new Error('Failed to get website uploads');
    }
    
    const data = await response.json();
    
    // Extract upload information from website data
    const uploads = data.uploads_metadata || [];
    const files = [];
    
    // Process upload directory if available
    if (data.upload_files) {
      data.upload_files.forEach(filename => {
        if (!filename.includes('_processed.json') && !filename.includes('_metadata.json')) {
          files.push({
            filename: filename,
            path: `data/${websiteId}/uploads/${filename}`,
            size: 0, // You can add actual size if available
            type: filename.split('.').pop().toUpperCase()
          });
        }
      });
    }
    
    return {
      uploads: uploads,
      files: files
    };
  },

  // Delete uploaded file
  async deleteUploadedFile(websiteId, filename) {
    const response = await fetch(`${API_URL}/api/delete-file/${websiteId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: filename })
    });
    
    if (!response.ok) {
      throw new Error('Failed to delete file');
    }
    
    return response.json();
  },

  // Reindex website
  async reindexWebsite(websiteId) {
    const response = await fetch(`${API_URL}/api/reindex/${websiteId}`, {
      method: 'POST'
    });
    
    if (!response.ok) {
      throw new Error('Reindex failed');
    }
    
    return response.json();
  },

  // List websites
  async listWebsites() {
    const response = await fetch(`${API_URL}/api/websites`);
    
    if (!response.ok) {
      throw new Error('Failed to list websites');
    }
    
    const data = await response.json();
    
    // Enhance website data with upload count
    const enhancedWebsites = data.websites.map(website => {
      if (website.uploads_metadata && Array.isArray(website.uploads_metadata)) {
        website.upload_count = website.uploads_metadata.length;
      } else {
        website.upload_count = 0;
      }
      return website;
    });
    
    return { ...data, websites: enhancedWebsites };
  },

  // Train website with contact email
  async trainWebsite(websiteUrl, websiteName = null, contactEmail = null, generateScript = true) {
    const response = await fetch(`${API_URL}/api/train`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        website_url: websiteUrl,
        website_name: websiteName,
        contact_email: contactEmail,
        generate_script: generateScript
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail?.error || error.detail?.message || 'Training failed to start');
    }
    
    return response.json();
  },

  // Get training status
  async getTrainingStatus(websiteId) {
    const response = await fetch(`${API_URL}/api/training-status/${websiteId}`);
    
    if (!response.ok) {
      throw new Error('Failed to get training status');
    }
    
    return response.json();
  },

  // Generate script
  async generateScript(websiteId) {
    const response = await fetch(`${API_URL}/api/generate-script/${websiteId}`);
    
    if (!response.ok) {
      throw new Error('Failed to generate script');
    }
    
    return response.json();
  },

  // Get website info
  async getWebsiteInfo(websiteId) {
    const response = await fetch(`${API_URL}/api/website/${websiteId}`);
    
    if (!response.ok) {
      throw new Error('Failed to get website info');
    }
    
    return response.json();
  },

  // Get user websites (authenticated)
  async getUserWebsites() {
    const response = await fetch(`${API_URL}/api/user/websites`, {
      headers: getAuthHeaders()
    });
    
    if (!response.ok) {
      throw new Error('Failed to get user websites');
    }
    
    return response.json();
  },


  
async getUserStats() {
    const response = await fetch(`${API_URL}/api/user/stats`, {
      headers: getAuthHeaders()
    });
    
    if (!response.ok) {
      throw new Error('Failed to get user stats');
    }
    
    return response.json();
  },


  // Submit contact form
  async submitContactForm(websiteId, formData) {
    const response = await fetch(`${API_URL}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        website_id: websiteId,
        ...formData
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to submit contact form');
    }
    
    return response.json();
  },

  // End chat session and send report
  async endChatSession(sessionId) {
    const response = await fetch(`${API_URL}/api/chat/end-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to end chat session');
    }
    
    return response.json();
  }
};

export default api;
