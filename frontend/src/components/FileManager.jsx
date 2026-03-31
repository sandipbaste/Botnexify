import React, { useRef, useState } from 'react';
import { FaUpload, FaSpinner, FaSync } from 'react-icons/fa';
import { toast } from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL;

const FileManager = ({ website, onUploadComplete }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadPhase, setUploadPhase] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');
  const [processingFiles, setProcessingFiles] = useState([]);
  const fileInputRef = useRef(null);

  // Simulate progressive upload with phases
  const simulateProgress = async (selectedFiles) => {
    return new Promise((resolve) => {
      let progress = 0;
      const phases = [
        { name: 'uploading', duration: 30, message: 'Uploading files..' },
        { name: 'processing', duration: 40, message: 'Processing file content...' },
        { name: 'embedding', duration: 30, message: 'Creating embeddings...' }
      ];
      
      let phaseIndex = 0;
      let phaseProgress = 0;
      
      const interval = setInterval(() => {
        if (phaseIndex >= phases.length) {
          clearInterval(interval);
          setUploadPhase('complete');
          setUploadProgress(100);
          setUploadStatus('Complete!');
          setTimeout(resolve, 500);
          return;
        }
        
        const currentPhase = phases[phaseIndex];
        setUploadPhase(currentPhase.name);
        setUploadStatus(currentPhase.message);
        
        phaseProgress += 1;
        
        const phaseStart = phases.slice(0, phaseIndex).reduce((sum, p) => sum + p.duration, 0);
        const phaseCurrent = (phaseProgress / currentPhase.duration) * currentPhase.duration;
        progress = Math.min(phaseStart + phaseCurrent, 100);
        
        setUploadProgress(Math.round(progress));
        
        if (phaseProgress >= currentPhase.duration) {
          phaseIndex++;
          phaseProgress = 0;
        }
      }, 100);
    });
  };

  const handleFileUpload = async (event) => {
    const selectedFiles = Array.from(event.target.files);
    if (selectedFiles.length === 0) return;

    setProcessingFiles(selectedFiles.map(f => f.name));
    setIsUploading(true);
    setUploadProgress(0);
    setUploadPhase('uploading');
    setUploadStatus('Starting upload...');

    try {
      const token = localStorage.getItem('access_token');
      const formData = new FormData();
      
      selectedFiles.forEach(file => {
        formData.append('files', file);
      });

      const progressPromise = simulateProgress(selectedFiles);

      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const uploadPercent = (e.loaded / e.total) * 30;
          setUploadProgress(Math.round(uploadPercent));
          setUploadPhase('uploading');
          setUploadStatus(`Uploading: ${Math.round((e.loaded / e.total) * 100)}%`);
        }
      });

      const uploadPromise = new Promise((resolve, reject) => {
        xhr.addEventListener('load', async () => {
          try {
            const data = JSON.parse(xhr.responseText);
            
            if (data.success) {
              if (data.successful_uploads > 0) {
                await progressPromise;
                toast.success(`Uploaded ${data.successful_uploads} file(s) successfully!`);
              } else {
                toast.error('No files were uploaded. Please try again.');
              }
              
              if (onUploadComplete) onUploadComplete();
              resolve();
            } else {
              reject(new Error(data.message || 'Upload failed'));
            }
          } catch (parseError) {
            if (xhr.responseText.includes('success') || xhr.responseText.includes('Uploaded')) {
              await progressPromise;
              toast.success('File uploaded successfully!');
              if (onUploadComplete) onUploadComplete();
              resolve();
            } else {
              reject(new Error('Failed to process upload response'));
            }
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Network error during upload'));
        });

        xhr.addEventListener('abort', () => {
          reject(new Error('Upload aborted'));
        });
      });

      xhr.open('POST', `${API_URL}/api/upload/${website.website_id}`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.send(formData);

      await uploadPromise;

    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error.message || 'Upload failed');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setUploadPhase('');
      setUploadStatus('');
      setProcessingFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const getPhaseColor = () => {
    switch (uploadPhase) {
      case 'uploading': return 'bg-blue-500';
      case 'processing': return 'bg-yellow-500';
      case 'embedding': return 'bg-purple-500';
      case 'complete': return 'bg-green-500';
      default: return 'bg-blue-500';
    }
  };

  return (
    <>
      {/* Upload Overlay - Blocks UI when uploading */}
      {isUploading && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4">
            <div className="text-center mb-6">
              <div className="w-20 h-20 mx-auto mb-4 relative">
                <div className="absolute inset-0 border-4 border-gray-200 rounded-full"></div>
                <div 
                  className={`absolute inset-0 border-4 ${getPhaseColor()} rounded-full transition-all duration-300`}
                  style={{ 
                    clipPath: `inset(0 ${100 - uploadProgress}% 0 0)`,
                    transform: 'rotate(90deg) scaleX(-1)'
                  }}
                ></div>
              </div>
              
              {/* Progress Bar */}
              <div className="w-full bg-gray-200 rounded-full h-3 mb-4">
                <div 
                  className={`${getPhaseColor()} h-3 rounded-full transition-all duration-300 relative`}
                  style={{ width: `${uploadProgress}%` }}
                >
                  <span className="absolute -right-8 -top-6 text-sm font-medium text-gray-700">
                    {uploadProgress}%
                  </span>
                </div>
              </div>
              
              {/* Files being processed */}
              {processingFiles.length > 0 && (
                <div className="mt-4 text-left">
                  <p className="text-sm font-medium text-gray-700 mb-2">Processing:</p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {processingFiles.map((fileName, index) => (
                      <div key={index} className="flex items-center space-x-2 text-sm">
                        <FaSpinner className="animate-spin text-blue-500 text-xs" />
                        <span className="text-gray-600 truncate">{fileName}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <p className="text-xs text-gray-500 mt-4">
                Please don't close this window or navigate away
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Upload Section */}
      <div className={`space-y-6 ${isUploading ? 'pointer-events-none opacity-50' : ''}`}>
        {/* Website Info */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-5 border border-blue-200">
          <div>
            <h3 className="font-semibold text-gray-900 text-lg">{website.website_name}</h3>
            <p className="text-sm text-gray-600">ID: {website.website_id.substring(0, 12)}...</p>
          </div>
        </div>

        {/* Upload Section */}
        <div className="bg-white border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 transition-colors">
          <label className="cursor-pointer">
            <div className="flex flex-col items-center justify-center space-y-4">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                <FaUpload className="text-blue-600 text-2xl" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Upload Files</h3>
                <p className="text-gray-600 mb-4">
                  Upload PDF, Word, Excel, or text files to train your chatbot
                </p>
              </div>
              <div className="relative">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  disabled={isUploading}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.jpg,.jpeg,.png"
                />
                <div className={`px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  {isUploading ? 'Uploading...' : 'Choose Files'}
                </div>
              </div>
              <p className="text-xs text-gray-500">
                Max file size: 50MB. Supported: PDF, DOC, XLS, TXT, Images
              </p>
            </div>
          </label>
        </div>

        {/* Note about file management */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
          <p className="text-sm text-blue-700">
            After uploading, your files will appear in the "Uploaded Files" section below.
            You can preview, download, or delete files from there.
          </p>
        </div>
      </div>
    </>
  );
};

export default FileManager;