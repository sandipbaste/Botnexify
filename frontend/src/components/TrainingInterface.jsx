

// TrainingInterface.jsx
import React, { useState, useEffect, useRef } from 'react';
import { 
  FaSpinner, FaCheckCircle, FaGlobe, FaDatabase, FaRobot, 
  FaClock, FaArrowRight, FaCode, FaSave, FaCog, FaSearch,
  FaFileAlt, FaBrain, FaRocket, FaHourglassHalf
} from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'https://botrion.onrender.com';

const TrainingInterface = ({ onWebsiteTrained, onTrainingStart, onTrainingComplete, isProcessing }) => {
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [websiteName, setWebsiteName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [trainingProgress, setTrainingProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [currentStage, setCurrentStage] = useState('');
  const [stageDetails, setStageDetails] = useState('');
  const [trainingComplete, setTrainingComplete] = useState(false);
  const [pagesExtracted, setPagesExtracted] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  
  const progressInterval = useRef(null);
  const startTimeRef = useRef(null);
  const targetProgressRef = useRef(0);
  const currentProgressRef = useRef(0);
  const baseProgressRef = useRef(0);

  // Continuous smooth progress function - NEVER STOPS
  const continuousProgress = () => {
    // Always increase progress slowly, even if target not reached
    // This ensures the progress bar never stops moving
    
    if (currentProgressRef.current < 99) { // Don't go to 100 until complete
      // Calculate increment based on elapsed time (faster at start, slower later)
      const elapsedSeconds = (Date.now() - startTimeRef.current) / 1000;
      
      // Dynamic increment: faster at beginning, slower as we approach target
      let increment = 0.1; // Base increment
      
      if (elapsedSeconds < 10) {
        // First 10 seconds: faster progress (0.15% per tick)
        increment = 0.15;
      } else if (elapsedSeconds < 30) {
        // 10-30 seconds: medium progress (0.1% per tick)
        increment = 0.1;
      } else if (elapsedSeconds < 60) {
        // 30-60 seconds: slower progress (0.08% per tick)
        increment = 0.08;
      } else {
        // After 60 seconds: very slow progress (0.05% per tick)
        increment = 0.05;
      }
      
      // Add small random variation to make it feel natural (±0.02%)
      increment += (Math.random() * 0.04) - 0.02;
      
      const newProgress = Math.min(
        currentProgressRef.current + increment, 
        99
      );
      
      currentProgressRef.current = newProgress;
      setTrainingProgress(newProgress);
      
      // Update stage details based on progress
      updateStageFromProgress(newProgress);
    }
  };

  // Update stage based on continuous progress
  const updateStageFromProgress = (progress) => {
    if (progress < 10) {
      setCurrentStage('Initializing');
      setStageDetails('Preparing training environment...');
      setCurrentStep(1);
    } else if (progress < 20) {
      setCurrentStage('Connecting to Website');
      setStageDetails('Establishing connection to target website...');
      setCurrentStep(2);
    } else if (progress < 30) {
      setCurrentStage('Discovering Pages');
      setStageDetails(`Scanning website structure... Found ${pagesExtracted} pages so far`);
      setCurrentStep(3);
    } else if (progress < 40) {
      setCurrentStage('Crawling Content');
      setStageDetails(`Extracting content from website pages...`);
      setCurrentStep(4);
    } else if (progress < 50) {
      setCurrentStage('Processing Pages');
      setStageDetails(`Processing ${pagesExtracted} pages for embedding...`);
      setCurrentStep(5);
    } else if (progress < 60) {
      setCurrentStage('Cleaning Content');
      setStageDetails('Cleaning and organizing extracted content...');
      setCurrentStep(6);
    } else if (progress < 70) {
      setCurrentStage('Loading AI Model');
      setStageDetails('Loading HuggingFace embedding model...');
      setCurrentStep(7);
    } else if (progress < 80) {
      setCurrentStage('Creating Embeddings');
      setStageDetails('Converting text to AI embeddings...');
      setCurrentStep(8);
    } else if (progress < 90) {
      setCurrentStage('Storing in Qdrant');
      setStageDetails('Saving embeddings to Qdrant Cloud...');
      setCurrentStep(9);
    } else if (progress < 95) {
      setCurrentStage('Generating Script');
      setStageDetails('Creating chatbot JavaScript file...');
      setCurrentStep(10);
    } else if (progress < 99) {
      setCurrentStage('Finalizing');
      setStageDetails('Completing training process...');
      setCurrentStep(11);
    } else {
      setCurrentStage('Almost Done');
      setStageDetails('Finalizing...');
      setCurrentStep(12);
    }
  };

  // Start continuous progress animation
  useEffect(() => {
    if (isProcessing && !trainingComplete) {
      // Start continuous progress (updates every 200ms)
      progressInterval.current = setInterval(continuousProgress, 200);
      
      // Update elapsed time
      startTimeRef.current = Date.now();
      const timeInterval = setInterval(() => {
        if (startTimeRef.current) {
          const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
          setElapsedTime(elapsed);
        }
      }, 1000);
      
      return () => {
        clearInterval(progressInterval.current);
        clearInterval(timeInterval);
      };
    }
  }, [isProcessing, trainingComplete]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!websiteUrl) {
      toast.error('Please enter a website URL');
      return;
    }
    
    if (!contactEmail) {
      toast.error('Please enter a contact email');
      return;
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(contactEmail)) {
      toast.error('Please enter a valid email address');
      return;
    }
    
    onTrainingStart();
    
    // Reset all progress values
    setTrainingProgress(0);
    setCurrentStage('Initializing');
    setStageDetails('Starting training process...');
    setPagesExtracted(0);
    setElapsedTime(0);
    setTrainingComplete(false);
    setCurrentStep(1);
    
    currentProgressRef.current = 0;
    startTimeRef.current = Date.now();
    
    try {
      const token = localStorage.getItem('access_token');
      
      // Start training
      const response = await fetch(`${API_URL}/api/train`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          website_url: websiteUrl,
          website_name: websiteName || undefined,
          contact_email: contactEmail,
          generate_script: true
        })
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Training failed');
      }
      
      const websiteId = data.website_id;
      
      // Poll for training status (just for completion, not for progress)
      const pollInterval = setInterval(async () => {
        try {
          const statusResponse = await fetch(`${API_URL}/api/training-status/${websiteId}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          
          const statusData = await statusResponse.json();
          
          if (statusData.success) {
            // Update pages extracted count from real data
            if (statusData.data_points) {
              setPagesExtracted(statusData.data_points);
            }
            
            // Check if training is complete or errored
            if (statusData.status === 'completed') {
              clearInterval(pollInterval);
              
              // Jump to 100% when complete
              currentProgressRef.current = 100;
              setTrainingProgress(100);
              setCurrentStage('Completed');
              setStageDetails('Training completed successfully!');
              setCurrentStep(12);
              setTrainingComplete(true);
              
              // Create website object
              setTimeout(() => {
                const websiteObj = {
                  website_id: websiteId,
                  website_name: statusData.website_name || websiteName || websiteUrl,
                  website_url: websiteUrl,
                  admin_email: contactEmail,
                  status: 'active',
                  created_at: new Date().toISOString(),
                  data_points: statusData.data_points || pagesExtracted || 0,
                  upload_count: 0
                };
                
                onWebsiteTrained(websiteObj);
                toast.success('🎉 Chatbot trained successfully!');
              }, 500);
              
            } else if (statusData.status === 'error') {
              clearInterval(pollInterval);
              setCurrentStage('Error');
              setStageDetails(statusData.message || 'Training failed');
              toast.error(statusData.message || 'Training failed');
              onTrainingComplete();
            }
          }
        } catch (error) {
          console.error('Error polling status:', error);
        }
      }, 3000);
      
    } catch (error) {
      console.error('Training error:', error);
      toast.error(error.message || 'Failed to start training');
      onTrainingComplete();
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Train New Chatbot</h2>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Website URL *
          </label>
          <input
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://example.com"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            disabled={isProcessing}
            required
          />
          <p className="mt-1 text-sm text-gray-500">
            Enter the full URL of the website you want to train the chatbot on
          </p>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Website Name (Optional)
          </label>
          <input
            type="text"
            value={websiteName}
            onChange={(e) => setWebsiteName(e.target.value)}
            placeholder="My Awesome Website"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            disabled={isProcessing}
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Contact Email *
          </label>
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="admin@example.com"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            disabled={isProcessing}
            required
          />
          <p className="mt-1 text-sm text-gray-500">
            Email where you'll receive notifications and chat reports
          </p>
        </div>
        
        <button
          type="submit"
          disabled={isProcessing}
          className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isProcessing ? 'Training in Progress...' : 'Start Training'}
        </button>
      </form>
      
      {/* Progress Popup Modal */}
      <AnimatePresence>
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 flex items-center justify-center z-50 p-4"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          >
            <motion.div
              initial={{ y: 50 }}
              animate={{ y: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                      <FaRobot className="text-blue-600 text-xl" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Training Progress</h3>
                      <p className="text-sm text-gray-500">Website: {websiteName || websiteUrl}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-blue-600">
                      {trainingComplete ? '100%' : `${Math.min(99, Math.round(trainingProgress))}%`}
                    </div>
                    <div className="text-xs text-gray-400 flex items-center">
                      <FaClock className="mr-1" /> {formatTime(elapsedTime)}
                    </div>
                  </div>
                </div>
                
                {/* Main Progress Bar - Always Moving */}
                <div className="mb-8">
                  <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-600"
                      initial={{ width: 0 }}
                      animate={{ width: `${trainingComplete ? 100 : trainingProgress}%` }}
                      transition={{ duration: 0.2 }}
                    />
                  </div>
                </div>
                
                {/* Current Step with Live Updates */}
                <div className="mb-4 text-center">
                  <div className={`inline-block rounded-full px-4 py-2 ${
                    trainingComplete ? 'bg-green-100' : 'bg-blue-100'
                  }`}>
                    <span className={`text-sm font-medium ${
                      trainingComplete ? 'text-green-700' : 'text-blue-700'
                    }`}>
                      {trainingComplete ? '✅ Training Complete!' : `Step ${currentStep} of 12 • ${currentStage}`}
                    </span>
                  </div>
                </div>
                
                {/* Live Stats Grid */}
                <div className="mb-6">
                  <div className="bg-green-50 p-3 rounded-lg text-center">
                    <div className="text-xs text-gray-600">Est. Remaining</div>
                    <div className="text-xl font-bold text-green-700">
                      {trainingComplete ? 'Done!' :
                       trainingProgress < 20 ? '3-4 min' :
                       trainingProgress < 40 ? '2-3 min' :
                       trainingProgress < 60 ? '1-2 min' :
                       trainingProgress < 80 ? '45-60 sec' :
                       trainingProgress < 95 ? '30 sec' :
                       'Few seconds'}
                    </div>
                  </div>
                </div>
                
                {/* Current Action with Continuous Progress */}
                <div className={`p-4 rounded-lg border ${
                  trainingComplete ? 'bg-green-50 border-green-200' : 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200'
                } mb-4`}>
                  <div className="flex items-center">
                    <div className="mr-3 text-2xl">
                      {trainingComplete ? 
                        <FaCheckCircle className="text-green-500" /> : 
                        <FaHourglassHalf className="text-blue-500 animate-pulse" />
                      }
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900">
                        {trainingComplete ? 'Complete!' : currentStage}
                      </p>
                      <p className="text-xs text-gray-600">{stageDetails}</p>
                      
                      {/* Micro progress bar for current action */}
                      {!trainingComplete && (
                        <div className="mt-2 w-full bg-blue-200 rounded-full h-1.5">
                          <motion.div
                            className="h-full bg-blue-600 rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${(trainingProgress % 10) * 10}%` }}
                            transition={{ duration: 0.3 }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Progress Message */}
                <div className="text-center">
                  <p className="text-xs text-gray-400">
                    {trainingComplete ? 
                      'Your chatbot is ready to use!' : 
                      'Progress continues during extraction • Training in progress...'}
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default TrainingInterface;
