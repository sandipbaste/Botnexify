import React, { useState, useEffect } from 'react';
import { 
  FaRobot, FaPlus, FaChartBar, FaFileUpload, FaCode, 
  FaHistory, FaUsers, FaComments, FaDatabase, FaSync,
  FaExternalLinkAlt, FaTrash, FaEdit, FaEye, FaFolderOpen, FaCrown, FaFile,
  FaFilePdf, FaFileWord, FaFileExcel, FaFileImage, FaFileArchive, FaFileAlt,
  FaDownload, FaClock, FaCheckCircle, FaExclamationTriangle
} from 'react-icons/fa';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import TrainingInterface from './TrainingInterface';
import ScriptGenerator from './ScriptGenerator';
import { useNavigate } from 'react-router-dom';
import ChatWidget from './ChatWidget';
import FileManager from './FileManager';
import botimage from '../assets/bot1.png';
import { Link } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'https://botrion.onrender.com';

const UserDashboard = ({ user }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [userStats, setUserStats] = useState(null);
  const [userWebsites, setUserWebsites] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showTrainForm, setShowTrainForm] = useState(false);
  const [showChatWidget, setShowChatWidget] = useState(false);
  const [selectedWebsite, setSelectedWebsite] = useState(null);
  const [selectedWebsiteForFiles, setSelectedWebsiteForFiles] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [websiteUploads, setWebsiteUploads] = useState({});
  const [loadingUploads, setLoadingUploads] = useState(false);
  
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      loadUserData();
      checkSubscription();
    }
  }, [user]);

  useEffect(() => {
    // Load uploads for selected website when in uploads tab
    if (activeTab === 'uploads' && selectedWebsiteForFiles) {
      loadWebsiteUploads(selectedWebsiteForFiles.website_id);
    }
  }, [activeTab, selectedWebsiteForFiles]);

  const checkSubscription = async () => {
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
          localStorage.setItem('user_subscription', JSON.stringify(data.subscription));
        } else {
          const storedSubscription = localStorage.getItem('user_subscription');
          if (!storedSubscription) {
            toast.error('Please subscribe to a plan to continue');
            navigate('/pricing');
          } else {
            setSubscription(JSON.parse(storedSubscription));
          }
        }
      }
    } catch (error) {
      console.error('Subscription check error:', error);
      const storedSubscription = localStorage.getItem('user_subscription');
      if (storedSubscription) {
        setSubscription(JSON.parse(storedSubscription));
      }
    }
  };

  const loadUserData = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      
      // Load user stats
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
      
      // Load user websites
      const websitesResponse = await fetch(`${API_URL}/api/user/websites`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (websitesResponse.ok) {
        const websitesData = await websitesResponse.json();
        if (websitesData.success) {
          setUserWebsites(websitesData.websites || []);
          
          // If there are websites and no selected website for files, select the first one
          if (websitesData.websites?.length > 0 && !selectedWebsiteForFiles) {
            setSelectedWebsiteForFiles(websitesData.websites[0]);
          }
          
          // Load uploads for each website
          websitesData.websites?.forEach(website => {
            loadWebsiteUploads(website.website_id);
          });
        }
      }
    } catch (error) {
      console.error('Error loading user data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  };

  const loadWebsiteUploads = async (websiteId) => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_URL}/api/website-uploads/${websiteId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setWebsiteUploads(prev => ({
            ...prev,
            [websiteId]: {
              uploads: data.uploads || [],
              files: data.files || [],
              count: data.upload_count || 0
            }
          }));
        }
      }
    } catch (error) {
      console.error(`Error loading uploads for ${websiteId}:`, error);
    }
  };

  const handleTrainButtonClick = () => {
    if (!subscription) {
      toast.error('Please subscribe to a plan first');
      navigate('/pricing');
      return;
    }
    
    if (userWebsites.length >= subscription.max_websites) {
      toast.error(`You have reached the website limit (${subscription.max_websites}) for your plan`);
      return;
    }
    
    setShowTrainForm(true);
  };

  const handleWebsiteTrained = (websiteData) => {
    setUserWebsites(prev => [...prev, websiteData]);
    toast.success(`🎉 Chatbot trained for ${websiteData.website_name}!`);
    setShowTrainForm(false);
    setActiveTab('websites');
    setIsProcessing(false);
    loadUserData();
  };

  const handleTestChat = (website) => {
    setSelectedWebsite(website);
    setShowChatWidget(true);
  };

  const handleDeleteWebsite = async (websiteId) => {
    if (!window.confirm('Are you sure you want to delete this website? This action cannot be undone.')) {
      return;
    }

    setIsProcessing(true);
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_URL}/api/website/${websiteId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      
      if (data.success) {
        setUserWebsites(prev => prev.filter(w => w.website_id !== websiteId));
        if (selectedWebsiteForFiles?.website_id === websiteId) {
          setSelectedWebsiteForFiles(null);
        }
        toast.success('Website deleted successfully');
        loadUserData();
      } else {
        throw new Error(data.message || 'Failed to delete website');
      }
    } catch (error) {
      toast.error(error.message || 'Failed to delete website');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOpenFileManager = (website) => {
    setSelectedWebsiteForFiles(website);
    setActiveTab('uploads');
    // Load uploads immediately when opening file manager
    loadWebsiteUploads(website.website_id);
  };

  const handleFileUploadComplete = () => {
    loadUserData();
    if (selectedWebsiteForFiles) {
      loadWebsiteUploads(selectedWebsiteForFiles.website_id);
    }
    toast.success('Files uploaded successfully');
  };

  const handleDeleteFile = async (websiteId, filename) => {
    if (!window.confirm(`Are you sure you want to delete ${filename}?`)) {
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_URL}/api/delete-file/${websiteId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ filename })
      });

      const data = await response.json();
      
      if (data.success) {
        toast.success('File deleted successfully');
        loadWebsiteUploads(websiteId);
        loadUserData();
      } else {
        throw new Error(data.message || 'Failed to delete file');
      }
    } catch (error) {
      toast.error(error.message || 'Failed to delete file');
    }
  };

  const getFileIcon = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    switch (ext) {
      case 'pdf': return <FaFilePdf className="text-red-500" />;
      case 'doc':
      case 'docx': return <FaFileWord className="text-blue-500" />;
      case 'xls':
      case 'xlsx': return <FaFileExcel className="text-green-500" />;
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'svg': return <FaFileImage className="text-purple-500" />;
      case 'zip':
      case 'rar':
      case '7z': return <FaFileArchive className="text-yellow-500" />;
      default: return <FaFileAlt className="text-gray-500" />;
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const StatsCard = ({ icon, title, value, color, subtext }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-2xl p-6 shadow-lg border border-gray-200 hover:shadow-xl transition-shadow ${color}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 mb-2">{title}</p>
          <p className="text-3xl font-bold text-gray-900">{value || 0}</p>
          {subtext && <p className="text-xs text-gray-500 mt-1">{subtext}</p>}
        </div>
        <div className="text-3xl opacity-80">
          {icon}
        </div>
      </div>
    </motion.div>
  );

  const DashboardTabs = () => (
    <div className="border-b border-gray-200 mb-8">
      <nav className="flex space-x-8 overflow-x-auto">
        {[
          { id: 'overview', label: 'Overview', icon: <FaChartBar /> },
          { id: 'websites', label: 'My Websites', icon: <FaRobot /> },
          { id: 'train', label: 'Train New', icon: <FaPlus /> },
          { id: 'uploads', label: 'Uploads', icon: <FaFileUpload /> },
          { id: 'generate', label: 'Generate Script', icon: <FaCode /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              if (tab.id === 'uploads' && !selectedWebsiteForFiles && userWebsites.length > 0) {
                setSelectedWebsiteForFiles(userWebsites[0]);
              }
            }}
            className={`py-4 px-1 flex items-center space-x-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );

  const WebsiteCard = ({ website, isRecent = false }) => {
    const uploads = websiteUploads[website.website_id] || { files: [], count: 0 };
    
    return (
      <div className={`border border-gray-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-md transition-all duration-200 ${isRecent ? 'bg-white' : ''}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <FaRobot className="text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{website.website_name || 'Unnamed Website'}</h3>
              <p className="text-sm text-gray-500">
                ID: {website.website_id ? website.website_id.substring(0, 8) + '...' : 'N/A'}
              </p>
            </div>
          </div>
          <span className={`px-3 py-1 text-xs font-medium rounded-full ${
            website.status === 'active' ? 'bg-green-100 text-green-800' :
            website.status === 'training' ? 'bg-yellow-100 text-yellow-800' :
            website.status === 'completed' ? 'bg-green-100 text-green-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {website.status || 'active'}
          </span>
        </div>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-blue-50 p-3 rounded-lg">
              <p className="text-gray-600">Data Points</p>
              <p className="font-semibold text-blue-700">
                {website.data_points || website.stats?.data_points || '0'}
              </p>
            </div>
            <div className="bg-green-50 p-3 rounded-lg">
              <p className="text-gray-600">Files</p>
              <p className="font-semibold text-green-700">
                {uploads.count || website.upload_count || website.files_count || '0'}
              </p>
            </div>
          </div>
          
          <div className="text-sm text-gray-600">
            <p className="truncate">{website.website_url || 'No URL'}</p>
            <p className="text-xs text-gray-500 mt-1">
              Created: {website.created_at ? formatDate(website.created_at) : 'N/A'}
            </p>
          </div>
          
          <div className="flex space-x-2">
            <button
              onClick={() => handleTestChat(website)}
              className="flex-1 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2"
            >
              <FaEye />
              <span>Test Chat</span>
            </button>
            <button
              onClick={() => handleOpenFileManager(website)}
              className="px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center"
              title="Manage Files"
            >
              <FaFolderOpen />
            </button>
            <button
              onClick={() => handleDeleteWebsite(website.website_id)}
              className="px-3 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
              title="Delete"
            >
              <FaTrash />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const FileList = ({ websiteId }) => {
    const uploads = websiteUploads[websiteId];
    const files = uploads?.files || uploads?.uploads || [];
    
    if (!files.length) {
      return (
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FaFileUpload className="text-gray-400 text-xl" />
          </div>
          <p className="text-gray-600">No files uploaded yet</p>
          <p className="text-sm text-gray-500 mt-2">
            Upload PDF, DOC, TXT, or other documents to enhance your chatbot's knowledge
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {files.map((file, index) => (
          <div
            key={index}
            className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center space-x-3 flex-1">
              <div className="text-xl">
                {getFileIcon(file.filename || file.saved_filename)}
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900">
                  {file.original_filename || file.filename || file.saved_filename}
                </p>
                <div className="flex items-center space-x-4 text-xs text-gray-500 mt-1">
                  <span className="flex items-center">
                    <FaFile className="mr-1" />
                    {formatFileSize(file.size || 0)}
                  </span>
                  <span className="flex items-center">
                    <FaClock className="mr-1" />
                    {formatDate(file.uploaded_at || file.modified || file.created_at)}
                  </span>
                  {file.processed && (
                    <span className="flex items-center text-green-600">
                      <FaCheckCircle className="mr-1" />
                      Processed
                    </span>
                  )}
                  {file.processed === false && (
                    <span className="flex items-center text-yellow-600">
                      <FaExclamationTriangle className="mr-1" />
                      Pending
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {file.saved_filename && (
                <Link
                  to={`${API_URL}/data/${websiteId}/uploads/${file.saved_filename}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded-lg transition-colors"
                  title="Download"
                >
                  <FaDownload />
                </Link>
              )}
              <button
                onClick={() => handleDeleteFile(websiteId, file.saved_filename || file.filename)}
                className="p-2 text-red-600 hover:text-red-800 hover:bg-red-100 rounded-lg transition-colors"
                title="Delete"
              >
                <FaTrash />
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="relative mb-12">
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
                  <FaRobot className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          </div>
          
          <h2 className="text-2xl font-semibold text-gray-800 mb-3">Botrion</h2>
          <p className="text-gray-600 mb-8">Loading your dashboard...</p>
          
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
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-gray-600 mt-1">
                Welcome back, <span className="font-semibold text-blue-600">{user?.full_name || 'User'}</span>!
              </p>
            </div>
            <div className="flex items-center space-x-4">
              {subscription && (
                <div className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white text-sm font-medium rounded-full flex items-center">
                  <FaCrown className="mr-2" />
                  <span>{subscription.plan_name || 'Premium'}</span>
                  {subscription.days_remaining > 0 && (
                    <span className="ml-2 text-green-100">
                      ({subscription.days_remaining} days left)
                    </span>
                  )}
                </div>
              )}
              <button
                onClick={handleTrainButtonClick}
                disabled={isProcessing}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 flex items-center space-x-2 shadow-lg disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isProcessing ? (
                  <>
                    <FaSync className="animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <FaPlus />
                    <span>Train New Chatbot</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <DashboardTabs />
        
        {activeTab === 'overview' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <StatsCard
                icon={<FaRobot />}
                title="Total Websites"
                value={userStats?.total_websites || userWebsites.length}
                color="hover:border-blue-300"
              />
              <StatsCard
                icon={<FaComments />}
                title="Chat Messages"
                value={userStats?.chat_messages || 0}
                color="hover:border-green-300"
              />
              <StatsCard
                icon={<FaUsers />}
                title="Contact Forms"
                value={userStats?.contact_forms || 0}
                color="hover:border-purple-300"
              />
              <StatsCard
                icon={<FaDatabase />}
                title="Uploaded Files"
                value={userStats?.files || Object.values(websiteUploads).reduce((acc, curr) => acc + (curr.count || 0), 0)}
                color="hover:border-yellow-300"
              />
            </div>
            
            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-200">
                <div className="flex items-center space-x-4 mb-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                    <FaPlus className="text-blue-600 text-xl" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Train Chatbot</h3>
                    <p className="text-sm text-gray-600">Create a new AI chatbot</p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab('train')}
                  className="w-full py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Train New
                </button>
              </div>
              
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl p-6 border border-green-200">
                <div className="flex items-center space-x-4 mb-4">
                  <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                    <FaFileUpload className="text-green-600 text-xl" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Upload Files</h3>
                    <p className="text-sm text-gray-600">Add documents to chatbots</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setActiveTab('uploads');
                    if (userWebsites.length > 0) {
                      setSelectedWebsiteForFiles(userWebsites[0]);
                    }
                  }}
                  className="w-full py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors"
                >
                  Upload Files
                </button>
              </div>
              
              <div className="bg-gradient-to-r from-purple-50 to-violet-50 rounded-2xl p-6 border border-purple-200">
                <div className="flex items-center space-x-4 mb-4">
                  <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                    <FaCode className="text-purple-600 text-xl" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Generate Script</h3>
                    <p className="text-sm text-gray-600">Get embed code for website</p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab('generate')}
                  className="w-full py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition-colors"
                >
                  Generate Code
                </button>
              </div>
            </div>
            
            {/* Recent Websites Section */}
            <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900 flex items-center">
                  <FaRobot className="mr-2 text-blue-600" />
                  Recent Websites
                </h2>
                {userWebsites.length > 0 && (
                  <button
                    onClick={() => setActiveTab('websites')}
                    className="text-blue-600 hover:text-blue-800 font-medium flex items-center"
                  >
                    View All ({userWebsites.length})
                    <FaExternalLinkAlt className="ml-2 text-sm" />
                  </button>
                )}
              </div>
              
              {userWebsites.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {userWebsites.slice(0, 3).map(website => (
                    <WebsiteCard key={website.website_id} website={website} isRecent={true} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FaRobot className="text-gray-400 text-2xl" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No websites yet</h3>
                  <p className="text-gray-600 mb-6">Get started by training your first chatbot</p>
                  <button
                    onClick={() => setShowTrainForm(true)}
                    className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200"
                  >
                    Train Your First Chatbot
                  </button>
                </div>
              )}
            </div>
            
            {/* Recent Uploads Section */}
            {userWebsites.length > 0 && (
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-gray-900 flex items-center">
                    <FaFileUpload className="mr-2 text-green-600" />
                    Recent Uploads
                  </h2>
                  <button
                    onClick={() => setActiveTab('uploads')}
                    className="text-green-600 hover:text-green-800 font-medium flex items-center"
                  >
                    View All Uploads
                    <FaExternalLinkAlt className="ml-2 text-sm" />
                  </button>
                </div>
                
                {Object.entries(websiteUploads).some(([_, data]) => data.files?.length > 0) ? (
                  <div className="space-y-4">
                    {Object.entries(websiteUploads).map(([websiteId, data]) => {
                      const website = userWebsites.find(w => w.website_id === websiteId);
                      if (!website || !data.files?.length) return null;
                      
                      return (
                        <div key={websiteId} className="border-b border-gray-100 last:border-0 pb-4 last:pb-0">
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="font-medium text-gray-900">
                              {website.website_name || 'Unnamed Website'}
                            </h3>
                            <span className="text-sm text-gray-500">
                              {data.files.length} file{data.files.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="space-y-2">
                            {data.files.slice(0, 3).map((file, idx) => (
                              <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                                <div className="flex items-center space-x-3">
                                  <div className="text-lg">
                                    {getFileIcon(file.filename || file.saved_filename)}
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-gray-900">
                                      {file.original_filename || file.filename || file.saved_filename}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                      {formatFileSize(file.size || 0)} • {formatDate(file.uploaded_at || file.modified)}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <FaFileUpload className="text-gray-400 text-xl" />
                    </div>
                    <p className="text-gray-600">No files uploaded yet</p>
                    <button
                      onClick={() => {
                        setActiveTab('uploads');
                        if (userWebsites.length > 0) {
                          setSelectedWebsiteForFiles(userWebsites[0]);
                        }
                      }}
                      className="mt-4 px-4 py-2 text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                    >
                      Upload Your First File
                    </button>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
        
        {activeTab === 'websites' && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 flex items-center">
                <FaRobot className="mr-2 text-blue-600" />
                My Websites
              </h2>
              <button
                onClick={() => setShowTrainForm(true)}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 flex items-center space-x-2"
                disabled={isProcessing}
              >
                <FaPlus />
                <span>New Website</span>
              </button>
            </div>
            
            {userWebsites.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {userWebsites.map(website => (
                  <WebsiteCard key={website.website_id} website={website} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FaRobot className="text-gray-400 text-2xl" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No websites yet</h3>
                <p className="text-gray-600 mb-6">Get started by training your first chatbot</p>
                <button
                  onClick={() => setShowTrainForm(true)}
                  className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200"
                >
                  Train Your First Chatbot
                </button>
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'train' && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <TrainingInterface 
              onWebsiteTrained={handleWebsiteTrained}
              onTrainingStart={() => setIsProcessing(true)}
              onTrainingComplete={() => setIsProcessing(false)}
              isProcessing={isProcessing}
            />
          </div>
        )}
        
        {activeTab === 'uploads' && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 flex items-center">
                <FaFileUpload className="mr-2 text-green-600" />
                File Uploads
              </h2>
              {userWebsites.length > 0 && (
                <div className="flex items-center space-x-4">
                  <span className="text-gray-600">Select website:</span>
                  <select
                    value={selectedWebsiteForFiles?.website_id || ''}
                    onChange={(e) => {
                      const website = userWebsites.find(w => w.website_id === e.target.value);
                      setSelectedWebsiteForFiles(website);
                      if (website) {
                        loadWebsiteUploads(website.website_id);
                      }
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select a website...</option>
                    {userWebsites.map(website => (
                      <option key={website.website_id} value={website.website_id}>
                        {website.website_name} ({websiteUploads[website.website_id]?.count || 0} files)
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            
            {selectedWebsiteForFiles ? (
              <div className="space-y-6">
                <FileManager 
                  website={selectedWebsiteForFiles}
                  onUploadComplete={handleFileUploadComplete}
                />
                
                <div className="mt-8">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <FaFile className="mr-2" />
                    Uploaded Files
                  </h3>
                  <FileList websiteId={selectedWebsiteForFiles.website_id} />
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FaFileUpload className="text-gray-400 text-2xl" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Select a Website</h3>
                <p className="text-gray-600 mb-6">Choose a website to manage its files</p>
                {userWebsites.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {userWebsites.slice(0, 3).map(website => (
                      <button
                        key={website.website_id}
                        onClick={() => {
                          setSelectedWebsiteForFiles(website);
                          loadWebsiteUploads(website.website_id);
                        }}
                        className="border border-gray-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-md transition-all duration-200 text-left"
                      >
                        <div className="flex items-center space-x-3 mb-4">
                          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                            <FaRobot className="text-blue-600" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900">{website.website_name}</h3>
                            <p className="text-sm text-gray-500">
                              {websiteUploads[website.website_id]?.count || 0} files
                            </p>
                          </div>
                        </div>
                        <span className="text-blue-600 font-medium">Manage Files →</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-600">You need to train a chatbot first to upload files</p>
                )}
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'generate' && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <ScriptGenerator 
              websites={userWebsites}
              onTestChat={handleTestChat}
              isProcessing={isProcessing}
            />
          </div>
        )}
      </div>
      
      {/* Training Modal */}
{showTrainForm && (
  <div className="fixed inset-0 bg-black/20 backdrop-blur-xs flex items-center justify-center p-4 z-50">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <img className='w-25' src={botimage} alt="Botrion" />
          <button
            onClick={() => {
              if (!isProcessing) {
                setShowTrainForm(false);
              }
            }}
            className="text-gray-400 hover:text-gray-600 text-2xl disabled:opacity-50"
            disabled={isProcessing}
          >
            &times;
          </button>
        </div>
        
        {/* TrainingInterface - it now shows its own progress popup when processing */}
        <TrainingInterface 
          onWebsiteTrained={handleWebsiteTrained}
          onTrainingStart={() => setIsProcessing(true)}
          onTrainingComplete={() => {
            setIsProcessing(false);
            setShowTrainForm(false);
          }}
          isProcessing={isProcessing}
        />
      </div>
    </div>
  </div>
)}
      
      {/* Chat Widget */}
      {showChatWidget && selectedWebsite && (
        <ChatWidget 
          websiteId={selectedWebsite.website_id}
          apiUrl={API_URL}
          onClose={() => setShowChatWidget(false)}
        />
      )}
    </div>
  );
};

export default UserDashboard;
