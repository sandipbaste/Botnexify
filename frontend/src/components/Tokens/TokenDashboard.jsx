import React, { useState, useEffect, Fragment} from 'react';
import { 
  FaChartBar, FaChartLine, FaChartPie, FaUsers, FaRobot,
  FaCalendar, FaDownload, FaEye, FaSearch, FaSort,
  FaSortUp, FaSortDown, FaSync, FaMoneyBillWave, FaCoins
} from 'react-icons/fa';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { Dialog, Transition } from '@headlessui/react';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
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
import { Link } from 'react-router-dom';

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

const TokenDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userDetails, setUserDetails] = useState(null);
  const [period, setPeriod] = useState(30); // days
  const [sortField, setSortField] = useState('total_tokens');
  const [sortDirection, setSortDirection] = useState('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('summary'); // summary, users, user-detail
  const [refreshing, setRefreshing] = useState(false);
  const [showWebsitePopup, setShowWebsitePopup] = useState(false);
  const [selectedUserWebsites, setSelectedUserWebsites] = useState(null);
  const [loadingWebsites, setLoadingWebsites] = useState(false);


  useEffect(() => {
    loadTokenData();
  }, [period]);

  const loadTokenData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      
      // Load summary
      const summaryResponse = await fetch(`${API_URL}/api/admin/token-summary?days=${period}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (summaryResponse.ok) {
        const summaryData = await summaryResponse.json();
        if (summaryData.success) {
          setSummary(summaryData.summary);
        }
      }
      
      // Load users token usage
      const usersResponse = await fetch(`${API_URL}/api/admin/token/users?days=${period}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (usersResponse.ok) {
        const usersData = await usersResponse.json();
        if (usersData.success) {
          setUsers(usersData.users);
        }
      }
      
    } catch (error) {
      console.error('Error loading token data:', error);
      toast.error('Failed to load token data');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadTokenData();
    setRefreshing(false);
    toast.success('Token data refreshed');
  };

  const handleViewUserWebsites = async (userId, userName) => {
  console.log(' Eye icon clicked for user:', userId, userName); // Add this line
  console.log('User ID type:', typeof userId); // Check data type
  
  setLoadingWebsites(true);
  setShowWebsitePopup(true);
  
  try {
    const token = localStorage.getItem('access_token');
    console.log(' Token exists:', !!token); // Check if token exists
    
    const response = await fetch(`${API_URL}/api/admin/token/user/${userId}/websites`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    console.log('Response status:', response.status); // Check response status
    
    const data = await response.json();
    console.log(' Response data:', data); // Check response data
    
    if (data.success) {
      setSelectedUserWebsites({
        user_id: userId,
        user_name: userName,
        websites: data.websites,
        overall_totals: data.overall_totals
      });
      toast.success('Website details loaded successfully');
    } else {
      toast.error(data.error || 'Failed to load website details');
    }
  } catch (error) {
    console.error('  Error loading website details:', error);
    toast.error('Failed to load website details: ' + error.message);
  } finally {
    setLoadingWebsites(false);
  }
};

  const handleViewUserDetails = async (userId) => {
    setLoading(true);
    setViewMode('user-detail');
    
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_URL}/api/admin/token/user/${userId}?days=${period}&include_websites=true`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      const data = await response.json();
      
      if (data.success) {
        setUserDetails(data.usage);
        setSelectedUser(users.find(u => u.user_id === userId));
      } else {
        toast.error('Failed to load user details');
      }
    } catch (error) {
      console.error('Error loading user details:', error);
      toast.error('Failed to load user details');
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const filteredUsers = users
    .filter(user => 
      user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      
      if (sortField === 'total_cost') {
        aVal = a.lifetime?.total_cost || 0;
        bVal = b.lifetime?.total_cost || 0;
      } else if (sortField === 'total_tokens') {
        aVal = a.lifetime?.total_tokens || 0;
        bVal = b.lifetime?.total_tokens || 0;
      } else if (sortField === 'input_tokens') {
        aVal = a.lifetime?.input_tokens || 0;
        bVal = b.lifetime?.input_tokens || 0;
      } else if (sortField === 'output_tokens') {
        aVal = a.lifetime?.output_tokens || 0;
        bVal = b.lifetime?.output_tokens || 0;
      } else if (sortField === 'embedding_tokens') {
        aVal = a.lifetime?.embedding_tokens || 0;
        bVal = b.lifetime?.embedding_tokens || 0;
      } else if (sortField === 'input_cost') {
        aVal = a.lifetime?.input_cost || 0;
        bVal = b.lifetime?.input_cost || 0;
      } else if (sortField === 'output_cost') {
        aVal = a.lifetime?.output_cost || 0;
        bVal = b.lifetime?.output_cost || 0;
      } else if (sortField === 'embedding_cost') {
        aVal = a.lifetime?.embedding_cost || 0;
        bVal = b.lifetime?.embedding_cost || 0;
      }
      
      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

  // Chart data - Updated to show all token types with costs
  const tokenTypeChart = {
    labels: ['Input Tokens', 'Output Tokens', 'Embedding Tokens'],
    datasets: [
      {
        label: 'Tokens',
        data: [
          summary?.recent?.input_tokens || 0,
          summary?.recent?.output_tokens || 0,
          summary?.recent?.embedding_tokens || 0
        ],
        backgroundColor: [
          'rgba(54, 162, 235, 0.8)',
          'rgba(255, 159, 64, 0.8)',
          'rgba(75, 192, 192, 0.8)'
        ],
        borderWidth: 1
      }
    ]
  };

  const tokenCostChart = {
    labels: ['Input Cost', 'Output Cost', 'Embedding Cost'],
    datasets: [
      {
        label: 'Cost ($)',
        data: [
          summary?.recent?.input_cost || 0,
          summary?.recent?.output_cost || 0,
          summary?.recent?.embedding_cost || 0
        ],
        backgroundColor: [
          'rgba(54, 162, 235, 0.8)',
          'rgba(255, 159, 64, 0.8)',
          'rgba(75, 192, 192, 0.8)'
        ],
        borderWidth: 1
      }
    ]
  };

  const usageByTypeChart = summary?.usage_by_type ? {
    labels: summary.usage_by_type.map(u => u.type || 'Unknown'),
    datasets: [
      {
        label: 'Tokens',
        data: summary.usage_by_type.map(u => u.tokens || 0),
        backgroundColor: [
          'rgba(54, 162, 235, 0.8)',
          'rgba(255, 206, 86, 0.8)',
          'rgba(75, 192, 192, 0.8)',
          'rgba(153, 102, 255, 0.8)',
          'rgba(255, 99, 132, 0.8)'
        ],
        borderWidth: 1
      }
    ]
  } : null;

  const formatNumber = (num) => {
    if (num === undefined || num === null) return '0';
    if (num >= 1000000) {
      return (num / 1000000).toFixed(2) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(2) + 'K';
    }
    return num?.toLocaleString() || '0';
  };

  const formatCost = (cost) => {
    if (cost === undefined || cost === null) return '$0.000000';
    return `$${Number(cost).toFixed(6)}`;
  };

  const formatCompactCost = (cost) => {
    if (cost === undefined || cost === null) return '$0.00';
    if (cost < 0.01) {
      return `$${Number(cost).toFixed(6)}`;
    }
    return `$${Number(cost).toFixed(4)}`;
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <FaSort className="ml-1 text-gray-400" />;
    return sortDirection === 'asc' ? 
      <FaSortUp className="ml-1 text-purple-600" /> : 
      <FaSortDown className="ml-1 text-purple-600" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading token data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-18">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Token Usage Dashboard</h2> 
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <label className="text-sm text-gray-600">Period:</label>
            <select
              value={period}
              onChange={(e) => setPeriod(Number(e.target.value))}
              className="cursor-pointer px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last year</option>
            </select>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="cursor-pointer p-2 text-gray-600 hover:text-purple-600 hover:bg-purple-50 rounded-xl transition-colors"
          >
            <FaSync className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {viewMode === 'summary' && (
        <>
          {/* Token Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl p-6 border border-purple-100">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-purple-100 rounded-xl">
                  <FaChartLine className="text-purple-600 text-xl" />
                </div>
                <span className="text-sm text-gray-600">Last {period} days</span>
              </div>
              <p className="text-3xl font-bold text-gray-900">
                {formatNumber(summary?.recent?.total_tokens || 0)}
              </p>
              <p className="text-sm text-gray-600 mt-1">Total Tokens</p>
              <div className="mt-2 text-xs text-gray-500">
                <span className="text-blue-600">Input: {formatNumber(summary?.recent?.input_tokens || 0)}</span> | 
                <span className="text-orange-600 ml-1">Output: {formatNumber(summary?.recent?.output_tokens || 0)}</span> | 
                <span className="text-teal-600 ml-1">Embed: {formatNumber(summary?.recent?.embedding_tokens || 0)}</span>
              </div>
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl p-6 border border-blue-100">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-blue-100 rounded-xl">
                  <FaMoneyBillWave className="text-blue-600 text-xl" />
                </div>
                <span className="text-sm text-gray-600">Last {period} days</span>
              </div>
              <p className="text-3xl font-bold text-gray-900">
                {formatCost(summary?.recent?.total_cost || 0)}
              </p>
              <p className="text-sm text-gray-600 mt-1">Total Cost</p>
              <div className="mt-2 text-xs text-gray-500">
                <span className="text-blue-600">Input: {formatCompactCost(summary?.recent?.input_cost || 0)}</span> | 
                <span className="text-orange-600 ml-1">Output: {formatCompactCost(summary?.recent?.output_cost || 0)}</span> | 
                <span className="text-teal-600 ml-1">Embed: {formatCompactCost(summary?.recent?.embedding_cost || 0)}</span>
              </div>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-6 border border-green-100">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-green-100 rounded-xl">
                  <FaUsers className="text-green-600 text-xl" />
                </div>
              </div>
              <p className="text-3xl font-bold text-gray-900">
                {summary?.active_users || 0}
              </p>
              <p className="text-sm text-gray-600 mt-1">Active Users</p>
            </div>

            <div className="bg-gradient-to-br from-yellow-50 to-amber-50 rounded-2xl p-6 border border-yellow-100">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-yellow-100 rounded-xl">
                  <FaRobot className="text-yellow-600 text-xl" />
                </div>
              </div>
              <p className="text-3xl font-bold text-gray-900">
                {summary?.active_websites || 0}
              </p>
              <p className="text-sm text-gray-600 mt-1">Active Websites</p>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <FaChartPie className="mr-2 text-purple-600" />
                Token Type Distribution
              </h3>
              <div className="h-64">
                {tokenTypeChart && (
                  <Doughnut 
                    data={tokenTypeChart}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { position: 'bottom' },
                        tooltip: {
                          callbacks: {
                            label: (context) => {
                              const label = context.label || '';
                              const value = context.raw || 0;
                              const total = context.dataset.data.reduce((a, b) => a + b, 0);
                              const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
                              return `${label}: ${formatNumber(value)} (${percentage}%)`;
                            }
                          }
                        }
                      }
                    }}
                  />
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <FaMoneyBillWave className="mr-2 text-purple-600" />
                Token Cost Distribution
              </h3>
              <div className="h-64">
                {tokenCostChart && (
                  <Bar
                    data={tokenCostChart}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { display: false },
                        tooltip: {
                          callbacks: {
                            label: (context) => {
                              const value = context.raw || 0;
                              return `Cost: ${formatCost(value)}`;
                            }
                          }
                        }
                      },
                      scales: {
                        y: {
                          beginAtZero: true,
                          ticks: {
                            callback: (value) => formatCost(value)
                          }
                        }
                      }
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Operation Type Chart */}
          <div className="grid grid-cols-1 gap-6">
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <FaChartBar className="mr-2 text-purple-600" />
                Usage by Operation Type
              </h3>
              <div className="h-64">
                {usageByTypeChart && (
                  <Bar
                    data={usageByTypeChart}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { display: false },
                        tooltip: {
                          callbacks: {
                            label: (context) => {
                              const value = context.raw || 0;
                              return `Tokens: ${formatNumber(value)}`;
                            }
                          }
                        }
                      }
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Top Users */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Top Users by Token Usage</h3>
              <button
                onClick={() => setViewMode('users')}
                className="text-purple-600 hover:text-purple-800 font-medium text-sm cursor-pointer"
              >
                View All Users →
              </button>
            </div>
            
            <div className="space-y-4">
              {summary?.top_users?.map((user, index) => (
                <div key={user.user_id} className="flex items-center justify-between p-4 border border-gray-100 rounded-xl hover:bg-gray-50">
                  <div className="flex items-center space-x-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-white ${
                      index === 0 ? 'bg-yellow-500' :
                      index === 1 ? 'bg-gray-500' :
                      index === 2 ? 'bg-orange-600' : 'bg-purple-600'
                    }`}>
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{user.full_name}</p>
                      <p className="text-sm text-gray-500">{user.email}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">{formatNumber(user.total_tokens)} tokens</p>
                    <p className="text-sm text-gray-600">{formatCost(user.total_cost)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
            {/* Users List View - Complete table structure */}
      {viewMode === 'users' && (
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">All Users Token Usage</h3>
              <p className="text-sm text-gray-600 mt-1">
                Showing {filteredUsers.length} users • Last {period} days
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="relative">
                <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <button
                onClick={() => setViewMode('summary')}
                className="cursor-pointer px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Back to Summary
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1400px]">
              <thead>
                <tr className="text-left text-gray-600 border-b">
                  <th className="pb-3">User</th>
                  <th className="pb-3 cursor-pointer" onClick={() => handleSort('total_tokens')}>
                    <div className="flex items-center">Total Tokens <SortIcon field="total_tokens" /></div>
                  </th>
                  <th className="pb-3 cursor-pointer" onClick={() => handleSort('total_cost')}>
                    <div className="flex items-center">Total Cost <SortIcon field="total_cost" /></div>
                  </th>
                  <th className="pb-3 cursor-pointer" onClick={() => handleSort('input_tokens')}>
                    <div className="flex items-center">Input <SortIcon field="input_tokens" /></div>
                  </th>
                  <th className="pb-3 cursor-pointer" onClick={() => handleSort('input_cost')}>
                    <div className="flex items-center">Input Cost <SortIcon field="input_cost" /></div>
                  </th>
                  <th className="pb-3 cursor-pointer" onClick={() => handleSort('output_tokens')}>
                    <div className="flex items-center">Output <SortIcon field="output_tokens" /></div>
                  </th>
                  <th className="pb-3 cursor-pointer" onClick={() => handleSort('output_cost')}>
                    <div className="flex items-center">Output Cost <SortIcon field="output_cost" /></div>
                  </th>
                  <th className="pb-3 cursor-pointer" onClick={() => handleSort('embedding_tokens')}>
                    <div className="flex items-center">Embedding <SortIcon field="embedding_tokens" /></div>
                  </th>
                  <th className="pb-3 cursor-pointer" onClick={() => handleSort('embedding_cost')}>
                    <div className="flex items-center">Embed Cost <SortIcon field="embedding_cost" /></div>
                  </th>
                  <th className="pb-3">Websites</th>
                  <th className="pb-3">Chats</th>
                  <th className="pb-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(user => (
                  <tr key={user.user_id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-4">
                      <div>
                        <p className="font-medium text-gray-900">{user.full_name}</p>
                        <p className="text-sm text-gray-500">{user.email}</p>
                      </div>
                    </td>
                    <td className="py-4 font-medium">{formatNumber(user.lifetime?.total_tokens)}</td>
                    <td className="py-4 font-medium text-purple-600">{formatCost(user.lifetime?.total_cost)}</td>
                    <td className="py-4 text-blue-600">{formatNumber(user.lifetime?.input_tokens)}</td>
                    <td className="py-4 text-blue-600">{formatCost(user.lifetime?.input_cost)}</td>
                    <td className="py-4 text-orange-600">{formatNumber(user.lifetime?.output_tokens)}</td>
                    <td className="py-4 text-orange-600">{formatCost(user.lifetime?.output_cost)}</td>
                    <td className="py-4 text-teal-600">{formatNumber(user.lifetime?.embedding_tokens)}</td>
                    <td className="py-4 text-teal-600">{formatCost(user.lifetime?.embedding_cost)}</td>
                    <td className="py-4">{user.lifetime?.websites || 0}</td>
                    <td className="py-4">{user.lifetime?.chats || 0}</td>
                    <td className="py-4 text-center">
                      <button
                        onClick={() => {
                          console.log('Button clicked for user:', user.user_id, user.full_name);
                          handleViewUserWebsites(user.user_id, user.full_name);
                        }}
                        className="cursor-pointer p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors inline-flex items-center justify-center"
                        title="View Website Details"
                      >
                        <FaEye size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
{viewMode === 'user-detail' && userDetails && (
  <div className="space-y-6">
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <button
          onClick={() => {
            setViewMode('users');
            setUserDetails(null);
            setSelectedUser(null);
          }}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
        >
          ← Back to Users
        </button>
        <div>
          <h3 className="text-xl font-bold text-gray-900">{selectedUser?.full_name}</h3>
          <p className="text-gray-600">{selectedUser?.email}</p>
        </div>
      </div>
    </div>

    {/* Lifetime Summary Cards */}
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl p-6">
        <p className="text-sm text-gray-600 mb-2">Lifetime Tokens</p>
        <p className="text-3xl font-bold text-gray-900">
          {formatNumber(userDetails.lifetime?.total_tokens)}
        </p>
        <div className="mt-3 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-blue-600">Input:</span>
            <span className="font-medium">{formatNumber(userDetails.lifetime?.input_tokens)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-orange-600">Output:</span>
            <span className="font-medium">{formatNumber(userDetails.lifetime?.output_tokens)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-teal-600">Embedding:</span>
            <span className="font-medium">{formatNumber(userDetails.lifetime?.embedding_tokens)}</span>
          </div>
        </div>
      </div>
      
      <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl p-6">
        <p className="text-sm text-gray-600 mb-2">Lifetime Cost</p>
        <p className="text-3xl font-bold text-gray-900">
          {formatCost(userDetails.lifetime?.total_cost)}
        </p>
        <div className="mt-3 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-blue-600">Input Cost:</span>
            <span className="font-medium">{formatCost(userDetails.lifetime?.input_cost)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-orange-600">Output Cost:</span>
            <span className="font-medium">{formatCost(userDetails.lifetime?.output_cost)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-teal-600">Embedding Cost:</span>
            <span className="font-medium">{formatCost(userDetails.lifetime?.embedding_cost)}</span>
          </div>
        </div>
      </div>
      
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-6">
        <p className="text-sm text-gray-600 mb-2">Recent Tokens (30 days)</p>
        <p className="text-3xl font-bold text-gray-900">
          {formatNumber(userDetails.recent?.total_tokens)}
        </p>
        <div className="mt-3 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-blue-600">Input:</span>
            <span className="font-medium">{formatNumber(userDetails.recent?.input_tokens)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-orange-600">Output:</span>
            <span className="font-medium">{formatNumber(userDetails.recent?.output_tokens)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-teal-600">Embedding:</span>
            <span className="font-medium">{formatNumber(userDetails.recent?.embedding_tokens)}</span>
          </div>
        </div>
      </div>
      
      <div className="bg-gradient-to-br from-yellow-50 to-amber-50 rounded-2xl p-6">
        <p className="text-sm text-gray-600 mb-2">Websites & Chats</p>
        <p className="text-3xl font-bold text-gray-900">
          {userDetails.lifetime?.websites || 0}
        </p>
        <div className="mt-3 text-xs">
          <div className="flex justify-between">
            <span>Total Chats:</span>
            <span className="font-medium">{userDetails.lifetime?.chats || 0}</span>
          </div>
        </div>
      </div>
    </div>

    {/* Monthly Breakdown from token_aggregates_monthly */}
    {userDetails.monthly_breakdown && userDetails.monthly_breakdown.length > 0 && (
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">
          Monthly Token Usage (from token_aggregates_monthly)
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-gray-600 border-b">
                <th className="pb-3 px-2">Month</th>
                <th className="pb-3 px-2 text-right">Input Tokens</th>
                <th className="pb-3 px-2 text-right">Input Cost</th>
                <th className="pb-3 px-2 text-right">Output Tokens</th>
                <th className="pb-3 px-2 text-right">Output Cost</th>
                <th className="pb-3 px-2 text-right">Embedding Tokens</th>
                <th className="pb-3 px-2 text-right">Embedding Cost</th>
                <th className="pb-3 px-2 text-right">Total Tokens</th>
                <th className="pb-3 px-2 text-right">Total Cost</th>
              </tr>
            </thead>
            <tbody>
              {userDetails.monthly_breakdown.map((month, index) => (
                <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-2 font-medium">{month.month || month.year_month}</td>
                  <td className="py-3 px-2 text-right text-blue-600">{formatNumber(month.input_tokens)}</td>
                  <td className="py-3 px-2 text-right text-blue-600">{formatCost(month.input_cost)}</td>
                  <td className="py-3 px-2 text-right text-orange-600">{formatNumber(month.output_tokens)}</td>
                  <td className="py-3 px-2 text-right text-orange-600">{formatCost(month.output_cost)}</td>
                  <td className="py-3 px-2 text-right text-teal-600">{formatNumber(month.embedding_tokens)}</td>
                  <td className="py-3 px-2 text-right text-teal-600">{formatCost(month.embedding_cost)}</td>
                  <td className="py-3 px-2 text-right font-medium">{formatNumber(month.total_tokens)}</td>
                  <td className="py-3 px-2 text-right font-medium text-purple-600">{formatCost(month.total_cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )}

    
    {/* Website Breakdown */}
    {userDetails.websites && userDetails.websites.length > 0 && (
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">Website Token Usage</h4>
        <div className="space-y-4">
          {userDetails.websites.map(website => (
            <div key={website.website_id} className="border border-gray-100 rounded-xl p-4 hover:bg-gray-50">
              <div className="flex justify-between items-center mb-3">
                <div>
                  <p className="font-medium text-gray-900">{website.website_id}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900">{formatNumber(website.totals?.total_tokens)} tokens</p>
                  <p className="text-sm text-purple-600">{formatCost(website.totals?.total_cost)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Input:</span>
                  <span className="font-medium text-blue-600 ml-1">{formatNumber(website.totals?.input_tokens)}</span>
                </div>
                <div>
                  <span className="text-gray-600">I Cost:</span>
                  <span className="font-medium text-blue-600 ml-1">{formatCost(website.totals?.input_cost)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Output:</span>
                  <span className="font-medium text-orange-600 ml-1">{formatNumber(website.totals?.output_tokens)}</span>
                </div>
                <div>
                  <span className="text-gray-600">O Cost:</span>
                  <span className="font-medium text-orange-600 ml-1">{formatCost(website.totals?.output_cost)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Embed:</span>
                  <span className="font-medium text-teal-600 ml-1">{formatNumber(website.totals?.embedding_tokens)}</span>
                </div>
                <div>
                  <span className="text-gray-600">E Cost:</span>
                  <span className="font-medium text-teal-600 ml-1">{formatCost(website.totals?.embedding_cost)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
)}

<Transition appear show={showWebsitePopup} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={() => setShowWebsitePopup(false)}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-6xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title
                  as="h3"
                  className="text-lg font-medium leading-6 text-gray-900 flex justify-between items-center"
                >
                  <span>Website Token Details - {selectedUserWebsites?.user_name}</span>
                  <button
                    onClick={() => setShowWebsitePopup(false)}
                    className="cursor-pointer text-gray-400 hover:text-gray-600"
                  >
                    <span className="text-2xl">&times;</span>
                  </button>
                </Dialog.Title>
                
                {loadingWebsites ? (
                  <div className="flex justify-center items-center h-64">
                    <div className="text-center">
                      <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                      <p className="text-gray-600">Loading website details...</p>
                    </div>
                  </div>
                ) : (
                  selectedUserWebsites && (
                    <div className="mt-4">
                      {/* Overall Summary */}
                      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-4 mb-6">
                        <h4 className="font-semibold text-gray-900 mb-3">Overall Summary</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <p className="text-sm text-gray-600">Total Websites</p>
                            <p className="text-xl font-bold text-gray-900">{selectedUserWebsites.overall_totals.website_count}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">Total Tokens</p>
                            <p className="text-xl font-bold text-gray-900">{formatNumber(selectedUserWebsites.overall_totals.total_tokens)}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">Total Cost</p>
                            <p className="text-xl font-bold text-purple-600">{formatCost(selectedUserWebsites.overall_totals.total_cost)}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">Total Chats</p>
                            <p className="text-xl font-bold text-gray-900">{selectedUserWebsites.overall_totals.total_chats}</p>
                          </div>
                        </div>
                      </div>

                      {/* Websites Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="text-left text-gray-600 border-b">
                              <th className="pb-3">Website</th>
                              <th className="pb-3 text-right">Input Tokens</th>
                              <th className="pb-3 text-right">Input Cost</th>
                              <th className="pb-3 text-right">Output Tokens</th>
                              <th className="pb-3 text-right">Output Cost</th>
                              <th className="pb-3 text-right">Embedding Tokens</th>
                              <th className="pb-3 text-right">Embedding Cost</th>
                              <th className="pb-3 text-right">Total Tokens</th>
                              <th className="pb-3 text-right">Total Cost</th>
                              <th className="pb-3 text-right">Chats</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedUserWebsites.websites.map((website, index) => (
                              <tr key={website.website_id} className="border-b border-gray-100 hover:bg-gray-50">
                                <td className="py-3">
                                  <div>
                                    <p className="font-medium text-gray-900">{website.website_name}</p>
                                    <p className="text-xs text-gray-500">{website.website_id}</p>
                                    {website.website_url && (
                                      <Link to={website.website_url} target="_blank" rel="noopener noreferrer" 
                                        className="text-xs text-blue-600 hover:underline">
                                        {website.website_url}
                                      </Link>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3 text-right text-blue-600">{formatNumber(website.input_tokens)}</td>
                                <td className="py-3 text-right text-blue-600">{formatCost(website.input_cost)}</td>
                                <td className="py-3 text-right text-orange-600">{formatNumber(website.output_tokens)}</td>
                                <td className="py-3 text-right text-orange-600">{formatCost(website.output_cost)}</td>
                                <td className="py-3 text-right text-teal-600">{formatNumber(website.embedding_tokens)}</td>
                                <td className="py-3 text-right text-teal-600">{formatCost(website.embedding_cost)}</td>
                                <td className="py-3 text-right font-medium">{formatNumber(website.total_tokens)}</td>
                                <td className="py-3 text-right font-medium text-purple-600">{formatCost(website.total_cost)}</td>
                                <td className="py-3 text-right">{website.chats}</td>
                              </tr>
                            ))}
                          </tbody>
                          {/* Footer with totals */}
                          <tfoot className="bg-gray-50 font-semibold">
                            <tr>
                              <td className="pt-3">Total</td>
                              <td className="pt-3 text-right text-blue-600">{formatNumber(selectedUserWebsites.overall_totals.total_input_tokens)}</td>
                              <td className="pt-3 text-right text-blue-600">{formatCost(selectedUserWebsites.overall_totals.total_input_cost)}</td>
                              <td className="pt-3 text-right text-orange-600">{formatNumber(selectedUserWebsites.overall_totals.total_output_tokens)}</td>
                              <td className="pt-3 text-right text-orange-600">{formatCost(selectedUserWebsites.overall_totals.total_output_cost)}</td>
                              <td className="pt-3 text-right text-teal-600">{formatNumber(selectedUserWebsites.overall_totals.total_embedding_tokens)}</td>
                              <td className="pt-3 text-right text-teal-600">{formatCost(selectedUserWebsites.overall_totals.total_embedding_cost)}</td>
                              <td className="pt-3 text-right font-bold">{formatNumber(selectedUserWebsites.overall_totals.total_tokens)}</td>
                              <td className="pt-3 text-right font-bold text-purple-600">{formatCost(selectedUserWebsites.overall_totals.total_cost)}</td>
                              <td className="pt-3 text-right">{selectedUserWebsites.overall_totals.total_chats}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>

                      {/* Close Button */}
                      <div className="mt-6 flex justify-end">
                        <button
                          type="button"
                          className="cursor-pointer inline-flex justify-center rounded-md border border-transparent bg-purple-100 px-4 py-2 text-sm font-medium text-purple-900 hover:bg-purple-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
                          onClick={() => setShowWebsitePopup(false)}
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  )
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>

    </div>
  );
};

export default TokenDashboard;