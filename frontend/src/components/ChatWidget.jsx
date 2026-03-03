// ChatWidget.jsx - FIXED VERSION
import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { 
  FaRobot, FaTimes, FaPaperPlane, FaSpinner, FaCopy,
  FaThumbsUp, FaThumbsDown, FaExpand, FaCompress,
  FaRegSmile, FaRegFileAlt, FaRegCommentDots, FaRedo,
  FaUser, FaEnvelope, FaPhone, FaCheck, FaAddressCard,
  FaEnvelopeOpenText, FaFilePdf, FaHistory
} from 'react-icons/fa';
import { toast } from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL;

// Memoized Contact Form Component
const ContactForm = memo(({ 
  contactFormData, 
  setContactFormData, 
  handleContactFormSubmit, 
  handleKeyPress, 
  isLoading,
  setShowContactForm 
}) => {
  const nameRef = useRef(null);
  const emailRef = useRef(null);
  const phoneRef = useRef(null);
  const messageRef = useRef(null);
  
  // Handle input changes without causing full re-render
  const handleInputChange = useCallback((field, value) => {
    setContactFormData(prev => ({
      ...prev,
      [field]: value
    }));
  }, [setContactFormData]);

  return (
    <div className="animate-fade-in">
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-6 mb-4">
        <h3 className="font-bold text-blue-800 text-lg mb-4 flex items-center">
          <FaAddressCard className="mr-2" />
          Contact Us
        </h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-blue-700 mb-2">
              Name *
            </label>
            <input
              ref={nameRef}
              type="text"
              value={contactFormData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              className="w-full px-4 py-3 border border-blue-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white"
              placeholder="Your name"
              onKeyPress={handleKeyPress}
              autoComplete="name"
              autoFocus
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-blue-700 mb-2">
              Email *
            </label>
            <input
              ref={emailRef}
              type="email"
              value={contactFormData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              className="w-full px-4 py-3 border border-blue-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white"
              placeholder="your.email@example.com"
              onKeyPress={handleKeyPress}
              autoComplete="email"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-blue-700 mb-2">
              Phone
            </label>
            <input
              ref={phoneRef}
              type="tel"
              value={contactFormData.phone}
              onChange={(e) => handleInputChange('phone', e.target.value)}
              className="w-full px-4 py-3 border border-blue-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white"
              placeholder="+91 1234567890"
              onKeyPress={handleKeyPress}
              autoComplete="tel"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-blue-700 mb-2">
              Message *
            </label>
            <textarea
              ref={messageRef}
              value={contactFormData.message}
              onChange={(e) => handleInputChange('message', e.target.value)}
              className="w-full px-4 py-3 border border-blue-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white"
              rows="4"
              placeholder="Your message..."
              onKeyPress={handleKeyPress}
            />
          </div>
          
          <div className="flex space-x-3">
            <button
              onClick={() => setShowContactForm(false)}
              className="px-4 py-3 text-gray-700 hover:text-gray-900 hover:bg-gray-200 rounded-xl transition-colors flex-1"
            >
              Cancel
            </button>
            <button
              onClick={handleContactFormSubmit}
              disabled={isLoading}
              className="px-4 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-medium rounded-xl hover:from-green-600 hover:to-emerald-700 transition-all duration-200 flex-1 disabled:opacity-50"
            >
              {isLoading ? 'Sending...' : 'Send Message'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

ContactForm.displayName = 'ContactForm';

// Registration Form Component
const RegistrationForm = memo(({ 
  userInfo, 
  setUserInfo, 
  handleUserRegistration, 
  handleKeyPress, 
  isLoading 
}) => {
  const nameRef = useRef(null);
  const emailRef = useRef(null);
  const phoneRef = useRef(null);
  
  // Focus on name field when component mounts
  useEffect(() => {
    if (nameRef.current) {
      nameRef.current.focus();
    }
  }, []);

  // Handle input changes
  const handleInputChange = useCallback((field, value) => {
    setUserInfo(prev => ({
      ...prev,
      [field]: value
    }));
  }, [setUserInfo]);

  return (
    <div className="animate-fade-in">
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-6 mb-4">
        <h3 className="font-bold text-blue-800 text-lg mb-4 flex items-center">
          <FaUser className="mr-2" />
          Welcome! Let's get started
        </h3>
        <p className="text-blue-600 mb-6">
          Please provide your information to start chatting with our AI assistant.
        </p>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-blue-700 mb-2">
              Full Name *
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-blue-500">
                <FaUser className="text-sm" />
              </div>
              <input
                ref={nameRef}
                type="text"
                value={userInfo.full_name}
                onChange={(e) => handleInputChange('full_name', e.target.value)}
                placeholder="Enter your full name"
                className="w-full pl-10 pr-4 py-3 border border-blue-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white"
                onKeyPress={handleKeyPress}
                autoComplete="name"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-blue-700 mb-2">
              Email Address *
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-blue-500">
                <FaEnvelope className="text-sm" />
              </div>
              <input
                ref={emailRef}
                type="email"
                value={userInfo.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="your.email@example.com"
                className="w-full pl-10 pr-4 py-3 border border-blue-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white"
                onKeyPress={handleKeyPress}
                autoComplete="email"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-blue-700 mb-2">
              Mobile Number *
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-blue-500">
                <FaPhone className="text-sm" />
              </div>
              <input
                ref={phoneRef}
                type="tel"
                value={userInfo.mobile}
                onChange={(e) => handleInputChange('mobile', e.target.value)}
                placeholder="+91 1234567890"
                className="w-full pl-10 pr-4 py-3 border border-blue-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white"
                onKeyPress={handleKeyPress}
                autoComplete="tel"
              />
            </div>
          </div>
          
          <button
            onClick={handleUserRegistration}
            disabled={isLoading}
            className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-medium rounded-xl hover:from-green-600 hover:to-emerald-700 transition-all duration-200 flex items-center justify-center space-x-2 shadow-lg disabled:opacity-50"
          >
            <FaCheck />
            <span>{isLoading ? 'Registering...' : 'Start Chatting'}</span>
          </button>
          
        </div>
      </div>
    </div>
  );
});

RegistrationForm.displayName = 'RegistrationForm';

const ChatWidget = ({ websiteId, apiUrl = API_URL, onEndSession, onClose }) => {
  const [isOpen, setIsOpen] = useState(true);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [suggestedQuestions, setSuggestedQuestions] = useState([]);
  const [showWelcome, setShowWelcome] = useState(true);
  const [showRegistration, setShowRegistration] = useState(true);
  const [showContactForm, setShowContactForm] = useState(false);
  const [userInfo, setUserInfo] = useState({
    full_name: '',
    email: '',
    mobile: ''
  });
  const [contactFormData, setContactFormData] = useState({
    name: '',
    email: '',
    phone: '',
    message: ''
  });
  const [isRegistered, setIsRegistered] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(false);
  const [isEndingSession, setIsEndingSession] = useState(false);
  const [showEnquiryButton, setShowEnquiryButton] = useState(false);
  const [currentQuestionContext, setCurrentQuestionContext] = useState('');
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const chatContainerRef = useRef(null);
  const messagesContainerRef = useRef(null);

  // Initialize conversation
  useEffect(() => {
    const newConvId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setConversationId(newConvId);
    
    // Load suggested questions
    const questions = [
      "What services do you offer?",
      "How can I contact you?",
      "Tell me about your company",
      "Do you have pricing information?",
      "Where are you located?"
    ];
    setSuggestedQuestions(questions);
    
  }, [websiteId]);

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    if (messagesContainerRef.current && shouldScrollToBottom) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      setShouldScrollToBottom(false);
    }
  }, [messages, shouldScrollToBottom]);

  // Check if we should show enquiry button for specific questions
  const shouldShowEnquiryButton = (question) => {
    const enquiryKeywords = [
      'price', 'pricing', 'cost', 'fee', 'charge', 'charges', 'how much',
      'budget', 'quote', 'quotation', 'estimate', 'rates',
      'contact', 'phone', 'email', 'address', 'location',
      'call', 'reach', 'get in touch', 'where are you',
      'office', 'headquarters', 'meet', 'visit'
    ];
    
    const lowerQuestion = question.toLowerCase();
    return enquiryKeywords.some(keyword => lowerQuestion.includes(keyword));
  };

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  };

  
const setupBeforeUnload = useCallback(() => {
  const sendAutoReport = async () => {
    if (isRegistered && sessionId && messages.length >= 2) {
      try {
        // Use FormData for better compatibility
        const formData = new FormData();
        formData.append('session_id', sessionId);
        
        // Try using fetch with keepalive first
        const response = await fetch(`${apiUrl}/api/chat/auto-report`, {
          method: 'POST',
          body: formData,
          keepalive: true, // This keeps the request alive after page unload
          mode: 'no-cors' // For cross-origin requests
        });
        
        console.log('📧 Auto-report sent (browser close)');
      } catch (error) {
        console.error('Error sending auto-report:', error);
        
        // Fallback: Use Beacon API
        try {
          const data = new FormData();
          data.append('session_id', sessionId);
          navigator.sendBeacon(`${apiUrl}/api/chat/auto-report`, data);
          console.log('📧 Auto-report queued via Beacon API');
        } catch (beaconError) {
          console.error('Beacon API also failed:', beaconError);
        }
      }
    }
  };

  const handleBeforeUnload = (e) => {
    if (isRegistered && messages.length >= 2) {
      // Don't prevent unload, just send report
      sendAutoReport();
    }
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden' && 
        isRegistered && 
        sessionId && 
        messages.length >= 2) {
      // Page is being hidden (tab switched, minimized, or closed)
      sendAutoReport();
    }
  };

  // Add event listeners
  window.addEventListener('beforeunload', handleBeforeUnload);
  window.addEventListener('pagehide', handleBeforeUnload);
  window.addEventListener('unload', handleBeforeUnload);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    window.removeEventListener('beforeunload', handleBeforeUnload);
    window.removeEventListener('pagehide', handleBeforeUnload);
    window.removeEventListener('unload', handleBeforeUnload);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}, [isRegistered, sessionId, messages.length, apiUrl]);


useEffect(() => {
  if (isRegistered && sessionId) {
    const cleanup = setupBeforeUnload();
    return cleanup;
  }
}, [isRegistered, sessionId, setupBeforeUnload]);

  const handleUserRegistration = async () => {
    // Basic validation
    if (!userInfo.full_name.trim()) {
      toast.error('Please enter your full name');
      return;
    }
    
    if (!userInfo.email.trim()) {
      toast.error('Please enter your email');
      return;
    }
    
    if (!userInfo.mobile.trim()) {
      toast.error('Please enter your mobile number');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${apiUrl}/api/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          website_id: websiteId,
          full_name: userInfo.full_name,
          email: userInfo.email,
          mobile: userInfo.mobile
        })
      });

      if (!response.ok) {
        throw new Error('Registration failed');
      }

      const data = await response.json();
      
      setSessionId(data.session_id);
      setConversationId(data.conversation_id);
      setIsRegistered(true);
      setShowRegistration(false);
      
      toast.success(`Welcome ${userInfo.full_name}!`);
      
      // Add welcome message after registration
      const welcomeMessage = {
        id: 'welcome',
        type: 'bot',
        content: `Hello ${userInfo.full_name.split(' ')[0]}! How can I help you today?`,
        timestamp: new Date().toISOString()
      };
      
      setMessages([welcomeMessage]);
      setShowWelcome(true);
      
      // Focus input after registration
      setTimeout(() => {
        inputRef.current?.focus();
      }, 500);
      
    } catch (error) {
      console.error('Registration error:', error);
      toast.error('Failed to register. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || isLoading || !isRegistered) return;

    const userMessage = {
      id: `user_${Date.now()}`,
      type: 'user',
      content: inputText.trim(),
      timestamp: new Date().toISOString()
    };

    // Add user message
    setMessages(prev => [...prev, userMessage]);
    const currentInput = inputText;
    setInputText('');
    setIsLoading(true);
    setShowWelcome(false);
    setShouldScrollToBottom(true);

    // Check if we should show enquiry button
    const showEnquiry = shouldShowEnquiryButton(currentInput);
    setShowEnquiryButton(showEnquiry);
    if (showEnquiry) {
      setCurrentQuestionContext(currentInput);
    }

    try {
      // Call backend API with user info
      const response = await fetch(`${apiUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          website_id: websiteId,
          question: currentInput,
          conversation_id: conversationId,
          user_info: userInfo,
          session_id: sessionId
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Failed to get response');
      }
      
      // Add bot response
      const botMessage = {
        id: `bot_${Date.now()}`,
        type: 'bot',
        content: data.response,
        timestamp: data.timestamp || new Date().toISOString(),
        rawData: data,
        showEnquiryButton: showEnquiry
      };

      setMessages(prev => [...prev, botMessage]);
      setShouldScrollToBottom(true);
      
    } catch (error) {
      console.error('Chat error:', error);
      
      // Error message
      const errorMessage = {
        id: `error_${Date.now()}`,
        type: 'bot',
        content: `Sorry, I encountered an error: ${error.message}. Please try again or rephrase your question.`,
        timestamp: new Date().toISOString(),
        isError: true
      };
      
      setMessages(prev => [...prev, errorMessage]);
      setShouldScrollToBottom(true);
      toast.error('Failed to get response from server');
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleEnquiryButtonClick = () => {
    setShowContactForm(true);
    setShowEnquiryButton(false);
    
    // Pre-fill contact form with user info and question context
    setContactFormData({
      name: userInfo.full_name,
      email: userInfo.email,
      phone: userInfo.mobile,
      message: `Enquiry about: ${currentQuestionContext}\n\nPlease provide more details about this.`
    });
    
    // Scroll to contact form
    setTimeout(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }
    }, 150);
  };

  const handleContactFormSubmit = async () => {
    if (!contactFormData.name || !contactFormData.email || !contactFormData.message) {
      toast.error('Please fill all required fields');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${apiUrl}/api/contact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          website_id: websiteId,
          name: contactFormData.name,
          email: contactFormData.email,
          phone: contactFormData.phone,
          message: contactFormData.message,
          additional_data: {
            session_id: sessionId,
            conversation_id: conversationId,
            user_registered: isRegistered
          }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to submit contact form');
      }

      const data = await response.json();
      
      if (data.success) {
        toast.success('Message sent successfully!');
        setShowContactForm(false);
        setContactFormData({ name: '', email: '', phone: '', message: '' });
        
        // Add system message
        const systemMessage = {
          id: `contact_${Date.now()}`,
          type: 'system',
          content: 'Your contact form has been submitted. We will get back to you soon!',
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, systemMessage]);
        setShouldScrollToBottom(true);
      }
    } catch (error) {
      console.error('Contact form error:', error);
      toast.error('Failed to send message');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (showRegistration) {
        handleUserRegistration();
      } else if (showContactForm) {
        handleContactFormSubmit();
      } else {
        handleSendMessage();
      }
    }
  };

  const handleSuggestedQuestion = (question) => {
    if (!isRegistered) return;
    
    setInputText(question);
    // Auto-send after a short delay
    setTimeout(() => {
      handleSendMessage();
    }, 100);
  };

  const handleCopyMessage = (content) => {
    navigator.clipboard.writeText(content);
    toast.success('Copied to clipboard!');
  };

  const handleFeedback = (messageId, isPositive) => {
    // Here you would typically send feedback to backend
    setMessages(prev => prev.map(msg => 
      msg.id === messageId 
        ? { ...msg, feedback: isPositive ? 'positive' : 'negative' }
        : msg
    ));
    
    toast.success('Thanks for your feedback!');
  };

  const handleClearChat = () => {
    setMessages([]);
    setShowWelcome(true);
    const newConvId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setConversationId(newConvId);
    
    // Add new welcome message
    setTimeout(() => {
      const welcomeMessage = {
        id: 'welcome',
        type: 'bot',
        content: `Chat cleared! How can I help you today, ${userInfo.full_name.split(' ')[0]}?`,
        timestamp: new Date().toISOString()
      };
      setMessages([welcomeMessage]);
    }, 300);
    
    toast.success('Chat cleared!');
  };

  const handleEndChatSession = async () => {
    if (!isRegistered || !sessionId) {
      toast.error('No active chat session');
      return;
    }

    if (messages.length < 3) {
      toast.error('Not enough messages to send a report');
      return;
    }

    setIsEndingSession(true);

    try {
      const response = await fetch(`${apiUrl}/api/chat/end-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionId
        })
      });

      const data = await response.json();
      
      if (data.success) {
        toast.success('Chat session ended. Report sent to admin!');
        if (onEndSession) {
          onEndSession(sessionId);
        }
        if (onClose) {
          onClose();
        }
      } else {
        toast.error(data.message || 'Failed to end chat session');
      }
    } catch (error) {
      console.error('End session error:', error);
      toast.error('Failed to end chat session');
    } finally {
      setIsEndingSession(false);
    }
  };

  const formatMessageContent = (content) => {
    // Enhanced markdown-like formatting
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
      .replace(/`(.*?)`/g, '<code class="bg-gray-100 px-1 rounded font-mono text-sm">$1</code>')
      .replace(/\n/g, '<br />')
      .replace(/^### (.*$)/gm, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>')
      .replace(/^## (.*$)/gm, '<h2 class="text-xl font-bold mt-6 mb-3">$1</h2>')
      .replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold mt-8 mb-4">$1</h1>')
      .replace(/- (.*$)/gm, '<li class="ml-4 mb-1">• $1</li>')
      .replace(/\d\. (.*$)/gm, '<li class="ml-4 mb-1">$1</li>');
  };

  // Widget styles with Tailwind
  const widgetStyles = {
    container: isExpanded 
      ? 'fixed inset-0 z-50 flex flex-col bg-white shadow-2xl'
      : 'fixed bottom-6 right-6 z-50 w-96 h-[600px] flex flex-col bg-white shadow-2xl rounded-2xl overflow-hidden border border-gray-200 animate-slide-in',
    
    header: 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white p-4 flex justify-between items-center shadow-lg',
    
    messagesContainer: isExpanded 
      ? 'flex-1 overflow-y-auto p-4 bg-gradient-to-b from-gray-50 to-white'
      : 'flex-1 overflow-y-auto p-4 bg-gradient-to-b from-gray-50 to-white',
    
    inputContainer: 'border-t border-gray-200 p-4 bg-white shadow-inner'
  };

  // If not open, show nothing
  if (!isOpen) return null;

  return (
    <div className={widgetStyles.container} ref={chatContainerRef}>
      {/* Header */}
      <div className={widgetStyles.header}>
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
            <FaRobot className="text-xl animate-pulse" />
          </div>
          <div>
            <h3 className="font-bold text-lg">Website Assistant</h3>
            <p className="text-sm text-white/90">
              {isRegistered ? `Welcome, ${userInfo.full_name.split(' ')[0]}` : 'Please register to chat'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {isRegistered && messages.length > 2 && (
            <button
              onClick={handleEndChatSession}
              disabled={isEndingSession}
              className="p-2 hover:bg-white/20 rounded-full transition-colors backdrop-blur-sm disabled:opacity-50"
              title="End chat and send report"
            >
              <FaFilePdf className="text-sm" />
            </button>
          )}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2 hover:bg-white/20 rounded-full transition-colors backdrop-blur-sm"
            title={isExpanded ? "Minimize" : "Expand"}
          >
            {isExpanded ? <FaCompress /> : <FaExpand />}
          </button>
          <button
            onClick={() => {
              setIsOpen(false);
              if (onClose) onClose();
            }}
            className="p-2 hover:bg-white/20 rounded-full transition-colors backdrop-blur-sm"
            title="Close"
          >
            <FaTimes />
          </button>
        </div>
      </div>

      {/* Messages Container */}
      <div 
        className={widgetStyles.messagesContainer}
        ref={messagesContainerRef}
      >
        {/* Registration Form */}
        {showRegistration && (
          <RegistrationForm
            userInfo={userInfo}
            setUserInfo={setUserInfo}
            handleUserRegistration={handleUserRegistration}
            handleKeyPress={handleKeyPress}
            isLoading={isLoading}
          />
        )}

        {/* Contact Form - Shown first when active */}
        {showContactForm && !showRegistration && (
          <ContactForm
            contactFormData={contactFormData}
            setContactFormData={setContactFormData}
            handleContactFormSubmit={handleContactFormSubmit}
            handleKeyPress={handleKeyPress}
            isLoading={isLoading}
            setShowContactForm={setShowContactForm}
          />
        )}

        {/* Chat Messages (only show after registration) */}
        {!showRegistration && (
          <>
            {/* Messages - Hidden when contact form is shown */}
            {!showContactForm && messages.map((message, index) => (
              <div
                key={message.id}
                className={`mb-4 animate-fade-in ${message.type === 'user' ? 'ml-auto' : ''}`}
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                {/* Message Bubble */}
                <div
                  className={`max-w-[85%] rounded-2xl p-4 transition-all duration-300 ${
                    message.type === 'user'
                      ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white ml-auto rounded-br-none shadow-lg'
                      : message.type === 'system'
                      ? 'bg-gradient-to-r from-yellow-50 to-yellow-100 border border-yellow-200 text-yellow-800 rounded-bl-none shadow-sm'
                      : message.isError
                      ? 'bg-gradient-to-r from-red-50 to-red-100 border border-red-200 text-red-800 rounded-bl-none shadow-sm'
                      : 'bg-gradient-to-r from-gray-50 to-white border border-gray-200 text-gray-800 rounded-bl-none shadow-sm'
                  }`}
                >
                  {/* Message Header */}
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium opacity-90 flex items-center">
                      {message.type === 'user' ? (
                        <>
                          <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                          {userInfo.full_name.split(' ')[0]}
                        </>
                      ) : message.type === 'system' ? (
                        <>
                          <span className="w-2 h-2 bg-yellow-400 rounded-full mr-2"></span>
                          System
                        </>
                      ) : (
                        <>
                          <span className="w-2 h-2 bg-blue-400 rounded-full mr-2"></span>
                          Assistant
                        </>
                      )}
                    </span>
                    <span className="text-xs opacity-70">
                      {new Date(message.timestamp).toLocaleTimeString([], { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </span>
                  </div>

                  {/* Message Content */}
                  <div 
                    className="prose prose-sm max-w-none mb-3"
                    dangerouslySetInnerHTML={{ 
                      __html: formatMessageContent(message.content) 
                    }}
                  />

                  {/* Enquiry Button - Show for bot messages with enquiry context */}
                  {message.showEnquiryButton && message.type === 'bot' && !message.isError && !showContactForm && (
                    <div className="mt-4 pt-3 border-t border-gray-100">
                      <button
                        onClick={handleEnquiryButtonClick}
                        className="w-full py-2 px-4 bg-gradient-to-r from-orange-500 to-red-500 text-white font-medium rounded-lg hover:from-orange-600 hover:to-red-600 transition-all duration-200 flex items-center justify-center space-x-2 shadow-md"
                      >
                        <FaAddressCard />
                        <span>Submit Enquiry</span>
                      </button>
                      <p className="text-xs text-gray-500 mt-2 text-center">
                        Need more details? Click above to submit an enquiry.
                      </p>
                    </div>
                  )}

                  {/* Message Actions */}
                  {message.type === 'bot' && !message.isError && !message.showEnquiryButton && !showContactForm && (
                    <div className="flex justify-end space-x-2 mt-3 pt-3 border-t border-gray-100">
                      <button
                        onClick={() => handleCopyMessage(message.content)}
                        className="p-1.5 hover:bg-black/10 rounded-full transition-colors text-gray-500 hover:text-gray-700"
                        title="Copy to clipboard"
                      >
                        <FaCopy className="text-sm" />
                      </button>
                      <button
                        onClick={() => handleFeedback(message.id, true)}
                        className={`p-1.5 hover:bg-green-100 rounded-full transition-colors ${
                          message.feedback === 'positive' 
                            ? 'text-green-600 bg-green-50' 
                            : 'text-gray-500 hover:text-green-600'
                        }`}
                        title="This was helpful"
                      >
                        <FaThumbsUp className="text-sm" />
                      </button>
                      <button
                        onClick={() => handleFeedback(message.id, false)}
                        className={`p-1.5 hover:bg-red-100 rounded-full transition-colors ${
                          message.feedback === 'negative' 
                            ? 'text-red-600 bg-red-50' 
                            : 'text-gray-500 hover:text-red-600'
                        }`}
                        title="This wasn't helpful"
                      >
                        <FaThumbsDown className="text-sm" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Suggested Questions - shown at the bottom */}
            {!showContactForm && messages.length <= 2 && suggestedQuestions.length > 0 && (
              <div className="mt-6 mb-6 animate-slide-in">
                <p className="text-sm text-gray-500 mb-3 flex items-center">
                  <FaRegCommentDots className="mr-2" />
                  Try asking:
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {suggestedQuestions.map((question, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSuggestedQuestion(question)}
                      className="text-left p-3 bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 border border-blue-100 rounded-xl text-blue-700 text-sm transition-all duration-200 hover:shadow-sm hover:border-blue-200 group"
                    >
                      <div className="flex items-center">
                        <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center mr-3 group-hover:bg-blue-200 transition-colors">
                          <span className="text-xs text-blue-600">{idx + 1}</span>
                        </div>
                        <span>{question}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Loading Indicator */}
            {isLoading && !showContactForm && (
              <div className="flex items-center space-x-3 bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-200 rounded-2xl p-4 max-w-[80%] animate-pulse">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
                <span className="text-gray-600 text-sm">Thinking...</span>
              </div>
            )}
          </>
        )}

        {/* Scroll anchor - only used for auto-scroll detection */}
        <div 
          ref={messagesEndRef} 
          className="h-4 invisible"
        />
      </div>

      {/* Input Area (only show after registration and not during contact form) */}
      {!showRegistration && !showContactForm && (
        <div className={widgetStyles.inputContainer}>
          <div className="flex space-x-3">
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask a question about the website..."
                className="w-full px-4 py-3 pl-12 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 placeholder-gray-400 bg-white shadow-sm"
                disabled={isLoading}
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
              />
              <div className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400">
                <FaRegSmile />
              </div>
            </div>
            
            <button
              onClick={handleSendMessage}
              disabled={!inputText.trim() || isLoading}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center space-x-2 shadow-lg hover:shadow-xl transform hover:scale-105"
            >
              {isLoading ? (
                <FaSpinner className="animate-spin" />
              ) : (
                <>
                  <FaPaperPlane />
                  <span className="hidden sm:inline">Send</span>
                </>
              )}
            </button>
          </div>
          
          {/* User Info Badge and Actions */}
          <div className="flex justify-between items-center mt-3 text-sm">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2 text-gray-600">
                <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                  <FaUser className="text-blue-600 text-xs" />
                </div>
                <span className="font-medium">{userInfo.full_name.split(' ')[0]}</span>
              </div>
              <button
                onClick={() => setShowContactForm(true)}
                className="text-blue-600 hover:text-blue-800 transition-colors flex items-center space-x-1 hover:bg-blue-50 px-2 py-1 rounded-lg"
              >
                <FaEnvelopeOpenText className="text-xs" />
                <span>Contact</span>
              </button>
              <button
                onClick={handleClearChat}
                className="text-gray-500 hover:text-gray-700 transition-colors flex items-center space-x-1 hover:bg-gray-100 px-2 py-1 rounded-lg"
              >
                <FaRedo className="text-xs" />
                <span>Clear chat</span>
              </button>
            </div>
            
            {isEndingSession && (
              <div className="text-xs text-blue-600 animate-pulse">
                Sending report...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatWidget;