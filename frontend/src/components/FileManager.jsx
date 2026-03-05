import React, { useState, useEffect } from 'react';
import { 
  FaUpload, FaTrash, FaFilePdf, FaFileWord, FaFileExcel, 
  FaFileImage, FaFileAlt, FaSpinner, FaSync, FaEye
} from 'react-icons/fa';
import { toast } from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'https://botrion.onrender.com';

const FileManager = ({ website, onUploadComplete }) => {
  const [files, setFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [reindexing, setReindexing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    if (website) {
      loadFiles();
    }
  }, [website]);

  const loadFiles = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_URL}/api/website/${website.website_id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Extract uploads from website data
        const uploads = data.uploads_metadata || [];
        const fileList = [];
        
        // Process uploads metadata
        uploads.forEach(upload => {
          if (upload.saved_filename) {
            fileList.push({
              id: upload.saved_filename,
              name: upload.original_filename || upload.saved_filename,
              size: upload.size || 0,
              type: getFileType(upload.saved_filename),
              uploaded_at: upload.uploaded_at,
              processed: upload.processed || false,
              chunks: upload.chunks || 0,
              path: upload.saved_path
            });
          }
        });
        
        setFiles(fileList);
      }
    } catch (error) {
      console.error('Error loading files:', error);
      toast.error('Failed to load files');
    } finally {
      setIsLoading(false);
    }
  };

  const getFileType = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    if (['pdf'].includes(ext)) return 'pdf';
    if (['doc', 'docx'].includes(ext)) return 'word';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'excel';
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp'].includes(ext)) return 'image';
    if (['txt', 'md'].includes(ext)) return 'text';
    return 'other';
  };

  const getFileIcon = (type) => {
    switch (type) {
      case 'pdf': return <FaFilePdf className="text-red-500" />;
      case 'word': return <FaFileWord className="text-blue-500" />;
      case 'excel': return <FaFileExcel className="text-green-500" />;
      case 'image': return <FaFileImage className="text-purple-500" />;
      case 'text': return <FaFileAlt className="text-gray-500" />;
      default: return <FaFileAlt className="text-gray-400" />;
    }
  };

  const handleFileUpload = async (event) => {
    const selectedFiles = Array.from(event.target.files);
    if (selectedFiles.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const token = localStorage.getItem('access_token');
      const formData = new FormData();
      
      selectedFiles.forEach(file => {
        formData.append('files', file);
      });

      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100;
          setUploadProgress(percentComplete);
        }
      });

      xhr.addEventListener('load', async () => {
        try {
          const data = JSON.parse(xhr.responseText);
          
          if (data.success) {
            if (data.successful_uploads > 0) {
              toast.success(`Uploaded ${data.successful_uploads} file(s) successfully!`);
            } else {
              toast.error('No files were uploaded. Please try again.');
            }
            
            await loadFiles(); // Refresh file list
            if (onUploadComplete) onUploadComplete();
            
            // Auto-reindex if files were processed
            if (data.successful_uploads > 0) {
              toast.info('Files are being processed in the background...');
            }
          } else {
            toast.error(data.message || 'Upload failed');
          }
        } catch (parseError) {
          console.error('Parse error:', parseError);
          // Check if response is plain text (not JSON)
          if (xhr.responseText.includes('success') || xhr.responseText.includes('Uploaded')) {
            toast.success('File uploaded successfully!');
            await loadFiles();
            if (onUploadComplete) onUploadComplete();
          } else {
            toast.error('Failed to process upload response');
          }
        } finally {
          setIsUploading(false);
          setUploadProgress(0);
          // Clear file input
          event.target.value = '';
        }
      });

      xhr.addEventListener('error', () => {
        toast.error('Network error during upload');
        setIsUploading(false);
        setUploadProgress(0);
        event.target.value = '';
      });

      xhr.open('POST', `${API_URL}/api/upload/${website.website_id}`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.send(formData);

    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Upload failed');
      setIsUploading(false);
      setUploadProgress(0);
      event.target.value = '';
    }
  };

  const handleDeleteFile = async (filename) => {
    if (!window.confirm(`Are you sure you want to delete "${filename}"?`)) {
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_URL}/api/delete-file/${website.website_id}`, {
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
        // Remove from local state
        setFiles(prevFiles => prevFiles.filter(f => f.id !== filename));
        if (onUploadComplete) onUploadComplete();
        
        // Refresh to ensure sync
        await loadFiles();
      } else {
        throw new Error(data.message || 'Failed to delete file');
      }
    } catch (error) {
      toast.error(error.message || 'Failed to delete file');
    }
  };

  const handleReindex = async () => {
    setReindexing(true);
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_URL}/api/reindex/${website.website_id}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      
      if (data.success) {
        toast.success('Reindexing completed successfully');
        await loadFiles(); // Refresh file list
      } else {
        throw new Error(data.message || 'Reindexing failed');
      }
    } catch (error) {
      toast.error(error.message || 'Reindexing failed');
    } finally {
      setReindexing(false);
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
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      {/* Website Info */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-5 border border-blue-200">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-gray-900 text-lg">{website.website_name}</h3>
            <p className="text-sm text-gray-600">ID: {website.website_id.substring(0, 12)}...</p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleReindex}
              disabled={reindexing || files.length === 0}
              className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all duration-200 flex items-center space-x-2 disabled:opacity-50"
            >
              <FaSync className={reindexing ? 'animate-spin' : ''} />
              <span>{reindexing ? 'Reindexing...' : 'Reindex Website'}</span>
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Total Files</p>
            <p className="font-medium text-blue-600">{files.length}</p>
          </div>
          <div>
            <p className="text-gray-500">Processed Files</p>
            <p className="font-medium text-green-600">{files.filter(f => f.processed).length}</p>
          </div>
          <div>
            <p className="text-gray-500">Total Chunks</p>
            <p className="font-medium text-purple-600">{files.reduce((sum, f) => sum + (f.chunks || 0), 0)}</p>
          </div>
          <div>
            <p className="text-gray-500">Data Points</p>
            <p className="font-medium text-indigo-600">{website.data_points || '0'}</p>
          </div>
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
                type="file"
                multiple
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={isUploading}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.jpg,.jpeg,.png"
              />
              <div className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors">
                {isUploading ? 'Uploading...' : 'Choose Files'}
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Max file size: 50MB. Supported: PDF, DOC, XLS, TXT, Images
            </p>
          </div>
        </label>
        
        {/* Upload Progress */}
        {isUploading && (
          <div className="mt-6">
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>Uploading...</span>
              <span>{Math.round(uploadProgress)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-green-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
          </div>
        )}
      </div>

      {/* Files List */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Uploaded Files ({files.length})</h3>
          <button
            onClick={loadFiles}
            className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center space-x-2"
          >
            <FaSync className={isLoading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
        
        {isLoading ? (
          <div className="text-center py-8">
            <FaSpinner className="animate-spin text-2xl text-blue-600 mx-auto mb-4" />
            <p className="text-gray-600">Loading files...</p>
          </div>
        ) : files.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-gray-600 border-b">
                  <th className="pb-3">File</th>
                  <th className="pb-3">Size</th>
                  <th className="pb-3">Type</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Uploaded</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {files.map(file => (
                  <tr key={file.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-4">
                      <div className="flex items-center space-x-3">
                        <div className="text-xl">
                          {getFileIcon(file.type)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 truncate max-w-xs">{file.name}</p>
                          <p className="text-xs text-gray-500">{file.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 text-gray-600">
                      {formatFileSize(file.size)}
                    </td>
                    <td className="py-4">
                      <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded capitalize">
                        {file.type}
                      </span>
                    </td>
                    <td className="py-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        file.processed 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {file.processed ? `Processed (${file.chunks} chunks)` : 'Pending'}
                      </span>
                    </td>
                    <td className="py-4 text-gray-600">
                      {formatDate(file.uploaded_at)}
                    </td>
                    <td className="py-4">
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => handleDeleteFile(file.id)}
                          className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <FaTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FaFileAlt className="text-gray-400 text-2xl" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No files uploaded yet</h3>
            <p className="text-gray-600">Upload your first file to train your chatbot</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileManager;
