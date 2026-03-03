import React, { useState, useEffect } from 'react';
import { FaCopy, FaCheck, FaCode, FaEye, FaDownload, FaRobot, FaSpinner, FaLock, FaExclamationTriangle, FaSync } from 'react-icons/fa';
import { toast } from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL;

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
        // Open in new tab
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

      <div className="space-y-6">
        {/* Website Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Trained Website
          </label>
          <select
            value={selectedWebsite}
            onChange={(e) => setSelectedWebsite(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
            disabled={isProcessing}
          >
            <option value="">Select a website...</option>
            {websites.map((website) => (
              <option 
                key={website.website_id} 
                value={website.website_id}
                disabled={!isWebsiteReadyForScript(website)}
              >
                {website.website_name} ({website.website_id.substring(0, 8)}...)
                {!isWebsiteReadyForScript(website) && ' - Not Ready'}
              </option>
            ))}
          </select>
          <p className="mt-2 text-sm text-gray-500">
            Choose Your Website
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-gradient-to-r from-red-50 to-red-100 border border-red-200 rounded-xl p-5 animate-fade-in">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <FaExclamationTriangle className="text-red-600 text-xl" />
              </div>
              <div>
                <h3 className="font-semibold text-red-800 text-lg">Script Generation Failed</h3>
                <p className="text-red-600">{error}</p>
                <p className="text-red-500 text-sm mt-1">
                  Please ensure the website is properly trained and try again.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Selected Website Info */}
        {selectedWebsiteData && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-5 border border-blue-100">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-gray-900 text-lg">{selectedWebsiteData.website_name}</h3>
                <p className="text-sm text-gray-600">
                  {isWebsiteReadyForScript(selectedWebsiteData) 
                    ? 'Ready for embedding' 
                    : 'Not ready for script generation'}
                </p>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => onTestChat(selectedWebsiteData)}
                  className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all duration-200 flex items-center space-x-2"
                  disabled={isProcessing}
                >
                  <FaRobot />
                  <span>Test Chat</span>
                </button>
                <button
                  onClick={handleTestScript}
                  className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg hover:from-purple-600 hover:to-pink-700 transition-all duration-200 flex items-center space-x-2"
                  disabled={isProcessing}
                >
                  <FaEye />
                  <span>Test Script</span>
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Data Points</p>
                <p className={`font-medium ${selectedWebsiteData.data_points > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {selectedWebsiteData.data_points || '0'}
                  {selectedWebsiteData.data_points > 0 ? ' ✓' : ' ✗'}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Status</p>
                <p className={`font-medium ${
                  selectedWebsiteData.status === 'completed' || 
                  selectedWebsiteData.status === 'trained' || 
                  selectedWebsiteData.status === 'active'
                    ? 'text-green-600'
                    : 'text-yellow-600'
                }`}>
                  {selectedWebsiteData.status || 'unknown'}
                  {isWebsiteReadyForScript(selectedWebsiteData) ? ' ✓' : ' ✗'}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Files</p>
                <p className="font-medium">{selectedWebsiteData.upload_count || selectedWebsiteData.files_count || '0'}</p>
              </div>
              <div>
                <p className="text-gray-500">ID</p>
                <code className="font-medium text-blue-600 bg-blue-100 px-2 py-1 rounded">
                  {selectedWebsiteData.website_id.substring(0, 12)}...
                </code>
              </div>
            </div>
            
            {!isWebsiteReadyForScript(selectedWebsiteData) && (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-yellow-700 text-sm">
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
            className="px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center space-x-3 shadow-lg shadow-blue-200"
          >
            <FaCode className="text-xl" />
            <span className="text-lg">
              {isGenerating ? 'Generating...' : 'Generate Script Tag'}
            </span>
            {isGenerating && <FaSpinner className="animate-spin" />}
          </button>
        </div>

        {/* Generated Script */}
        {generatedScript && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 text-lg">Your Embed Code:</h3>
              <div className="flex space-x-3">
                <button
                  onClick={copyToClipboard}
                  className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all duration-200 flex items-center space-x-2 shadow-lg"
                >
                  {copied ? <FaCheck /> : <FaCopy />}
                  <span>{copied ? 'Copied!' : 'Copy Code'}</span>
                </button>
                <button
                  onClick={downloadScript}
                  className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg hover:from-blue-600 hover:to-indigo-700 transition-all duration-200 flex items-center space-x-2 shadow-lg"
                >
                  <FaDownload />
                  <span>Download</span>
                </button>
              </div>
            </div>

            <div className="relative group">
              <div className="absolute top-3 right-3 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={copyToClipboard}
                  className="p-1.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900"
                  title="Copy"
                >
                  <FaCopy className="text-sm" />
                </button>
              </div>
              <div className="bg-gray-900 bg-opacity-90 text-gray-100 p-6 rounded-xl overflow-x-auto text-sm">
                <code className="whitespace-pre-wrap break-all">{generatedScript}</code>
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6 border border-green-200">
              <h4 className="font-semibold text-green-800 mb-4 text-lg flex items-center">
                <FaCode className="mr-2" /> How to use:
              </h4>
              <ol className="space-y-3 text-green-700">
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-sm mr-3">
                    1
                  </span>
                  <span>Copy the script tag above</span>
                </li>
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-sm mr-3">
                    2
                  </span>
                  <span>Paste it into your website's <code className="bg-green-100 px-2 py-1 rounded font-mono">index.html</code> file</span>
                </li>
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-sm mr-3">
                    3
                  </span>
                  <span>Place it just before the closing <code className="bg-green-100 px-2 py-1 rounded font-mono">&lt;/body&gt;</code> tag</span>
                </li>
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-sm mr-3">
                    4
                  </span>
                  <span>The chatbot icon will appear in the bottom-right corner of your website</span>
                </li>
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-sm mr-3">
                    5
                  </span>
                  <span>Users can click the icon to open the chat interface</span>
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