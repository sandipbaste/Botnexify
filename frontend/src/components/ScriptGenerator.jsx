import React, { useState, useEffect } from 'react';
import { FaCopy, FaCheck, FaCode, FaEye, FaDownload, FaRobot, FaSpinner, FaLock, FaExclamationTriangle, FaSync } from 'react-icons/fa';
import { toast } from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'https://botrion.onrender.com';

const ScriptGenerator = ({ 
  websites, 
  onTestChat,
  isProcessing
}) => {
  const [selectedWebsite, setSelectedWebsite] = useState('');
  const [generatedScript, setGeneratedScript] = useState('');
  const [copied, setCopied] = useState(false);
  const [selectedWebsiteData, setSelectedWebsiteData] = useState(null);
  const [error, setError] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    if (selectedWebsite) {
      const website = websites.find(w => w.website_id === selectedWebsite);
      setSelectedWebsiteData(website);
      setError('');
      setGeneratedScript('');
    } else {
      setSelectedWebsiteData(null);
      setGeneratedScript('');
    }
  }, [selectedWebsite, websites]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.dropdown-container')) {
        setIsDropdownOpen(false);
      }
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const generateScript = async () => {
    if (!selectedWebsite) {
      toast.error('Please select a website');
      return;
    }

    if (!selectedWebsiteData) {
      toast.error('Website data not found');
      return;
    }

    setError('');
    setGeneratedScript('');
    setIsGenerating(true);

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_URL}/api/generate-script/${selectedWebsite}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        let errorMessage = 'Failed to generate script';
        
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail?.error || errorData.detail?.message || errorData.message || errorMessage;
        } catch (e) {
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        
        throw new Error(errorMessage);
      }

      const data = await response.json();
      
      if (data.success) {
        const embedCode = data.embed_code || `<!-- Chatbot Script for ${selectedWebsiteData.website_name} -->\n<script src="${API_URL}/embed/${selectedWebsite}/script.js" defer></script>`;
        setGeneratedScript(embedCode);
        toast.success('Script generated successfully!');
      } else {
        throw new Error(data.message || 'Failed to generate script');
      }
      
    } catch (error) {
      console.error('Script generation error:', error);
      setError(error.message || 'Failed to generate script. Please make sure the website is properly trained.');
      toast.error(error.message || 'Failed to generate script');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = () => {
    if (!generatedScript) {
      toast.error('No script to copy');
      return;
    }
    
    navigator.clipboard.writeText(generatedScript);
    setCopied(true);
    toast.success('Copied to clipboard!');
    
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadScript = () => {
    if (!generatedScript) {
      toast.error('No script to download');
      return;
    }
    
    const blob = new Blob([generatedScript], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chatbot-${selectedWebsite}.js`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Script downloaded!');
  };

  const isWebsiteReadyForScript = (website) => {
    return website && (
      website.status === 'completed' || 
      website.status === 'trained' || 
      website.status === 'active' ||
      (website.data_points && website.data_points > 0)
    );
  };

  const handleTestScript = async () => {
    if (!selectedWebsiteData) {
      toast.error('Please select a website first');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/embed/${selectedWebsiteData.website_id}/script.js`);
      if (response.ok) {
        toast.success('Script is accessible!');
        window.open(`${API_URL}/test/${selectedWebsiteData.website_id}`, '_blank');
      } else {
        throw new Error('Script not available');
      }
    } catch (error) {
      toast.error('Script not generated yet. Please generate it first.');
    }
  };

  return (
    <div className={`space-y-8 relative ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
      {isGenerating && (
        <div className="absolute inset-0 bg-white bg-opacity-70 z-10 rounded-2xl flex items-center justify-center">
          <div className="text-center p-8 bg-white rounded-xl shadow-lg border border-blue-200">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Generating Script</h3>
            <p className="text-gray-600 mb-4">
              Please wait while we generate the embed script for your chatbot.
            </p>
            <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
              <FaLock />
              <span>Tabs are locked during generation</span>
            </div>
          </div>
        </div>
      )}
      
      <div>
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Generate Embed Script</h2>
        <p className="text-gray-600">
          Generate the JavaScript snippet to embed your chatbot on any website.
        </p>
      </div>

      <div className="space-y-4 sm:space-y-6">
        {/* Website Selection - Custom Dropdown for better mobile experience */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Trained Website
          </label>
          <div className="relative dropdown-container">
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white text-left flex items-center justify-between text-sm sm:text-base"
              disabled={isProcessing}
            >
              <span className="truncate pr-2">
                {selectedWebsiteData ? selectedWebsiteData.website_name : 'Select a website...'}
              </span>
              <svg className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform duration-200 ${isDropdownOpen ? 'transform rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {isDropdownOpen && (
              <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-80 overflow-y-auto">
                <div className="py-1">
                  <button
                    onClick={() => {
                      setSelectedWebsite('');
                      setIsDropdownOpen(false);
                    }}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 text-sm sm:text-base border-b border-gray-100 transition-colors duration-150"
                  >
                    <span className="text-gray-600">Select a website...</span>
                  </button>
                  {websites.map((website) => (
                    <button
                      key={website.website_id}
                      onClick={() => {
                        setSelectedWebsite(website.website_id);
                        setIsDropdownOpen(false);
                      }}
                      disabled={!isWebsiteReadyForScript(website)}
                      className={`w-full px-4 py-3 text-left hover:bg-gray-50 text-sm sm:text-base border-b border-gray-100 last:border-b-0 transition-colors duration-150 ${
                        !isWebsiteReadyForScript(website) ? 'opacity-60 cursor-not-allowed bg-gray-50' : ''
                      } ${selectedWebsite === website.website_id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-900">{website.website_name}</span>
                        <div className="flex items-center mt-1 space-x-2">
                          {!isWebsiteReadyForScript(website) ? (
                            <span className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
                              Not Ready
                            </span>
                          ) : (
                            <span className="text-xs text-green-500 bg-green-50 px-2 py-0.5 rounded-full">
                              Ready
                            </span>
                          )}
                          <span className="text-xs text-gray-400">
                            ID: {website.website_id.substring(0, 6)}...
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                  {websites.length === 0 && (
                    <div className="px-4 py-6 text-center text-gray-500">
                      No websites available
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Choose Your Website
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-gradient-to-r from-red-50 to-red-100 border border-red-200 rounded-xl p-4 sm:p-5 animate-fade-in">
            <div className="flex items-start sm:items-center space-x-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <FaExclamationTriangle className="text-red-600 text-lg sm:text-xl" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-red-800 text-base sm:text-lg">Something went wrong</h3>
                <p className="text-red-600 text-sm sm:text-base break-words">{error}</p>
                <p className="text-red-500 text-xs sm:text-sm mt-1">
                  Please ensure the website is properly trained and try again.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Selected Website Info */}
        {selectedWebsiteData && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 sm:p-5 border border-blue-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 text-base sm:text-lg truncate">
                  {selectedWebsiteData.website_name}
                </h3>
                <p className="text-xs sm:text-sm text-gray-600">
                  {isWebsiteReadyForScript(selectedWebsiteData) 
                    ? 'Ready for embedding' 
                    : 'Not ready for script generation'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => onTestChat(selectedWebsiteData)}
                  className="px-3 sm:px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all duration-200 flex items-center space-x-2 text-sm sm:text-base"
                  disabled={isProcessing}
                >
                  <FaRobot className="text-sm sm:text-base" />
                  <span className="hidden xs:inline">Test Chat</span>
                  <span className="xs:hidden">Chat</span>
                </button>
                <button
                  onClick={handleTestScript}
                  className="px-3 sm:px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg hover:from-purple-600 hover:to-pink-700 transition-all duration-200 flex items-center space-x-2 text-sm sm:text-base"
                  disabled={isProcessing}
                >
                  <FaEye className="text-sm sm:text-base" />
                  <span className="hidden xs:inline">Test Script</span>
                  <span className="xs:hidden">Script</span>
                </button>
              </div>
            </div>
            
            {/* Grid - Mobile optimized */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 text-xs sm:text-sm">
              <div className="bg-white bg-opacity-50 p-2 rounded-lg">
                <p className="text-gray-500 truncate">Data Points</p>
                <p className={`font-medium truncate ${
                  selectedWebsiteData.data_points > 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {selectedWebsiteData.data_points || '0'}
                  {selectedWebsiteData.data_points > 0 ? ' ✓' : ' ✗'}
                </p>
              </div>
              <div className="bg-white bg-opacity-50 p-2 rounded-lg">
                <p className="text-gray-500 truncate">Status</p>
                <p className={`font-medium truncate ${
                  selectedWebsiteData.status === 'completed' || 
                  selectedWebsiteData.status === 'trained' || 
                  selectedWebsiteData.status === 'active'
                    ? 'text-green-600'
                    : 'text-yellow-600'
                }`}>
                  {selectedWebsiteData.status || 'unknown'}
                </p>
              </div>
              <div className="bg-white bg-opacity-50 p-2 rounded-lg">
                <p className="text-gray-500 truncate">Files</p>
                <p className="font-medium truncate">
                  {selectedWebsiteData.upload_count || selectedWebsiteData.files_count || '0'}
                </p>
              </div>
              <div className="bg-white bg-opacity-50 p-2 rounded-lg">
                <p className="text-gray-500 truncate">ID</p>
                <code className="font-medium text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded text-xs block truncate">
                  {selectedWebsiteData.website_id.substring(0, 8)}...
                </code>
              </div>
            </div>
            
            {!isWebsiteReadyForScript(selectedWebsiteData) && (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-yellow-700 text-xs sm:text-sm">
                  ⚠️ This website may not be ready for script generation. 
                  Make sure training is complete and there are data points available.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Generate Button */}
        <div className="flex justify-center">
          <button
            onClick={generateScript}
            disabled={!selectedWebsite || isProcessing || (selectedWebsiteData && !isWebsiteReadyForScript(selectedWebsiteData)) || isGenerating}
            className="w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center space-x-3 shadow-lg shadow-blue-200 text-sm sm:text-base"
          >
            <FaCode className="text-lg sm:text-xl" />
            <span className="truncate">
              {isGenerating ? 'Generating...' : 'Generate Script Tag'}
            </span>
            {isGenerating && <FaSpinner className="animate-spin" />}
          </button>
        </div>

        {/* Generated Script */}
        {generatedScript && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="font-semibold text-gray-900 text-base sm:text-lg">Your Embed Code:</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={copyToClipboard}
                  className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all duration-200 flex items-center justify-center space-x-2 text-sm"
                >
                  {copied ? <FaCheck className="text-sm" /> : <FaCopy className="text-sm" />}
                  <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>
                <button
                  onClick={downloadScript}
                  className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg hover:from-blue-600 hover:to-indigo-700 transition-all duration-200 flex items-center justify-center space-x-2 text-sm"
                >
                  <FaDownload className="text-sm" />
                  <span>Download</span>
                </button>
              </div>
            </div>

            <div className="relative group">
              <div className="absolute top-2 right-2 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={copyToClipboard}
                  className="p-1.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900"
                  title="Copy"
                >
                  <FaCopy className="text-xs" />
                </button>
              </div>
              <div className="bg-gray-900 bg-opacity-90 text-gray-100 p-4 sm:p-6 rounded-xl overflow-x-auto">
                <code className="text-xs sm:text-sm whitespace-pre-wrap break-all block">
                  {generatedScript}
                </code>
              </div>
            </div>

            {/* Instructions - Mobile optimized */}
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 sm:p-6 border border-green-200">
              <h4 className="font-semibold text-green-800 mb-3 sm:mb-4 text-base sm:text-lg flex items-center">
                <FaCode className="mr-2 text-sm sm:text-base" /> How to use:
              </h4>
              <ol className="space-y-2 sm:space-y-3 text-green-700 text-xs sm:text-sm">
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-xs sm:text-sm mr-2 sm:mr-3">
                    1
                  </span>
                  <span className="flex-1">Copy the script tag above</span>
                </li>
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-xs sm:text-sm mr-2 sm:mr-3">
                    2
                  </span>
                  <span className="flex-1 break-words">
                    Paste it into your website's <code className="bg-green-100 px-1.5 py-0.5 rounded font-mono text-xs">index.html</code> file
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-xs sm:text-sm mr-2 sm:mr-3">
                    3
                  </span>
                  <span className="flex-1 break-words">
                    Place it just before the closing <code className="bg-green-100 px-1.5 py-0.5 rounded font-mono text-xs">&lt;/body&gt;</code> tag
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-xs sm:text-sm mr-2 sm:mr-3">
                    4
                  </span>
                  <span className="flex-1">The chatbot icon will appear in the bottom-right corner of your website</span>
                </li>
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-xs sm:text-sm mr-2 sm:mr-3">
                    5
                  </span>
                  <span className="flex-1">Users can click the icon to open the chat interface</span>
                </li>
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScriptGenerator;
