import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  FaUserShield, FaUserCheck, FaUserTimes, FaRobot, FaDatabase, 
  FaGlobe, FaLock, FaCopy, FaCheck, FaChartBar, FaTimes, 
  FaDownload, FaFileExcel, FaFilePdf
} from 'react-icons/fa';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'react-hot-toast';
import { Link } from 'react-router-dom';


const UserDetailsModal = ({ isOpen, onClose, user, isLoading }) => {
  const modalRef = useRef(null);
  const dropdownRef = useRef(null);
  const [copiedStates, setCopiedStates] = useState({});
  const [isExporting, setIsExporting] = useState(false);
  const [showExportDropdown, setShowExportDropdown] = useState(false);

  const handleClickOutside = useCallback((event) => {
    if (modalRef.current && !modalRef.current.contains(event.target)) {
      onClose();
    }
    if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
      setShowExportDropdown(false);
    }
  }, [onClose]);

  const handleCopyScript = useCallback((websiteId, scriptTag) => {
    navigator.clipboard.writeText(scriptTag);
    setCopiedStates(prev => ({ ...prev, [websiteId]: true }));
    toast.success('Script tag copied to clipboard!');
    setTimeout(() => {
      setCopiedStates(prev => ({ ...prev, [websiteId]: false }));
    }, 2000);
  }, []);

  // ==================== PDF EXPORT ====================
  const handleGeneratePDF = useCallback(async () => {
    if (!user) return;
    
    setIsExporting(true);
    setShowExportDropdown(false);
    
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
      doc.text(`Report ID: RPT-${user.id}-${Date.now()}`, 14, yPos);
      yPos += 8;
      doc.text(`Exported by: Admin`, 14, yPos);
      yPos += 15;
      
      // User Information Section
      doc.setTextColor(51, 51, 51);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(' User Information', 14, yPos);
      yPos += 10;
      
      // User Info Table
      const userInfoData = [
        ['User ID', user.id.toString()],
        ['Full Name', user.full_name || 'N/A'],
        ['Email', user.email || 'N/A'],
        ['Mobile', user.mobile || 'Not provided'],
        ['Status', user.is_active ? 'Active' : 'Inactive'],
        ['Role', user.role || 'user'],
        ['Joined Date', new Date(user.created_at).toLocaleString()]
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
      if (user.stats) {
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(' User Statistics', 14, yPos);
        yPos += 10;
        
        const statsData = [
          ['Total Websites', user.stats.total_websites?.toString() || '0'],
          ['Total Chat Messages', user.stats.total_chat_messages?.toString() || '0'],
          ['Total Contact Forms', user.stats.total_contact_forms?.toString() || '0'],
          ['Total Uploaded Files', user.stats.total_uploaded_files?.toString() || '0']
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
      if (user.websites && user.websites.length > 0) {
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(` All Websites (${user.websites.length})`, 14, yPos);
        yPos += 10;
        
        user.websites.forEach((website, index) => {
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
      doc.save(`user_${user.id}_${user.full_name?.replace(/\s+/g, '_')}_report_${new Date().toISOString().split('T')[0]}.pdf`);
      
      toast.success('PDF report generated successfully!');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate PDF report');
    } finally {
      setIsExporting(false);
    }
  }, [user]);

  // ==================== EXCEL EXPORT ====================
  const handleDownloadExcel = useCallback(() => {
    if (!user) return;
    
    setIsExporting(true);
    setShowExportDropdown(false);
    
    try {
      // Create workbook
      const wb = XLSX.utils.book_new();
      
      // ===== SHEET 1: User Information =====
      const userInfoData = [
        ['USER INFORMATION', ''],
        ['Generated Date', new Date().toLocaleString()],
        ['Report ID', `RPT-${user.id}-${Date.now()}`],
        ['Exported By', 'Admin Panel'],
        ['', ''],
        ['User Details', ''],
        ['User ID', user.id],
        ['Full Name', user.full_name || 'N/A'],
        ['Email Address', user.email || 'N/A'],
        ['Mobile Number', user.mobile || 'Not provided'],
        ['Account Status', user.is_active ? 'Active' : 'Inactive'],
        ['User Role', user.role || 'user'],
        ['Joined Date', new Date(user.created_at).toLocaleString()],
        ['', ''],
        ['STATISTICS (All Websites)', ''],
        ['Total Websites', user.stats?.total_websites || 0],
        ['Total Chat Messages', user.stats?.total_chat_messages || 0],
        ['Total Contact Forms', user.stats?.total_contact_forms || 0],
        ['Total Uploaded Files', user.stats?.total_uploaded_files || 0]
      ];
      
      const userInfoSheet = XLSX.utils.aoa_to_sheet(userInfoData);
      
      // Style the sheet
      userInfoSheet['!cols'] = [
        { wch: 25 }, // Column A width
        { wch: 50 }  // Column B width
      ];
      
      XLSX.utils.book_append_sheet(wb, userInfoSheet, 'User Information');
      
      // ===== SHEET 2: All Websites =====
      if (user.websites && user.websites.length > 0) {
        const websitesData = [
          ['WEBSITE DETAILS', '', '', '', '', '', '', '', '', ''],
          ['Website #', 'Website ID', 'Website Name', 'Website URL', 'Status', 'Created Date', 'Chat Messages', 'Contact Forms', 'Uploaded Files', 'Script Generated', 'Script Tag']
        ];
        
        user.websites.forEach((website, index) => {
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
      if (user.websites && user.websites.length > 0) {
        const summaryData = [
          ['WEBSITE STATISTICS SUMMARY', '', '', ''],
          ['Website Name', 'Chat Messages', 'Contact Forms', 'Uploaded Files']
        ];
        
        user.websites.forEach(website => {
          summaryData.push([
            website.website_name || 'N/A',
            (website.chat_messages_count || 0).toString(),
            (website.contact_forms_count || 0).toString(),
            (website.files_count || 0).toString()
          ]);
        });
        
        // Add totals row
        const totalChat = user.websites.reduce((sum, w) => sum + (w.chat_messages_count || 0), 0);
        const totalForms = user.websites.reduce((sum, w) => sum + (w.contact_forms_count || 0), 0);
        const totalFiles = user.websites.reduce((sum, w) => sum + (w.files_count || 0), 0);
        
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
        ['Report ID', `RPT-${user.id}-${Date.now()}`],
        ['User ID', user.id],
        ['User Email', user.email || 'N/A'],
        ['Total Websites', user.websites?.length || 0],
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
      XLSX.writeFile(wb, `user_${user.id}_${user.full_name?.replace(/\s+/g, '_')}_full_report_${new Date().toISOString().split('T')[0]}.xlsx`);
      
      toast.success('Excel file downloaded successfully!');
    } catch (error) {
      console.error('Error downloading Excel:', error);
      toast.error('Failed to download Excel');
    } finally {
      setIsExporting(false);
    }
  }, [user]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'auto';
    };
  }, [isOpen, handleClickOutside]);

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
                    onClick={() => setShowExportDropdown(!showExportDropdown)}
                    disabled={isExporting || !user}
                    className=" cursor-pointer px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all duration-200 flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
                  {showExportDropdown && !isExporting && (
                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-2xl border border-gray-200 z-20 overflow-hidden animate-fadeIn">
                      <div className="py-1">
                        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Export Format</p>
                        </div>
                        
                        <button
                          onClick={handleDownloadExcel}
                          className="cursor-pointer w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-3 transition-colors border-t border-gray-100"
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
                          className="cursor-pointer w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-3 transition-colors"
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
                  onClick={onClose}
                  className="cursor-pointer text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 transition-colors"
                  type="button"
                  aria-label="Close modal"
                >
                  <FaTimes className="text-xl" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-gray-600">Loading user details...</p>
              </div>
            ) : user ? (
              <div className="space-y-6">
                {/* User Information Section */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-lg font-semibold text-gray-900 flex items-center">
                      <FaUserCheck className="mr-2 text-blue-600" />
                      User Information
                    </h4>
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                      ID: {user.id}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white p-4 rounded-lg shadow-sm">
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Full Name</label>
                      <p className="text-sm font-medium text-gray-900 mt-1">{user.full_name}</p>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow-sm">
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Email Address</label>
                      <p className="text-sm text-gray-900 mt-1 break-all">{user.email}</p>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow-sm">
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Mobile Number</label>
                      <p className="text-sm text-gray-900 mt-1">{user.mobile || 'Not provided'}</p>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow-sm">
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Account Status</label>
                      <span className={`inline-block mt-1 px-3 py-1 text-xs font-medium rounded-full ${
                        user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow-sm">
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">User Role</label>
                      <span className="inline-block mt-1 px-3 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                        {user.role || 'user'}
                      </span>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow-sm md:col-span-2">
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Joined Date</label>
                      <p className="text-sm text-gray-900 mt-1">
                        {new Date(user.created_at).toLocaleDateString('en-US', {
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
                {user.stats && (
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6 border border-green-100">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <FaChartBar className="mr-2 text-green-600" />
                      User Statistics (All Websites)
                    </h4>
                    <p className="text-sm text-gray-600 mb-4">
                      Aggregated statistics for all {user.stats.total_websites} website(s)
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-white p-4 rounded-lg shadow-sm text-center">
                        <div className="text-2xl font-bold text-blue-600">{user.stats.total_websites || 0}</div>
                        <div className="text-xs text-gray-600 mt-1">Total Websites</div>
                      </div>
                      <div className="bg-white p-4 rounded-lg shadow-sm text-center">
                        <div className="text-2xl font-bold text-green-600">{user.stats.total_chat_messages || 0}</div>
                        <div className="text-xs text-gray-600 mt-1">Chat Messages</div>
                      </div>
                      <div className="bg-white p-4 rounded-lg shadow-sm text-center">
                        <div className="text-2xl font-bold text-purple-600">{user.stats.total_contact_forms || 0}</div>
                        <div className="text-xs text-gray-600 mt-1">Contact Forms</div>
                      </div>
                      <div className="bg-white p-4 rounded-lg shadow-sm text-center">
                        <div className="text-2xl font-bold text-yellow-600">{user.stats.total_uploaded_files || 0}</div>
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
                      All Websites ({user.websites?.length || 0})
                    </h4>
                  </div>
                  
                  {user.websites && user.websites.length > 0 ? (
                    <div className="space-y-6">
                      {user.websites.map((website, index) => (
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
                                  <Link 
                                    to={website.website_url} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-sm text-blue-600 hover:text-blue-800 hover:underline mt-1 block break-all"
                                  >
                                    {website.website_url}
                                  </Link>
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
                                    className={`cursor-pointer px-3 py-1.5 ${
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
                                  <span className="mr-2"></span>
                                  Add this script into index.html file
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
            ) : (
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FaUserTimes className="text-red-600 text-3xl" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">User not found</h3>
                <p className="text-gray-600">The requested user could not be found</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

UserDetailsModal.displayName = 'UserDetailsModal';

export default UserDetailsModal;