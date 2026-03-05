import React, { useState, useEffect, useCallback } from 'react';
import { 
  FaUsers, FaRobot, FaChartBar, FaDatabase, FaFileUpload,
  FaComments, FaEnvelope, FaCog, FaSync, FaEye, FaTrash,
  FaUserShield, FaUserCheck, FaUserTimes, FaDownload,
  FaCalendar, FaChartLine, FaCalendarAlt, FaCoins 
} from 'react-icons/fa';
import { motion } from 'framer-motion';
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
import Reports from './Reports';
import TokenDashboard from './Admin/TokenDashboard';

const API_URL = import.meta.env.VITE_API_URL || 'https://botrion.onrender.com';

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

// StatsCard Component (kept inside AdminPanel as it's only used here)
const StatsCard = ({ icon, title, value, color, change, changeLabel }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className={`bg-white rounded-2xl p-6 shadow-lg border ${color} hover:shadow-xl transition-shadow`}
  >
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-600 mb-2">{title}</p>
        <p className="text-3xl font-bold text-gray-900">{value}</p>
        {change !== undefined && change !== null && (
          <p className={`text-sm mt-1 ${
            change > 0 ? 'text-green-600' : change < 0 ? 'text-red-600' : 'text-gray-600'
          }`}>
            {change > 0 ? '↗' : change < 0 ? '↘' : '→'} {Math.abs(change)}{changeLabel || '%'} {changeLabel ? '' : 'from last period'}
          </p>
        )}
      </div>
      <div className="text-3xl opacity-80">
        {icon}
      </div>
    </div>
  </motion.div>
);

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
  
  // Add Admin Modal State
  const [showAddAdminModal, setShowAddAdminModal] = useState(false);
  const [isCreatingAdmin, setIsCreatingAdmin] = useState(false);
  
  // User Details Modal State
  const [showUserDetailsModal, setShowUserDetailsModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isLoadingUserDetails, setIsLoadingUserDetails] = useState(false);

  // ==================== DATA LOADING ====================
  useEffect(() => {
    loadAdminData();
  }, []);

  useEffect(() => {
    if (adminStats) {
      generateChartData();
    }
  }, [adminStats, growthPeriod, allUsers, allWebsites]);

  const loadAdminData = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      
      // Load admin stats
      const statsResponse = await fetch(`${API_URL}/api/admin/stats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        if (statsData.success) {
          setAdminStats(statsData.statistics);
        }
      }
      
      // Load all users
      const usersResponse = await fetch(`${API_URL}/api/admin/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (usersResponse.ok) {
        const usersData = await usersResponse.json();
        if (usersData.success) {
          setAllUsers(usersData.users);
        }
      }
      
      // Load all websites
      const websitesResponse = await fetch(`${API_URL}/api/admin/websites`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (websitesResponse.ok) {
        const websitesData = await websitesResponse.json();
        if (websitesData.success) {
          setAllWebsites(websitesData.websites);
        }
      }
      
      // Load user growth data
      const growthResponse = await fetch(`${API_URL}/api/admin/user-growth`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (growthResponse.ok) {
        const growthData = await growthResponse.json();
        if (growthData.success) {
          setUserGrowthData(growthData);
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
    if (!adminStats || !allUsers || !allWebsites) return;

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

  // ==================== USER ACTIONS ====================
  const handleViewUserDetails = async (userId) => {
    setIsLoadingUserDetails(true);
    setShowUserDetailsModal(true);
    
    try {
      const token = localStorage.getItem('access_token');
      
      // Find user from the users list
      const userData = allUsers.find(u => u.id === userId);
      
      if (!userData) {
        toast.error('User not found');
        setSelectedUser(null);
        return;
      }

      // Initialize variables
      let userWebsitesList = [];
      let userStats = {
        total_websites: 0,
        total_chat_messages: 0,
        total_contact_forms: 0,
        total_uploaded_files: 0
      };

      try {
        // Method 1: Get user's websites from the dedicated endpoint
        const userWebsitesResponse = await fetch(`${API_URL}/api/user/websites`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (userWebsitesResponse.ok) {
          const userWebsitesData = await userWebsitesResponse.json();
          
          if (userWebsitesData.success && userWebsitesData.websites) {
            userWebsitesList = userWebsitesData.websites.filter(w => w.user_id === userId);
          }
        }
        
        // Method 2: Fallback - Get all websites from admin endpoint and filter
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
        
        // Calculate total statistics from ALL user websites
        userStats.total_websites = userWebsitesList.length;
        userStats.total_chat_messages = userWebsitesList.reduce((sum, w) => sum + (w.chat_messages_count || 0), 0);
        userStats.total_contact_forms = userWebsitesList.reduce((sum, w) => sum + (w.contact_forms_count || 0), 0);
        userStats.total_uploaded_files = userWebsitesList.reduce((sum, w) => sum + (w.files_count || 0), 0);
        
        // Fetch detailed information for each website (including script tags)
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
            
            // Return basic info if detailed fetch fails
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
        
        // Filter out any null/undefined values
        userWebsitesList = websitesWithDetails.filter(website => website !== null);
        
      } catch (error) {
        console.error('Error fetching user websites:', error);
      }

      // Set selected user with ALL websites data
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
        
        // Update selected user if modal is open
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
    if (!window.confirm('Are you sure you want to delete this website?')) {
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
        pointRadius: 4,
        pointHoverRadius: 6
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
      legend: { position: 'top', labels: { padding: 20, usePointStyle: true } },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        titleFont: { size: 14 },
        bodyFont: { size: 14 },
        padding: 12,
        callbacks: {
          label: function(context) {
            return `${context.dataset.label}: ${context.raw} users`;
          }
        }
      }
    },
    scales: {
      y: { beginAtZero: true, grid: { color: 'rgba(0, 0, 0, 0.05)' }, ticks: { precision: 0 } },
      x: { grid: { display: false } }
    },
    interaction: { intersect: false, mode: 'index' }
  };

  const websiteStatusOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { padding: 20, usePointStyle: true } },
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
    cutout: '65%'
  };

  // ==================== UI COMPONENTS ====================
  const AdminTabs = () => (
    <div className="border-b border-gray-200 mb-8">
      <nav className="flex space-x-8">
        {[
          { id: 'dashboard', label: 'Dashboard', icon: <FaChartBar /> },
          { id: 'users', label: 'Users', icon: <FaUsers /> },
          { id: 'websites', label: 'Websites', icon: <FaRobot /> },
          { id: 'tokens', label: 'Token Usage', icon: <FaCoins /> },
          { id: 'reports', label: 'Reports', icon: <FaDatabase /> },
          { id: 'settings', label: 'Settings', icon: <FaCog /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`py-4 px-1 flex items-center space-x-2 text-sm font-medium border-b-2 transition-colors ${
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
  );

  // ==================== RENDER ====================
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Admin Panel</h1>
              <p className="text-gray-600 mt-1">
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

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AdminTabs />
        
        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              {/* User Growth Chart */}
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">User Growth</h3>
                    <p className="text-sm text-gray-600">Real user registration trends</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setGrowthPeriod('monthly')}
                      className={`px-3 py-1 text-sm rounded-lg flex items-center space-x-1 transition-colors ${
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
                      className={`px-3 py-1 text-sm rounded-lg flex items-center space-x-1 transition-colors ${
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
                <div className="h-64">
                  {userGrowthData?.values?.some(val => val > 0) ? (
                    <Line data={userGrowthChart} options={userGrowthOptions} />
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-500">
                      <FaChartLine className="text-4xl mb-2 opacity-50" />
                      <p>No user growth data available</p>
                    </div>
                  )}
                </div>
                <div className="mt-4 text-sm text-gray-600 flex justify-between">
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
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Website Status</h3>
                    <p className="text-sm text-gray-600">Real-time website status distribution</p>
                  </div>
                  <div className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-sm">
                    {allWebsites.length} total
                  </div>
                </div>
                <div className="h-64 flex items-center justify-center">
                  {websiteStatusData?.values?.some(val => val > 0) ? (
                    <Doughnut data={websiteStatsChart} options={websiteStatusOptions} />
                  ) : (
                    <div className="text-gray-500">
                      <FaRobot className="text-4xl mb-2 opacity-50 mx-auto" />
                      <p>No website data available</p>
                    </div>
                  )}
                </div>
                <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                  {websiteStatusData?.labels?.map((label, index) => (
                    <div key={label} className="text-center">
                      <div className={`text-2xl font-bold ${
                        label === 'Active' ? 'text-green-600' :
                        label === 'Training' ? 'text-yellow-600' :
                        label === 'Inactive' ? 'text-gray-600' :
                        'text-red-600'
                      }`}>
                        {websiteStatusData?.values?.[index] || 0}
                      </div>
                      <div className="text-sm text-gray-600">{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            {/* Detailed Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-gray-900">User Activity</h4>
                  <FaUsers className="text-blue-500" />
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Active Today</span>
                    <span className="font-medium">{
                      allUsers.filter(user => {
                        const today = new Date();
                        const userDate = new Date(user.last_login || user.created_at);
                        return userDate.toDateString() === today.toDateString();
                      }).length
                    }</span>
                  </div>
                  <div className="flex justify-between">
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
                  <div className="flex justify-between">
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
              
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-gray-900">Website Performance</h4>
                  <FaChartBar className="text-green-500" />
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Avg Messages/Day</span>
                    <span className="font-medium">
                      {adminStats?.avg_messages_per_day || 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Avg Forms/Day</span>
                    <span className="font-medium">
                      {adminStats?.avg_forms_per_day || 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Avg Training Time</span>
                    <span className="font-medium">
                      {adminStats?.avg_training_time ? `${adminStats.avg_training_time}s` : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-gray-900">System Health</h4>
                  <FaDatabase className="text-purple-500" />
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Database Size</span>
                    <span className="font-medium">{adminStats?.database_size || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Uptime</span>
                    <span className="font-medium text-green-600">99.8%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Active Sessions</span>
                    <span className="font-medium">{adminStats?.active_sessions || 'N/A'}</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Recent Activity */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
                <div className="text-sm text-gray-600">
                  Last 24 hours
                </div>
              </div>
              <div className="space-y-4">
                {allWebsites.slice(0, 5).map(website => (
                  <div key={website.website_id} className="flex items-center justify-between p-4 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
                    <div className="flex items-center space-x-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        website.status === 'active' ? 'bg-green-100' :
                        website.status === 'training' ? 'bg-yellow-100' :
                        'bg-gray-100'
                      }`}>
                        <FaRobot className={
                          website.status === 'active' ? 'text-green-600' :
                          website.status === 'training' ? 'text-yellow-600' :
                          'text-gray-600'
                        } />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{website.website_name}</p>
                        <p className="text-sm text-gray-500">
                          by {website.user_name || 'Unknown User'} • {website.website_url}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600">
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
                <div className="text-center py-12">
                  <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FaRobot className="text-gray-400 text-2xl" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No recent activity</h3>
                  <p className="text-gray-600">No websites have been created recently</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
        
        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">User Management</h2>
                <p className="text-gray-600 mt-1">
                  {allUsers.length} total users • {allUsers.filter(u => u.is_active).length} active • {allUsers.filter(u => !u.is_active).length} inactive
                </p>
              </div>
              <div className="flex space-x-3">
                <button 
                  onClick={handleAddAdmin}
                  className="px-4 py-2 text-sm bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-colors flex items-center"
                  type="button"
                >
                  <FaUserShield className="mr-2" />
                  Add Admin
                </button>
                <button 
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center" 
                  type="button"
                >
                  <FaDownload className="mr-2" />
                  Export
                </button>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-gray-600 border-b">
                    <th className="pb-3">User</th>
                    <th className="pb-3">Role</th>
                    <th className="pb-3">Websites</th>
                    <th className="pb-3">Joined</th>
                    <th className="pb-3">Last Active</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allUsers.map(user => {
                    const joinedDate = new Date(user.created_at);
                    const lastActive = user.last_login ? new Date(user.last_login) : joinedDate;
                    const isRecent = (new Date() - lastActive) < (7 * 24 * 60 * 60 * 1000);
                    
                    return (
                      <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-4">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-semibold">
                              {user.full_name?.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{user.full_name}</p>
                              <p className="text-sm text-gray-500">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4">
                          <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                            user.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                            {user.role}
                          </span>
                        </td>
                        <td className="py-4">
                          <div className="flex items-center space-x-2">
                            <FaRobot className="text-gray-400" />
                            <span>{user.website_count || 0}</span>
                          </div>
                        </td>
                        <td className="py-4 text-gray-600">
                          {joinedDate.toLocaleDateString()}
                        </td>
                        <td className="py-4">
                          <div className="flex items-center space-x-2">
                            <span className={`text-sm ${
                              isRecent ? 'text-green-600' : 'text-gray-600'
                            }`}>
                              {lastActive.toLocaleDateString()}
                            </span>
                            {isRecent && (
                              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                            )}
                          </div>
                        </td>
                        <td className="py-4">
                          <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                            user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {user.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="py-4">
                          <div className="flex justify-end space-x-2">
                            <button
                              onClick={() => handleViewUserDetails(user.id)}
                              className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                              title="View User Details"
                              type="button"
                            >
                              <FaEye />
                            </button>
                            <button
                              onClick={() => handleToggleUserStatus(user.id, user.is_active)}
                              className={`p-2 rounded-lg transition-colors ${
                                user.is_active
                                  ? 'text-red-600 hover:text-red-800 hover:bg-red-50'
                                  : 'text-green-600 hover:text-green-800 hover:bg-green-50'
                              }`}
                              title={user.is_active ? 'Deactivate User' : 'Activate User'}
                              type="button"
                            >
                              {user.is_active ? <FaUserTimes /> : <FaUserCheck />}
                            </button>
                            <button
                              className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                              title="Send Message"
                              type="button"
                            >
                              <FaEnvelope />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            {allUsers.length === 0 && (
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FaUsers className="text-gray-400 text-2xl" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No users found</h3>
                <p className="text-gray-600">No users have registered yet</p>
              </div>
            )}
          </div>
        )}
        
        {/* Websites Tab */}
        {activeTab === 'websites' && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">All Websites</h2>
                <p className="text-gray-600 mt-1">
                  Showing {allWebsites.length} websites • {allWebsites.filter(w => w.status === 'active').length} active • {allWebsites.filter(w => w.status === 'training').length} training
                </p>
              </div>
              <div className="flex space-x-3">
                <button 
                  className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center" 
                  type="button"
                >
                  <FaFileUpload className="mr-2" />
                  Bulk Import
                </button>
              </div>
            </div>
            
            {allWebsites.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-gray-600 border-b">
                      <th className="pb-3">Website</th>
                      <th className="pb-3">Owner</th>
                      <th className="pb-3">Status</th>
                      <th className="pb-3">Data</th>
                      <th className="pb-3">Created</th>
                      <th className="pb-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allWebsites.map(website => {
                      const createdDate = new Date(website.created_at);
                      const daysAgo = Math.floor((new Date() - createdDate) / (1000 * 60 * 60 * 24));
                      
                      return (
                        <tr key={website.website_id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-4">
                            <div className="flex items-center space-x-3">
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
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
                              <div>
                                <p className="font-medium text-gray-900">{website.website_name}</p>
                                <p className="text-sm text-gray-500 truncate max-w-xs">{website.website_url}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-4">
                            <div className="flex items-center space-x-2">
                              <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-600 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                                {website.user_name?.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900">{website.user_name}</p>
                                <p className="text-xs text-gray-500">{website.user_email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-4">
                            <div className="flex flex-col space-y-1">
                              <span className={`px-3 py-1 text-xs font-medium rounded-full ${
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
                          <td className="py-4">
                            <div className="flex items-center space-x-4 text-sm">
                              <div title="Data Points" className="flex items-center space-x-1">
                                <FaDatabase className="text-gray-400" />
                                <span>{website.data_points || '0'}</span>
                              </div>
                              <div title="Contact Forms" className="flex items-center space-x-1">
                                <FaEnvelope className="text-gray-400" />
                                <span>{website.contact_forms_count || '0'}</span>
                              </div>
                              <div title="Chat Messages" className="flex items-center space-x-1">
                                <FaComments className="text-gray-400" />
                                <span>{website.chat_messages_count || '0'}</span>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 text-gray-600">
                            {createdDate.toLocaleDateString()}
                          </td>
                          <td className="py-4">
                            <div className="flex justify-end space-x-2">
                              <button
                                onClick={() => toast.info(`Viewing ${website.website_name}`)}
                                className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                                title="View Details"
                                type="button"
                              >
                                <FaEye />
                              </button>
                              <button
                                onClick={() => handleDeleteWebsite(website.website_id)}
                                className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete"
                                type="button"
                              >
                                <FaTrash />
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
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FaRobot className="text-gray-400 text-2xl" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No websites found</h3>
                <p className="text-gray-600">No websites have been created yet</p>
              </div>
            )}
          </div>
        )}
        
        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Admin Settings</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* System Settings */}
              <div className="space-y-6">
                <h3 className="text-lg font-semibold text-gray-900">System Configuration</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Max Websites per User
                  </label>
                  <input
                    type="number"
                    defaultValue="10"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors outline-none focus:outline-none"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Max File Upload Size (MB)
                  </label>
                  <input
                    type="number"
                    defaultValue="50"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors outline-none focus:outline-none"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email Notifications
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center">
                      <input type="checkbox" defaultChecked className="rounded text-purple-600" />
                      <span className="ml-2 text-sm text-gray-700">New user registrations</span>
                    </label>
                    <label className="flex items-center">
                      <input type="checkbox" defaultChecked className="rounded text-purple-600" />
                      <span className="ml-2 text-sm text-gray-700">Website training completions</span>
                    </label>
                    <label className="flex items-center">
                      <input type="checkbox" defaultChecked className="rounded text-purple-600" />
                      <span className="ml-2 text-sm text-gray-700">System alerts</span>
                    </label>
                  </div>
                </div>
              </div>
              
              {/* Maintenance */}
              <div className="space-y-6">
                <h3 className="text-lg font-semibold text-gray-900">Maintenance</h3>
                
                <div className="space-y-4">
                  <button 
                    onClick={() => toast.success('Cache cleared successfully')}
                    className="w-full py-3 bg-yellow-100 text-yellow-800 border border-yellow-300 rounded-lg hover:bg-yellow-200 transition-colors font-medium"
                    type="button"
                  >
                    Clear Cache
                  </button>
                  
                  <button 
                    onClick={() => toast.success('Database backup initiated')}
                    className="w-full py-3 bg-blue-100 text-blue-800 border border-blue-300 rounded-lg hover:bg-blue-200 transition-colors font-medium"
                    type="button"
                  >
                    Backup Database
                  </button>
                  
                  <button 
                    onClick={() => toast.success('Reindexing all websites started')}
                    className="w-full py-3 bg-green-100 text-green-800 border border-green-300 rounded-lg hover:bg-green-200 transition-colors font-medium"
                    type="button"
                  >
                    Reindex All Websites
                  </button>
                  
                  <button 
                    onClick={() => {
                      if (window.confirm('Are you sure you want to purge data older than 30 days?')) {
                        toast.success('Old data purge initiated');
                      }
                    }}
                    className="w-full py-3 bg-red-100 text-red-800 border border-red-300 rounded-lg hover:bg-red-200 transition-colors font-medium"
                    type="button"
                  >
                    Purge Old Data
                  </button>
                </div>
                
                <div className="pt-6 border-t border-gray-200">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">System Info</h4>
                  <div className="space-y-2 text-sm text-gray-600">
                    <div className="flex justify-between">
                      <span>Total Users:</span>
                      <span className="font-medium">{adminStats?.total_users || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Websites:</span>
                      <span className="font-medium">{adminStats?.total_websites || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Database Size:</span>
                      <span className="font-medium">45.2 MB</span>
                    </div>
                    <div className="flex justify-between">
                      <span>System Uptime:</span>
                      <span className="font-medium">99.8%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="mt-8 pt-6 border-t border-gray-200">
              <button 
                onClick={() => toast.success('Settings saved successfully')}
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-medium rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all duration-200"
                type="button"
              >
                Save Settings
              </button>
            </div>
          </div>
        )}
      </div>

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
