import React, { useState, useEffect } from 'react';
import { 
  FaRobot, FaPlus, FaChartBar, FaFileUpload, FaCode, 
  FaHistory, FaUsers, FaComments, FaDatabase, FaSync,
  FaExternalLinkAlt, FaTrash, FaEdit, FaEye, FaFolderOpen, FaCrown, FaFile,
  FaFilePdf, FaFileWord, FaFileExcel, FaFileImage, FaFileArchive, FaFileAlt,
  FaDownload, FaClock, FaCheckCircle, FaExclamationTriangle, FaBars,
  FaTimes, FaChevronDown, FaChevronUp, FaHome, FaGlobe, FaUpload, FaCog
} from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [expandedWebsiteId, setExpandedWebsiteId] = useState(null);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
  
  const navigate = useNavigate();

  // Check if device is mobile
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isTablet, setIsTablet] = useState(window.innerWidth >= 768 && window.innerWidth < 1024);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
      setIsTablet(window.innerWidth >= 768 && window.innerWidth < 1024);
      if (window.innerWidth >= 768) {
        setIsMobileMenuOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (user) {
      loadUserData();
      checkSubscription();
    }
  }, [user]);

  useEffect(() => {
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
          
          if (websitesData.websites?.length > 0 && !selectedWebsiteForFiles) {
            setSelectedWebsiteForFiles(websitesData.websites[0]);
          }
          
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
    if (isMobile) {
      setIsMobileMenuOpen(false);
    }
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

  const toggleWebsiteExpand = (websiteId) => {
    setExpandedWebsiteId(expandedWebsiteId === websiteId ? null : websiteId);
  };

  const StatsCard = ({ icon, title, value, color, subtext }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-xl md:rounded-2xl p-4 md:p-6 shadow-lg border border-gray-200 hover:shadow-xl transition-shadow ${color}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs md:text-sm text-gray-600 mb-1 md:mb-2">{title}</p>
          <p className="text-xl md:text-3xl font-bold text-gray-900">{value || 0}</p>
          {subtext && <p className="text-xs text-gray-500 mt-1">{subtext}</p>}
        </div>
        <div className="text-xl md:text-3xl opacity-80">
          {icon}
        </div>
      </div>
    </motion.div>
  );

  const MobileTabBar = () => (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-40 md:hidden">
      <div className="flex justify-around items-center h-16">
        {[
          { id: 'overview', icon: <FaHome className="text-xl" />, label: 'Home' },
          { id: 'websites', icon: <FaGlobe className="text-xl" />, label: 'Sites' },
          { id: 'train', icon: <FaPlus className="text-xl" />, label: 'Train' },
          { id: 'uploads', icon: <FaUpload className="text-xl" />, label: 'Files' },
          { id: 'generate', icon: <FaCode className="text-xl" />, label: 'Code' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              if (tab.id === 'uploads' && !selectedWebsiteForFiles && userWebsites.length > 0) {
                setSelectedWebsiteForFiles(userWebsites[0]);
              }
            }}
            className={`flex flex-col items-center justify-center flex-1 h-full ${
              activeTab === tab.id ? 'text-blue-600' : 'text-gray-500'
            }`}
          >
            {tab.icon}
            <span className="text-xs mt-1">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const MobileHeader = () => (
    <div className="md:hidden bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-30">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <img src={botimage} alt="Botnexify" className="h-8 w-auto" />
          <div>
            <h1 className="text-lg font-bold text-gray-900">Dashboard</h1>
            <p className="text-xs text-gray-600 truncate max-w-[150px]">
              Welcome, {user?.full_name?.split(' ')[0] || 'User'}!
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 rounded-lg hover:bg-gray-100"
        >
          {isMobileMenuOpen ? <FaTimes size={20} /> : <FaBars size={20} />}
        </button>
      </div>

      {/* Mobile Menu Dropdown */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="absolute top-full left-0 right-0 bg-white border-b border-gray-200 shadow-lg px-4 py-3 space-y-2"
          >
            {subscription && (
              <div className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white text-sm font-medium rounded-lg flex items-center">
                <FaCrown className="mr-2" />
                <span>{subscription.plan_name || 'Premium'}</span>
                {subscription.days_remaining > 0 && (
                  <span className="ml-2 text-green-100 text-xs">
                    ({subscription.days_remaining}d)
                  </span>
                )}
              </div>
            )}
            <button
              onClick={handleTrainButtonClick}
              disabled={isProcessing}
              className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-70"
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  const WebsiteCard = ({ website }) => {
    const uploads = websiteUploads[website.website_id] || { files: [], count: 0 };
    const isExpanded = expandedWebsiteId === website.website_id;
    
    return (
      <div className="border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-md transition-all duration-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 flex-1">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <FaRobot className="text-blue-600 text-lg md:text-xl" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 truncate">
                {website.website_name || 'Unnamed Website'}
              </h3>
              <p className="text-xs text-gray-500 truncate">
                {website.website_url || 'No URL'}
              </p>
            </div>
          </div>
          <button
            onClick={() => toggleWebsiteExpand(website.website_id)}
            className="p-2 hover:bg-gray-100 rounded-lg ml-2"
          >
            {isExpanded ? <FaChevronUp /> : <FaChevronDown />}
          </button>
        </div>
        
        <div className="mt-3 flex flex-wrap gap-2">
          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
            website.status === 'active' ? 'bg-green-100 text-green-800' :
            website.status === 'training' ? 'bg-yellow-100 text-yellow-800' :
            website.status === 'completed' ? 'bg-green-100 text-green-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {website.status || 'active'}
          </span>
          <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full">
            {uploads.count || website.upload_count || website.files_count || '0'} files
          </span>
        </div>
        
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 space-y-3"
            >
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-blue-50 p-2 rounded-lg">
                  <p className="text-gray-600 text-xs">Data Points</p>
                  <p className="font-semibold text-blue-700 text-sm">
                    {website.data_points || website.stats?.data_points || '0'}
                  </p>
                </div>
                <div className="bg-green-50 p-2 rounded-lg">
                  <p className="text-gray-600 text-xs">Created</p>
                  <p className="font-semibold text-green-700 text-xs">
                    {website.created_at ? new Date(website.created_at).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
              </div>
              
              <div className="flex flex-col space-y-2">
                <button
                  onClick={() => handleTestChat(website)}
                  className="w-full px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2"
                >
                  <FaEye />
                  <span>Test Chat</span>
                </button>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleOpenFileManager(website)}
                    className="flex-1 px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center space-x-2"
                  >
                    <FaFolderOpen />
                    <span>Files</span>
                  </button>
                  <button
                    onClick={() => handleDeleteWebsite(website.website_id)}
                    className="flex-1 px-3 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center space-x-2"
                  >
                    <FaTrash />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const FileList = ({ websiteId }) => {
    const uploads = websiteUploads[websiteId];
    const files = uploads?.files || uploads?.uploads || [];
    
    if (!files.length) {
      return (
        <div className="text-center py-6 md:py-8">
          <div className="w-12 h-12 md:w-16 md:h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 md:mb-4">
            <FaFileUpload className="text-gray-400 text-lg md:text-xl" />
          </div>
          <p className="text-sm md:text-base text-gray-600">No files uploaded yet</p>
          <p className="text-xs md:text-sm text-gray-500 mt-2 px-4">
            Upload PDF, DOC, TXT, or other documents
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-2 md:space-y-3">
        {files.map((file, index) => (
          <div
            key={index}
            className="flex flex-col sm:flex-row sm:items-center justify-between p-3 md:p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors gap-3"
          >
            <div className="flex items-center space-x-3 flex-1 min-w-0">
              <div className="text-lg md:text-xl flex-shrink-0">
                {getFileIcon(file.filename || file.saved_filename)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 text-sm md:text-base truncate">
                  {file.original_filename || file.filename || file.saved_filename}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mt-1">
                  <span className="flex items-center">
                    <FaFile className="mr-1" />
                    {formatFileSize(file.size || 0)}
                  </span>
                  <span className="flex items-center">
                    <FaClock className="mr-1" />
                    {new Date(file.uploaded_at || file.modified || file.created_at).toLocaleDateString()}
                  </span>
                  {file.processed && (
                    <span className="flex items-center text-green-600">
                      <FaCheckCircle className="mr-1" />
                      Processed
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2 ml-11 sm:ml-0">
              {file.saved_filename && (
                <Link
                  to={`${API_URL}/data/${websiteId}/uploads/${file.saved_filename}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 md:p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded-lg transition-colors"
                  title="Download"
                >
                  <FaDownload size={14} />
                </Link>
              )}
              <button
                onClick={() => handleDeleteFile(websiteId, file.saved_filename || file.filename)}
                className="p-1.5 md:p-2 text-red-600 hover:text-red-800 hover:bg-red-100 rounded-lg transition-colors"
                title="Delete"
              >
                <FaTrash size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="relative mb-8 md:mb-12">
            <div className="relative w-16 h-16 md:w-24 md:h-24 mx-auto">
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
                <div className="w-8 h-8 md:w-12 md:h-12 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center shadow-lg">
                  <FaRobot className="w-4 h-4 md:w-6 md:h-6 text-white" />
                </div>
              </div>
            </div>
          </div>
          
          <h2 className="text-xl md:text-2xl font-semibold text-gray-800 mb-2 md:mb-3">Botnexify</h2>
          <p className="text-sm md:text-base text-gray-600 mb-6 md:mb-8">Loading your dashboard...</p>
          
          <div className="flex justify-center gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 md:w-2 md:h-2 bg-blue-400 rounded-full animate-bounce"
                style={{ animationDelay: `${i * 0.1}s` }}
              ></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 pb-16 md:pb-0">
      {/* Mobile Header */}
      <MobileHeader />

      {/* Desktop Header */}
      <div className="hidden md:block bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-6">
          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-sm lg:text-base text-gray-600 mt-1">
                Welcome back, <span className="font-semibold text-blue-600">{user?.full_name || 'User'}</span>!
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              {subscription && (
                <div className="px-3 py-1.5 lg:px-4 lg:py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white text-xs lg:text-sm font-medium rounded-full flex items-center">
                  <FaCrown className="mr-1.5 lg:mr-2" />
                  <span>{subscription.plan_name || 'Premium'}</span>
                  {subscription.days_remaining > 0 && (
                    <span className="ml-1.5 lg:ml-2 text-green-100 text-xs">
                      ({subscription.days_remaining}d)
                    </span>
                  )}
                </div>
              )}
              <button
                onClick={handleTrainButtonClick}
                disabled={isProcessing}
                className="px-4 py-2 lg:px-6 lg:py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm lg:text-base font-medium rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 flex items-center space-x-2 shadow-lg disabled:opacity-70 disabled:cursor-not-allowed"
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

      {/* Desktop Tabs */}
      <div className="hidden md:block max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        <div className="border-b border-gray-200 mb-6 lg:mb-8 overflow-x-auto">
          <nav className="flex space-x-6 lg:space-x-8 min-w-max">
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
                className={`py-3 lg:py-4 px-1 flex items-center space-x-2 text-xs lg:text-sm font-medium border-b-2 transition-colors ${
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

        {/* Content Area */}
        <div className="bg-white rounded-xl lg:rounded-2xl shadow-lg p-4 lg:p-6">
          {activeTab === 'overview' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              {/* Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-6 lg:mb-8">
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6 mb-6 lg:mb-8">
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl lg:rounded-2xl p-4 lg:p-6 border border-blue-200">
                  <div className="flex items-center space-x-3 lg:space-x-4 mb-3 lg:mb-4">
                    <div className="w-10 h-10 lg:w-12 lg:h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                      <FaPlus className="text-blue-600 text-lg lg:text-xl" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 text-sm lg:text-base">Train Chatbot</h3>
                      <p className="text-xs lg:text-sm text-gray-600">Create a new AI chatbot</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveTab('train')}
                    className="w-full py-2 bg-blue-600 text-white text-sm lg:text-base font-medium rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Train New
                  </button>
                </div>
                
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl lg:rounded-2xl p-4 lg:p-6 border border-green-200">
                  <div className="flex items-center space-x-3 lg:space-x-4 mb-3 lg:mb-4">
                    <div className="w-10 h-10 lg:w-12 lg:h-12 bg-green-100 rounded-xl flex items-center justify-center">
                      <FaFileUpload className="text-green-600 text-lg lg:text-xl" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 text-sm lg:text-base">Upload Files</h3>
                      <p className="text-xs lg:text-sm text-gray-600">Add documents to chatbots</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setActiveTab('uploads');
                      if (userWebsites.length > 0) {
                        setSelectedWebsiteForFiles(userWebsites[0]);
                      }
                    }}
                    className="w-full py-2 bg-green-600 text-white text-sm lg:text-base font-medium rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Upload Files
                  </button>
                </div>
                
                <div className="bg-gradient-to-r from-purple-50 to-violet-50 rounded-xl lg:rounded-2xl p-4 lg:p-6 border border-purple-200">
                  <div className="flex items-center space-x-3 lg:space-x-4 mb-3 lg:mb-4">
                    <div className="w-10 h-10 lg:w-12 lg:h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                      <FaCode className="text-purple-600 text-lg lg:text-xl" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 text-sm lg:text-base">Generate Script</h3>
                      <p className="text-xs lg:text-sm text-gray-600">Get embed code for website</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveTab('generate')}
                    className="w-full py-2 bg-purple-600 text-white text-sm lg:text-base font-medium rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    Generate Code
                  </button>
                </div>
              </div>
              
              {/* Recent Websites */}
              <div className="mb-6 lg:mb-8">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg lg:text-xl font-bold text-gray-900 flex items-center">
                    <FaRobot className="mr-2 text-blue-600" />
                    Recent Websites
                  </h2>
                  {userWebsites.length > 0 && (
                    <button
                      onClick={() => setActiveTab('websites')}
                      className="text-sm lg:text-base text-blue-600 hover:text-blue-800 font-medium flex items-center"
                    >
                      View All ({userWebsites.length})
                      <FaExternalLinkAlt className="ml-2 text-xs" />
                    </button>
                  )}
                </div>
                
                {userWebsites.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {userWebsites.slice(0, 3).map(website => (
                      <WebsiteCard key={website.website_id} website={website} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 lg:py-12">
                    <div className="w-16 h-16 lg:w-20 lg:h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <FaRobot className="text-gray-400 text-xl lg:text-2xl" />
                    </div>
                    <h3 className="text-base lg:text-lg font-medium text-gray-900 mb-2">No websites yet</h3>
                    <p className="text-sm lg:text-base text-gray-600 mb-6">Get started by training your first chatbot</p>
                    <button
                      onClick={() => setShowTrainForm(true)}
                      className="px-4 py-2 lg:px-6 lg:py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm lg:text-base font-medium rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200"
                    >
                      Train Your First Chatbot
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
          
          {activeTab === 'websites' && (
            <>
              <div className="flex justify-between items-center mb-4 lg:mb-6">
                <h2 className="text-lg lg:text-xl font-bold text-gray-900 flex items-center">
                  <FaRobot className="mr-2 text-blue-600" />
                  My Websites
                </h2>
                <button
                  onClick={() => setShowTrainForm(true)}
                  className="px-3 py-1.5 lg:px-4 lg:py-2 bg-blue-600 text-white text-sm lg:text-base font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
                >
                  <FaPlus />
                  <span>New</span>
                </button>
              </div>
              
              {userWebsites.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {userWebsites.map(website => (
                    <WebsiteCard key={website.website_id} website={website} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 lg:py-12">
                  <div className="w-16 h-16 lg:w-20 lg:h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FaRobot className="text-gray-400 text-xl lg:text-2xl" />
                  </div>
                  <p className="text-sm lg:text-base text-gray-600">No websites yet. Train your first chatbot!</p>
                </div>
              )}
            </>
          )}
          
          {activeTab === 'train' && (
            <TrainingInterface 
              onWebsiteTrained={handleWebsiteTrained}
              onTrainingStart={() => setIsProcessing(true)}
              onTrainingComplete={() => setIsProcessing(false)}
              isProcessing={isProcessing}
            />
          )}
          
          {activeTab === 'uploads' && (
            <>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 lg:mb-6">
                <h2 className="text-lg lg:text-xl font-bold text-gray-900 flex items-center">
                  <FaFileUpload className="mr-2 text-green-600" />
                  File Uploads
                </h2>
                {userWebsites.length > 0 && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
                    <span className="text-xs lg:text-sm text-gray-600">Select website:</span>
                    <select
                      value={selectedWebsiteForFiles?.website_id || ''}
                      onChange={(e) => {
                        const website = userWebsites.find(w => w.website_id === e.target.value);
                        setSelectedWebsiteForFiles(website);
                        if (website) {
                          loadWebsiteUploads(website.website_id);
                        }
                      }}
                      className="w-full sm:w-auto px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                <div className="space-y-4 lg:space-y-6">
                  <FileManager 
                    website={selectedWebsiteForFiles}
                    onUploadComplete={handleFileUploadComplete}
                  />
                  
                  <div className="mt-6 lg:mt-8">
                    <h3 className="text-base lg:text-lg font-semibold text-gray-900 mb-3 lg:mb-4 flex items-center">
                      <FaFile className="mr-2" />
                      Uploaded Files
                    </h3>
                    <FileList websiteId={selectedWebsiteForFiles.website_id} />
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 lg:py-12">
                  <div className="w-16 h-16 lg:w-20 lg:h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FaFileUpload className="text-gray-400 text-xl lg:text-2xl" />
                  </div>
                  <h3 className="text-base lg:text-lg font-medium text-gray-900 mb-2">Select a Website</h3>
                  <p className="text-sm lg:text-base text-gray-600 mb-6">Choose a website to manage its files</p>
                  {userWebsites.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {userWebsites.slice(0, 3).map(website => (
                        <button
                          key={website.website_id}
                          onClick={() => {
                            setSelectedWebsiteForFiles(website);
                            loadWebsiteUploads(website.website_id);
                          }}
                          className="border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-md transition-all duration-200 text-left"
                        >
                          <div className="flex items-center space-x-3 mb-3">
                            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                              <FaRobot className="text-blue-600" />
                            </div>
                            <div>
                              <h3 className="font-semibold text-gray-900 text-sm">{website.website_name}</h3>
                              <p className="text-xs text-gray-500">
                                {websiteUploads[website.website_id]?.count || 0} files
                              </p>
                            </div>
                          </div>
                          <span className="text-blue-600 text-sm font-medium">Manage Files →</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm lg:text-base text-gray-600">You need to train a chatbot first</p>
                  )}
                </div>
              )}
            </>
          )}
          
          {activeTab === 'generate' && (
            <ScriptGenerator 
              websites={userWebsites}
              onTestChat={handleTestChat}
              isProcessing={isProcessing}
            />
          )}
        </div>
      </div>

      {/* Mobile Content */}
      <div className="md:hidden px-4 py-4 pb-20">
        {activeTab === 'overview' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <StatsCard
                icon={<FaRobot />}
                title="Websites"
                value={userStats?.total_websites || userWebsites.length}
                color="hover:border-blue-300"
              />
              <StatsCard
                icon={<FaComments />}
                title="Messages"
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
                title="Files"
                value={userStats?.files || Object.values(websiteUploads).reduce((acc, curr) => acc + (curr.count || 0), 0)}
                color="hover:border-yellow-300"
              />
            </div>
            
            {/* Quick Actions */}
            <div className="space-y-3 mb-4">
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <FaPlus className="text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">Train Chatbot</h3>
                      <p className="text-xs text-gray-600">Create new AI chatbot</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveTab('train')}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
                  >
                    Train
                  </button>
                </div>
              </div>
              
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <FaFileUpload className="text-green-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">Upload Files</h3>
                      <p className="text-xs text-gray-600">Add documents</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setActiveTab('uploads');
                      if (userWebsites.length > 0) {
                        setSelectedWebsiteForFiles(userWebsites[0]);
                      }
                    }}
                    className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700"
                  >
                    Upload
                  </button>
                </div>
              </div>
              
              <div className="bg-gradient-to-r from-purple-50 to-violet-50 rounded-xl p-4 border border-purple-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                      <FaCode className="text-purple-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">Get Script</h3>
                      <p className="text-xs text-gray-600">Embed code</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveTab('generate')}
                    className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700"
                  >
                    Generate
                  </button>
                </div>
              </div>
            </div>
            
            {/* Recent Websites */}
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex justify-between items-center mb-3">
                <h2 className="font-semibold text-gray-900 flex items-center">
                  <FaRobot className="mr-2 text-blue-600" />
                  Recent Websites
                </h2>
                {userWebsites.length > 0 && (
                  <button
                    onClick={() => setActiveTab('websites')}
                    className="text-blue-600 text-sm"
                  >
                    View All ({userWebsites.length})
                  </button>
                )}
              </div>
              
              {userWebsites.length > 0 ? (
                <div className="space-y-3">
                  {userWebsites.slice(0, 3).map(website => (
                    <WebsiteCard key={website.website_id} website={website} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-2">
                    <FaRobot className="text-gray-400" />
                  </div>
                  <p className="text-sm text-gray-600">No websites yet</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
        
        {activeTab === 'websites' && (
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-semibold text-gray-900 flex items-center">
                <FaRobot className="mr-2 text-blue-600" />
                My Websites
              </h2>
              <button
                onClick={() => setShowTrainForm(true)}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 flex items-center space-x-1"
              >
                <FaPlus size={12} />
                <span>New</span>
              </button>
            </div>
            
            {userWebsites.length > 0 ? (
              <div className="space-y-3">
                {userWebsites.map(website => (
                  <WebsiteCard key={website.website_id} website={website} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-2">
                  <FaRobot className="text-gray-400" />
                </div>
                <p className="text-sm text-gray-600">No websites yet</p>
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'train' && (
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <TrainingInterface 
              onWebsiteTrained={handleWebsiteTrained}
              onTrainingStart={() => setIsProcessing(true)}
              onTrainingComplete={() => setIsProcessing(false)}
              isProcessing={isProcessing}
            />
          </div>
        )}
        
        {activeTab === 'uploads' && (
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="mb-4">
              <h2 className="font-semibold text-gray-900 flex items-center mb-3">
                <FaFileUpload className="mr-2 text-green-600" />
                File Uploads
              </h2>
              
              {userWebsites.length > 0 && (
                <div className="mb-4">
                  <label className="block text-xs text-gray-600 mb-1">Select Website</label>
                  <select
                    value={selectedWebsiteForFiles?.website_id || ''}
                    onChange={(e) => {
                      const website = userWebsites.find(w => w.website_id === e.target.value);
                      setSelectedWebsiteForFiles(website);
                      if (website) {
                        loadWebsiteUploads(website.website_id);
                      }
                    }}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
              <div className="space-y-4">
                <FileManager 
                  website={selectedWebsiteForFiles}
                  onUploadComplete={handleFileUploadComplete}
                />
                
                <div className="mt-4">
                  <h3 className="font-medium text-gray-900 mb-3 flex items-center text-sm">
                    <FaFile className="mr-2" />
                    Uploaded Files
                  </h3>
                  <FileList websiteId={selectedWebsiteForFiles.website_id} />
                </div>
              </div>
            ) : (
              <div className="text-center py-6">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-2">
                  <FaFileUpload className="text-gray-400" />
                </div>
                <p className="text-sm text-gray-600 mb-3">Select a website to manage files</p>
                {userWebsites.length > 0 ? (
                  <div className="space-y-2">
                    {userWebsites.slice(0, 2).map(website => (
                      <button
                        key={website.website_id}
                        onClick={() => {
                          setSelectedWebsiteForFiles(website);
                          loadWebsiteUploads(website.website_id);
                        }}
                        className="w-full text-left p-3 border border-gray-200 rounded-lg"
                      >
                        <p className="font-medium text-sm">{website.website_name}</p>
                        <p className="text-xs text-gray-500">{websiteUploads[website.website_id]?.count || 0} files</p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">Train a chatbot first</p>
                )}
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'generate' && (
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <ScriptGenerator 
              websites={userWebsites}
              onTestChat={handleTestChat}
              isProcessing={isProcessing}
            />
          </div>
        )}
      </div>

      {/* Mobile Tab Bar */}
      <MobileTabBar />
      
      {/* Training Modal */}
      {showTrainForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4 z-50">
          <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-4 md:p-6">
              <div className="flex justify-between items-center mb-4 md:mb-6">
                <img className='h-8 md:h-10 w-auto' src={botimage} alt="Botnexify" />
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
