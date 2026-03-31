import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { 
  FaUsers, FaRobot, FaChartBar, FaDatabase, FaFileUpload,
  FaComments, FaEnvelope, FaCog, FaSync, FaEye, FaTrash,
  FaUserShield, FaUserCheck, FaUserTimes, FaDownload,
  FaCalendar, FaChartLine, FaCalendarAlt, FaCoins, FaBars,
  FaTimes, FaChevronDown, FaChevronUp, FaHome, FaGlobe,
  FaUpload, FaCrown, FaSearch, FaFilter, FaSort,
  FaCheckCircle, FaExclamationTriangle, FaClock, FaUser,
  FaSpinner, FaInbox, FaInfoCircle , FaCode, FaFilePdf, FaFile, FaChevronLeft, FaFileWord, FaFileExcel, FaFileImage, FaFileArchive, FaFileAlt
} from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { Line, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

// Import separated components
import AddAdminModal from './AdminModal';
import UserDetailsModal from './UserDetailsModal';
import Reports from './Reports'
import TokenDashboard from './Tokens/TokenDashboard';

const API_URL = import.meta.env.VITE_API_URL;

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// StatsCard Component with responsive design
const StatsCard = ({ icon, title, value, color, change, changeLabel }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className={`bg-white rounded-xl md:rounded-2xl p-4 md:p-6 shadow-lg border ${color} hover:shadow-xl transition-shadow`}
  >
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs md:text-sm text-gray-600 mb-1 md:mb-2">{title}</p>
        <p className="text-xl md:text-3xl font-bold text-gray-900">{value}</p>
        {change !== undefined && change !== null && (
          <p className={`text-xs md:text-sm mt-1 ${
            change > 0 ? 'text-green-600' : change < 0 ? 'text-red-600' : 'text-gray-600'
          }`}>
            {change > 0 ? '↗' : change < 0 ? '↘' : '→'} {Math.abs(change)}{changeLabel || '%'}
          </p>
        )}
      </div>
      <div className="text-xl md:text-3xl opacity-80">
        {icon}
      </div>
    </div>
  </motion.div>
);

// Memoized SearchFilterBar component to prevent unnecessary re-renders
const SearchFilterBar = memo(({ 
  activeTab, 
  searchTerm, 
  onSearchChange, 
  filterStatus, 
  onFilterChange, 
  sortBy, 
  onSortChange 
}) => {
  // Use local state for input to prevent re-renders from parent
  const [localSearchTerm, setLocalSearchTerm] = useState(searchTerm);
  const debounceTimeout = useRef(null);

  // Update local state when parent search term changes
  useEffect(() => {
    setLocalSearchTerm(searchTerm);
  }, [searchTerm]);

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setLocalSearchTerm(newValue);
    
    // Debounce the search update to parent
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }
    
    debounceTimeout.current = setTimeout(() => {
      onSearchChange(newValue);
    }, 300);
  };

  return (
    <div className="flex flex-col sm:flex-row gap-3 mb-4">
      <div className="flex-1 relative">
        <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm" />
        <input
          type="text"
          placeholder={activeTab === 'users' ? "Search users by name or email..." : "Search websites by name or owner..."}
          value={localSearchTerm}
          onChange={handleInputChange}
          className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          autoComplete="off"
        />
      </div>
      <div className="flex gap-2">
        <select
          value={filterStatus}
          onChange={(e) => onFilterChange(e.target.value)}
          className="cursor-pointer px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
        >
          <option value="all">All Status</option>
          {activeTab === 'users' ? (
            <>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="admin">Admin</option>
            </>
          ) : (
            <>
              <option value="active">Active</option>
              <option value="training">Training</option>
              <option value="inactive">Inactive</option>
              <option value="error">Error</option>
            </>
          )}
        </select>
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value)}
          className="cursor-pointer px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="name">Name</option>
        </select>
      </div>
    </div>
  );
});

const AdminPanel = ({ user }) => {
  // State Management
  const [activeTab, setActiveTab] = useState('dashboard');
  const [adminStats, setAdminStats] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [allWebsites, setAllWebsites] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [growthPeriod, setGrowthPeriod] = useState('monthly');
  const [userGrowthData, setUserGrowthData] = useState(null);
  const [websiteStatusData, setWebsiteStatusData] = useState(null);
  const [selectedWebsiteForDetails, setSelectedWebsiteForDetails] = useState(null);
  const [showWebsiteDetailsModal, setShowWebsiteDetailsModal] = useState(false);
  const [loadingWebsiteDetails, setLoadingWebsiteDetails] = useState(false);
  const [websiteDetails, setWebsiteDetails] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [showFilePreview, setShowFilePreview] = useState(false);
  

  // Responsive State
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isTablet, setIsTablet] = useState(window.innerWidth >= 768 && window.innerWidth < 1024);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [expandedWebsiteId, setExpandedWebsiteId] = useState(null);
  
  // Search and Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  
  // Add Admin Modal State
  const [showAddAdminModal, setShowAddAdminModal] = useState(false);
  const [isCreatingAdmin, setIsCreatingAdmin] = useState(false);
  
  // User Details Modal State
  const [showUserDetailsModal, setShowUserDetailsModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isLoadingUserDetails, setIsLoadingUserDetails] = useState(false);

  // Chat and Contact Form State
  const [selectedWebsiteForChat, setSelectedWebsiteForChat] = useState(null);
  const [selectedWebsiteForContact, setSelectedWebsiteForContact] = useState(null);
  const [websiteChatUsers, setWebsiteChatUsers] = useState([]);
  const [websiteContactForms, setWebsiteContactForms] = useState({});
  const [selectedUserChat, setSelectedUserChat] = useState(null);
  const [userChatMessages, setUserChatMessages] = useState([]);
  const [selectedContactForm, setSelectedContactForm] = useState(null);
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingContactForms, setLoadingContactForms] = useState(false);
  const [showChatPopup, setShowChatPopup] = useState(false);
  const [showContactPopup, setShowContactPopup] = useState(false);
  const [updatingContactStatus, setUpdatingContactStatus] = useState(false);

  // ==================== RESPONSIVE HANDLING ====================
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

  // ==================== DATA LOADING ====================
  useEffect(() => {
    loadAdminData();
  }, []);

  // Generate chart data when adminStats, allUsers, or allWebsites change
  useEffect(() => {
    if (adminStats && allUsers.length > 0 && allWebsites.length > 0) {
      generateChartData();
    }
  }, [adminStats, allUsers, allWebsites, growthPeriod]);

  const loadAdminData = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      
      const statsResponse = await fetch(`${API_URL}/api/admin/stats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        if (statsData.success) {
          setAdminStats(statsData.statistics);
        }
      }
      
      const usersResponse = await fetch(`${API_URL}/api/admin/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (usersResponse.ok) {
        const usersData = await usersResponse.json();
        if (usersData.success) {
          const usersWithDetails = usersData.users.map(user => ({
            ...user,
            full_name: user.full_name || user.name || 'Unknown User',
            email: user.email || 'No email provided',
            website_count: user.website_count || 0
          }));
          setAllUsers(usersWithDetails);
        }
      }
      
      const websitesResponse = await fetch(`${API_URL}/api/admin/websites`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (websitesResponse.ok) {
        const websitesData = await websitesResponse.json();
        if (websitesData.success) {
          const websitesWithOwners = websitesData.websites.map(website => ({
            ...website,
            owner_name: website.owner_name || website.user_name || 'Unknown User',
            owner_email: website.owner_email || website.user_email || 'No email provided',
            user_name: website.user_name || website.owner_name || 'Unknown User',
            user_email: website.user_email || website.owner_email || 'No email provided'
          }));
          setAllWebsites(websitesWithOwners);
        }
      }
      
    } catch (error) {
      console.error('Error loading admin data:', error);
      toast.error('Failed to load admin data');
    } finally {
      setIsLoading(false);
    }
  };

  // ==================== CHART DATA GENERATION ====================
  const generateChartData = () => {
    if (!allUsers || allUsers.length === 0) return;

    const now = new Date();
    const userGrowthLabels = [];
    const userGrowthValues = [];
    
    if (growthPeriod === 'monthly') {
      for (let i = 5; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthYear = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        userGrowthLabels.push(monthYear);
        
        const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
        const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
        
        const usersInMonth = allUsers.filter(user => {
          const userDate = new Date(user.created_at);
          return userDate >= monthStart && userDate <= monthEnd;
        }).length;
        
        userGrowthValues.push(usersInMonth);
      }
    } else {
      for (let i = 4; i >= 0; i--) {
        const year = now.getFullYear() - i;
        userGrowthLabels.push(year.toString());
        
        const yearStart = new Date(year, 0, 1);
        const yearEnd = new Date(year, 11, 31, 23, 59, 59);
        
        const usersInYear = allUsers.filter(user => {
          const userDate = new Date(user.created_at);
          return userDate >= yearStart && userDate <= yearEnd;
        }).length;
        
        userGrowthValues.push(usersInYear);
      }
    }

    const websiteStatusLabels = ['Active', 'Training', 'Inactive', 'Error'];
    const websiteStatusValues = [0, 0, 0, 0];
    
    allWebsites.forEach(website => {
      if (website.status === 'active') {
        websiteStatusValues[0]++;
      } else if (website.status === 'training') {
        websiteStatusValues[1]++;
      } else if (website.status === 'inactive') {
        websiteStatusValues[2]++;
      } else {
        websiteStatusValues[3]++;
      }
    });

    setUserGrowthData({
      labels: userGrowthLabels,
      values: userGrowthValues
    });

    setWebsiteStatusData({
      labels: websiteStatusLabels,
      values: websiteStatusValues
    });
  };

  // ==================== FILTER FUNCTIONS - Memoized to prevent re-renders ====================
  const getFilteredUsers = useCallback(() => {
    let filtered = [...allUsers];
    
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(user => 
        user.full_name?.toLowerCase().includes(searchLower) ||
        user.email?.toLowerCase().includes(searchLower)
      );
    }
    
    if (filterStatus !== 'all') {
      filtered = filtered.filter(user => {
        if (filterStatus === 'active') return user.is_active === true;
        if (filterStatus === 'inactive') return user.is_active === false;
        if (filterStatus === 'admin') return user.role === 'admin';
        return true;
      });
    }
    
    filtered.sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.created_at) - new Date(a.created_at);
      } else if (sortBy === 'oldest') {
        return new Date(a.created_at) - new Date(b.created_at);
      } else if (sortBy === 'name') {
        return (a.full_name || '').localeCompare(b.full_name || '');
      }
      return 0;
    });
    
    return filtered;
  }, [allUsers, searchTerm, filterStatus, sortBy]);

  const getFilteredWebsites = useCallback(() => {
    let filtered = [...allWebsites];
    
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(website => 
        website.website_name?.toLowerCase().includes(searchLower) ||
        website.website_url?.toLowerCase().includes(searchLower) ||
        website.user_name?.toLowerCase().includes(searchLower)
      );
    }
    
    if (filterStatus !== 'all') {
      filtered = filtered.filter(website => website.status === filterStatus);
    }
    
    filtered.sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.created_at) - new Date(a.created_at);
      } else if (sortBy === 'oldest') {
        return new Date(a.created_at) - new Date(b.created_at);
      }
      return 0;
    });
    
    return filtered;
  }, [allWebsites, searchTerm, filterStatus, sortBy]);

  // Search handlers
  const handleSearchChange = useCallback((newSearchTerm) => {
    setSearchTerm(newSearchTerm);
  }, []);

  const handleFilterChange = useCallback((newFilter) => {
    setFilterStatus(newFilter);
  }, []);

  const handleSortChange = useCallback((newSort) => {
    setSortBy(newSort);
  }, []);

  // ==================== USER ACTIONS ====================
  const handleViewUserDetails = async (userId) => {
    setIsLoadingUserDetails(true);
    setShowUserDetailsModal(true);
    
    try {
      const token = localStorage.getItem('access_token');
      
      const userData = allUsers.find(u => u.id === userId);
      
      if (!userData) {
        toast.error('User not found');
        setSelectedUser(null);
        return;
      }

      let userWebsitesList = [];
      let userStats = {
        total_websites: 0,
        total_chat_messages: 0,
        total_contact_forms: 0,
        total_uploaded_files: 0
      };

      try {
        const userWebsitesResponse = await fetch(`${API_URL}/api/user/websites`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (userWebsitesResponse.ok) {
          const userWebsitesData = await userWebsitesResponse.json();
          
          if (userWebsitesData.success && userWebsitesData.websites) {
            userWebsitesList = userWebsitesData.websites.filter(w => w.user_id === userId);
          }
        }
        
        if (userWebsitesList.length === 0) {
          const allWebsitesResponse = await fetch(`${API_URL}/api/admin/websites`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          
          if (allWebsitesResponse.ok) {
            const allWebsitesData = await allWebsitesResponse.json();
            
            if (allWebsitesData.success && allWebsitesData.websites) {
              userWebsitesList = allWebsitesData.websites.filter(w => w.user_id === userId);
            }
          }
        }
        
        userStats.total_websites = userWebsitesList.length;
        userStats.total_chat_messages = userWebsitesList.reduce((sum, w) => sum + (w.chat_messages_count || 0), 0);
        userStats.total_contact_forms = userWebsitesList.reduce((sum, w) => sum + (w.contact_forms_count || 0), 0);
        userStats.total_uploaded_files = userWebsitesList.reduce((sum, w) => sum + (w.files_count || 0), 0);
        
        const websitesWithDetails = await Promise.all(
          userWebsitesList.map(async (website) => {
            try {
              const websiteDetailsResponse = await fetch(`${API_URL}/api/website/${website.website_id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
              });
              
              if (websiteDetailsResponse.ok) {
                const websiteDetails = await websiteDetailsResponse.json();
                return {
                  website_id: website.website_id,
                  website_name: website.website_name,
                  website_url: website.website_url,
                  status: website.status,
                  created_at: website.created_at,
                  chat_messages_count: website.chat_messages_count || 0,
                  contact_forms_count: website.contact_forms_count || 0,
                  files_count: website.files_count || 0,
                  script_tag: websiteDetails.embed_code || websiteDetails.script_tag || website.script_tag || null,
                  data_points: websiteDetails.data_points || website.data_points || 0
                };
              }
            } catch (error) {
              console.error(`Error fetching details for website ${website.website_id}:`, error);
            }
            
            return {
              website_id: website.website_id,
              website_name: website.website_name,
              website_url: website.website_url,
              status: website.status,
              created_at: website.created_at,
              chat_messages_count: website.chat_messages_count || 0,
              contact_forms_count: website.contact_forms_count || 0,
              files_count: website.files_count || 0,
              script_tag: website.script_tag || null,
              data_points: website.data_points || 0
            };
          })
        );
        
        userWebsitesList = websitesWithDetails.filter(website => website !== null);
        
      } catch (error) {
        console.error('Error fetching user websites:', error);
      }

      setSelectedUser({
        ...userData,
        websites: userWebsitesList,
        stats: userStats
      });
      
    } catch (error) {
      console.error('Error loading user details:', error);
      toast.error('Failed to load user details');
      setSelectedUser(null);
    } finally {
      setIsLoadingUserDetails(false);
    }
  };

  const handleToggleUserStatus = async (userId, currentStatus) => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_URL}/api/admin/users/${userId}/toggle`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ is_active: !currentStatus })
      });

      const data = await response.json();
      
      if (data.success) {
        setAllUsers(prev => prev.map(user => 
          user.id === userId ? { ...user, is_active: !currentStatus } : user
        ));
        
        if (selectedUser && selectedUser.id === userId) {
          setSelectedUser(prev => ({ ...prev, is_active: !currentStatus }));
        }
        
        toast.success(`User ${!currentStatus ? 'activated' : 'deactivated'} successfully`);
      } else {
        throw new Error(data.error || 'Failed to update user');
      }
    } catch (error) {
      toast.error(error.message || 'Failed to update user status');
    }
  };

  const handleDeleteWebsite = async (websiteId) => {
    if (!window.confirm('Are you sure you want to delete this chatbot?')) {
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_URL}/api/website/${websiteId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await response.json();
      
      if (data.success) {
        setAllWebsites(prev => prev.filter(w => w.website_id !== websiteId));
        toast.success('Website deleted successfully');
      } else {
        throw new Error(data.message || 'Failed to delete website');
      }
    } catch (error) {
      toast.error(error.message || 'Failed to delete website');
    }
  };

  // ==================== ADMIN ACTIONS ====================
  const handleAddAdmin = () => {
    setShowAddAdminModal(true);
  };

  const handleCloseAddAdminModal = useCallback(() => {
    if (isCreatingAdmin) return;
    setShowAddAdminModal(false);
  }, [isCreatingAdmin]);

  const handleCloseUserDetailsModal = useCallback(() => {
    setShowUserDetailsModal(false);
    setSelectedUser(null);
  }, []);

  const handleCreateAdmin = useCallback(async (newAdminData) => {
    if (!newAdminData.full_name.trim()) {
      toast.error('Full name is required');
      return;
    }

    if (!newAdminData.email.trim()) {
      toast.error('Email is required');
      return;
    }

    if (!/\S+@\S+\.\S+/.test(newAdminData.email)) {
      toast.error('Invalid email format');
      return;
    }

    if (newAdminData.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    if (newAdminData.password !== newAdminData.confirm_password) {
      toast.error('Passwords do not match');
      return;
    }

    setIsCreatingAdmin(true);

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_URL}/api/admin/create-admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          full_name: newAdminData.full_name,
          email: newAdminData.email,
          password: newAdminData.password
        })
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Admin user created successfully!');
        setShowAddAdminModal(false);
        toast.success(`Admin created! Email: ${data.admin.email}, Role: ${data.admin.role}`, {
          duration: 5000
        });
        loadAdminData();
      } else {
        toast.error(data.error || 'Failed to create admin');
      }
    } catch (error) {
      console.error('Error creating admin:', error);
      toast.error('Failed to create admin. Please try again.');
    } finally {
      setIsCreatingAdmin(false);
    }
  }, []);

  // ==================== CHAT FUNCTIONS ====================
  const loadWebsiteChatUsers = async (website) => {
    setLoadingChats(true);
    setSelectedWebsiteForChat(website);
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        toast.error('No access token found. Please login again.');
        return;
      }

      const response = await fetch(`${API_URL}/api/chat-users/${website.website_id}`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        setWebsiteChatUsers(data.users || []);
        setShowChatPopup(true);
        setSelectedUserChat(null);
        setUserChatMessages([]);
      } else {
        const errorMessage = data.message || data.error || 'Failed to load chat users';
        toast.error(errorMessage);
      }
    } catch (error) {
      console.error('Error loading chat users:', error);
      toast.error('Error loading chat users: ' + error.message);
    } finally {
      setLoadingChats(false);
    }
  };

  const loadUserChatMessages = async (websiteId, userEmail) => {
    setLoadingChats(true);
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        toast.error('No access token found. Please login again.');
        return;
      }

      const response = await fetch(`${API_URL}/api/user-chat/${websiteId}?email=${encodeURIComponent(userEmail)}`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        setUserChatMessages(data.messages || []);
        setSelectedUserChat(userEmail);
      } else {
        const errorMessage = data.message || data.error || 'Failed to load chat messages';
        toast.error(errorMessage);
      }
    } catch (error) {
      console.error('Error loading chat messages:', error);
      toast.error('Error loading chat messages: ' + error.message);
    } finally {
      setLoadingChats(false);
    }
  };

  // ==================== WEBSITE DETAILS FUNCTIONS ====================
  const loadWebsiteDetails = async (website) => {
    setLoadingWebsiteDetails(true);
    setSelectedWebsiteForDetails(website);
    try {
      const token = localStorage.getItem('access_token');
      
      const response = await fetch(`${API_URL}/api/website/${website.website_id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          const contactFormsResponse = await fetch(`${API_URL}/api/contact/forms/${website.website_id}?limit=50`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          
          let contactForms = [];
          if (contactFormsResponse.ok) {
            const contactFormsData = await contactFormsResponse.json();
            if (contactFormsData.success) {
              contactForms = contactFormsData.forms || [];
            }
          }
          
          const chatUsersResponse = await fetch(`${API_URL}/api/chat-users/${website.website_id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          
          let chatUsers = [];
          if (chatUsersResponse.ok) {
            const chatUsersData = await chatUsersResponse.json();
            if (chatUsersData.success) {
              chatUsers = chatUsersData.users || [];
            }
          }
          
          const uploadsResponse = await fetch(`${API_URL}/api/website-uploads/${website.website_id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          
          let uploads = { files: [], count: 0 };
          if (uploadsResponse.ok) {
            const uploadsData = await uploadsResponse.json();
            if (uploadsData.success) {
              uploads = {
                files: uploadsData.files || [],
                count: uploadsData.upload_count || 0
              };
            }
          }
          
          setWebsiteDetails({
            ...data,
            contact_forms: contactForms,
            chat_users: chatUsers,
            uploads: uploads
          });
          setShowWebsiteDetailsModal(true);
        } else {
          toast.error(data.message || 'Failed to load website details');
        }
      } else {
        toast.error('Failed to load website details');
      }
    } catch (error) {
      console.error('Error loading website details:', error);
      toast.error('Error loading website details');
    } finally {
      setLoadingWebsiteDetails(false);
    }
  };

  // ==================== FILE PREVIEW MODAL ====================
  const FilePreviewModal = ({ file, websiteId, onClose }) => {
    if (!file) return null;

    const [loading, setLoading] = useState(true);
    const [fileContent, setFileContent] = useState(null);
    const [fileType, setFileType] = useState('');
    const [error, setError] = useState(null);
    const [imageLoaded, setImageLoaded] = useState(false);

    useEffect(() => {
      const loadFileContent = async () => {
        setLoading(true);
        setError(null);
        setImageLoaded(false);
        
        try {
          const token = localStorage.getItem('access_token');
          const fileUrl = `${API_URL}/data/${websiteId}/uploads/${file.filename}`;
          
          const ext = file.filename.split('.').pop().toLowerCase();
          setFileType(ext);
          
          if (['txt', 'csv', 'json', 'md', 'html', 'htm', 'xml', 'css', 'js', 'log'].includes(ext)) {
            const response = await fetch(fileUrl, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
              const text = await response.text();
              setFileContent(text);
            } else {
              setError('Failed to load file content');
            }
          }
        } catch (error) {
          console.error('Error loading file:', error);
          setError('Error loading file');
        } finally {
          setLoading(false);
        }
      };

      loadFileContent();
    }, [file, websiteId]);

    const getFileIcon = (filename) => {
      const ext = filename.split('.').pop().toLowerCase();
      switch (ext) {
        case 'pdf': return <FaFilePdf className="text-red-500 text-4xl" />;
        case 'doc':
        case 'docx': return <FaFileWord className="text-blue-500 text-4xl" />;
        case 'xls':
        case 'xlsx': return <FaFileExcel className="text-green-500 text-4xl" />;
        case 'jpg':
        case 'jpeg':
        case 'png':
        case 'gif':
        case 'svg': return <FaFileImage className="text-purple-500 text-4xl" />;
        case 'zip':
        case 'rar':
        case '7z': return <FaFileArchive className="text-yellow-500 text-4xl" />;
        default: return <FaFileAlt className="text-gray-500 text-4xl" />;
      }
    };

    const formatFileSize = (bytes) => {
      if (!bytes || bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'].includes(fileType);
    const isPdf = fileType === 'pdf';
    const isText = ['txt', 'csv', 'json', 'md', 'html', 'htm', 'xml', 'css', 'js', 'log'].includes(fileType);

    const handleImageLoad = () => {
      setImageLoaded(true);
      setLoading(false);
    };

    const handleImageError = () => {
      setError('Failed to load image');
      setLoading(false);
    };

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center">
            <div className="flex items-center space-x-3">
              {getFileIcon(file.filename)}
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{file.filename}</h3>
                <p className="text-sm text-gray-500">
                  {formatFileSize(file.size)} • Uploaded {file.modified ? new Date(file.modified).toLocaleDateString() : 'N/A'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl"
            >
              &times;
            </button>
          </div>

          <div className="overflow-y-auto p-4" style={{ maxHeight: 'calc(90vh - 120px)' }}>
            {loading && !imageLoaded ? (
              <div className="flex items-center justify-center py-12">
                <FaSpinner className="animate-spin text-blue-600 text-3xl" />
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <FaExclamationTriangle className="text-red-500 text-4xl mx-auto mb-3" />
                <p className="text-red-600">{error}</p>
                <a
                  href={`${API_URL}/data/${websiteId}/uploads/${file.filename}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-4 py-2 mt-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <FaDownload className="mr-2" />
                  Download File
                </a>
              </div>
            ) : (
              <>
                {isImage && (
                  <div className="flex justify-center">
                    <img
                      src={`${API_URL}/data/${websiteId}/uploads/${file.filename}?t=${new Date().getTime()}`}
                      alt={file.filename}
                      className="max-w-full max-h-[60vh] object-contain rounded-lg"
                      onLoad={handleImageLoad}
                      onError={handleImageError}
                    />
                  </div>
                )}

                {isPdf && (
                  <iframe
                    src={`${API_URL}/data/${websiteId}/uploads/${file.filename}#toolbar=1&navpanes=1&scrollbar=1`}
                    className="w-full h-[70vh] rounded-lg"
                    title={file.filename}
                    onLoad={() => setLoading(false)}
                    onError={() => {
                      setError('Failed to load PDF');
                      setLoading(false);
                    }}
                  />
                )}

                {isText && fileContent && (
                  <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-sm overflow-x-auto whitespace-pre-wrap">
                    {fileContent}
                  </pre>
                )}

                {!isImage && !isPdf && !isText && (
                  <div className="text-center py-12">
                    <div className="mb-4">{getFileIcon(file.filename)}</div>
                    <p className="text-gray-600 mb-4">Preview not available for this file type</p>
                    <a
                      href={`${API_URL}/data/${websiteId}/uploads/${file.filename}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <FaDownload className="mr-2" />
                      Download File
                    </a>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ==================== WEBSITE DETAILS MODAL ====================
  const WebsiteDetailsModal = () => {
    if (!showWebsiteDetailsModal || !selectedWebsiteForDetails) return null;

    const website = selectedWebsiteForDetails;
    const details = websiteDetails;
    const uploads = details?.uploads || { files: [], count: 0 };
    const contactForms = details?.contact_forms || [];
    const chatUsers = details?.chat_users || [];
    
    const [activeTab, setActiveTab] = useState('overview');
    const [selectedChatUser, setSelectedChatUser] = useState(null);
    const [chatMessages, setChatMessages] = useState([]);
    const [loadingMessages, setLoadingMessages] = useState(false);
    
    const formatDate = (dateString) => {
      if (!dateString) return 'N/A';
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    };

    const getStatusBadge = (status) => {
      switch(status) {
        case 'active':
          return <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">Active</span>;
        case 'training':
          return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">Training</span>;
        case 'inactive':
          return <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs font-medium rounded-full">Inactive</span>;
        case 'error':
          return <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full">Error</span>;
        case 'pending':
          return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">Pending</span>;
        case 'processed':
          return <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">Processed</span>;
        case 'spam':
          return <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full">Spam</span>;
        default:
          return <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs font-medium rounded-full">{status}</span>;
      }
    };

    const getFileIcon = (filename) => {
      if (!filename) return <FaFileAlt className="text-gray-500 text-xl" />;
      const ext = filename.split('.').pop().toLowerCase();
      switch (ext) {
        case 'pdf': return <FaFilePdf className="text-red-500 text-xl" />;
        case 'doc':
        case 'docx': return <FaFileWord className="text-blue-500 text-xl" />;
        case 'xls':
        case 'xlsx': return <FaFileExcel className="text-green-500 text-xl" />;
        case 'jpg':
        case 'jpeg':
        case 'png':
        case 'gif':
        case 'svg': return <FaFileImage className="text-purple-500 text-xl" />;
        case 'zip':
        case 'rar':
        case '7z': return <FaFileArchive className="text-yellow-500 text-xl" />;
        default: return <FaFileAlt className="text-gray-500 text-xl" />;
      }
    };

    const formatFileSize = (bytes) => {
      if (!bytes || bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const loadUserChatMessages = async (userEmail) => {
      setLoadingMessages(true);
      try {
        const token = localStorage.getItem('access_token');
        const response = await fetch(`${API_URL}/api/user-chat/${website.website_id}?email=${encodeURIComponent(userEmail)}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setChatMessages(data.messages || []);
            setSelectedChatUser(userEmail);
          } else {
            toast.error(data.message || 'Failed to load chat messages');
          }
        } else {
          toast.error('Failed to load chat messages');
        }
      } catch (error) {
        console.error('Error loading chat messages:', error);
        toast.error('Error loading chat messages');
      } finally {
        setLoadingMessages(false);
      }
    };

    const handleBackToUsers = () => {
      setSelectedChatUser(null);
      setChatMessages([]);
    };

    const handleFileClick = (file) => {
      setSelectedFile(file);
      setShowFilePreview(true);
    };

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
          <div className="p-4 md:p-6 border-b border-gray-200 flex justify-between items-center">
            <div>
              <h2 className="text-lg md:text-xl font-bold text-gray-900 flex items-center">
                <FaRobot className="mr-2 text-blue-600" />
                Chatbot Details - {website?.website_name || 'Unknown'}
              </h2>
              <p className="text-sm text-gray-500 mt-1">{website?.website_url || 'No URL'}</p>
            </div>
            <button
              onClick={() => {
                setShowWebsiteDetailsModal(false);
                setWebsiteDetails(null);
                setSelectedChatUser(null);
                setChatMessages([]);
              }}
              className="text-gray-400 hover:text-gray-600 text-2xl"
            >
              &times;
            </button>
          </div>

          <div className="bg-gradient-to-r from-purple-50 to-indigo-50 p-4 border-b border-gray-200">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                {website?.owner_name?.charAt(0).toUpperCase() || website?.user_name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div>
                <p className="text-sm text-gray-600">Owner</p>
                <p className="text-lg font-semibold text-gray-900">{website?.owner_name || website?.user_name || 'Unknown User'}</p>
                <p className="text-sm text-gray-500">{website?.owner_email || website?.user_email || 'No email provided'}</p>
              </div>
            </div>
          </div>

          <div className="border-b border-gray-200 px-4 md:px-6 overflow-x-auto">
            <nav className="flex space-x-4">
              <button
                onClick={() => {
                  setActiveTab('overview');
                  setSelectedChatUser(null);
                  setChatMessages([]);
                }}
                className={`py-3 px-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'overview'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <FaChartBar className="inline mr-2" />
                Overview
              </button>
              <button
                onClick={() => {
                  setActiveTab('chat');
                  setSelectedChatUser(null);
                  setChatMessages([]);
                }}
                className={`py-3 px-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'chat'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <FaComments className="inline mr-2" />
                Chat History ({chatUsers.length})
              </button>
              <button
                onClick={() => {
                  setActiveTab('contact');
                  setSelectedChatUser(null);
                  setChatMessages([]);
                }}
                className={`py-3 px-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'contact'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <FaEnvelope className="inline mr-2" />
                Contact Forms ({contactForms.length})
              </button>
              <button
                onClick={() => {
                  setActiveTab('uploads');
                  setSelectedChatUser(null);
                  setChatMessages([]);
                }}
                className={`py-3 px-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'uploads'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <FaFileUpload className="inline mr-2" />
                Uploaded Files ({uploads.count})
              </button>
            </nav>
          </div>

          <div className="overflow-y-auto p-4 md:p-6" style={{ maxHeight: 'calc(90vh - 280px)' }}>
            {loadingWebsiteDetails ? (
              <div className="flex items-center justify-center py-12">
                <FaSpinner className="animate-spin text-blue-600 text-3xl" />
              </div>
            ) : (
              <>
                {activeTab === 'overview' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 text-center border border-blue-200">
                        <FaComments className="text-blue-600 text-xl mx-auto mb-2" />
                        <p className="text-2xl font-bold text-gray-900">{details?.stats?.chat_messages || website?.chat_messages_count || 0}</p>
                        <p className="text-xs text-gray-600">Chat Messages</p>
                      </div>
                      
                      <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 text-center border border-green-200">
                        <FaUsers className="text-green-600 text-xl mx-auto mb-2" />
                        <p className="text-2xl font-bold text-gray-900">{chatUsers.length}</p>
                        <p className="text-xs text-gray-600">Chat Users</p>
                      </div>
                      
                      <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl p-4 text-center border border-purple-200">
                        <FaEnvelope className="text-purple-600 text-xl mx-auto mb-2" />
                        <p className="text-2xl font-bold text-gray-900">{contactForms.length}</p>
                        <p className="text-xs text-gray-600">Contact Forms</p>
                      </div>
                      
                      <div className="bg-gradient-to-br from-yellow-50 to-amber-50 rounded-xl p-4 text-center border border-yellow-200">
                        <FaFileUpload className="text-yellow-600 text-xl mx-auto mb-2" />
                        <p className="text-2xl font-bold text-gray-900">{uploads.count}</p>
                        <p className="text-xs text-gray-600">Uploaded Files</p>
                      </div>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                      <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                        <FaInfoCircle className="mr-2 text-blue-600" />
                        Chatbot Information
                      </h4>
                      <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <dt className="text-sm text-gray-600">Chatbot ID</dt>
                          <dd className="text-sm font-mono text-gray-900">{website?.website_id || 'N/A'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-gray-600">Chatbot Name</dt>
                          <dd className="text-sm text-gray-900">{website?.website_name || 'N/A'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-gray-600">Website URL</dt>
                          <dd className="text-sm text-gray-900 break-all">{website?.website_url || 'N/A'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-gray-600">Created</dt>
                          <dd className="text-sm text-gray-900">{formatDate(website?.created_at)}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-gray-600">Status</dt>
                          <dd className="text-sm">{getStatusBadge(website?.status)}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-gray-600">Data Points</dt>
                          <dd className="text-sm text-gray-900">{details?.data_points || website?.data_points || 0}</dd>
                        </div>
                      </dl>
                    </div>

                    {details?.script_tag && (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 mb-2 flex items-center">
                          <FaCode className="mr-2 text-green-600" />
                          Embed Script
                        </h4>
                        <pre className="bg-gray-900 text-gray-100 p-3 rounded-lg text-xs overflow-x-auto">
                          {details.script_tag}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'chat' && (
                  <div className="space-y-4">
                    {selectedChatUser ? (
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="font-medium text-gray-900">
                            Chat with {selectedChatUser}
                          </h4>
                          <button
                            onClick={handleBackToUsers}
                            className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
                          >
                            <FaChevronLeft className="mr-1" size={12} />
                            Back to users
                          </button>
                        </div>
                        <div className="space-y-4 max-h-[60vh] overflow-y-auto p-2">
                          {loadingMessages ? (
                            <div className="flex items-center justify-center py-12">
                              <FaSpinner className="animate-spin text-blue-600 text-3xl" />
                            </div>
                          ) : chatMessages.length > 0 ? (
                            chatMessages.map((msg, index) => (
                              <div
                                key={index}
                                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                              >
                                <div
                                  className={`max-w-[80%] p-3 rounded-lg ${
                                    msg.role === 'user'
                                      ? 'bg-blue-600 text-white rounded-br-none'
                                      : 'bg-gray-100 text-gray-900 rounded-bl-none'
                                  }`}
                                >
                                  <div className="flex items-center space-x-2 mb-1">
                                    {msg.role === 'user' ? (
                                      <FaUser className="text-xs opacity-75" />
                                    ) : (
                                      <FaRobot className="text-xs opacity-75" />
                                    )}
                                    <span className="text-xs opacity-75">
                                      {msg.role === 'user' ? 'User' : 'Bot'}
                                    </span>
                                  </div>
                                  <p className="text-sm whitespace-pre-wrap break-words">
                                    {msg.message}
                                  </p>
                                  <p className="text-xs opacity-75 mt-1 text-right">
                                    {formatDate(msg.created_at)}
                                  </p>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="text-center py-8">
                              <FaComments className="text-gray-400 text-4xl mx-auto mb-3" />
                              <p className="text-gray-600">No messages in this conversation</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <>
                        <h4 className="font-medium text-gray-900 mb-3">Chat Users ({chatUsers.length})</h4>
                        {chatUsers.length > 0 ? (
                          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                            {chatUsers.map((user, index) => (
                              <div
                                key={index}
                                onClick={() => loadUserChatMessages(user.email)}
                                className="border border-gray-200 rounded-lg p-4 hover:shadow-md cursor-pointer transition-shadow"
                              >
                                <div className="flex items-center space-x-3">
                                  <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                                    <FaUser className="text-purple-600" />
                                  </div>
                                  <div className="flex-1">
                                    <p className="font-medium text-gray-900">{user.name || 'Anonymous'}</p>
                                    <p className="text-sm text-gray-500">{user.email}</p>
                                    <p className="text-xs text-gray-400 mt-1">
                                      {user.message_count} messages • Last: {user.last_message_date ? formatDate(user.last_message_date) : 'N/A'}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-8 bg-gray-50 rounded-lg">
                            <FaComments className="text-gray-400 text-4xl mx-auto mb-3" />
                            <p className="text-gray-600">No chat history found</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {activeTab === 'contact' && (
                  <div className="space-y-4">
                    <h4 className="font-medium text-gray-900 mb-3">Contact Forms ({contactForms.length})</h4>
                    {contactForms.length > 0 ? (
                      <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                        {contactForms.map((form, index) => (
                          <div key={index} className="border border-gray-200 rounded-lg p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center space-x-2 mb-2">
                                  <FaUser className="text-blue-600 text-sm" />
                                  <span className="font-medium text-gray-900">{form.name}</span>
                                </div>
                                <p className="text-sm text-gray-600 mb-2">{form.email}</p>
                                {form.phone && (
                                  <p className="text-sm text-gray-600 mb-2">📞 {form.phone}</p>
                                )}
                                <p className="text-sm text-gray-800 bg-gray-50 p-2 rounded mb-2">
                                  {form.message}
                                </p>
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-gray-500">{formatDate(form.created_at)}</span>
                                  {getStatusBadge(form.status)}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 bg-gray-50 rounded-lg">
                        <FaEnvelope className="text-gray-400 text-4xl mx-auto mb-3" />
                        <p className="text-gray-600">No contact forms found</p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'uploads' && (
                  <div className="space-y-4">
                    <h4 className="font-medium text-gray-900 mb-3">Uploaded Files ({uploads.count})</h4>
                    {uploads.count > 0 ? (
                      <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                        {uploads.files.map((file, index) => (
                          <div
                            key={index}
                            onClick={() => handleFileClick(file)}
                            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
                          >
                            <div className="flex items-center space-x-3">
                              {getFileIcon(file.filename)}
                              <div>
                                <p className="text-sm font-medium text-gray-900">{file.filename}</p>
                                <div className="flex items-center space-x-3 text-xs text-gray-500">
                                  <span className="flex items-center">
                                    <FaFile className="mr-1" />
                                    {formatFileSize(file.size)}
                                  </span>
                                  <span className="flex items-center">
                                    <FaClock className="mr-1" />
                                    {formatDate(file.modified)}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              {file.processed && (
                                <span className="text-green-600 text-xs flex items-center">
                                  <FaCheckCircle className="mr-1" />
                                  Processed
                                </span>
                              )}
                              <FaEye className="text-blue-600" />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 bg-gray-50 rounded-lg">
                        <FaFileUpload className="text-gray-400 text-4xl mx-auto mb-3" />
                        <p className="text-gray-600">No files uploaded yet</p>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ==================== CONTACT FORM FUNCTIONS ====================
  const loadWebsiteContactForms = async (website) => {
    setLoadingContactForms(true);
    setSelectedWebsiteForContact(website);
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_URL}/api/contact/forms/${website.website_id}?limit=100`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setWebsiteContactForms(prev => ({
            ...prev,
            [website.website_id]: data.forms || []
          }));
          setShowContactPopup(true);
          setSelectedContactForm(null);
        } else {
          toast.error(data.message || 'Failed to load contact forms');
        }
      } else {
        toast.error('Failed to load contact forms');
      }
    } catch (error) {
      console.error('Error loading contact forms:', error);
      toast.error('Error loading contact forms');
    } finally {
      setLoadingContactForms(false);
    }
  };

  const handleUpdateContactStatus = async (formId, newStatus, websiteId) => {
    if (updatingContactStatus) return;
    
    setUpdatingContactStatus(true);
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_URL}/api/contact/form/${formId}/status`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus })
      });

      const data = await response.json();
      
      if (data.success) {
        toast.success(`Form marked as ${newStatus}`);
        setWebsiteContactForms(prev => ({
          ...prev,
          [websiteId]: prev[websiteId].map(form => 
            form.id === formId ? { ...form, status: newStatus } : form
          )
        }));
        if (selectedContactForm && selectedContactForm.id === formId) {
          setSelectedContactForm({ ...selectedContactForm, status: newStatus });
        }
      } else {
        throw new Error(data.message || 'Failed to update status');
      }
    } catch (error) {
      toast.error(error.message || 'Failed to update status');
    } finally {
      setUpdatingContactStatus(false);
    }
  };

  // ==================== HELPER FUNCTIONS ====================
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

  const getStatusBadge = (status) => {
    switch(status) {
      case 'pending':
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">Pending</span>;
      case 'processed':
        return <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">Processed</span>;
      case 'spam':
        return <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full">Spam</span>;
      default:
        return <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs font-medium rounded-full">{status}</span>;
    }
  };

  // ==================== CHART CONFIGURATION ====================
  const userGrowthChart = {
    labels: userGrowthData?.labels || [],
    datasets: [
      {
        label: 'New Users',
        data: userGrowthData?.values || [],
        borderColor: 'rgb(99, 102, 241)',
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        fill: true,
        tension: 0.4,
        pointBackgroundColor: 'rgb(99, 102, 241)',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: isMobile ? 2 : 4,
        pointHoverRadius: isMobile ? 4 : 6
      }
    ]
  };

  const websiteStatsChart = {
    labels: websiteStatusData?.labels || [],
    datasets: [
      {
        data: websiteStatusData?.values || [],
        backgroundColor: [
          'rgba(34, 197, 94, 0.8)',
          'rgba(249, 115, 22, 0.8)',
          'rgba(156, 163, 175, 0.8)',
          'rgba(239, 68, 68, 0.8)'
        ],
        borderColor: [
          'rgb(34, 197, 94)',
          'rgb(249, 115, 22)',
          'rgb(156, 163, 175)',
          'rgb(239, 68, 68)'
        ],
        borderWidth: 2,
        hoverOffset: 15
      }
    ]
  };

  const userGrowthOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { 
        position: isMobile ? 'bottom' : 'top', 
        labels: { 
          padding: isMobile ? 10 : 20, 
          usePointStyle: true,
          boxWidth: isMobile ? 8 : 12,
          font: { size: isMobile ? 10 : 12 }
        } 
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        titleFont: { size: isMobile ? 12 : 14 },
        bodyFont: { size: isMobile ? 12 : 14 },
        padding: isMobile ? 8 : 12,
        callbacks: {
          label: function(context) {
            return `${context.dataset.label}: ${context.raw} users`;
          }
        }
      }
    },
    scales: {
      y: { 
        beginAtZero: true, 
        grid: { color: 'rgba(0, 0, 0, 0.05)' }, 
        ticks: { 
          precision: 0,
          font: { size: isMobile ? 10 : 12 }
        } 
      },
      x: { 
        grid: { display: false },
        ticks: { 
          font: { size: isMobile ? 10 : 12 },
          maxRotation: isMobile ? 45 : 0,
          minRotation: isMobile ? 45 : 0
        }
      }
    },
    interaction: { intersect: false, mode: 'index' }
  };

  const websiteStatusOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { 
        position: isMobile ? 'bottom' : 'top', 
        labels: { 
          padding: isMobile ? 10 : 20, 
          usePointStyle: true,
          boxWidth: isMobile ? 8 : 12,
          font: { size: isMobile ? 10 : 12 }
        } 
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            const label = context.label || '';
            const value = context.raw || 0;
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const percentage = Math.round((value / total) * 100);
            return `${label}: ${value} (${percentage}%)`;
          }
        }
      }
    },
    cutout: isMobile ? '60%' : '65%'
  };

  // ==================== MODAL COMPONENTS ====================
  const ChatPopupModal = () => {
    if (!showChatPopup || !selectedWebsiteForChat) return null;

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
          <div className="p-4 md:p-6 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg md:text-xl font-bold text-gray-900 flex items-center">
              <FaComments className="mr-2 text-purple-600" />
              Chat History - {selectedWebsiteForChat.website_name}
            </h2>
            <button
              onClick={() => {
                setShowChatPopup(false);
                setSelectedUserChat(null);
                setUserChatMessages([]);
              }}
              className="text-gray-400 hover:text-gray-600 text-2xl"
            >
              &times;
            </button>
          </div>

          <div className="flex flex-col md:flex-row h-[calc(90vh-80px)]">
            <div className="w-full md:w-1/3 border-r border-gray-200 overflow-y-auto">
              <div className="p-3 bg-gray-50 border-b border-gray-200">
                <h3 className="font-semibold text-gray-700 flex items-center">
                  <FaUsers className="mr-2 text-blue-600" />
                  Users ({websiteChatUsers.length})
                </h3>
              </div>
              {loadingChats && selectedUserChat === null ? (
                <div className="flex items-center justify-center h-32">
                  <FaSpinner className="animate-spin text-blue-600 text-xl" />
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {websiteChatUsers.map((user, index) => (
                    <button
                      key={index}
                      onClick={() => loadUserChatMessages(selectedWebsiteForChat.website_id, user.email)}
                      className={`w-full p-3 text-left hover:bg-gray-50 transition-colors cursor-pointer ${
                        selectedUserChat === user.email ? 'bg-purple-50 border-l-4 border-purple-600' : ''
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <FaUser className="text-purple-600 text-sm" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 text-sm truncate">
                            {user.name || 'Anonymous User'}
                          </p>
                          <p className="text-xs text-gray-500 truncate flex items-center">
                            <FaEnvelope className="mr-1 flex-shrink-0" />
                            {user.email}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            {user.message_count || 0} messages • Last: {user.last_message_date ? formatDate(user.last_message_date) : 'N/A'}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                  {websiteChatUsers.length === 0 && (
                    <div className="p-4 text-center text-gray-500">
                      No chat users found
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="w-full md:w-2/3 flex flex-col h-full">
              {selectedUserChat ? (
                <>
                  <div className="p-3 bg-gray-50 border-b border-gray-200">
                    <h3 className="font-semibold text-gray-700 flex items-center">
                      <FaEnvelope className="mr-2 text-blue-600" />
                      Chat with {selectedUserChat}
                    </h3>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {loadingChats ? (
                      <div className="flex items-center justify-center h-32">
                        <FaSpinner className="animate-spin text-blue-600 text-xl" />
                      </div>
                    ) : (
                      userChatMessages.map((msg, index) => (
                        <div
                          key={index}
                          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] p-3 rounded-lg ${
                              msg.role === 'user'
                                ? 'bg-blue-600 text-white rounded-br-none'
                                : 'bg-gray-100 text-gray-900 rounded-bl-none'
                            }`}
                          >
                            <div className="flex items-center space-x-2 mb-1">
                              {msg.role === 'user' ? (
                                <FaUser className="text-xs opacity-75" />
                              ) : (
                                <FaRobot className="text-xs opacity-75" />
                              )}
                              <span className="text-xs opacity-75">
                                {msg.role === 'user' ? 'User' : 'Bot'}
                              </span>
                            </div>
                            <p className="text-sm whitespace-pre-wrap break-words">
                              {msg.message}
                            </p>
                            <p className="text-xs opacity-75 mt-1 text-right">
                              {formatDate(msg.created_at)}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                    {userChatMessages.length === 0 && !loadingChats && (
                      <div className="text-center text-gray-500 py-8">
                        No messages in this conversation
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <div className="text-center">
                    <FaComments className="text-4xl mx-auto mb-3 text-gray-300" />
                    <p>Select a user to view chat history</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const ContactFormDetailModal = ({ form, onClose, onUpdateStatus, websiteId }) => {
    if (!form) return null;

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
          <div className="p-4 md:p-6 border-b border-gray-200 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <FaEnvelope className="mr-2 text-blue-600" />
              Contact Form Details
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl"
            >
              &times;
            </button>
          </div>
          
          <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 100px)' }}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-xs text-blue-600 mb-1">Name</p>
                  <p className="font-medium text-gray-900">{form.name || 'N/A'}</p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <p className="text-xs text-green-600 mb-1">Email</p>
                  <p className="font-medium text-gray-900 break-all">{form.email || 'N/A'}</p>
                </div>
              </div>
              
              {form.phone && (
                <div className="bg-purple-50 p-4 rounded-lg">
                  <p className="text-xs text-purple-600 mb-1">Phone</p>
                  <p className="font-medium text-gray-900">{form.phone}</p>
                </div>
              )}
              
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-xs text-gray-600 mb-2">Message</p>
                <p className="text-gray-900 whitespace-pre-wrap">{form.message}</p>
              </div>
              
              <div className="flex justify-between items-center text-sm text-gray-500 border-t pt-4">
                <span>Received: {formatDate(form.created_at)}</span>
                <div className="flex items-center space-x-2">
                  <span className="text-gray-600">Status:</span>
                  {getStatusBadge(form.status)}
                </div>
              </div>

              {form.status === 'pending' && (
                <div className="border-t pt-4">
                  <p className="text-sm font-medium text-gray-700 mb-3">Update Status:</p>
                  <div className="flex space-x-3">
                    <button
                      onClick={() => onUpdateStatus(form.id, 'processed')}
                      disabled={updatingContactStatus}
                      className="flex-1 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                    >
                      {updatingContactStatus ? <FaSpinner className="animate-spin" /> : <FaCheckCircle />}
                      <span>Mark as Processed</span>
                    </button>
                    <button
                      onClick={() => onUpdateStatus(form.id, 'spam')}
                      disabled={updatingContactStatus}
                      className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                    >
                      {updatingContactStatus ? <FaSpinner className="animate-spin" /> : <FaExclamationTriangle />}
                      <span>Mark as Spam</span>
                    </button>
                  </div>
                </div>
              )}

              {form.status === 'processed' && (
                <div className="border-t pt-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                    <FaCheckCircle className="text-green-600 text-2xl mx-auto mb-2" />
                    <p className="text-green-800 font-medium">This form has been marked as processed</p>
                  </div>
                </div>
              )}

              {form.status === 'spam' && (
                <div className="border-t pt-4">
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                    <FaExclamationTriangle className="text-red-600 text-2xl mx-auto mb-2" />
                    <p className="text-red-800 font-medium">This form has been marked as spam</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const ContactFormsPopupModal = () => {
    if (!showContactPopup || !selectedWebsiteForContact) return null;

    const forms = websiteContactForms[selectedWebsiteForContact.website_id] || [];
    const [filter, setFilter] = useState('all');
    
    const filteredForms = filter === 'all' 
      ? forms 
      : forms.filter(form => form && form.status === filter);

    const pendingCount = forms.filter(f => f && f.status === 'pending').length;
    const processedCount = forms.filter(f => f && f.status === 'processed').length;
    const spamCount = forms.filter(f => f && f.status === 'spam').length;

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
          <div className="p-4 md:p-6 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg md:text-xl font-bold text-gray-900 flex items-center">
              <FaEnvelope className="mr-2 text-blue-600" />
              Contact Forms - {selectedWebsiteForContact.website_name}
            </h2>
            <button
              onClick={() => {
                setShowContactPopup(false);
                setSelectedContactForm(null);
              }}
              className="text-gray-400 hover:text-gray-600 text-2xl"
            >
              &times;
            </button>
          </div>

          <div className="p-4 md:p-6">
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  filter === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All ({forms.length})
              </button>
              <button
                onClick={() => setFilter('pending')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  filter === 'pending'
                    ? 'bg-yellow-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Pending ({pendingCount})
              </button>
              <button
                onClick={() => setFilter('processed')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  filter === 'processed'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Processed ({processedCount})
              </button>
              <button
                onClick={() => setFilter('spam')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  filter === 'spam'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Spam ({spamCount})
              </button>
            </div>

            {loadingContactForms ? (
              <div className="flex items-center justify-center py-12">
                <FaSpinner className="animate-spin text-blue-600 text-2xl" />
              </div>
            ) : filteredForms.length > 0 ? (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                {filteredForms.map((form, index) => (
                  <div
                    key={index}
                    className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => setSelectedContactForm(form)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                            <FaUser className="text-blue-600 text-sm" />
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900">{form.name || 'Anonymous'}</h4>
                            <p className="text-xs text-gray-500 flex items-center">
                              <FaEnvelope className="mr-1" />
                              {form.email}
                            </p>
                          </div>
                        </div>
                        <p className="text-sm text-gray-600 line-clamp-2 mb-2">
                          {form.message}
                        </p>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500 flex items-center">
                            <FaClock className="mr-1" />
                            {formatDate(form.created_at)}
                          </span>
                          {getStatusBadge(form.status)}
                        </div>
                      </div>
                      <button className="ml-2 p-2 text-blue-600 hover:bg-blue-50 rounded-lg">
                        <FaEye size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-gray-50 rounded-lg">
                <FaInbox className="text-gray-400 text-4xl mx-auto mb-3" />
                <p className="text-gray-600">No contact form submissions found</p>
                <p className="text-sm text-gray-500 mt-1">
                  {filter !== 'all' ? 'Try changing the filter' : 'No forms submitted yet'}
                </p>
              </div>
            )}
          </div>
        </div>

        {selectedContactForm && (
          <ContactFormDetailModal
            form={selectedContactForm}
            onClose={() => setSelectedContactForm(null)}
            onUpdateStatus={(formId, newStatus) => 
              handleUpdateContactStatus(formId, newStatus, selectedWebsiteForContact.website_id)
            }
            websiteId={selectedWebsiteForContact.website_id}
          />
        )}
      </div>
    );
  };

  // ==================== UI COMPONENTS ====================
  const MobileHeader = () => (
    <div className="md:hidden bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-30">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Admin Panel</h1>
          <p className="text-xs text-gray-600">Welcome, {user?.full_name?.split(' ')[0]}</p>
        </div>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 rounded-lg hover:bg-gray-100"
        >
          {isMobileMenuOpen ? <FaTimes size={20} /> : <FaBars size={20} />}
        </button>
      </div>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="absolute top-full left-0 right-0 bg-white border-b border-gray-200 shadow-lg px-4 py-3"
          >
            <div className="space-y-2">
              {[
                { id: 'dashboard', label: 'Dashboard', icon: <FaChartBar /> },
                { id: 'users', label: 'Users', icon: <FaUsers /> },
                { id: 'websites', label: 'Websites', icon: <FaRobot /> },
                { id: 'tokens', label: 'Token Usage', icon: <FaCoins /> },
                { id: 'reports', label: 'Reports', icon: <FaDatabase /> }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full px-4 py-3 text-left flex items-center space-x-3 rounded-lg cursor-pointer${
                    activeTab === tab.id
                      ? 'bg-purple-50 text-purple-600'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              ))}
              <button
                onClick={loadAdminData}
                className="w-full px-4 py-3 text-left flex items-center space-x-3 text-gray-600 hover:bg-gray-50 rounded-lg"
              >
                <FaSync className={isLoading ? 'animate-spin' : ''} />
                <span>Refresh</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  const MobileTabBar = () => (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-40 md:hidden">
      <div className="flex justify-around items-center h-16">
        {[
          { id: 'dashboard', icon: <FaHome className="text-xl" />, label: 'Home' },
          { id: 'users', icon: <FaUsers className="text-xl" />, label: 'Users' },
          { id: 'websites', icon: <FaGlobe className="text-xl" />, label: 'Sites' },
          { id: 'tokens', icon: <FaCoins className="text-xl" />, label: 'Tokens' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-col items-center justify-center flex-1 h-full ${
              activeTab === tab.id ? 'text-purple-600' : 'text-gray-500'
            }`}
          >
            {tab.icon}
            <span className="text-xs mt-1">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const MobileUserCard = ({ user }) => {
    const isExpanded = expandedUserId === user.id;
    const joinedDate = new Date(user.created_at);
    const lastActive = user.last_login ? new Date(user.last_login) : joinedDate;
    const isRecent = (new Date() - lastActive) < (7 * 24 * 60 * 60 * 1000);

    return (
      <div className="border border-gray-200 rounded-xl p-4 mb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 flex-1">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0">
              {user.full_name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 truncate">{user.full_name || 'Unknown User'}</p>
              <p className="text-xs text-gray-500 truncate">{user.email || 'No email provided'}</p>
            </div>
          </div>
          <button
            onClick={() => setExpandedUserId(isExpanded ? null : user.id)}
            className="p-2 hover:bg-gray-100 rounded-lg ml-2"
          >
            {isExpanded ? <FaChevronUp /> : <FaChevronDown />}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
            user.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
          }`}>
            {user.role || 'user'}
          </span>
          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
            user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            {user.is_active ? 'Active' : 'Inactive'}
          </span>
          <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs font-medium rounded-full">
            {user.website_count || 0} websites
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
                  <p className="text-gray-600 text-xs">Joined</p>
                  <p className="font-semibold text-blue-700 text-sm">
                    {joinedDate.toLocaleDateString()}
                  </p>
                </div>
                <div className="bg-green-50 p-2 rounded-lg">
                  <p className="text-gray-600 text-xs">Last Active</p>
                  <div className="flex items-center space-x-1">
                    <p className="font-semibold text-green-700 text-sm">
                      {lastActive.toLocaleDateString()}
                    </p>
                    {isRecent && (
                      <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex space-x-2">
                <button
                  onClick={() => handleViewUserDetails(user.id)}
                  className="cursor-pointer flex-1 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2"
                >
                  <FaEye />
                  <span>View Details</span>
                </button>
                <button
                  onClick={() => handleToggleUserStatus(user.id, user.is_active)}
                  className={`cursor-pointer flex-1 px-3 py-2 text-sm font-medium rounded-lg flex items-center justify-center space-x-2 ${
                    user.is_active
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-green-600 text-white hover:bg-green-700'
                  }`}
                >
                  {user.is_active ? (
                    <>
                      <FaUserTimes />
                      <span>Deactivate</span>
                    </>
                  ) : (
                    <>
                      <FaUserCheck />
                      <span>Activate</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const MobileWebsiteCard = ({ website }) => {
    const isExpanded = expandedWebsiteId === website.website_id;
    const createdDate = new Date(website.created_at);
    const daysAgo = Math.floor((new Date() - createdDate) / (1000 * 60 * 60 * 24));
    const contactFormsCount = website.contact_forms_count || 0;

    return (
      <div className="border border-gray-200 rounded-xl p-4 mb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 flex-1">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
              website.status === 'active' ? 'bg-blue-100' :
              website.status === 'training' ? 'bg-yellow-100' :
              'bg-gray-100'
            }`}>
              <FaRobot className={
                website.status === 'active' ? 'text-blue-600' :
                website.status === 'training' ? 'text-yellow-600' :
                'text-gray-600'
              } />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 truncate">{website.website_name}</p>
              <p className="text-xs text-gray-500 truncate">{website.website_url}</p>
            </div>
          </div>
          <button
            onClick={() => setExpandedWebsiteId(isExpanded ? null : website.website_id)}
            className="p-2 hover:bg-gray-100 rounded-lg ml-2"
          >
            {isExpanded ? <FaChevronUp /> : <FaChevronDown />}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
            website.status === 'active' ? 'bg-green-100 text-green-800' :
            website.status === 'training' ? 'bg-yellow-100 text-yellow-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {website.status}
          </span>
          <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs font-medium rounded-full">
            {daysAgo === 0 ? 'Today' : `${daysAgo}d ago`}
          </span>
        </div>

        <div className="mt-3 flex items-center space-x-4 text-sm">
          <div className="flex items-center space-x-1">
            <FaDatabase className="text-gray-400 text-xs" />
            <span className="text-xs">{website.data_points || '0'}</span>
          </div>
          <div className="flex items-center space-x-1">
            <FaEnvelope className="text-gray-400 text-xs" />
            <span className="text-xs">{website.contact_forms_count || '0'}</span>
          </div>
          <div className="flex items-center space-x-1">
            <FaComments className="text-gray-400 text-xs" />
            <span className="text-xs">{website.chat_messages_count || '0'}</span>
          </div>
        </div>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 space-y-3"
            >
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-600 rounded-full flex items-center justify-center text-white text-xs font-semibold">
                    {website.user_name?.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{website.user_name}</p>
                    <p className="text-xs text-gray-500">{website.user_email}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => loadWebsiteChatUsers(website)}
                  className="flex items-center justify-center space-x-2 px-3 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors"
                >
                  <FaComments />
                  <span>Chats</span>
                </button>
                <button
                  onClick={() => loadWebsiteContactForms(website)}
                  className="flex items-center justify-center space-x-2 px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors relative"
                >
                  <FaEnvelope />
                  <span>Forms</span>
                  {contactFormsCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                      {contactFormsCount > 9 ? '9+' : contactFormsCount}
                    </span>
                  )}
                </button>
              </div>

              <div className="flex space-x-2">
                <button
                  onClick={() => loadWebsiteDetails(website)}
                  className="cursor-pointer flex-1 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2"
                >
                  <FaEye />
                  <span>View</span>
                </button>
                <button
                  onClick={() => handleDeleteWebsite(website.website_id)}
                  className="flex-1 px-3 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center space-x-2"
                >
                  <FaTrash />
                  <span>Delete</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  // ==================== RENDER ====================
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-12 h-12 md:w-16 md:h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm md:text-base text-gray-600">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-50 pb-16 md:pb-0">
      {/* Mobile Header */}
      <MobileHeader />

      {/* Desktop Header */}
      <div className="hidden md:block bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-6">
          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Admin Panel</h1>
              <p className="text-sm lg:text-base text-gray-600 mt-1">
                Welcome, <span className="font-semibold text-purple-600">{user?.full_name}</span>!
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={loadAdminData}
                className="p-2 text-gray-600 hover:text-purple-600 hover:bg-purple-50 rounded-xl transition-colors"
                title="Refresh Data"
                type="button"
              >
                <FaSync className={isLoading ? 'animate-spin' : ''} />
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
              { id: 'dashboard', label: 'Dashboard', icon: <FaChartBar /> },
              { id: 'users', label: 'Users', icon: <FaUsers /> },
              { id: 'websites', label: 'Websites', icon: <FaRobot /> },
              { id: 'tokens', label: 'Token Usage', icon: <FaCoins /> },
              { id: 'reports', label: 'Reports', icon: <FaDatabase /> },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`cursor-pointer py-3 lg:py-4 px-1 flex items-center space-x-2 text-xs lg:text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-purple-600 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
                type="button"
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Desktop Content */}
        <div className="bg-white rounded-xl lg:rounded-2xl shadow-lg p-4 lg:p-6">
          {activeTab === 'dashboard' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              {/* Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-6 lg:mb-8">
                <StatsCard
                  icon={<FaUsers />}
                  title="Total Users"
                  value={adminStats?.total_users || 0}
                  color="border-purple-200 hover:border-purple-300"
                  change={Math.round(((adminStats?.total_users || 0) - ((adminStats?.total_users || 0) * 0.88)) / ((adminStats?.total_users || 0) * 0.88) * 100)}
                />
                <StatsCard
                  icon={<FaRobot />}
                  title="Total Websites"
                  value={adminStats?.total_websites || 0}
                  color="border-blue-200 hover:border-blue-300"
                  change={Math.round(((adminStats?.total_websites || 0) - ((adminStats?.total_websites || 0) * 0.92)) / ((adminStats?.total_websites || 0) * 0.92) * 100)}
                />
                <StatsCard
                  icon={<FaComments />}
                  title="Today's Messages"
                  value={adminStats?.messages_today || 0}
                  color="border-green-200 hover:border-green-300"
                  change={Math.round(((adminStats?.messages_today || 0) - ((adminStats?.messages_today || 0) * 0.85)) / ((adminStats?.messages_today || 0) * 0.85) * 100)}
                />
                <StatsCard
                  icon={<FaEnvelope />}
                  title="Today's Forms"
                  value={adminStats?.forms_today || 0}
                  color="border-yellow-200 hover:border-yellow-300"
                  change={Math.round(((adminStats?.forms_today || 0) - ((adminStats?.forms_today || 0) * 0.95)) / ((adminStats?.forms_today || 0) * 0.95) * 100)}
                />
              </div>
              
              {/* Charts Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 mb-6 lg:mb-8">
                {/* User Growth Chart */}
                <div className="bg-white rounded-xl lg:rounded-2xl shadow-lg p-4 lg:p-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 lg:mb-6">
                    <div>
                      <h3 className="text-base lg:text-lg font-semibold text-gray-900">User Growth</h3>
                      <p className="text-xs lg:text-sm text-gray-600">Real user registration trends</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setGrowthPeriod('monthly')}
                        className={`cursor-pointer px-2 lg:px-3 py-1 text-xs lg:text-sm rounded-lg flex items-center space-x-1 transition-colors ${
                          growthPeriod === 'monthly' 
                            ? 'bg-purple-100 text-purple-700' 
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                        type="button"
                      >
                        <FaCalendar className="text-xs" />
                        <span>Monthly</span>
                      </button>
                      <button
                        onClick={() => setGrowthPeriod('yearly')}
                        className={`cursor-pointer px-2 lg:px-3 py-1 text-xs lg:text-sm rounded-lg flex items-center space-x-1 transition-colors ${
                          growthPeriod === 'yearly' 
                            ? 'bg-purple-100 text-purple-700' 
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                        type="button"
                      >
                        <FaCalendarAlt className="text-xs" />
                        <span>Yearly</span>
                      </button>
                    </div>
                  </div>
                  <div className="h-48 sm:h-56 lg:h-64">
                    {userGrowthData && userGrowthData.values && userGrowthData.values.some(val => val > 0) ? (
                      <Line data={userGrowthChart} options={userGrowthOptions} />
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-gray-500">
                        <FaChartLine className="text-2xl lg:text-4xl mb-2 opacity-50" />
                        <p className="text-xs lg:text-sm">No user growth data available</p>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 lg:mt-4 text-xs lg:text-sm text-gray-600 flex flex-wrap justify-between gap-2">
                    <div>
                      <span className="font-medium">Total Growth:</span>{' '}
                      {userGrowthData?.values?.reduce((a, b) => a + b, 0) || 0} users
                    </div>
                    <div>
                      <span className="font-medium">Average:</span>{' '}
                      {userGrowthData?.values?.length 
                        ? Math.round(userGrowthData.values.reduce((a, b) => a + b, 0) / userGrowthData.values.length)
                        : 0} per period
                    </div>
                  </div>
                </div>
                
                {/* Website Status Chart */}
                <div className="bg-white rounded-xl lg:rounded-2xl shadow-lg p-4 lg:p-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 lg:mb-6">
                    <div>
                      <h3 className="text-base lg:text-lg font-semibold text-gray-900">Website Status</h3>
                      <p className="text-xs lg:text-sm text-gray-600">Real-time website status distribution</p>
                    </div>
                    <div className="px-2 lg:px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-xs lg:text-sm">
                      {allWebsites.length} total
                    </div>
                  </div>
                  <div className="h-48 sm:h-56 lg:h-64 flex items-center justify-center">
                    {websiteStatusData && websiteStatusData.values && websiteStatusData.values.some(val => val > 0) ? (
                      <Doughnut data={websiteStatsChart} options={websiteStatusOptions} />
                    ) : (
                      <div className="text-gray-500">
                        <FaRobot className="text-2xl lg:text-4xl mb-2 opacity-50 mx-auto" />
                        <p className="text-xs lg:text-sm">No website data available</p>
                      </div>
                    )}
                  </div>
                  <div className="mt-4 lg:mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2 lg:gap-4">
                    {websiteStatusData?.labels?.map((label, index) => (
                      <div key={label} className="text-center">
                        <div className={`text-base lg:text-2xl font-bold ${
                          label === 'Active' ? 'text-green-600' :
                          label === 'Training' ? 'text-yellow-600' :
                          label === 'Inactive' ? 'text-gray-600' :
                          'text-red-600'
                        }`}>
                          {websiteStatusData?.values?.[index] || 0}
                        </div>
                        <div className="text-xs lg:text-sm text-gray-600 truncate">{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
              {/* Detailed Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6 mb-6 lg:mb-8">
                <div className="bg-white rounded-xl lg:rounded-2xl shadow-lg p-4 lg:p-6">
                  <div className="flex items-center justify-between mb-3 lg:mb-4">
                    <h4 className="text-sm lg:text-base font-semibold text-gray-900">User Activity</h4>
                    <FaUsers className="text-blue-500 text-lg lg:text-xl" />
                  </div>
                  <div className="space-y-2 lg:space-y-3">
                    <div className="flex justify-between text-xs lg:text-sm">
                      <span className="text-gray-600">Active Today</span>
                      <span className="font-medium">{
                        allUsers.filter(user => {
                          const today = new Date();
                          const userDate = new Date(user.last_login || user.created_at);
                          return userDate.toDateString() === today.toDateString();
                        }).length
                      }</span>
                    </div>
                    <div className="flex justify-between text-xs lg:text-sm">
                      <span className="text-gray-600">Active This Week</span>
                      <span className="font-medium">{
                        allUsers.filter(user => {
                          const weekAgo = new Date();
                          weekAgo.setDate(weekAgo.getDate() - 7);
                          const userDate = new Date(user.last_login || user.created_at);
                          return userDate >= weekAgo;
                        }).length
                      }</span>
                    </div>
                    <div className="flex justify-between text-xs lg:text-sm">
                      <span className="text-gray-600">New This Month</span>
                      <span className="font-medium">{
                        allUsers.filter(user => {
                          const monthAgo = new Date();
                          monthAgo.setMonth(monthAgo.getMonth() - 1);
                          const userDate = new Date(user.created_at);
                          return userDate >= monthAgo;
                        }).length
                      }</span>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white rounded-xl lg:rounded-2xl shadow-lg p-4 lg:p-6">
                  <div className="flex items-center justify-between mb-3 lg:mb-4">
                    <h4 className="text-sm lg:text-base font-semibold text-gray-900">Website Performance</h4>
                    <FaChartBar className="text-green-500 text-lg lg:text-xl" />
                  </div>
                  <div className="space-y-2 lg:space-y-3">
                    <div className="flex justify-between text-xs lg:text-sm">
                      <span className="text-gray-600">Avg Messages/Day</span>
                      <span className="font-medium">
                        {adminStats?.avg_messages_per_day || 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs lg:text-sm">
                      <span className="text-gray-600">Avg Forms/Day</span>
                      <span className="font-medium">
                        {adminStats?.avg_forms_per_day || 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs lg:text-sm">
                      <span className="text-gray-600">Avg Training Time</span>
                      <span className="font-medium">
                        {adminStats?.avg_training_time ? `${adminStats.avg_training_time}s` : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white rounded-xl lg:rounded-2xl shadow-lg p-4 lg:p-6">
                  <div className="flex items-center justify-between mb-3 lg:mb-4">
                    <h4 className="text-sm lg:text-base font-semibold text-gray-900">System Health</h4>
                    <FaDatabase className="text-purple-500 text-lg lg:text-xl" />
                  </div>
                  <div className="space-y-2 lg:space-y-3">
                    <div className="flex justify-between text-xs lg:text-sm">
                      <span className="text-gray-600">Database Size</span>
                      <span className="font-medium">{adminStats?.database_size || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between text-xs lg:text-sm">
                      <span className="text-gray-600">Uptime</span>
                      <span className="font-medium text-green-600">99.8%</span>
                    </div>
                    <div className="flex justify-between text-xs lg:text-sm">
                      <span className="text-gray-600">Active Sessions</span>
                      <span className="font-medium">{adminStats?.active_sessions || 'N/A'}</span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Recent Activity */}
              <div className="bg-white rounded-xl lg:rounded-2xl shadow-lg p-4 lg:p-6">
                <div className="flex justify-between items-center mb-4 lg:mb-6">
                  <h3 className="text-base lg:text-lg font-semibold text-gray-900">Recent Activity</h3>
                  <div className="text-xs lg:text-sm text-gray-600">
                    Last 24 hours
                  </div>
                </div>
                <div className="space-y-3 lg:space-y-4">
                  {allWebsites.slice(0, 5).map(website => (
                    <div key={website.website_id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 lg:p-4 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors gap-3">
                      <div className="flex items-center space-x-3">
                        <div className={`w-8 h-8 lg:w-10 lg:h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          website.status === 'active' ? 'bg-green-100' :
                          website.status === 'training' ? 'bg-yellow-100' :
                          'bg-gray-100'
                        }`}>
                          <FaRobot className={`text-sm lg:text-base ${
                            website.status === 'active' ? 'text-green-600' :
                            website.status === 'training' ? 'text-yellow-600' :
                            'text-gray-600'
                          }`} />
                        </div>
                        <div>
                          <p className="text-sm lg:text-base font-medium text-gray-900">{website.website_name}</p>
                          <p className="text-xs lg:text-sm text-gray-500">
                            by {website.user_name || 'Unknown User'} • {website.website_url}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end sm:space-x-4 ml-11 sm:ml-0">
                        <p className="text-xs lg:text-sm text-gray-600">
                          {new Date(website.created_at).toLocaleDateString()}
                        </p>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          website.status === 'active' ? 'bg-green-100 text-green-800' :
                          website.status === 'training' ? 'bg-yellow-100 text-yellow-800' :
                          website.status === 'inactive' ? 'bg-gray-100 text-gray-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {website.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {allWebsites.length === 0 && (
                  <div className="text-center py-8 lg:py-12">
                    <div className="w-12 h-12 lg:w-20 lg:h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <FaRobot className="text-gray-400 text-lg lg:text-2xl" />
                    </div>
                    <h3 className="text-sm lg:text-lg font-medium text-gray-900 mb-2">No recent activity</h3>
                    <p className="text-xs lg:text-sm text-gray-600">No websites have been created recently</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
          
          {/* Users Tab - Desktop */}
          {activeTab === 'users' && (
            <div>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                  <h2 className="text-lg lg:text-xl font-bold text-gray-900">User Management</h2>
                  <p className="text-xs lg:text-sm text-gray-600 mt-1">
                    {allUsers.length} total users • {allUsers.filter(u => u.is_active).length} active • {allUsers.filter(u => !u.is_active).length} inactive
                  </p>
                </div>
                <div className="flex space-x-3">
                  <button 
                    onClick={handleAddAdmin}
                    className="cursor-pointer px-3 lg:px-4 py-2 text-sm bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-colors flex items-center"
                    type="button"
                  >
                    <FaUserShield className="mr-2 text-sm" />
                    <span className="hidden sm:inline">Add Admin</span>
                    <span className="sm:hidden">Admin</span>
                  </button>
                </div>
              </div>

              <SearchFilterBar 
                activeTab={activeTab}
                searchTerm={searchTerm}
                onSearchChange={handleSearchChange}
                filterStatus={filterStatus}
                onFilterChange={handleFilterChange}
                sortBy={sortBy}
                onSortChange={handleSortChange}
              />
              
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px]">
                  <thead>
                    <tr className="text-left text-gray-600 border-b">
                      <th className="pb-3 text-xs lg:text-sm">User</th>
                      <th className="pb-3 text-xs lg:text-sm">Role</th>
                      <th className="pb-3 text-xs lg:text-sm">Websites</th>
                      <th className="pb-3 text-xs lg:text-sm">Joined</th>
                      <th className="pb-3 text-xs lg:text-sm">Last Active</th>
                      <th className="pb-3 text-xs lg:text-sm">Status</th>
                      <th className="pb-3 text-xs lg:text-sm text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredUsers().map(user => {
                      const joinedDate = new Date(user.created_at);
                      const lastActive = user.last_login ? new Date(user.last_login) : joinedDate;
                      const isRecent = (new Date() - lastActive) < (7 * 24 * 60 * 60 * 1000);
                      
                      return (
                        <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 lg:py-4">
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 lg:w-10 lg:h-10 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-semibold text-sm lg:text-base">
                                {user.full_name?.charAt(0).toUpperCase() || 'U'}
                              </div>
                              <div>
                                <p className="text-sm lg:text-base font-medium text-gray-900">{user.full_name || 'Unknown User'}</p>
                                <p className="text-xs lg:text-sm text-gray-500">{user.email || 'No email provided'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 lg:py-4">
                            <span className={`px-2 lg:px-3 py-1 text-xs font-medium rounded-full ${
                              user.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                            }`}>
                              {user.role || 'user'}
                            </span>
                          </td>
                          <td className="py-3 lg:py-4">
                            <div className="flex items-center space-x-2">
                              <FaRobot className="text-gray-400 text-xs lg:text-sm" />
                              <span className="text-xs lg:text-sm">{user.website_count || 0}</span>
                            </div>
                          </td>
                          <td className="py-3 lg:py-4 text-xs lg:text-sm text-gray-600">
                            {joinedDate.toLocaleDateString()}
                          </td>
                          <td className="py-3 lg:py-4">
                            <div className="flex items-center space-x-2">
                              <span className={`text-xs lg:text-sm ${
                                isRecent ? 'text-green-600' : 'text-gray-600'
                              }`}>
                                {lastActive.toLocaleDateString()}
                              </span>
                              {isRecent && (
                                <span className="w-1.5 h-1.5 lg:w-2 lg:h-2 bg-green-500 rounded-full"></span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 lg:py-4">
                            <span className={`px-2 lg:px-3 py-1 text-xs font-medium rounded-full ${
                              user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {user.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="py-3 lg:py-4">
                            <div className="flex justify-end space-x-2">
                              <button
                                onClick={() => handleViewUserDetails(user.id)}
                                className="cursor-pointer p-1.5 lg:p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                                title="View User Details"
                                type="button"
                              >
                                <FaEye size={14} />
                              </button>
                              <button
                                onClick={() => handleToggleUserStatus(user.id, user.is_active)}
                                className={`p-1.5 cursor-pointer lg:p-2 rounded-lg transition-colors ${
                                  user.is_active
                                    ? 'text-red-600 hover:text-red-800 hover:bg-red-50'
                                    : 'text-green-600 hover:text-green-800 hover:bg-green-50'
                                }`}
                                title={user.is_active ? 'Deactivate User' : 'Activate User'}
                                type="button"
                              >
                                {user.is_active ? <FaUserTimes size={14} /> : <FaUserCheck size={14} />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              
              {getFilteredUsers().length === 0 && (
                <div className="text-center py-8 lg:py-12">
                  <div className="w-12 h-12 lg:w-20 lg:h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FaUsers className="text-gray-400 text-lg lg:text-2xl" />
                  </div>
                  <h3 className="text-sm lg:text-lg font-medium text-gray-900 mb-2">No users found</h3>
                  <p className="text-xs lg:text-sm text-gray-600">No users match your search criteria</p>
                </div>
              )}
            </div>
          )}
          
          {/* Websites Tab - Desktop */}
          {activeTab === 'websites' && (
            <div>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                  <h2 className="text-lg lg:text-xl font-bold text-gray-900">All Websites Chatbots Details</h2>
                  <p className="text-xs lg:text-sm text-gray-600 mt-1">
                    Showing {allWebsites.length} websites • {allWebsites.filter(w => w.status === 'active').length} active • {allWebsites.filter(w => w.status === 'training').length} training
                  </p>
                </div>
              </div>

              <SearchFilterBar 
                activeTab={activeTab}
                searchTerm={searchTerm}
                onSearchChange={handleSearchChange}
                filterStatus={filterStatus}
                onFilterChange={handleFilterChange}
                sortBy={sortBy}
                onSortChange={handleSortChange}
              />
              
              {getFilteredWebsites().length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1000px]">
                    <thead>
                      <tr className="text-left text-gray-600 border-b">
                        <th className="pb-3 text-xs lg:text-sm">Website</th>
                        <th className="pb-3 text-xs lg:text-sm">Owner</th>
                        <th className="pb-3 text-xs lg:text-sm">Status</th>
                        <th className="pb-3 text-xs lg:text-sm">Data</th>
                        <th className="pb-3 text-xs lg:text-sm">Created</th>
                        <th className="pb-3 text-xs lg:text-sm text-center">Chat</th>
                        <th className="pb-3 text-xs lg:text-sm text-center">Contact Forms</th>
                        <th className="pb-3 text-xs lg:text-sm text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getFilteredWebsites().map(website => {
                        const createdDate = new Date(website.created_at);
                        const daysAgo = Math.floor((new Date() - createdDate) / (1000 * 60 * 60 * 24));
                        const contactFormsCount = website.contact_forms_count || 0;
                        
                        return (
                          <tr key={website.website_id} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-3 lg:py-4">
                              <div className="flex items-center space-x-3">
                                <div className={`w-8 h-8 lg:w-10 lg:h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                  website.status === 'active' ? 'bg-blue-100' :
                                  website.status === 'training' ? 'bg-yellow-100' :
                                  'bg-gray-100'
                                }`}>
                                  <FaRobot className={`text-sm lg:text-base ${
                                    website.status === 'active' ? 'text-blue-600' :
                                    website.status === 'training' ? 'text-yellow-600' :
                                    'text-gray-600'
                                  }`} />
                                </div>
                                <div>
                                  <p className="text-sm lg:text-base font-medium text-gray-900">{website.website_name}</p>
                                  <p className="text-xs lg:text-sm text-gray-500 truncate max-w-[150px] lg:max-w-xs">{website.website_url}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 lg:py-4">
                              <div className="flex items-center space-x-2">
                                <div className="w-6 h-6 lg:w-8 lg:h-8 bg-gradient-to-r from-purple-500 to-pink-600 rounded-full flex items-center justify-center text-white text-xs font-semibold">
                                  {website.user_name?.charAt(0).toUpperCase() || 'U'}
                                </div>
                                <div>
                                  <p className="text-xs lg:text-sm font-medium text-gray-900">{website.user_name || 'Unknown User'}</p>
                                  <p className="text-xs text-gray-500 hidden lg:block">{website.user_email || 'No email'}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 lg:py-4">
                              <div className="flex flex-col space-y-1">
                                <span className={`px-2 lg:px-3 py-1 text-xs font-medium rounded-full ${
                                  website.status === 'active' ? 'bg-green-100 text-green-800' :
                                  website.status === 'training' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {website.status}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {daysAgo === 0 ? 'Today' : `${daysAgo} days ago`}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 lg:py-4">
                              <div className="flex items-center space-x-2 lg:space-x-4 text-xs lg:text-sm">
                                <div title="Contact Forms" className="flex items-center space-x-1">
                                  <FaEnvelope className="text-gray-400 text-xs" />
                                  <span>{website.contact_forms_count || '0'}</span>
                                </div>
                                <div title="Chat Messages" className="flex items-center space-x-1">
                                  <FaComments className="text-gray-400 text-xs" />
                                  <span>{website.chat_messages_count || '0'}</span>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 lg:py-4 text-xs lg:text-sm text-gray-600">
                              {createdDate.toLocaleDateString()}
                            </td>
                            <td className="py-3 lg:py-4 text-center">
                              <button
                                onClick={() => loadWebsiteChatUsers(website)}
                                className="cursor-pointer p-1.5 lg:p-2 text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded-lg transition-colors"
                                title="View Chat History"
                                type="button"
                              >
                                <FaComments size={16} />
                              </button>
                            </td>
                            <td className="py-3 lg:py-4 text-center">
                              <button
                                onClick={() => loadWebsiteContactForms(website)}
                                className={`cursor-pointer p-1.5 lg:p-2 rounded-lg transition-colors relative ${
                                  contactFormsCount > 0
                                    ? 'text-green-600 hover:text-green-800 hover:bg-green-50'
                                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                                }`}
                                title="View Contact Forms"
                                type="button"
                              >
                                <FaEnvelope size={16} />
                                {contactFormsCount > 0 && (
                                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                                    {contactFormsCount > 9 ? '9+' : contactFormsCount}
                                  </span>
                                )}
                              </button>
                            </td>
                            <td className="py-3 lg:py-4">
                              <div className="flex justify-end space-x-2">
                                <button
                                  onClick={() => loadWebsiteDetails(website)}
                                  className="cursor-pointer p-1.5 lg:p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="View Website Details"
                                  type="button"
                                >
                                  <FaEye size={14} />
                                </button>
                                <button
                                  onClick={() => handleDeleteWebsite(website.website_id)}
                                  className="cursor-pointer p-1.5 lg:p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Delete"
                                  type="button"
                                >
                                  <FaTrash size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 lg:py-12">
                  <div className="w-12 h-12 lg:w-20 lg:h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FaRobot className="text-gray-400 text-lg lg:text-2xl" />
                  </div>
                  <h3 className="text-sm lg:text-lg font-medium text-gray-900 mb-2">No websites found</h3>
                  <p className="text-xs lg:text-sm text-gray-600">No websites match your search criteria</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile Content */}
      <div className="md:hidden px-4 py-4 pb-20">
        {/* Mobile Dashboard */}
        {activeTab === 'dashboard' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <StatsCard
                icon={<FaUsers />}
                title="Total Users"
                value={adminStats?.total_users || 0}
                color="border-purple-200"
              />
              <StatsCard
                icon={<FaRobot />}
                title="Total Websites"
                value={adminStats?.total_websites || 0}
                color="border-blue-200"
              />
              <StatsCard
                icon={<FaComments />}
                title="Today's Msgs"
                value={adminStats?.messages_today || 0}
                color="border-green-200"
              />
              <StatsCard
                icon={<FaEnvelope />}
                title="Today's Forms"
                value={adminStats?.forms_today || 0}
                color="border-yellow-200"
              />
            </div>
            
            {/* Charts Section */}
            <div className="space-y-4 mb-4">
              {/* User Growth Chart */}
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">User Growth</h3>
                    <p className="text-xs text-gray-600">Registration trends</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setGrowthPeriod('monthly')}
                      className={`px-2 py-1 text-xs rounded-lg ${
                        growthPeriod === 'monthly' 
                          ? 'bg-purple-100 text-purple-700' 
                          : 'text-gray-600'
                      }`}
                    >
                      Monthly
                    </button>
                    <button
                      onClick={() => setGrowthPeriod('yearly')}
                      className={`px-2 py-1 text-xs rounded-lg ${
                        growthPeriod === 'yearly' 
                          ? 'bg-purple-100 text-purple-700' 
                          : 'text-gray-600'
                      }`}
                    >
                      Yearly
                    </button>
                  </div>
                </div>
                <div className="h-48">
                  {userGrowthData && userGrowthData.values && userGrowthData.values.some(val => val > 0) ? (
                    <Line data={userGrowthChart} options={userGrowthOptions} />
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-500">
                      <FaChartLine className="text-2xl mb-2 opacity-50" />
                      <p className="text-xs">No data available</p>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Website Status Chart */}
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">Website Status</h3>
                    <p className="text-xs text-gray-600">Status distribution</p>
                  </div>
                  <div className="px-2 py-1 bg-gray-100 text-gray-700 rounded-lg text-xs">
                    {allWebsites.length} total
                  </div>
                </div>
                <div className="h-48 flex items-center justify-center">
                  {websiteStatusData && websiteStatusData.values && websiteStatusData.values.some(val => val > 0) ? (
                    <Doughnut data={websiteStatsChart} options={websiteStatusOptions} />
                  ) : (
                    <div className="text-gray-500">
                      <FaRobot className="text-2xl mb-2 opacity-50 mx-auto" />
                      <p className="text-xs">No data available</p>
                    </div>
                  )}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {websiteStatusData?.labels?.map((label, index) => (
                    <div key={label} className="text-center">
                      <div className={`text-lg font-bold ${
                        label === 'Active' ? 'text-green-600' :
                        label === 'Training' ? 'text-yellow-600' :
                        'text-gray-600'
                      }`}>
                        {websiteStatusData?.values?.[index] || 0}
                      </div>
                      <div className="text-xs text-gray-600">{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            {/* Quick Stats */}
            <div className="space-y-3">
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h4 className="font-medium text-gray-900 mb-3 text-sm">User Activity</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Active Today</span>
                    <span className="font-medium">{
                      allUsers.filter(user => {
                        const today = new Date();
                        const userDate = new Date(user.last_login || user.created_at);
                        return userDate.toDateString() === today.toDateString();
                      }).length
                    }</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Active This Week</span>
                    <span className="font-medium">{
                      allUsers.filter(user => {
                        const weekAgo = new Date();
                        weekAgo.setDate(weekAgo.getDate() - 7);
                        const userDate = new Date(user.last_login || user.created_at);
                        return userDate >= weekAgo;
                      }).length
                    }</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">New This Month</span>
                    <span className="font-medium">{
                      allUsers.filter(user => {
                        const monthAgo = new Date();
                        monthAgo.setMonth(monthAgo.getMonth() - 1);
                        const userDate = new Date(user.created_at);
                        return userDate >= monthAgo;
                      }).length
                    }</span>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h4 className="font-medium text-gray-900 mb-3 text-sm">Recent Activity</h4>
                <div className="space-y-3">
                  {allWebsites.slice(0, 3).map(website => (
                    <div key={website.website_id} className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                          website.status === 'active' ? 'bg-green-100' :
                          website.status === 'training' ? 'bg-yellow-100' :
                          'bg-gray-100'
                        }`}>
                          <FaRobot className={`text-xs ${
                            website.status === 'active' ? 'text-green-600' :
                            website.status === 'training' ? 'text-yellow-600' :
                            'text-gray-600'
                          }`} />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-900">{website.website_name}</p>
                          <p className="text-xs text-gray-500">{new Date(website.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        website.status === 'active' ? 'bg-green-100 text-green-800' :
                        website.status === 'training' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {website.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
        
        {/* Mobile Users */}
        {activeTab === 'users' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="font-semibold text-gray-900">User Management</h2>
                <p className="text-xs text-gray-600">
                  {allUsers.length} total • {allUsers.filter(u => u.is_active).length} active
                </p>
              </div>
              <button
                onClick={handleAddAdmin}
                className="px-3 py-2 bg-purple-600 text-white text-sm rounded-lg flex items-center"
              >
                <FaUserShield className="mr-2" />
                Add Admin
              </button>
            </div>

            <SearchFilterBar 
              activeTab={activeTab}
              searchTerm={searchTerm}
              onSearchChange={handleSearchChange}
              filterStatus={filterStatus}
              onFilterChange={handleFilterChange}
              sortBy={sortBy}
              onSortChange={handleSortChange}
            />

            <div className="space-y-2">
              {getFilteredUsers().map(user => (
                <MobileUserCard key={user.id} user={user} />
              ))}
            </div>

            {getFilteredUsers().length === 0 && (
              <div className="text-center py-8">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-2">
                  <FaUsers className="text-gray-400" />
                </div>
                <p className="text-sm text-gray-600">No users found</p>
              </div>
            )}
          </div>
        )}

        {/* File Preview Modal */}
        {showFilePreview && selectedFile && selectedWebsiteForDetails && (
          <FilePreviewModal
            file={selectedFile}
            websiteId={selectedWebsiteForDetails.website_id}
            onClose={() => {
              setShowFilePreview(false);
              setSelectedFile(null);
            }}
          />
        )}

        {/* Mobile Websites */}
        {activeTab === 'websites' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="font-semibold text-gray-900">All Websites</h2>
                <p className="text-xs text-gray-600">
                  {allWebsites.length} total • {allWebsites.filter(w => w.status === 'active').length} active
                </p>
              </div>
            </div>

            <SearchFilterBar 
              activeTab={activeTab}
              searchTerm={searchTerm}
              onSearchChange={handleSearchChange}
              filterStatus={filterStatus}
              onFilterChange={handleFilterChange}
              sortBy={sortBy}
              onSortChange={handleSortChange}
            />

            <div className="space-y-2">
              {getFilteredWebsites().map(website => (
                <MobileWebsiteCard key={website.website_id} website={website} />
              ))}
            </div>

            {getFilteredWebsites().length === 0 && (
              <div className="text-center py-8">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-2">
                  <FaRobot className="text-gray-400" />
                </div>
                <p className="text-sm text-gray-600">No websites found</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mobile Tab Bar */}
      <MobileTabBar />

      {/* Website Details Modal */}
      <WebsiteDetailsModal />

      {/* Modals */}
      <AddAdminModal 
        isOpen={showAddAdminModal}
        onClose={handleCloseAddAdminModal}
        onCreateAdmin={handleCreateAdmin}
        isCreatingAdmin={isCreatingAdmin}
      />

      <UserDetailsModal
        isOpen={showUserDetailsModal}
        onClose={handleCloseUserDetailsModal}
        user={selectedUser}
        isLoading={isLoadingUserDetails}
      />

      {/* Chat and Contact Modals */}
      <ChatPopupModal />
      <ContactFormsPopupModal />

      {activeTab === 'reports' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <Reports />
        </motion.div>
      )}

      {activeTab === 'tokens' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <TokenDashboard />
        </motion.div>
      )}
    </div>
  );
};

export default AdminPanel;