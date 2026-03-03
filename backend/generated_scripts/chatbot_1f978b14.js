// Chatbot Widget for Website ID: 1f978b14
// Generated on: 2026-02-16T11:50:09.904480
// Version: 4.3 (Fixed enquiry button logic)

(function() {
    'use strict';
    
    // Configuration
    const config = {
        websiteId: '1f978b14',
        apiUrl: 'http://localhost:8000',
        primaryColor: '#3B82F6',
        secondaryColor: '#1E40AF',
        accentColor: '#10B981',
        widgetTitle: 'AI Assistant',
        showRegistration: true,
        showContactForm: true,
        autoReport: true
    };
    
    // Session management
    const sessionManager = {
        getSessionId() {
            let sessionId = localStorage.getItem('chatbot_session_id');
            if (!sessionId) {
                sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                localStorage.setItem('chatbot_session_id', sessionId);
            }
            return sessionId;
        },
        
        getUserInfo() {
            const info = localStorage.getItem('chatbot_user_info');
            return info ? JSON.parse(info) : null;
        },
        
        saveUserInfo(userInfo) {
            localStorage.setItem('chatbot_user_info', JSON.stringify(userInfo));
            localStorage.setItem('chatbot_session_id', userInfo.session_id);
        },
        
        clearSession() {
            localStorage.removeItem('chatbot_session_id');
            localStorage.removeItem('chatbot_user_info');
            localStorage.removeItem('chatbot_conversation_id');
        },
        
        saveConversationId(conversationId) {
            localStorage.setItem('chatbot_conversation_id', conversationId);
        },
        
        getConversationId() {
            return localStorage.getItem('chatbot_conversation_id');
        }
    };
    
    // Global state
    let chatbotState = {
        isOpen: false,
        conversationId: null,
        sessionId: null,
        userInfo: null,
        messages: [],
        isLoading: false,
        isInitialized: false,
        lastUserQuestion: ''
    };
    
    // Main chatbot initialization
    function createChatbot() {
        // Check if already exists
        if (document.getElementById('chatbot-widget')) {
            return;
        }
        
        // Create main container
        const container = document.createElement('div');
        container.id = 'chatbot-widget';
        container.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 10000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
        `;
        
        // Create chat window (initially hidden)
        const chatWindow = document.createElement('div');
        chatWindow.id = 'chatbot-window';
        chatWindow.style.cssText = `
            width: 380px;
            max-width: calc(100vw - 40px);
            height: 600px;
            max-height: calc(100vh - 100px);
            background: white;
            border-radius: 16px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
            display: none;
            flex-direction: column;
            overflow: hidden;
            margin-bottom: 15px;
            border: 1px solid #E5E7EB;
        `;
        
        // Create toggle button
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'chatbot-toggle';
        toggleBtn.style.cssText = `
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: linear-gradient(135deg, ${config.primaryColor}, ${config.secondaryColor});
            color: white;
            border: none;
            cursor: pointer;
            box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 26px;
            transition: all 0.3s ease;
            z-index: 10001;
        `;
        toggleBtn.innerHTML = '💬';
        toggleBtn.title = 'Chat with AI Assistant';
        toggleBtn.setAttribute('aria-label', 'Open chat');
        
        // Build chat window structure (EMPTY - will be populated dynamically)
        chatWindow.innerHTML = `
            <!-- Header -->
            <div style="
                background: linear-gradient(135deg, ${config.primaryColor}, ${config.secondaryColor});
                color: white;
                padding: 20px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-shrink: 0;
            ">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="
                        width: 40px;
                        height: 40px;
                        background: rgba(255, 255, 255, 0.2);
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 20px;
                    ">🤖</div>
                    <div>
                        <div style="font-weight: 600; font-size: 16px;">${config.widgetTitle}</div>
                        <div style="font-size: 12px; opacity: 0.9;">Powered by AI</div>
                    </div>
                </div>
                <button id="chatbot-close" style="
                    background: none;
                    border: none;
                    color: white;
                    cursor: pointer;
                    font-size: 24px;
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: background 0.2s;
                " aria-label="Close chat">×</button>
            </div>
            
            <!-- Messages Container (EMPTY - will be populated) -->
            <div id="chatbot-messages" style="
                flex: 1;
                padding: 20px;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 12px;
                background: #F9FAFB;
            ">
                <!-- Content will be added dynamically -->
            </div>
            
            <!-- Input Area (hidden initially) -->
            <div id="input-area" style="
                border-top: 1px solid #E5E7EB;
                padding: 16px;
                background: white;
                flex-shrink: 0;
                display: none;
                gap: 10px;
            ">
                <input 
                    type="text" 
                    id="chatbot-input" 
                    placeholder="Type your message..." 
                    style="
                        flex: 1;
                        padding: 12px 16px;
                        border: 1px solid #D1D5DB;
                        border-radius: 12px;
                        font-size: 14px;
                        outline: none;
                        transition: border 0.2s;
                        background: #F9FAFB;
                        box-sizing: border-box;
                        width: 100%;
                    "
                >
                <button id="chatbot-send" style="
                    background: linear-gradient(135deg, ${config.primaryColor}, ${config.secondaryColor});
                    color: white;
                    border: none;
                    border-radius: 12px;
                    padding: 0 24px;
                    cursor: pointer;
                    font-weight: 600;
                    font-size: 14px;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-width: 80px;
                    flex-shrink: 0;
                ">Send</button>
            </div>
            
            <!-- Footer (hidden initially) -->
            <div id="chatbot-footer" style="
                border-top: 1px solid #E5E7EB;
                padding: 12px 16px;
                background: #F9FAFB;
                flex-shrink: 0;
                display: none;
                justify-content: space-between;
                align-items: center;
                font-size: 12px;
                color: #6B7280;
            ">
                <div id="user-info-display" style="display: flex; align-items: center; gap: 6px;">
                    <span style="width: 8px; height: 8px; background: ${config.accentColor}; border-radius: 50%;"></span>
                    <span id="user-name-display">Not registered</span>
                </div>
                <button id="show-contact-btn" style="
                    background: none;
                    border: 1px solid #D1D5DB;
                    color: ${config.primaryColor};
                    padding: 6px 12px;
                    border-radius: 6px;
                    font-size: 11px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                    flex-shrink: 0;
                ">Contact</button>
            </div>
        `;
        
        // Add responsive styles and animations
        const styleSheet = document.createElement('style');
        styleSheet.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            
            @keyframes slideIn {
                from { transform: translateY(20px) scale(0.95); opacity: 0; }
                to { transform: translateY(0) scale(1); opacity: 1; }
            }
            
            @keyframes bounce {
                0%, 60%, 100% { transform: translateY(0); }
                30% { transform: translateY(-4px); }
            }
            
            .chatbot-window-open {
                animation: slideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
            }
            
            .message-fade {
                animation: fadeIn 0.3s ease forwards;
            }
            
            .typing-indicator {
                display: flex;
                gap: 6px;
                align-items: center;
            }
            
            .typing-dot {
                width: 8px;
                height: 8px;
                background: #9CA3AF;
                border-radius: 50%;
                animation: bounce 1.4s infinite;
            }
            
            .user-message {
                background: linear-gradient(135deg, ${config.primaryColor}, ${config.secondaryColor});
                color: white;
                border-radius: 18px;
                padding: 14px 18px;
                max-width: 85%;
                margin-left: auto;
                margin-bottom: 8px;
                box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);
                word-break: break-word;
            }
            
            .bot-message {
                background: white;
                border-radius: 18px;
                padding: 16px;
                max-width: 85%;
                margin-bottom: 8px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
                border: 1px solid #E5E7EB;
                word-break: break-word;
            }
            
            .enquiry-button {
                margin-top: 12px;
                padding: 10px 16px;
                background: linear-gradient(135deg, #F97316, #EA580C);
                color: white;
                border: none;
                border-radius: 10px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                width: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                box-sizing: border-box;
            }
            
            .enquiry-button:hover {
                background: linear-gradient(135deg, #EA580C, #C2410C);
                transform: translateY(-2px);
            }
            
            .registration-form {
                background: linear-gradient(135deg, #EFF6FF, #DBEAFE);
                border-radius: 12px;
                padding: 20px;
                border: 1px solid ${config.primaryColor};
                animation: fadeIn 0.5s ease;
                margin-bottom: 12px;
                width: 100%;
                box-sizing: border-box;
            }
            
            .contact-form {
                background: linear-gradient(135deg, #F0FDF4, #DCFCE7);
                border-radius: 12px;
                padding: 20px;
                border: 1px solid ${config.accentColor};
                animation: fadeIn 0.5s ease;
                margin-top: 12px;
                margin-bottom: 12px;
                width: 100%;
                box-sizing: border-box;
            }
            
            .form-input {
                width: 100%;
                padding: 10px 12px;
                border: 1px solid #D1D5DB;
                border-radius: 8px;
                font-size: 14px;
                transition: border 0.2s;
                box-sizing: border-box;
                background: white;
                margin-bottom: 15px;
            }
            
            .form-input:focus {
                outline: none;
                border-color: ${config.primaryColor};
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
            }
            
            .form-label {
                display: block;
                margin-bottom: 6px;
                font-size: 13px;
                color: #4B5563;
                font-weight: 500;
            }
            
            /* Enhanced list formatting for proper numbering */
            .bot-message ol,
            .bot-message ul {
                margin: 8px 0;
                padding-left: 24px;
            }
            
            .bot-message li {
                margin-bottom: 6px;
                padding-left: 4px;
            }
            
            .bot-message p {
                margin: 8px 0;
                line-height: 1.5;
            }
            
            .bot-message h1,
            .bot-message h2,
            .bot-message h3 {
                margin: 16px 0 8px 0;
                font-weight: 600;
            }
            
            .bot-message strong {
                font-weight: 600;
            }
            
            .bot-message em {
                font-style: italic;
            }
            
            .bot-message code {
                background: #F3F4F6;
                padding: 2px 6px;
                border-radius: 4px;
                font-family: 'Courier New', monospace;
                font-size: 0.9em;
            }
            
            /* Responsive adjustments */
            @media (max-width: 480px) {
                #chatbot-window {
                    width: calc(100vw - 40px);
                    height: calc(100vh - 120px);
                    max-height: 500px;
                    bottom: 80px;
                    right: 20px;
                    left: 20px;
                    margin: 0 auto;
                }
                
                .user-message,
                .bot-message {
                    max-width: 90%;
                    padding: 12px 16px;
                }
                
                .registration-form,
                .contact-form {
                    padding: 16px;
                }
                
                #chatbot-toggle {
                    width: 56px;
                    height: 56px;
                    font-size: 24px;
                    bottom: 20px;
                    right: 20px;
                }
            }
            
            @media (max-width: 380px) {
                #chatbot-window {
                    width: calc(100vw - 30px);
                    right: 15px;
                    left: 15px;
                }
                
                #chatbot-messages {
                    padding: 16px;
                }
                
                .form-input {
                    padding: 9px 11px;
                    font-size: 13px;
                }
            }
            
            /* Mobile landscape support */
            @media (max-height: 600px) and (orientation: landscape) {
                #chatbot-window {
                    height: calc(100vh - 100px);
                    max-height: 400px;
                }
            }
            
            /* Improve scrollbar */
            #chatbot-messages::-webkit-scrollbar {
                width: 6px;
            }
            
            #chatbot-messages::-webkit-scrollbar-track {
                background: #f1f1f1;
                border-radius: 3px;
            }
            
            #chatbot-messages::-webkit-scrollbar-thumb {
                background: #c1c1c1;
                border-radius: 3px;
            }
            
            #chatbot-messages::-webkit-scrollbar-thumb:hover {
                background: #a1a1a1;
            }
        `;
        document.head.appendChild(styleSheet);
        
        // Assemble and append to body
        container.appendChild(chatWindow);
        container.appendChild(toggleBtn);
        document.body.appendChild(container);
        
        // Initialize chatbot state
        initializeChatbotState();
        
        // Event listeners
        setupEventListeners();
        
        // Make responsive on window resize
        window.addEventListener('resize', makeResponsive);
    }
    
    // Make chatbot responsive
    function makeResponsive() {
        const chatWindow = document.getElementById('chatbot-window');
        const toggleBtn = document.getElementById('chatbot-toggle');
        
        if (!chatWindow || !toggleBtn) return;
        
        const isMobile = window.innerWidth <= 480;
        
        if (isMobile) {
            // Mobile adjustments
            chatWindow.style.width = 'calc(100vw - 40px)';
            chatWindow.style.height = 'calc(100vh - 120px)';
            chatWindow.style.maxHeight = '500px';
            
            // Position toggle button better on mobile
            toggleBtn.style.width = '56px';
            toggleBtn.style.height = '56px';
            toggleBtn.style.fontSize = '24px';
            toggleBtn.style.bottom = '20px';
            toggleBtn.style.right = '20px';
            toggleBtn.style.position = 'fixed';
        } else {
            // Desktop settings
            chatWindow.style.width = '380px';
            chatWindow.style.height = '600px';
            chatWindow.style.maxHeight = 'calc(100vh - 100px)';
            
            toggleBtn.style.width = '60px';
            toggleBtn.style.height = '60px';
            toggleBtn.style.fontSize = '26px';
        }
    }
    
    // Initialize chatbot state
    function initializeChatbotState() {
        // Check if user is already registered
        const savedUserInfo = sessionManager.getUserInfo();
        
        if (savedUserInfo) {
            // Returning user
            chatbotState.userInfo = savedUserInfo;
            chatbotState.sessionId = sessionManager.getSessionId();
            chatbotState.conversationId = sessionManager.getConversationId();
            
            // Initialize UI for returning user
            initializeUIForRegisteredUser();
            
            // Add welcome back message
            addMessage('bot', `Welcome back, ${savedUserInfo.full_name.split(' ')[0]}! How can I help you today?`);
        } else {
            // New user - show registration form first
            showRegistrationForm();
        }
        
        chatbotState.isInitialized = true;
        
        // Apply initial responsive settings
        setTimeout(makeResponsive, 100);
    }
    
    // Initialize UI for registered user
    function initializeUIForRegisteredUser() {
        // Show input area
        document.getElementById('input-area').style.display = 'flex';
        
        // Show footer
        document.getElementById('chatbot-footer').style.display = 'flex';
        
        // Update user display
        document.getElementById('user-name-display').textContent = chatbotState.userInfo.full_name.split(' ')[0];
        
        // Setup auto-report
        setupAutoReport();
    }
    
    // Show registration form (for new users)
    function showRegistrationForm() {
        const messagesDiv = document.getElementById('chatbot-messages');
        messagesDiv.innerHTML = '';
        
        const registrationForm = document.createElement('div');
        registrationForm.className = 'registration-form';
        registrationForm.id = 'registration-form-container';
        
        registrationForm.innerHTML = `
            <h3 style="color: ${config.primaryColor}; margin: 0 0 15px 0; font-size: 18px; display: flex; align-items: center; gap: 8px;">
                <span>👋</span> Welcome! Please register to start chatting
            </h3>
            
            <div>
                <label class="form-label">Full Name *</label>
                <input type="text" id="register-name" placeholder="Enter your name" class="form-input">
            </div>
            
            <div>
                <label class="form-label">Email *</label>
                <input type="email" id="register-email" placeholder="your.email@example.com" class="form-input">
            </div>
            
            <div>
                <label class="form-label">Mobile *</label>
                <input type="tel" id="register-mobile" placeholder="+91 1234567890" class="form-input">
            </div>
            
            <button id="register-submit" style="
                width: 100%;
                background: linear-gradient(135deg, ${config.primaryColor}, ${config.secondaryColor});
                color: white;
                border: none;
                border-radius: 8px;
                padding: 12px;
                font-weight: 600;
                font-size: 14px;
                cursor: pointer;
                transition: all 0.2s;
                box-sizing: border-box;
                margin-top: 10px;
            ">Start Chatting</button>
            
        `;
        
        messagesDiv.appendChild(registrationForm);
        
        // Add event listeners for registration form
        document.getElementById('register-submit').addEventListener('click', handleRegistration);
        
        // Enter key navigation in registration form
        document.getElementById('register-name').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                document.getElementById('register-email').focus();
            }
        });
        
        document.getElementById('register-email').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                document.getElementById('register-mobile').focus();
            }
        });
        
        document.getElementById('register-mobile').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                handleRegistration();
            }
        });
        
        // Focus on first input
        setTimeout(() => {
            document.getElementById('register-name').focus();
        }, 100);
    }
    
    // Show contact form BELOW current conversation
    function showContactForm() {
        // Create and add contact form at the END of messages
        const messagesDiv = document.getElementById('chatbot-messages');
        
        // Remove any existing contact form first
        const existingContactForm = document.getElementById('contact-form-container');
        if (existingContactForm) {
            existingContactForm.remove();
        }
        
        const contactForm = document.createElement('div');
        contactForm.className = 'contact-form';
        contactForm.id = 'contact-form-container';
        
        contactForm.innerHTML = `
            <h3 style="color: ${config.accentColor}; margin: 0 0 15px 0; font-size: 18px; display: flex; align-items: center; gap: 8px;">
                <span>📧</span> Contact Form
            </h3>
            
            <div>
                <label class="form-label">Name *</label>
                <input type="text" id="contact-name" placeholder="Your name" class="form-input">
            </div>
            
            <div>
                <label class="form-label">Email *</label>
                <input type="email" id="contact-email" placeholder="your.email@example.com" class="form-input">
            </div>
            
            <div>
                <label class="form-label">Phone</label>
                <input type="tel" id="contact-phone" placeholder="+91 1234567890" class="form-input">
            </div>
            
            <div>
                <label class="form-label">Message *</label>
                <textarea id="contact-message" placeholder="Your message..." class="form-input" style="min-height: 80px; resize: vertical;"></textarea>
            </div>
            
            <div style="display: flex; gap: 10px; margin-top: 10px;">
                <button id="contact-cancel" style="
                    flex: 1;
                    background: #F3F4F6;
                    color: #374151;
                    border: 1px solid #D1D5DB;
                    border-radius: 8px;
                    padding: 12px;
                    font-weight: 600;
                    font-size: 14px;
                    cursor: pointer;
                    transition: all 0.2s;
                    box-sizing: border-box;
                ">Cancel</button>
                <button id="contact-submit" style="
                    flex: 1;
                    background: linear-gradient(135deg, ${config.accentColor}, #059669);
                    color: white;
                    border: none;
                    border-radius: 8px;
                    padding: 12px;
                    font-weight: 600;
                    font-size: 14px;
                    cursor: pointer;
                    transition: all 0.2s;
                    box-sizing: border-box;
                ">Send Message</button>
            </div>
        `;
        
        // Append contact form to the END of messages (not at the beginning)
        messagesDiv.appendChild(contactForm);
        
        // Pre-fill with user info if available
        if (chatbotState.userInfo) {
            document.getElementById('contact-name').value = chatbotState.userInfo.full_name;
            document.getElementById('contact-email').value = chatbotState.userInfo.email;
            document.getElementById('contact-phone').value = chatbotState.userInfo.mobile;
        }
        
        // Hide input area while contact form is open
        document.getElementById('input-area').style.display = 'none';
        
        // Add event listeners for contact form
        document.getElementById('contact-cancel').addEventListener('click', hideContactForm);
        document.getElementById('contact-submit').addEventListener('click', handleContactFormSubmit);
        
        // Focus on first input
        setTimeout(() => {
            document.getElementById('contact-name').focus();
        }, 100);
        
        // Scroll to contact form
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
    
    // Hide contact form
    function hideContactForm() {
        const contactForm = document.getElementById('contact-form-container');
        if (contactForm) {
            contactForm.remove();
        }
        
        // Show input area again
        document.getElementById('input-area').style.display = 'flex';
        
        // Focus on input
        setTimeout(() => {
            document.getElementById('chatbot-input').focus();
        }, 100);
    }
    
    // Enhanced message formatting function - FIXED VERSION
    function formatMessageContent(content) {
        // Enhanced markdown-like formatting
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br />')
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            .replace(/- (.*$)/gm, '<li>• $1</li>')
            // FIXED: Handle numbered lists properly - keep the number!
            .replace(/^(\d+)\.\s*(.*)$/gm, '<li>$1. $2</li>')
            .replace(/^We offer:\s*\n/gm, 'We offer:<br />');
    }
    
    // Check if response should show enquiry button
    function shouldShowEnquiryButton(userQuestion, botResponse) {
        // Check if the bot response contains the enquiry message
        const enquiryMessage = "If you want detailed information, please fill out the Enquiry form and our team will get back to you.";
        
        if (botResponse.includes(enquiryMessage)) {
            return true;
        }
        
        // Also check based on user question keywords
        const enquiryKeywords = [
            'price', 'pricing', 'cost', 'fee', 'charge', 'charges', 'how much',
            'budget', 'quote', 'quotation', 'estimate', 'rates',
            'contact', 'phone', 'email', 'address', 'location',
            'call', 'reach', 'get in touch', 'where are you',
            'office', 'headquarters', 'meet', 'visit'
        ];
        
        const lowerQuestion = userQuestion.toLowerCase();
        return enquiryKeywords.some(keyword => lowerQuestion.includes(keyword));
    }
    
    // Add message to chat
    function addMessage(type, content, showEnquiryButton = false) {
        const messagesDiv = document.getElementById('chatbot-messages');
        
        // Remove registration form if it exists (when user sends first message)
        const registrationForm = document.getElementById('registration-form-container');
        if (registrationForm) {
            registrationForm.remove();
            
            // Initialize UI for registered user if not already done
            if (chatbotState.userInfo && !document.getElementById('input-area').style.display) {
                initializeUIForRegisteredUser();
            }
        }
        
        // Remove contact form if it exists (to keep chat clean)
        const contactForm = document.getElementById('contact-form-container');
        if (contactForm) {
            contactForm.remove();
            // Show input area
            document.getElementById('input-area').style.display = 'flex';
        }
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message-fade ' + (type === 'user' ? 'user-message' : 'bot-message');
        
        // Format the content properly
        let formattedContent = formatMessageContent(content);
        
        // Check if we should show enquiry button based on content
        let shouldShowEnquiry = showEnquiryButton;
        if (type === 'bot') {
            shouldShowEnquiry = shouldShowEnquiry || shouldShowEnquiryButton(chatbotState.lastUserQuestion, content);
        }
        
        let html = '';
        if (type === 'user') {
            html = `
                <div style="font-weight: 600; margin-bottom: 4px; font-size: 14px; opacity: 0.9;">You</div>
                <div style="font-size: 14px; line-height: 1.5;">${content}</div>
            `;
        } else if (type === 'bot') {
            html = `
                <div style="font-weight: 600; margin-bottom: 6px; color: ${config.primaryColor}; font-size: 14px;">Assistant</div>
                <div style="font-size: 14px; color: #374151; line-height: 1.5;">${formattedContent}</div>
            `;
            
            // Add enquiry button if needed
            if (shouldShowEnquiry) {
                html += `
                    <button class="enquiry-button" onclick="window.chatbotWidget.showContactForm()">
                        📧 Submit Enquiry Form
                    </button>
                `;
            }
        }
        
        messageDiv.innerHTML = html;
        messagesDiv.appendChild(messageDiv);
        
        // Scroll to bottom
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        
        // Save to messages array
        chatbotState.messages.push({ type, content, timestamp: new Date().toISOString() });
    }
    
    // Handle user registration
    async function handleRegistration() {
        const name = document.getElementById('register-name').value.trim();
        const email = document.getElementById('register-email').value.trim();
        const mobile = document.getElementById('register-mobile').value.trim();
        
        if (!name || !email || !mobile) {
            alert('Please fill all fields');
            return;
        }
        
        if (!email.includes('@')) {
            alert('Please enter a valid email');
            return;
        }
        
        const registerBtn = document.getElementById('register-submit');
        const originalText = registerBtn.textContent;
        registerBtn.textContent = 'Registering...';
        registerBtn.disabled = true;
        
        try {
            const response = await fetch(`${config.apiUrl}/api/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    website_id: config.websiteId,
                    full_name: name,
                    email: email,
                    mobile: mobile
                })
            });
            
            if (!response.ok) {
                throw new Error(`Registration failed: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.message || 'Registration failed');
            }
            
            // Save user info to state
            chatbotState.userInfo = {
                full_name: name,
                email: email,
                mobile: mobile,
                session_id: data.session_id,
                website_id: config.websiteId
            };
            
            chatbotState.sessionId = data.session_id;
            chatbotState.conversationId = data.conversation_id;
            
            // Save to localStorage
            sessionManager.saveUserInfo(chatbotState.userInfo);
            sessionManager.saveConversationId(chatbotState.conversationId);
            
            // Initialize UI for registered user
            initializeUIForRegisteredUser();
            
            // Add welcome message
            addMessage('bot', `Hello ${name.split(' ')[0]}! How can I help you today?`);
            
            // Setup auto-report
            setupAutoReport();
            
        } catch (error) {
            console.error('Registration error:', error);
            alert('Registration failed. Please try again.');
        } finally {
            registerBtn.textContent = originalText;
            registerBtn.disabled = false;
        }
    }
    
    // Handle contact form submission
    async function handleContactFormSubmit() {
        const name = document.getElementById('contact-name').value.trim();
        const email = document.getElementById('contact-email').value.trim();
        const phone = document.getElementById('contact-phone').value.trim();
        const message = document.getElementById('contact-message').value.trim();
        
        if (!name || !email || !message) {
            alert('Please fill all required fields');
            return;
        }
        
        if (!email.includes('@')) {
            alert('Please enter a valid email');
            return;
        }
        
        const submitBtn = document.getElementById('contact-submit');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Sending...';
        submitBtn.disabled = true;
        
        try {
            const response = await fetch(`${config.apiUrl}/api/contact`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    website_id: config.websiteId,
                    name: name,
                    email: email,
                    phone: phone,
                    message: message,
                    additional_data: {
                        session_id: chatbotState.sessionId,
                        conversation_id: chatbotState.conversationId,
                        user_registered: !!chatbotState.userInfo
                    }
                })
            });
            
            if (!response.ok) {
                throw new Error(`Contact form failed: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.message || 'Failed to send message');
            }
            
            // Hide contact form
            hideContactForm();
            
            // Add success message
            addMessage('bot', 'Thank you for your message! We will get back to you soon.');
            
        } catch (error) {
            console.error('Contact form error:', error);
            alert('Failed to send message. Please try again.');
        } finally {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    }
    
    // Send chat message
    async function sendMessage() {
        if (!chatbotState.userInfo) {
            alert('Please register first');
            return;
        }
        
        const input = document.getElementById('chatbot-input');
        const message = input.value.trim();
        
        if (!message || chatbotState.isLoading) return;
        
        // Store the user question
        chatbotState.lastUserQuestion = message;
        
        // Add user message
        addMessage('user', message);
        input.value = '';
        chatbotState.isLoading = true;
        
        // Show typing indicator
        const messagesDiv = document.getElementById('chatbot-messages');
        const typingDiv = document.createElement('div');
        typingDiv.className = 'bot-message';
        typingDiv.innerHTML = `
            <div style="font-weight: 600; margin-bottom: 6px; color: ${config.primaryColor}; font-size: 14px;">Assistant</div>
            <div class="typing-indicator">
                <div class="typing-dot" style="animation-delay: 0s;"></div>
                <div class="typing-dot" style="animation-delay: 0.2s;"></div>
                <div class="typing-dot" style="animation-delay: 0.4s;"></div>
                <div style="font-size: 13px; color: #6B7280; margin-left: 8px;">Thinking...</div>
            </div>
        `;
        messagesDiv.appendChild(typingDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        
        try {
            // Send to backend
            const response = await fetch(`${config.apiUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    website_id: config.websiteId,
                    question: message,
                    conversation_id: chatbotState.conversationId,
                    user_info: chatbotState.userInfo,
                    session_id: chatbotState.sessionId
                })
            });
            
            if (!response.ok) {
                throw new Error(`Chat failed: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Remove typing indicator
            typingDiv.remove();
            
            // Add bot response
            if (data.success) {
                // The shouldShowEnquiryButton function will now check both the user question AND the bot response
                addMessage('bot', data.response);
            } else {
                addMessage('bot', 'Sorry, I encountered an error. Please try again.');
            }
            
        } catch (error) {
            console.error('Chat error:', error);
            typingDiv.remove();
            addMessage('bot', 'Sorry, I encountered an error. Please try again.');
        } finally {
            chatbotState.isLoading = false;
            input.focus();
        }
    }
    
    // Setup auto-report functionality
    function setupAutoReport() {
        if (!config.autoReport || !chatbotState.sessionId) return;
        
        // Store messages in localStorage
        const saveMessagesToStorage = () => {
            localStorage.setItem('chatbot_messages_' + chatbotState.sessionId, JSON.stringify(chatbotState.messages));
        };
        
        // Send auto-report on page unload
        const sendAutoReport = async () => {
            if (chatbotState.messages.length < 2) return; // Need at least 2 messages
            
            try {
                const formData = new FormData();
                formData.append('session_id', chatbotState.sessionId);
                
                // Try with fetch keepalive first
                await fetch(`${config.apiUrl}/api/chat/auto-report`, {
                    method: 'POST',
                    body: formData,
                    keepalive: true
                });
            } catch (error) {
                // Fallback to beacon
                try {
                    const formData = new FormData();
                    formData.append('session_id', chatbotState.sessionId);
                    navigator.sendBeacon(`${config.apiUrl}/api/chat/auto-report`, formData);
                } catch (beaconError) {
                    console.error('Auto-report failed:', beaconError);
                }
            }
        };
        
        // Add event listeners
        window.addEventListener('beforeunload', () => {
            saveMessagesToStorage();
            sendAutoReport();
        });
        
        window.addEventListener('pagehide', () => {
            saveMessagesToStorage();
            sendAutoReport();
        });
        
        // Auto-save messages periodically
        setInterval(saveMessagesToStorage, 30000);
    }
    
    // Setup all event listeners
    function setupEventListeners() {
        const toggleBtn = document.getElementById('chatbot-toggle');
        const closeBtn = document.getElementById('chatbot-close');
        const sendBtn = document.getElementById('chatbot-send');
        const inputField = document.getElementById('chatbot-input');
        const chatWindow = document.getElementById('chatbot-window');
        
        // Toggle chat window
        toggleBtn.addEventListener('click', function() {
            chatbotState.isOpen = !chatbotState.isOpen;
            
            if (chatbotState.isOpen) {
                chatWindow.style.display = 'flex';
                setTimeout(() => {
                    chatWindow.classList.add('chatbot-window-open');
                }, 10);
                
                // Focus appropriate input
                if (chatbotState.userInfo) {
                    setTimeout(() => {
                        inputField.focus();
                    }, 100);
                } else {
                    const nameInput = document.getElementById('register-name');
                    if (nameInput) {
                        setTimeout(() => {
                            nameInput.focus();
                        }, 100);
                    }
                }
            } else {
                chatWindow.classList.remove('chatbot-window-open');
                setTimeout(() => {
                    chatWindow.style.display = 'none';
                }, 300);
            }
        });
        
        // Close button
        closeBtn.addEventListener('click', function() {
            chatbotState.isOpen = false;
            chatWindow.classList.remove('chatbot-window-open');
            setTimeout(() => {
                chatWindow.style.display = 'none';
            }, 300);
        });
        
        // Send message
        sendBtn.addEventListener('click', sendMessage);
        inputField.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
        
        // Contact button (only for registered users)
        document.getElementById('show-contact-btn').addEventListener('click', showContactForm);
        
        // Click outside to close
        document.addEventListener('click', function(event) {
            if (chatbotState.isOpen && 
                !chatWindow.contains(event.target) && 
                !toggleBtn.contains(event.target)) {
                chatbotState.isOpen = false;
                chatWindow.classList.remove('chatbot-window-open');
                setTimeout(() => {
                    chatWindow.style.display = 'none';
                }, 300);
            }
        });
        
        // Make toggle button draggable on mobile for better positioning
        let isDragging = false;
        let startX, startY, initialX, initialY;
        
        toggleBtn.addEventListener('mousedown', startDrag);
        toggleBtn.addEventListener('touchstart', startDragTouch);
        
        function startDrag(e) {
            if (window.innerWidth > 480) return; // Only on mobile
            
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            initialX = toggleBtn.offsetLeft;
            initialY = toggleBtn.offsetTop;
            
            document.addEventListener('mousemove', drag);
            document.addEventListener('mouseup', stopDrag);
            e.preventDefault();
        }
        
        function startDragTouch(e) {
            if (window.innerWidth > 480) return; // Only on mobile
            
            isDragging = true;
            const touch = e.touches[0];
            startX = touch.clientX;
            startY = touch.clientY;
            initialX = toggleBtn.offsetLeft;
            initialY = toggleBtn.offsetTop;
            
            document.addEventListener('touchmove', dragTouch);
            document.addEventListener('touchend', stopDrag);
            e.preventDefault();
        }
        
        function drag(e) {
            if (!isDragging) return;
            
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            
            toggleBtn.style.left = initialX + dx + 'px';
            toggleBtn.style.top = initialY + dy + 'px';
            toggleBtn.style.position = 'fixed';
            toggleBtn.style.right = 'auto';
            toggleBtn.style.bottom = 'auto';
        }
        
        function dragTouch(e) {
            if (!isDragging) return;
            
            const touch = e.touches[0];
            const dx = touch.clientX - startX;
            const dy = touch.clientY - startY;
            
            toggleBtn.style.left = initialX + dx + 'px';
            toggleBtn.style.top = initialY + dy + 'px';
            toggleBtn.style.position = 'fixed';
            toggleBtn.style.right = 'auto';
            toggleBtn.style.bottom = 'auto';
        }
        
        function stopDrag() {
            isDragging = false;
            document.removeEventListener('mousemove', drag);
            document.removeEventListener('touchmove', dragTouch);
            document.removeEventListener('mouseup', stopDrag);
            document.removeEventListener('touchend', stopDrag);
            
            // Save position to localStorage
            localStorage.setItem('chatbot_toggle_position', JSON.stringify({
                left: toggleBtn.style.left,
                top: toggleBtn.style.top
            }));
        }
        
        // Load saved position
        const savedPos = localStorage.getItem('chatbot_toggle_position');
        if (savedPos && window.innerWidth <= 480) {
            try {
                const pos = JSON.parse(savedPos);
                if (pos.left && pos.top) {
                    toggleBtn.style.left = pos.left;
                    toggleBtn.style.top = pos.top;
                    toggleBtn.style.position = 'fixed';
                    toggleBtn.style.right = 'auto';
                    toggleBtn.style.bottom = 'auto';
                }
            } catch (e) {
                console.error('Error loading saved position:', e);
            }
        }
    }
    
    // Expose functions globally for enquiry button
    window.chatbotWidget = {
        showContactForm,
        hideContactForm,
        makeResponsive
    };
    
    // Initialize chatbot when page loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createChatbot);
    } else {
        createChatbot();
    }
    
    // Make responsive on initial load
    setTimeout(makeResponsive, 100);
})();
