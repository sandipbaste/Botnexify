import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  FaUsers, FaRobot, FaChartBar, FaDatabase, FaFileExport,
  FaComments, FaEnvelope, FaDownload, FaCalendarAlt,
  FaFilter, FaSort, FaSearch, FaTimes, FaCheck,
  FaUserCircle, FaClock, FaChartLine, FaEye,
  FaFilePdf, FaFileExcel, FaSpinner,
  FaUserShield, FaUserCheck, FaUserTimes, FaGlobe, FaLock, FaCopy
} from 'react-icons/fa';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { Doughnut } from 'react-chartjs-2';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const API_URL = import.meta.env.VITE_API_URL;

const Reports = () => {
  // State Management
  const [allUsers, setAllUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState('all');
  const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' });
  const [filters, setFilters] = useState({
    role: 'all',
    status: 'all',
    websites: 'all'
  });
  const [showFilters, setShowFilters] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userDetails, setUserDetails] = useState(null);
  const [exportFormat, setExportFormat] = useState('json');
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [allWebsites, setAllWebsites] = useState([]);
  const [adminStats, setAdminStats] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [copiedStates, setCopiedStates] = useState({});
  const dropdownRef = useRef(null);
  const modalRef = useRef(null);

  // ==================== DATA LOADING ====================
  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    if (allUsers.length > 0) {
      applyFilters();
    }
  }, [allUsers, searchTerm, dateRange, filters, sortConfig]);

  useEffect(() => {
    if (selectedUser) {
      document.addEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'auto';
    };
  }, [selectedUser]);

  const handleClickOutside = (event) => {
    if (modalRef.current && !modalRef.current.contains(event.target)) {
      setSelectedUser(null);
      setUserDetails(null);
    }
    if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
      setShowExportOptions(false);
    }
  };

  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      
      // Fetch admin stats
      const statsResponse = await fetch(`${API_URL}/api/admin/stats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        if (statsData.success) {
          setAdminStats(statsData.statistics);
        }
      }
      
      // Fetch all websites
      const websitesResponse = await fetch(`${API_URL}/api/admin/websites`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      let websitesList = [];
      if (websitesResponse.ok) {
        const websitesData = await websitesResponse.json();
        if (websitesData.success && websitesData.websites) {
          websitesList = websitesData.websites;
          setAllWebsites(websitesList);
        }
      }
      
      // Fetch all users
      const usersResponse = await fetch(`${API_URL}/api/admin/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (usersResponse.ok) {
        const usersData = await usersResponse.json();
        if (usersData.success && usersData.users) {
          // Enrich users with website data
          const usersWithDetails = usersData.users.map(user => {
            const userWebsites = websitesList.filter(w => w.user_id === user.id);
            
            const totalChatMessages = userWebsites.reduce((sum, w) => sum + (w.chat_messages_count || 0), 0);
            const totalContactForms = userWebsites.reduce((sum, w) => sum + (w.contact_forms_count || 0), 0);
            const totalUploadedFiles = userWebsites.reduce((sum, w) => sum + (w.files_count || 0), 0);
            
            return {
              ...user,
              total_websites: userWebsites.length,
              total_chat_messages: totalChatMessages,
              total_contact_forms: totalContactForms,
              total_uploaded_files: totalUploadedFiles,
              websites: userWebsites,
              stats: {
                total_websites: userWebsites.length,
                total_chat_messages: totalChatMessages,
                total_contact_forms: totalContactForms,
                total_uploaded_files: totalUploadedFiles
              }
            };
          });
          
          setAllUsers(usersWithDetails);
        }
      }
      
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load report data');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUserDetails = async (userId) => {
    try {
      const token = localStorage.getItem('access_token');
      
      const userWebsitesResponse = await fetch(`${API_URL}/api/user/websites`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      let userWebsites = [];
      
      if (userWebsitesResponse.ok) {
        const websitesData = await userWebsitesResponse.json();
        if (websitesData.success && websitesData.websites) {
          userWebsites = websitesData.websites.filter(w => w.user_id === userId);
        }
      }
      
      if (userWebsites.length === 0 && allWebsites.length > 0) {
        userWebsites = allWebsites.filter(w => w.user_id === userId);
      }
      
      const totalChatMessages = userWebsites.reduce((sum, w) => sum + (w.chat_messages_count || 0), 0);
      const totalContactForms = userWebsites.reduce((sum, w) => sum + (w.contact_forms_count || 0), 0);
      const totalUploadedFiles = userWebsites.reduce((sum, w) => sum + (w.files_count || 0), 0);
      
      const websitesWithDetails = await Promise.all(
        userWebsites.map(async (website) => {
          try {
            const websiteDetailsResponse = await fetch(`${API_URL}/api/website/${website.website_id}`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (websiteDetailsResponse.ok) {
              const websiteDetails = await websiteDetailsResponse.json();
              return {
                ...website,
                script_tag: websiteDetails.embed_code || websiteDetails.script_tag || website.script_tag,
                training_status: websiteDetails.training_status || website.status
              };
            }
          } catch (error) {
            console.error(`Error fetching details for website ${website.website_id}:`, error);
          }
          return website;
        })
      );
      
      return {
        total_websites: userWebsites.length,
        total_chat_messages: totalChatMessages,
        total_contact_forms: totalContactForms,
        total_uploaded_files: totalUploadedFiles,
        websites: websitesWithDetails,
        stats: {
          total_websites: userWebsites.length,
          total_chat_messages: totalChatMessages,
          total_contact_forms: totalContactForms,
          total_uploaded_files: totalUploadedFiles
        }
      };
      
    } catch (error) {
      console.error(`Error fetching details for user ${userId}:`, error);
      return {
        total_websites: 0,
        total_chat_messages: 0,
        total_contact_forms: 0,
        total_uploaded_files: 0,
        websites: [],
        stats: {
          total_websites: 0,
          total_chat_messages: 0,
          total_contact_forms: 0,
          total_uploaded_files: 0
        }
      };
    }
  };

  // ==================== EXPORT FUNCTIONS ====================
  const handleGeneratePDF = useCallback(async () => {
    if (!selectedUser) return;
    
    setIsExporting(true);
    setShowExportOptions(false);
    
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      let yPos = 20;
      
      // Helper function to add text
      const addText = (text, fontSize = 12, isBold = false, x = 14) => {
        doc.setFontSize(fontSize);
        doc.setFont('helvetica', isBold ? 'bold' : 'normal');
        doc.text(text, x, yPos);
        yPos += fontSize / 2 + 2;
      };
      
      // Title
      doc.setTextColor(102, 126, 234);
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.text('User Report', 14, yPos);
      yPos += 15;
      
      // Generated Date
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, yPos);
      yPos += 8;
      doc.text(`Report ID: RPT-${selectedUser.id}-${Date.now()}`, 14, yPos);
      yPos += 8;
      doc.text(`Exported by: Admin`, 14, yPos);
      yPos += 15;
      
      // User Information Section
      doc.setTextColor(51, 51, 51);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('👤 User Information', 14, yPos);
      yPos += 10;
      
      // User Info Table
      const userInfoData = [
        ['User ID', selectedUser.id.toString()],
        ['Full Name', selectedUser.full_name || 'N/A'],
        ['Email', selectedUser.email || 'N/A'],
        ['Mobile', selectedUser.mobile || 'Not provided'],
        ['Status', selectedUser.is_active ? 'Active' : 'Inactive'],
        ['Role', selectedUser.role || 'user'],
        ['Joined Date', new Date(selectedUser.created_at).toLocaleString()]
      ];
      
      autoTable(doc, {
        startY: yPos,
        head: [['Field', 'Value']],
        body: userInfoData,
        theme: 'grid',
        headStyles: { fillColor: [102, 126, 234], textColor: 255, fontStyle: 'bold' },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 }, 1: { cellWidth: 130 } },
        margin: { left: 14, right: 14 }
      });
      
      yPos = doc.lastAutoTable.finalY + 15;
      
      // Statistics Section
      if (userDetails?.stats) {
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('📊 User Statistics', 14, yPos);
        yPos += 10;
        
        const statsData = [
          ['Total Websites', userDetails.stats.total_websites?.toString() || '0'],
          ['Total Chat Messages', userDetails.stats.total_chat_messages?.toString() || '0'],
          ['Total Contact Forms', userDetails.stats.total_contact_forms?.toString() || '0'],
          ['Total Uploaded Files', userDetails.stats.total_uploaded_files?.toString() || '0']
        ];
        
        autoTable(doc, {
          startY: yPos,
          head: [['Metric', 'Count']],
          body: statsData,
          theme: 'grid',
          headStyles: { fillColor: [72, 187, 120], textColor: 255, fontStyle: 'bold' },
          columnStyles: { 0: { fontStyle: 'bold', cellWidth: 80 }, 1: { cellWidth: 100 } },
          margin: { left: 14, right: 14 }
        });
        
        yPos = doc.lastAutoTable.finalY + 15;
      }
      
      // Websites Section
      if (userDetails?.websites && userDetails.websites.length > 0) {
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(`🌐 All Websites (${userDetails.websites.length})`, 14, yPos);
        yPos += 10;
        
        userDetails.websites.forEach((website, index) => {
          // Check if we need a new page
          if (yPos > 250) {
            doc.addPage();
            yPos = 20;
          }
          
          // Website Header
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(102, 126, 234);
          doc.text(`Website #${index + 1} - ${website.status?.toUpperCase() || 'UNKNOWN'}`, 14, yPos);
          yPos += 8;
          
          doc.setTextColor(51, 51, 51);
          doc.setFontSize(10);
          
          // Website Details
          const websiteData = [
            ['Website ID', website.website_id || 'N/A'],
            ['Website Name', website.website_name || 'N/A'],
            ['Website URL', website.website_url || 'N/A'],
            ['Created Date', website.created_at ? new Date(website.created_at).toLocaleString() : 'N/A'],
            ['Chat Messages', website.chat_messages_count?.toString() || '0'],
            ['Contact Forms', website.contact_forms_count?.toString() || '0'],
            ['Uploaded Files', website.files_count?.toString() || '0']
          ];
          
          autoTable(doc, {
            startY: yPos,
            body: websiteData,
            theme: 'plain',
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 }, 1: { cellWidth: 140 } },
            margin: { left: 14, right: 14 },
            styles: { fontSize: 9 }
          });
          
          yPos = doc.lastAutoTable.finalY + 5;
          
          // Script Tag
          if (website.script_tag) {
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('Script Tag:', 14, yPos);
            yPos += 5;
            
            doc.setFont('courier', 'normal');
            doc.setFontSize(8);
            
            // Split long script tag
            const splitScript = doc.splitTextToSize(website.script_tag, 170);
            doc.text(splitScript, 14, yPos);
            yPos += splitScript.length * 4 + 5;
          } else {
            doc.setFontSize(10);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(150, 150, 150);
            doc.text('No script tag generated', 14, yPos);
            yPos += 8;
            doc.setTextColor(51, 51, 51);
          }
          
          yPos += 10;
        });
      }
      
      // Footer
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text('© Chatbot Generator - Admin Panel', 14, 285);
      doc.text('This report is confidential', 14, 290);
      
      // Save PDF
      doc.save(`user_${selectedUser.id}_${selectedUser.full_name?.replace(/\s+/g, '_')}_report_${new Date().toISOString().split('T')[0]}.pdf`);
      
      toast.success('PDF report generated successfully!');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate PDF report');
    } finally {
      setIsExporting(false);
    }
  }, [selectedUser, userDetails]);

  const handleDownloadExcel = useCallback(() => {
    if (!selectedUser) return;
    
    setIsExporting(true);
    setShowExportOptions(false);
    
    try {
      // Create workbook
      const wb = XLSX.utils.book_new();
      
      // ===== SHEET 1: User Information =====
      const userInfoData = [
        ['USER INFORMATION', ''],
        ['Generated Date', new Date().toLocaleString()],
        ['Report ID', `RPT-${selectedUser.id}-${Date.now()}`],
        ['Exported By', 'Admin Panel'],
        ['', ''],
        ['User Details', ''],
        ['User ID', selectedUser.id],
        ['Full Name', selectedUser.full_name || 'N/A'],
        ['Email Address', selectedUser.email || 'N/A'],
        ['Mobile Number', selectedUser.mobile || 'Not provided'],
        ['Account Status', selectedUser.is_active ? 'Active' : 'Inactive'],
        ['User Role', selectedUser.role || 'user'],
        ['Joined Date', new Date(selectedUser.created_at).toLocaleString()],
        ['', ''],
        ['STATISTICS (All Websites)', ''],
        ['Total Websites', userDetails?.stats?.total_websites || 0],
        ['Total Chat Messages', userDetails?.stats?.total_chat_messages || 0],
        ['Total Contact Forms', userDetails?.stats?.total_contact_forms || 0],
        ['Total Uploaded Files', userDetails?.stats?.total_uploaded_files || 0]
      ];
      
      const userInfoSheet = XLSX.utils.aoa_to_sheet(userInfoData);
      
      // Style the sheet
      userInfoSheet['!cols'] = [
        { wch: 25 }, // Column A width
        { wch: 50 }  // Column B width
      ];
      
      XLSX.utils.book_append_sheet(wb, userInfoSheet, 'User Information');
      
      // ===== SHEET 2: All Websites =====
      if (userDetails?.websites && userDetails.websites.length > 0) {
        const websitesData = [
          ['WEBSITE DETAILS', '', '', '', '', '', '', '', '', ''],
          ['Website #', 'Website ID', 'Website Name', 'Website URL', 'Status', 'Created Date', 'Chat Messages', 'Contact Forms', 'Uploaded Files', 'Script Generated', 'Script Tag']
        ];
        
        userDetails.websites.forEach((website, index) => {
          websitesData.push([
            (index + 1).toString(),
            website.website_id || 'N/A',
            website.website_name || 'N/A',
            website.website_url || 'N/A',
            website.status || 'unknown',
            website.created_at ? new Date(website.created_at).toLocaleString() : 'N/A',
            (website.chat_messages_count || 0).toString(),
            (website.contact_forms_count || 0).toString(),
            (website.files_count || 0).toString(),
            website.script_tag ? 'Yes' : 'No',
            website.script_tag || ''
          ]);
        });
        
        const websitesSheet = XLSX.utils.aoa_to_sheet(websitesData);
        
        // Set column widths
        websitesSheet['!cols'] = [
          { wch: 8 },  // Website #
          { wch: 20 }, // Website ID
          { wch: 25 }, // Website Name
          { wch: 40 }, // Website URL
          { wch: 12 }, // Status
          { wch: 20 }, // Created Date
          { wch: 15 }, // Chat Messages
          { wch: 15 }, // Contact Forms
          { wch: 15 }, // Uploaded Files
          { wch: 15 }, // Script Generated
          { wch: 60 }  // Script Tag
        ];
        
        XLSX.utils.book_append_sheet(wb, websitesSheet, 'Websites');
      }
      
      // ===== SHEET 3: Website Statistics Summary =====
      if (userDetails?.websites && userDetails.websites.length > 0) {
        const summaryData = [
          ['WEBSITE STATISTICS SUMMARY', '', '', ''],
          ['Website Name', 'Chat Messages', 'Contact Forms', 'Uploaded Files']
        ];
        
        userDetails.websites.forEach(website => {
          summaryData.push([
            website.website_name || 'N/A',
            (website.chat_messages_count || 0).toString(),
            (website.contact_forms_count || 0).toString(),
            (website.files_count || 0).toString()
          ]);
        });
        
        // Add totals row
        const totalChat = userDetails.websites.reduce((sum, w) => sum + (w.chat_messages_count || 0), 0);
        const totalForms = userDetails.websites.reduce((sum, w) => sum + (w.contact_forms_count || 0), 0);
        const totalFiles = userDetails.websites.reduce((sum, w) => sum + (w.files_count || 0), 0);
        
        summaryData.push(['TOTAL', totalChat.toString(), totalForms.toString(), totalFiles.toString()]);
        
        const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
        summarySheet['!cols'] = [
          { wch: 30 },
          { wch: 15 },
          { wch: 15 },
          { wch: 15 }
        ];
        
        XLSX.utils.book_append_sheet(wb, summarySheet, 'Statistics Summary');
      }
      
      // ===== SHEET 4: Export Information =====
      const exportInfoData = [
        ['EXPORT INFORMATION', ''],
        ['Generated Date', new Date().toLocaleString()],
        ['Generated Date (ISO)', new Date().toISOString()],
        ['Exported By', 'Admin Panel'],
        ['Report ID', `RPT-${selectedUser.id}-${Date.now()}`],
        ['User ID', selectedUser.id],
        ['User Email', selectedUser.email || 'N/A'],
        ['Total Websites', userDetails?.websites?.length || 0],
        ['Version', '1.0'],
        ['', ''],
        ['SYSTEM INFORMATION', ''],
        ['Application', 'Chatbot Generator'],
        ['Export Format', 'Excel XLSX'],
        ['Timestamp', Date.now().toString()]
      ];
      
      const exportInfoSheet = XLSX.utils.aoa_to_sheet(exportInfoData);
      exportInfoSheet['!cols'] = [
        { wch: 25 },
        { wch: 40 }
      ];
      
      XLSX.utils.book_append_sheet(wb, exportInfoSheet, 'Export Info');
      
      // Save Excel file
      XLSX.writeFile(wb, `user_${selectedUser.id}_${selectedUser.full_name?.replace(/\s+/g, '_')}_full_report_${new Date().toISOString().split('T')[0]}.xlsx`);
      
      toast.success('Excel file downloaded successfully!');
    } catch (error) {
      console.error('Error downloading Excel:', error);
      toast.error('Failed to download Excel');
    } finally {
      setIsExporting(false);
    }
  }, [selectedUser, userDetails]);

  const handleCopyScript = useCallback((websiteId, scriptTag) => {
    navigator.clipboard.writeText(scriptTag);
    setCopiedStates(prev => ({ ...prev, [websiteId]: true }));
    toast.success('Script tag copied to clipboard!');
    setTimeout(() => {
      setCopiedStates(prev => ({ ...prev, [websiteId]: false }));
    }, 2000);
  }, []);

  const handleViewUserDetails = async (user) => {
    setSelectedUser(user);
    setIsLoadingDetails(true);
    
    try {
      const details = await fetchUserDetails(user.id);
      setUserDetails({
        ...user,
        ...details
      });
    } catch (error) {
      console.error('Error loading user details:', error);
      toast.error('Failed to load user details');
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...allUsers];

    if (searchTerm) {
      filtered = filtered.filter(user => 
        user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (filters.role !== 'all') {
      filtered = filtered.filter(user => user.role === filters.role);
    }

    if (filters.status !== 'all') {
      filtered = filtered.filter(user => 
        filters.status === 'active' ? user.is_active : !user.is_active
      );
    }

    if (filters.websites !== 'all') {
      filtered = filtered.filter(user => {
        const websiteCount = user.total_websites || 0;
        if (filters.websites === '0') return websiteCount === 0;
        if (filters.websites === '1-5') return websiteCount >= 1 && websiteCount <= 5;
        if (filters.websites === '6-10') return websiteCount >= 6 && websiteCount <= 10;
        if (filters.websites === '10+') return websiteCount > 10;
        return true;
      });
    }

    if (dateRange !== 'all') {
      const now = new Date();
      filtered = filtered.filter(user => {
        const userDate = new Date(user.created_at);
        const diffDays = Math.floor((now - userDate) / (1000 * 60 * 60 * 24));
        
        if (dateRange === 'today') return diffDays === 0;
        if (dateRange === 'week') return diffDays <= 7;
        if (dateRange === 'month') return diffDays <= 30;
        if (dateRange === 'quarter') return diffDays <= 90;
        if (dateRange === 'year') return diffDays <= 365;
        return true;
      });
    }

    filtered.sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];
      
      if (sortConfig.key === 'created_at' || sortConfig.key === 'last_login') {
        aVal = aVal ? new Date(aVal).getTime() : 0;
        bVal = bVal ? new Date(bVal).getTime() : 0;
      }
      
      if (aVal === undefined || aVal === null) aVal = 0;
      if (bVal === undefined || bVal === null) bVal = 0;
      
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    setFilteredUsers(filtered);
  };

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const calculateStatistics = () => {
    const totalWebsites = allUsers.reduce((sum, u) => sum + (u.total_websites || 0), 0);
    const totalMessages = allUsers.reduce((sum, u) => sum + (u.total_chat_messages || 0), 0);
    const totalForms = allUsers.reduce((sum, u) => sum + (u.total_contact_forms || 0), 0);
    const totalFiles = allUsers.reduce((sum, u) => sum + (u.total_uploaded_files || 0), 0);
    
    const stats = {
      totalUsers: allUsers.length,
      totalActive: allUsers.filter(u => u.is_active).length,
      totalInactive: allUsers.filter(u => !u.is_active).length,
      totalWebsites: totalWebsites,
      totalMessages: totalMessages,
      totalForms: totalForms,
      totalFiles: totalFiles,
      averageWebsitesPerUser: (totalWebsites / (allUsers.length || 1)).toFixed(1),
      usersWithWebsites: allUsers.filter(u => (u.total_websites || 0) > 0).length,
      usersWithoutWebsites: allUsers.filter(u => (u.total_websites || 0) === 0).length
    };
    return stats;
  };

  const stats = calculateStatistics();

  // Prepare chart data
  const userStatusChartData = {
    labels: ['Active', 'Inactive'],
    datasets: [{
      data: [stats.totalActive, stats.totalInactive],
      backgroundColor: ['rgba(34, 197, 94, 0.8)', 'rgba(239, 68, 68, 0.8)'],
      borderColor: ['rgb(34, 197, 94)', 'rgb(239, 68, 68)'],
      borderWidth: 2
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' },
      tooltip: { enabled: true }
    },
    cutout: '60%'
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <FaSpinner className="w-12 h-12 text-purple-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading reports data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">User Reports</h2>
          <p className="text-gray-600 mt-1">
            Detailed analytics and reports for all users
          </p>
        </div>
        <div className="flex space-x-3">
          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-2 border rounded-lg transition-colors flex items-center ${
              showFilters 
                ? 'bg-purple-50 border-purple-300 text-purple-700' 
                : 'border-gray-300 hover:bg-gray-50'
            }`}
            type="button"
          >
            <FaFilter className="mr-2" />
            Filters
            {(searchTerm || filters.role !== 'all' || filters.status !== 'all' || dateRange !== 'all') && (
              <span className="ml-2 w-2 h-2 bg-purple-600 rounded-full"></span>
            )}
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-xl p-6 shadow-lg border border-purple-100"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Users</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalUsers}</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <FaUsers className="text-purple-600 text-xl" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <span className="text-green-600 font-medium">{stats.totalActive} active</span>
            <span className="text-gray-400 mx-2">•</span>
            <span className="text-red-600 font-medium">{stats.totalInactive} inactive</span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-xl p-6 shadow-lg border border-blue-100"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Websites</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalWebsites}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <FaRobot className="text-blue-600 text-xl" />
            </div>
          </div>
          <div className="mt-4 text-sm text-gray-600">
            {stats.usersWithWebsites} users have websites
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-xl p-6 shadow-lg border border-green-100"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Interactions</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.totalMessages + stats.totalForms + stats.totalFiles}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <FaComments className="text-green-600 text-xl" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <span className="text-blue-600">{stats.totalMessages} msgs</span>
            <span className="text-gray-400 mx-2">•</span>
            <span className="text-yellow-600">{stats.totalForms} forms</span>
            <span className="text-gray-400 mx-2">•</span>
            <span className="text-purple-600">{stats.totalFiles} files</span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-xl p-6 shadow-lg border border-yellow-100"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Avg per User</p>
              <p className="text-2xl font-bold text-gray-900">{stats.averageWebsitesPerUser}</p>
            </div>
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <FaChartBar className="text-yellow-600 text-xl" />
            </div>
          </div>
          <div className="mt-4 text-sm text-gray-600">
            websites per user
          </div>
        </motion.div>
      </div>

      {/* Single Chart - User Status Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-lg lg:col-span-1">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">User Status Distribution</h3>
          <div className="h-64">
            <Doughnut data={userStatusChartData} options={chartOptions} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-sm text-gray-600">Active</p>
              <p className="text-xl font-bold text-green-600">{stats.totalActive}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Inactive</p>
              <p className="text-xl font-bold text-red-600">{stats.totalInactive}</p>
            </div>
          </div>
        </div>
        
        {/* Empty space */}
        <div className="lg:col-span-1"></div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="bg-white rounded-xl p-6 shadow-lg border border-gray-200"
        >
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Filter Users</h3>
            <button
              onClick={() => {
                setSearchTerm('');
                setFilters({ role: 'all', status: 'all', websites: 'all' });
                setDateRange('all');
              }}
              className="text-sm text-purple-600 hover:text-purple-800"
              type="button"
            >
              Clear All Filters
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Search */}
            <div className="relative">
              <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>

            {/* Role Filter */}
            <select
              value={filters.role}
              onChange={(e) => setFilters({ ...filters, role: e.target.value })}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="all">All Roles</option>
              <option value="admin">Admin Only</option>
              <option value="user">Users Only</option>
            </select>

            {/* Status Filter */}
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="all">All Status</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>

            {/* Websites Filter */}
            <select
              value={filters.websites}
              onChange={(e) => setFilters({ ...filters, websites: e.target.value })}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="all">All Websites</option>
              <option value="0">No Websites</option>
              <option value="1-5">1-5 Websites</option>
              <option value="6-10">6-10 Websites</option>
              <option value="10+">10+ Websites</option>
            </select>

            {/* Date Range Filter */}
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">Last 7 Days</option>
              <option value="month">Last 30 Days</option>
              <option value="quarter">Last 90 Days</option>
              <option value="year">Last Year</option>
            </select>
          </div>

          <div className="mt-4 text-sm text-gray-600">
            Showing {filteredUsers.length} of {allUsers.length} users
          </div>
        </motion.div>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('full_name')}
                    className="flex items-center space-x-1 hover:text-gray-700"
                    type="button"
                  >
                    <span>User</span>
                    {sortConfig.key === 'full_name' && (
                      <FaSort className={`text-xs ${sortConfig.direction === 'asc' ? 'rotate-180' : ''}`} />
                    )}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('role')}
                    className="flex items-center space-x-1 hover:text-gray-700"
                    type="button"
                  >
                    <span>Role</span>
                    {sortConfig.key === 'role' && (
                      <FaSort className={`text-xs ${sortConfig.direction === 'asc' ? 'rotate-180' : ''}`} />
                    )}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('total_websites')}
                    className="flex items-center space-x-1 hover:text-gray-700"
                    type="button"
                  >
                    <span>Websites</span>
                    {sortConfig.key === 'total_websites' && (
                      <FaSort className={`text-xs ${sortConfig.direction === 'asc' ? 'rotate-180' : ''}`} />
                    )}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('total_chat_messages')}
                    className="flex items-center space-x-1 hover:text-gray-700"
                    type="button"
                  >
                    <span>Messages</span>
                    {sortConfig.key === 'total_chat_messages' && (
                      <FaSort className={`text-xs ${sortConfig.direction === 'asc' ? 'rotate-180' : ''}`} />
                    )}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('total_contact_forms')}
                    className="flex items-center space-x-1 hover:text-gray-700"
                    type="button"
                  >
                    <span>Forms</span>
                    {sortConfig.key === 'total_contact_forms' && (
                      <FaSort className={`text-xs ${sortConfig.direction === 'asc' ? 'rotate-180' : ''}`} />
                    )}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('total_uploaded_files')}
                    className="flex items-center space-x-1 hover:text-gray-700"
                    type="button"
                  >
                    <span>Files</span>
                    {sortConfig.key === 'total_uploaded_files' && (
                      <FaSort className={`text-xs ${sortConfig.direction === 'asc' ? 'rotate-180' : ''}`} />
                    )}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('created_at')}
                    className="flex items-center space-x-1 hover:text-gray-700"
                    type="button"
                  >
                    <span>Joined</span>
                    {sortConfig.key === 'created_at' && (
                      <FaSort className={`text-xs ${sortConfig.direction === 'asc' ? 'rotate-180' : ''}`} />
                    )}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-r from-purple-500 to-indigo-600 flex items-center justify-center">
                          <span className="text-white font-medium text-lg">
                            {user.full_name?.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {user.full_name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {user.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      user.role === 'admin' 
                        ? 'bg-purple-100 text-purple-800' 
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                    {user.total_websites || 0}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {user.total_chat_messages || 0}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {user.total_contact_forms || 0}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {user.total_uploaded_files || 0}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      user.is_active 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleViewUserDetails(user)}
                      className="text-purple-600 hover:text-purple-900 mr-3"
                      title="View Details"
                      type="button"
                    >
                      <FaEye />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredUsers.length === 0 && (
          <div className="text-center py-12">
            <FaUsers className="mx-auto text-4xl text-gray-400 mb-4" />
            <p className="text-gray-500">No users found matching your filters</p>
            <button
              onClick={() => {
                setSearchTerm('');
                setFilters({ role: 'all', status: 'all', websites: 'all' });
                setDateRange('all');
              }}
              className="mt-4 text-purple-600 hover:text-purple-800"
              type="button"
            >
              Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* User Details Modal - Exactly like UserDetailsModal */}
      {selectedUser && (
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
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-y-auto"
            >
              <div className="p-6">
                {/* Header with Export Dropdown */}
                <div className="flex justify-between items-start mb-6 sticky top-0 bg-white z-10 pb-4 border-b">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center">
                      <FaUserShield className="text-white text-xl" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">User Details</h3>
                      <p className="text-sm text-gray-600">View complete user information and all websites</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {/* Export Dropdown Button */}
                    <div className="relative" ref={dropdownRef}>
                      <button
                        onClick={() => setShowExportOptions(!showExportOptions)}
                        disabled={isExporting || !selectedUser}
                        className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all duration-200 flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        type="button"
                      >
                        {isExporting ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Exporting...</span>
                          </>
                        ) : (
                          <>
                            <FaDownload className="text-sm" />
                            <span>Export Data</span>
                          </>
                        )}
                      </button>
                      
                      {/* Export Dropdown Menu */}
                      {showExportOptions && !isExporting && (
                        <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-2xl border border-gray-200 z-20 overflow-hidden animate-fadeIn">
                          <div className="py-1">
                            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Export Format</p>
                            </div>
                            
                            <button
                              onClick={handleDownloadExcel}
                              className="w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-3 transition-colors border-t border-gray-100"
                              type="button"
                            >
                              <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                                <FaFileExcel className="text-emerald-600" size={16} />
                              </div>
                              <div className="flex-1">
                                <p className="font-medium text-gray-900">Excel Format</p>
                                <p className="text-xs text-gray-500">Multiple sheets with full data</p>
                              </div>
                              <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">.xlsx</span>
                            </button>
                            
                            <div className="border-t border-gray-200 my-1"></div>
                            
                            <button
                              onClick={handleGeneratePDF}
                              className="w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-3 transition-colors"
                              type="button"
                            >
                              <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                                <FaFilePdf className="text-red-600" size={16} />
                              </div>
                              <div className="flex-1">
                                <p className="font-medium text-gray-900">PDF Report</p>
                                <p className="text-xs text-gray-500">Professional formatted report</p>
                              </div>
                              <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">.pdf</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <button
                      onClick={() => {
                        setSelectedUser(null);
                        setUserDetails(null);
                      }}
                      className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 transition-colors"
                      type="button"
                      aria-label="Close modal"
                    >
                      <FaTimes className="text-xl" />
                    </button>
                  </div>
                </div>

                {/* Modal Content */}
                {isLoadingDetails ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                    <p className="text-gray-600">Loading user details...</p>
                  </div>
                ) : selectedUser && (
                  <div className="space-y-6">
                    {/* User Information Section */}
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100">
                      <div className="flex justify-between items-center mb-4">
                        <h4 className="text-lg font-semibold text-gray-900 flex items-center">
                          <FaUserCheck className="mr-2 text-blue-600" />
                          User Information
                        </h4>
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                          ID: {selectedUser.id}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-white p-4 rounded-lg shadow-sm">
                          <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Full Name</label>
                          <p className="text-sm font-medium text-gray-900 mt-1">{selectedUser.full_name}</p>
                        </div>
                        <div className="bg-white p-4 rounded-lg shadow-sm">
                          <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Email Address</label>
                          <p className="text-sm text-gray-900 mt-1 break-all">{selectedUser.email}</p>
                        </div>
                        <div className="bg-white p-4 rounded-lg shadow-sm">
                          <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Mobile Number</label>
                          <p className="text-sm text-gray-900 mt-1">{selectedUser.mobile || 'Not provided'}</p>
                        </div>
                        <div className="bg-white p-4 rounded-lg shadow-sm">
                          <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Account Status</label>
                          <span className={`inline-block mt-1 px-3 py-1 text-xs font-medium rounded-full ${
                            selectedUser.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {selectedUser.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <div className="bg-white p-4 rounded-lg shadow-sm">
                          <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">User Role</label>
                          <span className="inline-block mt-1 px-3 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                            {selectedUser.role || 'user'}
                          </span>
                        </div>
                        <div className="bg-white p-4 rounded-lg shadow-sm md:col-span-2">
                          <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Joined Date</label>
                          <p className="text-sm text-gray-900 mt-1">
                            {new Date(selectedUser.created_at).toLocaleDateString('en-US', {
                              weekday: 'long',
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* User Statistics Section */}
                    {userDetails?.stats && (
                      <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6 border border-green-100">
                        <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                          <FaChartBar className="mr-2 text-green-600" />
                          User Statistics (All Websites)
                        </h4>
                        <p className="text-sm text-gray-600 mb-4">
                          Aggregated statistics for all {userDetails.stats.total_websites} website(s)
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="bg-white p-4 rounded-lg shadow-sm text-center">
                            <div className="text-2xl font-bold text-blue-600">{userDetails.stats.total_websites || 0}</div>
                            <div className="text-xs text-gray-600 mt-1">Total Websites</div>
                          </div>
                          <div className="bg-white p-4 rounded-lg shadow-sm text-center">
                            <div className="text-2xl font-bold text-green-600">{userDetails.stats.total_chat_messages || 0}</div>
                            <div className="text-xs text-gray-600 mt-1">Chat Messages</div>
                          </div>
                          <div className="bg-white p-4 rounded-lg shadow-sm text-center">
                            <div className="text-2xl font-bold text-purple-600">{userDetails.stats.total_contact_forms || 0}</div>
                            <div className="text-xs text-gray-600 mt-1">Contact Forms</div>
                          </div>
                          <div className="bg-white p-4 rounded-lg shadow-sm text-center">
                            <div className="text-2xl font-bold text-yellow-600">{userDetails.stats.total_uploaded_files || 0}</div>
                            <div className="text-xs text-gray-600 mt-1">Uploaded Files</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* All Websites Section */}
                    <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-6 border border-purple-100">
                      <div className="flex justify-between items-center mb-4">
                        <h4 className="text-lg font-semibold text-gray-900 flex items-center">
                          <FaRobot className="mr-2 text-purple-600" />
                          All Websites ({userDetails?.websites?.length || 0})
                        </h4>
                      </div>
                      
                      {userDetails?.websites && userDetails.websites.length > 0 ? (
                        <div className="space-y-6">
                          {userDetails.websites.map((website, index) => (
                            <div key={website.website_id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                              {/* Website Header */}
                              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                                <div className="flex items-center space-x-2">
                                  <span className="text-sm font-medium text-gray-700">Website #{index + 1}</span>
                                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                    website.status === 'active' ? 'bg-green-100 text-green-800' :
                                    website.status === 'training' ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-gray-100 text-gray-800'
                                  }`}>
                                    {website.status}
                                  </span>
                                </div>
                                <div className="text-xs text-gray-500">
                                  Created: {website.created_at ? new Date(website.created_at).toLocaleDateString() : 'N/A'}
                                </div>
                              </div>
                              
                              {/* Website Details */}
                              <div className="p-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                  <div>
                                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wider flex items-center">
                                      <FaDatabase className="mr-1 text-gray-400" size={12} />
                                      Website ID
                                    </label>
                                    <p className="text-sm font-mono text-gray-900 mt-1 bg-gray-50 p-2 rounded">
                                      {website.website_id || 'N/A'}
                                    </p>
                                  </div>
                                  
                                  <div>
                                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wider flex items-center">
                                      <FaRobot className="mr-1 text-gray-400" size={12} />
                                      Website Name
                                    </label>
                                    <p className="text-sm font-medium text-gray-900 mt-1">
                                      {website.website_name || 'N/A'}
                                    </p>
                                  </div>
                                  
                                  <div className="md:col-span-2">
                                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wider flex items-center">
                                      <FaGlobe className="mr-1 text-gray-400" size={12} />
                                      Website URL
                                    </label>
                                    {website.website_url ? (
                                      <a 
                                        href={website.website_url} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-sm text-blue-600 hover:text-blue-800 hover:underline mt-1 block break-all"
                                      >
                                        {website.website_url}
                                      </a>
                                    ) : (
                                      <p className="text-sm text-gray-500 mt-1">N/A</p>
                                    )}
                                  </div>
                                </div>

                                {/* Website Statistics */}
                                <div className="grid grid-cols-3 gap-3 mb-4">
                                  <div className="bg-blue-50 p-2 rounded-lg text-center">
                                    <div className="text-lg font-bold text-blue-700">{website.chat_messages_count || 0}</div>
                                    <div className="text-xs text-gray-600">Chat Messages</div>
                                  </div>
                                  <div className="bg-purple-50 p-2 rounded-lg text-center">
                                    <div className="text-lg font-bold text-purple-700">{website.contact_forms_count || 0}</div>
                                    <div className="text-xs text-gray-600">Contact Forms</div>
                                  </div>
                                  <div className="bg-yellow-50 p-2 rounded-lg text-center">
                                    <div className="text-lg font-bold text-yellow-700">{website.files_count || 0}</div>
                                    <div className="text-xs text-gray-600">Uploaded Files</div>
                                  </div>
                                </div>

                                {/* Script Tag Section */}
                                {website.script_tag ? (
                                  <div className="bg-gray-900 rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-3">
                                      <label className="text-xs font-medium text-gray-400 uppercase tracking-wider flex items-center">
                                        <FaLock className="mr-1" size={12} />
                                        Embed Script Tag
                                      </label>
                                      <button
                                        onClick={() => handleCopyScript(website.website_id, website.script_tag)}
                                        className={`px-3 py-1.5 ${
                                          copiedStates[website.website_id] ? 'bg-green-600' : 'bg-gray-800 hover:bg-gray-700'
                                        } text-white text-xs rounded-lg transition-colors flex items-center space-x-1`}
                                        type="button"
                                      >
                                        {copiedStates[website.website_id] ? (
                                          <>
                                            <FaCheck size={12} />
                                            <span>Copied!</span>
                                          </>
                                        ) : (
                                          <>
                                            <FaCopy size={12} />
                                            <span>Copy Script</span>
                                          </>
                                        )}
                                      </button>
                                    </div>
                                    <div className="relative">
                                      <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap break-all bg-gray-800 p-3 rounded-lg border border-gray-700 max-h-32 overflow-y-auto">
                                        {website.script_tag}
                                      </pre>
                                    </div>
                                    <div className="mt-2 text-xs text-gray-400 flex items-center">
                                      <span className="mr-2">📦</span>
                                      Add to &lt;head&gt; section to embed chatbot
                                    </div>
                                  </div>
                                ) : (
                                  <div className="bg-gray-50 rounded-lg p-4 text-center border border-gray-200">
                                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-2">
                                      <FaLock className="text-gray-500 text-sm" />
                                    </div>
                                    <p className="text-sm text-gray-600">No script tag generated</p>
                                    <p className="text-xs text-gray-500 mt-1">
                                      User needs to generate the chatbot script
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="bg-white p-8 rounded-lg text-center">
                          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <FaRobot className="text-gray-400 text-2xl" />
                          </div>
                          <h5 className="text-md font-medium text-gray-900 mb-1">No Websites Found</h5>
                          <p className="text-sm text-gray-600">This user hasn't created any websites yet</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;