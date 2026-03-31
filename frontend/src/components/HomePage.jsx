// HomePage.jsx - REMOVED PRICING CARDS FROM HOME PAGE
import React, { useState, useEffect, useRef } from 'react';
import { 
  FaRobot, FaMagic, FaRocket, FaShieldAlt, FaChartLine, 
  FaUsers, FaGlobe, FaCode, FaServer, FaDatabase,
  FaArrowRight, FaCreditCard, FaCrown, FaBolt, FaCheck
} from 'react-icons/fa';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

const HomePage = ({ onLoginClick, onSignupClick, user, subscriptionStatus }) => {
  const [stats, setStats] = useState({
    accuracy: 0,
    setupTime: 0,
    support: 0
  });

  const navigate = useNavigate();

  const features = [
    {
      icon: <FaMagic />,
      title: 'AI-Powered Chatbots',
      description: 'Create intelligent chatbots that understand your website content and provide accurate responses.'
    },
    {
      icon: <FaRocket />,
      title: 'Quick Training',
      description: 'Train your chatbot in minutes by simply providing your website URL.'
    },
    {
      icon: <FaShieldAlt />,
      title: 'Secure & Private',
      description: 'Your data is encrypted and stored securely. We never share your information.'
    },
    {
      icon: <FaChartLine />,
      title: 'Advanced Analytics',
      description: 'Track user interactions, popular questions, and chatbot performance.'
    },
    {
      icon: <FaUsers />,
      title: 'Multi-User Support',
      description: 'Collaborate with your team and manage multiple chatbots from one dashboard.'
    },
    {
      icon: <FaGlobe />,
      title: 'Global Reach',
      description: 'Support for multiple languages and deploy chatbots worldwide.'
    }
  ];

  const steps = [
    {
      number: '01',
      title: 'Sign Up',
      description: 'Create your free account in seconds'
    },
    {
      number: '02',
      title: 'Choose Plan',
      description: 'Select your subscription plan'
    },
    {
      number: '03',
      title: 'Train Chatbot',
      description: 'Provide your website URL to train the AI'
    },
    {
      number: '04',
      title: 'Embed & Go',
      description: 'Add script to your website and start chatting'
    }
  ];

  const statsRef = useRef(null);
  const animated = useRef(false);

  const handleLoginClick = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (onLoginClick) {
      onLoginClick();
    }
  };

  const handleSignupClick = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (onSignupClick) {
      onSignupClick();
    }
  };

  const handleGoToPricing = () => {
    if (user) {
      navigate('/pricing');
    } else {
      // If not logged in, show signup first
      handleSignupClick();
    }
  };

  const handleGoToDashboard = () => {
    navigate('/dashboard');
  };

  // Show call-to-action based on user status
  const getCTAButtons = () => {
    if (user) {
      if (subscriptionStatus?.hasSubscription) {
        return (
          <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
            <button
              onClick={handleGoToDashboard}
              className="px-8 py-4 bg-white text-blue-600 font-bold rounded-xl hover:bg-gray-50 shadow-xl transform hover:-translate-y-1 transition-all duration-300 hover:shadow-2xl"
            >
              Go to Dashboard
            </button>
          </div>
        );
      } else {
        return (
          <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
            <button
              onClick={handleGoToPricing}
              className="px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl hover:from-blue-700 hover:to-indigo-700 shadow-xl transform hover:-translate-y-1 transition-all duration-300 hover:shadow-2xl"
            >
              Choose Plan
            </button>
          </div>
        );
      }
    } else {
      return (
        <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
          <button
            onClick={handleSignupClick}
            className="cursor-pointer px-8 py-4 bg-white text-blue-600 font-bold rounded-xl hover:bg-gray-50 shadow-xl transform hover:-translate-y-1 transition-all duration-300 hover:shadow-2xl"
          >
            Get Started Free
          </button>
          <button
            onClick={handleLoginClick}
            className="cursor-pointer px-8 py-4 border-2 border-white text-white font-bold rounded-xl hover:bg-white/10 transition-all duration-300"
          >
            Sign In
          </button>
        </div>
      );
    }
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !animated.current) {
          animated.current = true;
          
          const animateCount = (endValue, setter, duration = 2000) => {
            let startValue = 0;
            const increment = endValue / (duration / 16);
            const timer = setInterval(() => {
              startValue += increment;
              if (startValue >= endValue) {
                startValue = endValue;
                clearInterval(timer);
              }
              setter(Math.floor(startValue));
            }, 16);
          };

          setTimeout(() => animateCount(99, (val) => setStats(prev => ({...prev, accuracy: val}))), 100);
          setTimeout(() => animateCount(5, (val) => setStats(prev => ({...prev, setupTime: val}))), 500);
          setTimeout(() => animateCount(24, (val) => setStats(prev => ({...prev, support: val}))), 900);
        }
      },
      { threshold: 0.5 }
    );

    if (statsRef.current) {
      observer.observe(statsRef.current);
    }

    return () => {
      if (statsRef.current) {
        observer.unobserve(statsRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
      @keyframes blob {
        0% { transform: translate(0px, 0px) scale(1); }
        33% { transform: translate(30px, -50px) scale(1.1); }
        66% { transform: translate(-20px, 20px) scale(0.9); }
        100% { transform: translate(0px, 0px) scale(1); }
      }
      
      @keyframes gradient {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      
      .animate-blob {
        animation: blob 7s infinite cubic-bezier(0.455, 0.03, 0.515, 0.955);
      }
      
      .animate-gradient {
        animation: gradient 3s ease infinite;
        background-size: 200% 200%;
      }
      
      .animation-delay-2000 {
        animation-delay: 2s;
      }
      
      .animation-delay-4000 {
        animation-delay: 4s;
      }
    `;
    document.head.appendChild(styleSheet);

    return () => {
      document.head.removeChild(styleSheet);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-blue-50">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-700 to-purple-800 text-white pb-8 md:pb-0">
        {/* Animated Background Blobs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-10 left-10 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
          <div className="absolute top-10 right-10 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
          <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
        </div>

        {/* Main Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 md:pt-20 lg:pt-32 pb-16 md:pb-24">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-12 lg:gap-8">
            {/* Left Column - Text Content */}
            <motion.div 
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              className="lg:w-1/2 text-center lg:text-left"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="inline-flex p-3 md:p-4 bg-white/10 backdrop-blur-lg rounded-2xl md:rounded-3xl mb-6 md:mb-8 border border-white/20 shadow-2xl"
              >
                <FaRobot className="text-4xl md:text-5xl lg:text-6xl animate-pulse" />
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-6"
              >
                Create AI Chatbots for
                <span className="block mt-2 text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-pink-300 to-purple-300 animate-gradient">
                  Your Website
                </span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="text-lg md:text-xl text-blue-100 mb-8 md:mb-10 leading-relaxed"
              >
                Train intelligent chatbots on your website content in minutes.
                {user ? (
                  subscriptionStatus?.hasSubscription 
                    ? " Access your dashboard to manage your chatbots."
                    : " Choose a plan to get started."
                ) : (
                  " No coding required. Boost engagement and support instantly."
                )}
              </motion.p>

              {/* Stats */}
              <motion.div
                ref={statsRef}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                className="flex justify-center lg:justify-start gap-8 md:gap-12 mb-8"
              >
                <div className="text-center">
                  <div className="text-3xl md:text-4xl font-bold mb-2">
                    <span className="text-yellow-300">{stats.accuracy}</span>%
                  </div>
                  <div className="text-sm md:text-base text-blue-200">Accuracy</div>
                </div>

                <div className="text-center">
                  <div className="text-3xl md:text-4xl font-bold mb-2">
                    <span className="text-pink-300">{stats.setupTime}</span>min
                  </div>
                  <div className="text-sm md:text-base text-blue-200">Setup Time</div>
                </div>

                <div className="text-center">
                  <div className="text-3xl md:text-4xl font-bold mb-2">
                    <span className="text-purple-300">{stats.support}</span>/7
                  </div>
                  <div className="text-sm md:text-base text-blue-200">Support</div>
                </div>
              </motion.div>

              {/* Dynamic CTA Buttons */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.5 }}
                className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start"
              >
                {getCTAButtons()}
              </motion.div>

            </motion.div>

            {/* Right Column - Visual Element */}
            <motion.div 
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="lg:w-1/2 relative"
            >
              {/* Floating Chatbot Illustration */}
              <div className="relative mx-auto lg:mx-0 max-w-lg">
                <div className="relative bg-gradient-to-br from-white/20 to-white/5 backdrop-blur-xl rounded-3xl p-8 border border-white/20 shadow-2xl">
                  {/* Chat bubbles */}
                  <div className="mb-6">
                    <div className="bg-white/20 rounded-2xl rounded-bl-none p-4 mb-4 max-w-xs">
                      <p className="text-white">Hi! How can I help you today?</p>
                    </div>
                    <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl rounded-br-none p-4 ml-auto max-w-xs">
                      <p className="text-white">Tell me about your services</p>
                    </div>
                  </div>
                  
                  {/* Typing indicator */}
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 bg-gradient-to-r from-blue-400 to-indigo-500 rounded-full flex items-center justify-center">
                      <FaRobot className="text-white text-sm" />
                    </div>
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-white/60 rounded-full animate-pulse"></div>
                      <div className="w-2 h-2 bg-white/60 rounded-full animate-pulse delay-150"></div>
                      <div className="w-2 h-2 bg-white/60 rounded-full animate-pulse delay-300"></div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 md:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Everything You Need
            </h2>
            <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto">
              Powerful features to create, manage, and scale your AI chatbots
            </p>
          </motion.div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                viewport={{ once: true }}
                whileHover={{ y: -10, transition: { duration: 0.2 } }}
                className="bg-gradient-to-br from-gray-50 to-white rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all duration-300 border border-gray-100 group"
              >
                <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl mb-6 group-hover:scale-110 transition-transform duration-300">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">
                  {feature.title}
                </h3>
                <p className="text-gray-600">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20 md:py-28 bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              How It Works
            </h2>
            <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto">
              Four simple steps to deploy your AI chatbot
            </p>
          </motion.div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="relative"
              >
                <div className="bg-white rounded-2xl p-8 shadow-lg text-center h-full group hover:shadow-2xl transition-shadow duration-300">
                  <div className="text-6xl font-bold text-blue-100 mb-4">
                    {step.number}
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">
                    {step.title}
                  </h3>
                  <p className="text-gray-600">
                    {step.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-20 md:py-28 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-3xl md:text-4xl font-bold mb-6"
          >
            Ready to Transform Your Website?
          </motion.h2>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            viewport={{ once: true }}
            className="text-lg md:text-xl mb-10 max-w-3xl mx-auto opacity-90"
          >
            {user ? (
              subscriptionStatus?.hasSubscription 
                ? "Access your dashboard to manage your chatbots and see analytics."
                : "Choose a plan to start creating amazing chatbots for your website."
            ) : (
              "Join thousands of businesses using our AI chatbot platform to enhance customer experience."
            )}
          </motion.p>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            viewport={{ once: true }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            {user ? (
              subscriptionStatus?.hasSubscription ? (
                <button
                  onClick={handleGoToDashboard}
                  className="px-8 py-4 bg-white text-blue-600 font-bold rounded-xl hover:bg-gray-100 transition-all duration-200 transform hover:scale-105 shadow-2xl"
                >
                  Go to Dashboard
                </button>
              ) : (
                <button
                  onClick={handleGoToPricing}
                  className="px-8 py-4 bg-white text-blue-600 font-bold rounded-xl hover:bg-gray-100 transition-all duration-200 transform hover:scale-105 shadow-2xl"
                >
                  Choose Your Plan
                </button>
              )
            ) : (
              <>
                <button
                  onClick={handleSignupClick}
                  className="cursor-pointer px-8 py-4 bg-white text-blue-600 font-bold rounded-xl hover:bg-gray-100 transition-all duration-200 transform hover:scale-105 shadow-2xl"
                >
                  Start Free Trial
                </button>
              </>
            )}
          </motion.div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;