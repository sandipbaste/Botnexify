import os
import hashlib
import json
import base64
from datetime import datetime
from typing import Dict, Any, Optional
from dotenv import load_dotenv

load_dotenv()

BASE_URL = os.getenv("BASE_URL", "https://botnexify-frontend.onrender.com").rstrip("/")

class ChatbotGenerator:
    def __init__(self, base_url: str = BASE_URL):
        self.base_url = base_url.rstrip('/')
        self.scripts_dir = "generated_scripts"
        os.makedirs(self.scripts_dir, exist_ok=True)
        os.makedirs("static/assets", exist_ok=True)
    
    def check_website_has_embeddings(self, website_id: str) -> bool:
        """Check if website has embeddings in Qdrant Cloud"""
        try:
            from app.vectoredb.embedding_handler import EmbeddingHandler
            handler = EmbeddingHandler()
            return handler.check_embeddings_exist(website_id)
        except Exception as e:
            print(f"  Error checking embeddings in Qdrant: {e}")
            return False
    
    def get_website_info(self, website_id: str) -> Optional[Dict[str, Any]]:
        """Get website information from database"""
        try:
            from app.database.database import db_manager
            website = db_manager.get_website(website_id)
            return website
        except Exception as e:
            print(f"  Error getting website info: {e}")
            return None
    
    def generate_script_url(self, website_id: str) -> str:
        """Generate unique script URL for embedding"""
        unique_string = f"{website_id}_{datetime.now().timestamp()}"
        script_hash = hashlib.md5(unique_string.encode()).hexdigest()[:8]
        return f"{self.base_url}/embed/{website_id}/script.js?v={script_hash}"
    
    def generate_embed_code(self, website_id: str) -> str:
        """Generate embed code for website"""
        script_url = self.generate_script_url(website_id)
        return f'<script src="{script_url}" defer></script>'
    
    def get_image_base64(self, image_path: str) -> Optional[str]:
        """Convert image to base64 data URL"""
        try:
            if os.path.exists(image_path):
                with open(image_path, 'rb') as img_file:
                    img_data = base64.b64encode(img_file.read()).decode('utf-8')
                    if image_path.endswith('.png'):
                        mime_type = 'image/png'
                    elif image_path.endswith('.jpg') or image_path.endswith('.jpeg'):
                        mime_type = 'image/jpeg'
                    elif image_path.endswith('.svg'):
                        mime_type = 'image/svg+xml'
                    else:
                        mime_type = 'image/png'
                    return f'data:{mime_type};base64,{img_data}'
        except Exception as e:
            print(f"  Error loading image: {e}")
        return None
    
    def generate_script_file(self, website_id: str) -> str:
        """Generate JavaScript file for chatbot widget with awesome next-level theme"""
        
        if not self.check_website_has_embeddings(website_id):
            website = self.get_website_info(website_id)
            website_name = website.get('website_name', website_id) if website else website_id
            raise Exception(f"No embeddings found for website '{website_name}' ({website_id}) in Qdrant Cloud. Please train the website first.")
        
        website = self.get_website_info(website_id)
        website_name = website.get('website_name', website_id) if website else website_id
        
        # Try to load local image as base64
        image_base64 = None
        possible_image_paths = [
            "static/assets/bot_image1.png",
            "app/static/assets/bot_image1.png",
            "assets/bot_image1.png",
            "../static/assets/bot_image1.png"
        ]
        
        for img_path in possible_image_paths:
            if os.path.exists(img_path):
                image_base64 = self.get_image_base64(img_path)
                if image_base64:
                    print(f"  Found and encoded image: {img_path}")
                    break
        
        os.makedirs(self.scripts_dir, exist_ok=True)
        
        # Create image HTML with modern styling
        if image_base64:
            image_html = f'''
            <img 
                src="{image_base64}"
                width="64"
                height="64"
                style="border-radius: 50%; object-fit: cover; cursor: pointer; box-shadow: 0 8px 25px rgba(0,0,0,0.2); transition: all 0.3s ease;"
                alt="Chat Assistant"
            />
            '''
        else:
            image_html = '''
            <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 32px; box-shadow: 0 8px 25px rgba(102, 126, 234, 0.4);">
                🤖
            </div>
            '''
        
        script_content = f"""// Chatbot Widget for Website: {website_name}
// Website ID: {website_id}
// Generated on: {datetime.now().isoformat()}
// Version: 7.0 - Awesome Next Level Theme

(function() {{
    'use strict';
    
    // Modern color scheme
    const config = {{
        websiteId: '{website_id}',
        apiUrl: '{self.base_url}',
        primaryGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        secondaryGradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        accentGradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
        widgetTitle: '{website_name} AI Assistant',
        showRegistration: true,
        showContactForm: true,
        autoReport: true,
        storage: 'Qdrant Cloud'
    }};
    
    // Session management
    const sessionManager = {{
        getSessionId() {{
            let sessionId = localStorage.getItem('chatbot_session_id');
            if (!sessionId) {{
                sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                localStorage.setItem('chatbot_session_id', sessionId);
            }}
            return sessionId;
        }},
        
        getUserInfo() {{
            const info = localStorage.getItem('chatbot_user_info');
            return info ? JSON.parse(info) : null;
        }},
        
        saveUserInfo(userInfo) {{
            localStorage.setItem('chatbot_user_info', JSON.stringify(userInfo));
            localStorage.setItem('chatbot_session_id', userInfo.session_id);
        }},
        
        clearSession() {{
            localStorage.removeItem('chatbot_session_id');
            localStorage.removeItem('chatbot_user_info');
            localStorage.removeItem('chatbot_conversation_id');
        }},
        
        saveConversationId(conversationId) {{
            localStorage.setItem('chatbot_conversation_id', conversationId);
        }},
        
        getConversationId() {{
            return localStorage.getItem('chatbot_conversation_id');
        }}
    }};
    
    // Global state
    let chatbotState = {{
        isOpen: false,
        conversationId: null,
        sessionId: null,
        userInfo: null,
        messages: [],
        isLoading: false,
        isInitialized: false,
        lastUserQuestion: '',
        pendingEnquiryButton: false
    }};
    
    // Main chatbot initialization
    function createChatbot() {{
        if (document.getElementById('chatbot-widget')) {{
            return;
        }}
        
        // Create main container
        const container = document.createElement('div');
        container.id = 'chatbot-widget';
        container.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 10000;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
        `;
        
        // Create chat window with glass morphism effect
        const chatWindow = document.createElement('div');
        chatWindow.id = 'chatbot-window';
        chatWindow.style.cssText = `
            width: 420px;
            max-width: calc(100vw - 40px);
            height: 650px;
            max-height: calc(100vh - 100px);
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 24px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.2);
            display: none;
            flex-direction: column;
            overflow: hidden;
            margin-bottom: 15px;
            border: 1px solid rgba(255, 255, 255, 0.3);
        `;
        
        // Create toggle button with pulse animation
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'chatbot-toggle';
        toggleBtn.style.cssText = `
            width: 64px;
            height: 64px;
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
            z-index: 10001;
            padding: 0;
            background: transparent;
            overflow: hidden;
            border-radius: 50%;
            animation: pulse 2s infinite;
        `;
        
        // Add image to toggle button
        toggleBtn.innerHTML = `{image_html}`;
        
        // Add hover effect
        toggleBtn.addEventListener('mouseenter', function() {{
            this.style.transform = 'scale(1.1) rotate(5deg)';
        }});
        
        toggleBtn.addEventListener('mouseleave', function() {{
            this.style.transform = 'scale(1) rotate(0deg)';
        }});
        
        // Build chat window structure with modern design
        chatWindow.innerHTML = `
            <!-- Modern Header with Gradient -->
            <div style="
                background: ${{config.primaryGradient}};
                color: white;
                padding: 24px 20px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-shrink: 0;
                position: relative;
                overflow: hidden;
            ">
                <div style="position: absolute; top: -50%; right: -20%; width: 200px; height: 200px; background: rgba(255,255,255,0.1); border-radius: 50%;"></div>
                <div style="position: absolute; bottom: -30%; left: -10%; width: 150px; height: 150px; background: rgba(255,255,255,0.1); border-radius: 50%;"></div>
                <div style="display: flex; align-items: center; gap: 14px; position: relative; z-index: 1;">
                    <div style="
                        width: 48px;
                        height: 48px;
                        background: rgba(255, 255, 255, 0.2);
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 28px;
                        backdrop-filter: blur(5px);
                        animation: float 3s ease-in-out infinite;
                    ">🤖</div>
                    <div>
                        <div style="font-weight: 700; font-size: 18px; letter-spacing: -0.5px;">${{config.widgetTitle}}</div>
                        <div style="font-size: 12px; opacity: 0.9; margin-top: 4px;">Always here to help</div>
                    </div>
                </div>
                <button id="chatbot-close" style="
                    background: rgba(255,255,255,0.2);
                    border: none;
                    color: white;
                    cursor: pointer;
                    font-size: 20px;
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                    backdrop-filter: blur(5px);
                    position: relative;
                    z-index: 1;
                " aria-label="Close chat">✕</button>
            </div>
            
            <!-- Messages Container with Gradient Scrollbar -->
            <div id="chatbot-messages" style="
                flex: 1;
                padding: 20px;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 12px;
                background: linear-gradient(180deg, #f8f9fa 0%, #ffffff 100%);
            "></div>
            
            <!-- Input Area with Modern Design -->
            <div id="input-area" style="
                border-top: 1px solid rgba(0,0,0,0.05);
                padding: 16px 20px;
                background: white;
                flex-shrink: 0;
                display: none;
                gap: 12px;
            ">
                <div style="display: flex; gap: 12px; align-items: center;">
                    <input 
                        type="text" 
                        id="chatbot-input" 
                        placeholder="Type your message..." 
                        style="
                            flex: 1;
                            padding: 14px 18px;
                            border: 2px solid #e5e7eb;
                            border-radius: 30px;
                            font-size: 14px;
                            outline: none;
                            transition: all 0.3s;
                            background: #f9fafb;
                            font-family: inherit;
                        "
                        onfocus="this.style.borderColor='#667eea'; this.style.background='white';"
                        onblur="this.style.borderColor='#e5e7eb'; this.style.background='#f9fafb';"
                    >
                    <button id="chatbot-send" style="
                        background: ${{config.primaryGradient}};
                        color: white;
                        border: none;
                        border-radius: 30px;
                        padding: 0 28px;
                        cursor: pointer;
                        font-weight: 600;
                        font-size: 14px;
                        transition: all 0.3s;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        min-width: 90px;
                        height: 48px;
                        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
                    ">Send →</button>
                </div>
            </div>
            
            <!-- Footer -->
            <div id="chatbot-footer" style="
                border-top: 1px solid rgba(0,0,0,0.05);
                padding: 12px 20px;
                background: #f9fafb;
                flex-shrink: 0;
                display: none;
                justify-content: space-between;
                align-items: center;
                font-size: 12px;
                color: #6b7280;
            ">
                <div id="user-info-display" style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 8px; height: 8px; background: #10b981; border-radius: 50%; animation: pulse 1.5s infinite;"></div>
                    <span id="user-name-display">Not registered</span>
                </div>
                <button id="show-contact-btn" style="
                    background: none;
                    border: 1px solid #e5e7eb;
                    color: #667eea;
                    padding: 8px 16px;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                ">📧 Contact</button>
            </div>
            
            <!-- Persistent Enquiry Button -->
            <div id="enquiry-button-container" style="
                display: none;
                padding: 12px 20px;
                background: linear-gradient(135deg, #fff5f0 0%, #ffe8e0 100%);
                border-top: 2px solid #f97316;
                flex-shrink: 0;
            ">
                <button id="persistent-enquiry-btn" style="
                    width: 100%;
                    background: linear-gradient(135deg, #f97316, #ea580c);
                    color: white;
                    border: none;
                    border-radius: 50px;
                    padding: 14px 20px;
                    font-weight: 700;
                    font-size: 14px;
                    cursor: pointer;
                    transition: all 0.3s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    box-shadow: 0 4px 15px rgba(249, 115, 22, 0.4);
                ">
                    <span>📋 Need Help? Submit Enquiry</span>
                    <span style="font-size: 18px;">→</span>
                </button>
            </div>
        `;
        
        // Add modern animations and styles (ESCAPED CURLY BRACES)
        const styleSheet = document.createElement('style');
        styleSheet.textContent = `
            @keyframes slideIn {{
                from {{
                    opacity: 0;
                    transform: translateY(20px) scale(0.95);
                }}
                to {{
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }}
            }}
            
            @keyframes pulse {{
                0%, 100% {{
                    transform: scale(1);
                    opacity: 1;
                }}
                50% {{
                    transform: scale(1.05);
                    opacity: 0.8;
                }}
            }}
            
            @keyframes float {{
                0%, 100% {{
                    transform: translateY(0px);
                }}
                50% {{
                    transform: translateY(-5px);
                }}
            }}
            
            @keyframes fadeInUp {{
                from {{
                    opacity: 0;
                    transform: translateY(10px);
                }}
                to {{
                    opacity: 1;
                    transform: translateY(0);
                }}
            }}
            
            @keyframes shimmer {{
                0% {{
                    background-position: -1000px 0;
                }}
                100% {{
                    background-position: 1000px 0;
                }}
            }}
            
            .chatbot-window-open {{
                animation: slideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
            }}
            
            .message-fade {{
                animation: fadeInUp 0.3s ease forwards;
            }}
            
            .typing-indicator {{
                display: flex;
                gap: 6px;
                align-items: center;
                padding: 12px 16px;
            }}
            
            .typing-dot {{
                width: 8px;
                height: 8px;
                background: #9ca3af;
                border-radius: 50%;
                animation: pulse 1.4s infinite;
            }}
            
            .typing-dot:nth-child(2) {{
                animation-delay: 0.2s;
            }}
            
            .typing-dot:nth-child(3) {{
                animation-delay: 0.4s;
            }}
            
            .user-message {{
                background: ${{config.primaryGradient}};
                color: white;
                border-radius: 20px 20px 4px 20px;
                padding: 14px 18px;
                max-width: 85%;
                margin-left: auto;
                margin-bottom: 8px;
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
                word-break: break-word;
                animation: fadeInUp 0.3s ease;
            }}
            
            .bot-message {{
                background: white;
                border-radius: 20px 20px 20px 4px;
                padding: 14px 18px;
                max-width: 85%;
                margin-bottom: 8px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
                border: 1px solid #f0f0f0;
                word-break: break-word;
                animation: fadeInUp 0.3s ease;
            }}
            
            .enquiry-button-in-message {{
                margin-top: 16px;
                padding: 12px 20px;
                background: linear-gradient(135deg, #f97316, #ea580c);
                color: white;
                border: none;
                border-radius: 50px;
                font-weight: 600;
                font-size: 13px;
                cursor: pointer;
                transition: all 0.3s;
                width: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                box-sizing: border-box;
                animation: fadeInUp 0.5s ease;
            }}
            
            .enquiry-button-in-message:hover {{
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(249, 115, 22, 0.4);
            }}
            
            .registration-form {{
                background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%);
                border-radius: 20px;
                padding: 24px;
                border: 1px solid rgba(102, 126, 234, 0.2);
                animation: fadeInUp 0.5s ease;
                margin-bottom: 12px;
                width: 100%;
                box-sizing: border-box;
            }}
            
            .contact-form {{
                background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
                border-radius: 20px;
                padding: 24px;
                border: 1px solid rgba(16, 185, 129, 0.2);
                animation: fadeInUp 0.5s ease;
                margin-top: 12px;
                margin-bottom: 12px;
                width: 100%;
                box-sizing: border-box;
            }}
            
            .form-input {{
                width: 100%;
                padding: 12px 16px;
                border: 2px solid #e5e7eb;
                border-radius: 12px;
                font-size: 14px;
                transition: all 0.3s;
                box-sizing: border-box;
                background: white;
                margin-bottom: 16px;
                font-family: inherit;
            }}
            
            .form-input:focus {{
                outline: none;
                border-color: #667eea;
                box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
                transform: translateY(-2px);
            }}
            
            .form-label {{
                display: block;
                margin-bottom: 8px;
                font-size: 13px;
                color: #4b5563;
                font-weight: 600;
            }}
            
            /* Enhanced message formatting */
            .bot-message ol, .bot-message ul {{
                margin: 8px 0;
                padding-left: 24px;
            }}
            
            .bot-message li {{
                margin-bottom: 6px;
                padding-left: 4px;
            }}
            
            .bot-message p {{
                margin: 8px 0;
                line-height: 1.6;
            }}
            
            .bot-message h1, .bot-message h2, .bot-message h3 {{
                margin: 16px 0 8px 0;
                font-weight: 700;
            }}
            
            .bot-message strong {{
                font-weight: 700;
                color: #667eea;
            }}
            
            .bot-message em {{
                font-style: italic;
            }}
            
            .bot-message code {{
                background: #f3f4f6;
                padding: 2px 6px;
                border-radius: 6px;
                font-family: 'Courier New', monospace;
                font-size: 0.9em;
            }}
            
            /* Custom scrollbar */
            #chatbot-messages::-webkit-scrollbar {{
                width: 6px;
            }}
            
            #chatbot-messages::-webkit-scrollbar-track {{
                background: #f1f1f1;
                border-radius: 3px;
            }}
            
            #chatbot-messages::-webkit-scrollbar-thumb {{
                background: linear-gradient(135deg, #667eea, #764ba2);
                border-radius: 3px;
            }}
            
            #chatbot-messages::-webkit-scrollbar-thumb:hover {{
                background: linear-gradient(135deg, #764ba2, #667eea);
            }}
            
            /* Responsive */
            @media (max-width: 480px) {{
                #chatbot-window {{
                    width: calc(100vw - 40px);
                    height: calc(100vh - 120px);
                    max-height: 550px;
                }}
                
                .user-message, .bot-message {{
                    max-width: 90%;
                    padding: 12px 16px;
                }}
                
                .registration-form, .contact-form {{
                    padding: 20px;
                }}
                
                #chatbot-toggle {{
                    width: 56px;
                    height: 56px;
                }}
            }}
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
        
        // Make responsive
        window.addEventListener('resize', makeResponsive);
        makeResponsive();
    }}
    
    // Make responsive
    function makeResponsive() {{
        const chatWindow = document.getElementById('chatbot-window');
        const toggleBtn = document.getElementById('chatbot-toggle');
        
        if (!chatWindow || !toggleBtn) return;
        
        const isMobile = window.innerWidth <= 480;
        
        if (isMobile) {{
            chatWindow.style.width = 'calc(100vw - 40px)';
            chatWindow.style.height = 'calc(100vh - 120px)';
            chatWindow.style.maxHeight = '550px';
            toggleBtn.style.width = '56px';
            toggleBtn.style.height = '56px';
        }} else {{
            chatWindow.style.width = '420px';
            chatWindow.style.height = '650px';
            chatWindow.style.maxHeight = 'calc(100vh - 100px)';
            toggleBtn.style.width = '64px';
            toggleBtn.style.height = '64px';
        }}
    }}
    
    // Initialize chatbot state
    function initializeChatbotState() {{
        const savedUserInfo = sessionManager.getUserInfo();
        
        if (savedUserInfo) {{
            chatbotState.userInfo = savedUserInfo;
            chatbotState.sessionId = sessionManager.getSessionId();
            chatbotState.conversationId = sessionManager.getConversationId();
            initializeUIForRegisteredUser();
            addMessage('bot', `Welcome back, ${{savedUserInfo.full_name.split(' ')[0]}}! How can I assist you today?`);
        }} else {{
            showRegistrationForm();
        }}
        
        chatbotState.isInitialized = true;
    }}
    
    // Initialize UI for registered user
    function initializeUIForRegisteredUser() {{
        document.getElementById('input-area').style.display = 'block';
        document.getElementById('chatbot-footer').style.display = 'flex';
        document.getElementById('user-name-display').textContent = chatbotState.userInfo.full_name.split(' ')[0];
        setupAutoReport();
    }}
    
    // Show registration form
    function showRegistrationForm() {{
        const messagesDiv = document.getElementById('chatbot-messages');
        messagesDiv.innerHTML = '';
        
        const registrationForm = document.createElement('div');
        registrationForm.className = 'registration-form';
        registrationForm.id = 'registration-form-container';
        
        registrationForm.innerHTML = `
            <div style="text-align: center; margin-bottom: 20px;">
                <div style="font-size: 48px; margin-bottom: 12px;"></div>
                <h3 style="color: #667eea; margin: 0 0 8px 0; font-size: 20px;">Welcome!</h3>
                <p style="color: #6b7280; margin: 0; font-size: 14px;">Register to start your journey with AI</p>
            </div>
            
            <div>
                <label class="form-label">Full Name *</label>
                <input type="text" id="register-name" placeholder="Enter your full name" class="form-input">
            </div>
            
            <div>
                <label class="form-label">Email *</label>
                <input type="email" id="register-email" placeholder="your@email.com" class="form-input">
            </div>
            
            <div>
                <label class="form-label">Mobile *</label>
                <input type="tel" id="register-mobile" placeholder="+91 1234567890" class="form-input">
            </div>
            
            <button id="register-submit" style="
                width: 100%;
                background: ${{config.primaryGradient}};
                color: white;
                border: none;
                border-radius: 50px;
                padding: 14px;
                font-weight: 700;
                font-size: 15px;
                cursor: pointer;
                transition: all 0.3s;
                box-sizing: border-box;
                margin-top: 12px;
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
            ">Start Chatting →</button>
        `;
        
        messagesDiv.appendChild(registrationForm);
        
        document.getElementById('register-submit').addEventListener('click', handleRegistration);
        
        document.getElementById('register-name').addEventListener('keypress', function(e) {{
            if (e.key === 'Enter') document.getElementById('register-email').focus();
        }});
        
        document.getElementById('register-email').addEventListener('keypress', function(e) {{
            if (e.key === 'Enter') document.getElementById('register-mobile').focus();
        }});
        
        document.getElementById('register-mobile').addEventListener('keypress', function(e) {{
            if (e.key === 'Enter') handleRegistration();
        }});
        
        setTimeout(() => document.getElementById('register-name').focus(), 100);
    }}
    
    // Show contact form
    function showContactForm() {{
        const messagesDiv = document.getElementById('chatbot-messages');
        
        const existingContactForm = document.getElementById('contact-form-container');
        if (existingContactForm) existingContactForm.remove();
        
        const contactForm = document.createElement('div');
        contactForm.className = 'contact-form';
        contactForm.id = 'contact-form-container';
        
        contactForm.innerHTML = `
            <div style="text-align: center; margin-bottom: 20px;">
                <div style="font-size: 48px; margin-bottom: 12px;">📧</div>
                <h3 style="color: #10b981; margin: 0 0 8px 0; font-size: 20px;">Get in Touch</h3>
                <p style="color: #6b7280; margin: 0; font-size: 14px;">We'll get back to you within 24 hours</p>
            </div>
            
            <div>
                <label class="form-label">Name *</label>
                <input type="text" id="contact-name" placeholder="Your name" class="form-input">
            </div>
            
            <div>
                <label class="form-label">Email *</label>
                <input type="email" id="contact-email" placeholder="your@email.com" class="form-input">
            </div>
            
            <div>
                <label class="form-label">Phone</label>
                <input type="tel" id="contact-phone" placeholder="+91 1234567890" class="form-input">
            </div>
            
            <div>
                <label class="form-label">Message *</label>
                <textarea id="contact-message" placeholder="How can we help you?" class="form-input" style="min-height: 80px; resize: vertical;"></textarea>
            </div>
            
            <div style="display: flex; gap: 12px; margin-top: 12px;">
                <button id="contact-cancel" style="
                    flex: 1;
                    background: #f3f4f6;
                    color: #374151;
                    border: 2px solid #e5e7eb;
                    border-radius: 50px;
                    padding: 12px;
                    font-weight: 600;
                    font-size: 14px;
                    cursor: pointer;
                    transition: all 0.2s;
                ">Cancel</button>
                <button id="contact-submit" style="
                    flex: 1;
                    background: linear-gradient(135deg, #10b981, #059669);
                    color: white;
                    border: none;
                    border-radius: 50px;
                    padding: 12px;
                    font-weight: 600;
                    font-size: 14px;
                    cursor: pointer;
                    transition: all 0.2s;
                    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
                ">Send →</button>
            </div>
        `;
        
        messagesDiv.appendChild(contactForm);
        
        if (chatbotState.userInfo) {{
            document.getElementById('contact-name').value = chatbotState.userInfo.full_name;
            document.getElementById('contact-email').value = chatbotState.userInfo.email;
            document.getElementById('contact-phone').value = chatbotState.userInfo.mobile;
        }}
        
        if (chatbotState.lastUserQuestion) {{
            document.getElementById('contact-message').value = `I'm interested in: ${{chatbotState.lastUserQuestion}}`;
        }}
        
        document.getElementById('input-area').style.display = 'none';
        
        document.getElementById('contact-cancel').addEventListener('click', hideContactForm);
        document.getElementById('contact-submit').addEventListener('click', handleContactFormSubmit);
        
        setTimeout(() => document.getElementById('contact-name').focus(), 100);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }}
    
    // Hide contact form
    function hideContactForm() {{
        const contactForm = document.getElementById('contact-form-container');
        if (contactForm) contactForm.remove();
        document.getElementById('input-area').style.display = 'block';
        setTimeout(() => document.getElementById('chatbot-input').focus(), 100);
    }}
    
    // Format message content with markdown support
    function formatMessageContent(content) {{
        if (!content) return '';
        let formatted = content.replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>');
        formatted = formatted.replace(/\\*(.*?)\\*/g, '<em>$1</em>');
        formatted = formatted.replace(/`(.*?)`/g, '<code>$1</code>');
        formatted = formatted.replace(/\\n/g, '<br>');
        formatted = formatted.replace(/^### (.*$)/gim, '<h3>$1</h3>');
        formatted = formatted.replace(/^## (.*$)/gim, '<h2>$1</h2>');
        formatted = formatted.replace(/^# (.*$)/gim, '<h1>$1</h1>');
        formatted = formatted.replace(/^- (.*$)/gm, '<li>• $1</li>');
        formatted = formatted.replace(/^(\\d+)\\.\\s*(.*)$/gm, '<li>$1. $2</li>');
        return formatted;
    }}
    
    // Check if response should show enquiry button
    function shouldShowEnquiryButton(userQuestion, botResponse) {{
        const enquiryPhrases = [
            'fill out an enquiry form', 'enquiry form', 'submit an enquiry',
            'contact our team', 'get more information', 'fill this form'
        ];
        
        if (botResponse) {{
            const lowerResponse = botResponse.toLowerCase();
            if (enquiryPhrases.some(phrase => lowerResponse.includes(phrase))) return true;
        }}
        
        const enquiryKeywords = [
            'price', 'pricing', 'cost', 'fee', 'charge', 'how much',
            'budget', 'quote', 'quotation', 'estimate', 'rates',
            'contact', 'phone', 'email', 'address', 'location',
            'call', 'reach', 'get in touch', 'enquiry', 'inquiry'
        ];
        
        const lowerQuestion = (userQuestion || '').toLowerCase();
        return enquiryKeywords.some(keyword => lowerQuestion.includes(keyword));
    }}
    
    // Show persistent enquiry button
    function showPersistentEnquiryButton() {{
        const container = document.getElementById('enquiry-button-container');
        if (container) {{
            container.style.display = 'block';
            chatbotState.pendingEnquiryButton = true;
        }}
    }}
    
    // Hide persistent enquiry button
    function hidePersistentEnquiryButton() {{
        const container = document.getElementById('enquiry-button-container');
        if (container) {{
            container.style.display = 'none';
            chatbotState.pendingEnquiryButton = false;
        }}
    }}
    
    // Add message to chat
    function addMessage(type, content, forceEnquiryButton = false) {{
        const messagesDiv = document.getElementById('chatbot-messages');
        
        const registrationForm = document.getElementById('registration-form-container');
        if (registrationForm) {{
            registrationForm.remove();
            if (chatbotState.userInfo && !document.getElementById('input-area').style.display) {{
                initializeUIForRegisteredUser();
            }}
        }}
        
        const contactForm = document.getElementById('contact-form-container');
        if (contactForm) {{
            contactForm.remove();
            document.getElementById('input-area').style.display = 'block';
        }}
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message-fade ' + (type === 'user' ? 'user-message' : 'bot-message');
        
        let formattedContent = content;
        if (type === 'bot') formattedContent = formatMessageContent(content);
        
        let shouldShowEnquiry = forceEnquiryButton;
        if (type === 'bot' && !shouldShowEnquiry) {{
            shouldShowEnquiry = shouldShowEnquiryButton(chatbotState.lastUserQuestion, content);
        }}
        
        if (shouldShowEnquiry) showPersistentEnquiryButton();
        
        let html = '';
        if (type === 'user') {{
            html = `<div style="font-size: 14px; line-height: 1.5;">${{content}}</div>`;
        }} else if (type === 'bot') {{
            html = `<div style="font-size: 14px; color: #374151; line-height: 1.6;">${{formattedContent}}</div>`;
            if (shouldShowEnquiry) {{
                html += `
                    <button class="enquiry-button-in-message" onclick="window.chatbotWidget.showContactForm()">
                        <span>📋 Submit Enquiry Form</span>
                        <span>→</span>
                    </button>
                `;
            }}
        }}
        
        messageDiv.innerHTML = html;
        messagesDiv.appendChild(messageDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        chatbotState.messages.push({{ type, content, timestamp: new Date().toISOString() }});
    }}
    
    // Handle user registration
    async function handleRegistration() {{
        const name = document.getElementById('register-name').value.trim();
        const email = document.getElementById('register-email').value.trim();
        const mobile = document.getElementById('register-mobile').value.trim();
        
        if (!name || !email || !mobile) {{
            alert('Please fill all fields');
            return;
        }}
        
        if (!email.includes('@')) {{
            alert('Please enter a valid email');
            return;
        }}
        
        const registerBtn = document.getElementById('register-submit');
        const originalText = registerBtn.textContent;
        registerBtn.textContent = 'Registering...';
        registerBtn.disabled = true;
        
        try {{
            const response = await fetch(`${{config.apiUrl}}/api/register`, {{
                method: 'POST',
                headers: {{ 'Content-Type': 'application/json' }},
                body: JSON.stringify({{
                    website_id: config.websiteId,
                    full_name: name,
                    email: email,
                    mobile: mobile
                }})
            }});
            
            if (!response.ok) throw new Error(`Registration failed: ${{response.status}}`);
            
            const data = await response.json();
            if (!data.success) throw new Error(data.message || 'Registration failed');
            
            chatbotState.userInfo = {{
                full_name: name,
                email: email,
                mobile: mobile,
                session_id: data.session_id,
                website_id: config.websiteId
            }};
            
            chatbotState.sessionId = data.session_id;
            chatbotState.conversationId = data.conversation_id;
            
            sessionManager.saveUserInfo(chatbotState.userInfo);
            sessionManager.saveConversationId(chatbotState.conversationId);
            
            initializeUIForRegisteredUser();
            addMessage('bot', `Hello ${{name.split(' ')[0]}}! I'm your AI assistant. How can I help you today?`);
            setupAutoReport();
            
        }} catch (error) {{
            console.error('Registration error:', error);
            alert('Registration failed. Please try again.');
        }} finally {{
            registerBtn.textContent = originalText;
            registerBtn.disabled = false;
        }}
    }}
    
    // Handle contact form submission
    async function handleContactFormSubmit() {{
        const name = document.getElementById('contact-name').value.trim();
        const email = document.getElementById('contact-email').value.trim();
        const phone = document.getElementById('contact-phone').value.trim();
        const message = document.getElementById('contact-message').value.trim();
        
        if (!name || !email || !message) {{
            alert('Please fill all required fields');
            return;
        }}
        
        if (!email.includes('@')) {{
            alert('Please enter a valid email');
            return;
        }}
        
        const submitBtn = document.getElementById('contact-submit');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = '📧 Sending...';
        submitBtn.disabled = true;
        
        try {{
            const response = await fetch(`${{config.apiUrl}}/api/contact`, {{
                method: 'POST',
                headers: {{ 'Content-Type': 'application/json' }},
                body: JSON.stringify({{
                    website_id: config.websiteId,
                    name: name,
                    email: email,
                    phone: phone,
                    message: message,
                    additional_data: {{
                        session_id: chatbotState.sessionId,
                        conversation_id: chatbotState.conversationId,
                        user_registered: !!chatbotState.userInfo
                    }}
                }})
            }});
            
            if (!response.ok) throw new Error(`Contact form failed: ${{response.status}}`);
            
            const data = await response.json();
            if (!data.success) throw new Error(data.message || 'Failed to send message');
            
            hideContactForm();
            addMessage('bot', 'Thank you for your enquiry! Our team will get back to you soon.');
            hidePersistentEnquiryButton();
            
        }} catch (error) {{
            console.error('Contact form error:', error);
            alert('Failed to send message. Please try again.');
        }} finally {{
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }}
    }}
    
    // Send chat message
    async function sendMessage() {{
        if (!chatbotState.userInfo) {{
            alert('Please register first');
            return;
        }}
        
        const input = document.getElementById('chatbot-input');
        const message = input.value.trim();
        
        if (!message || chatbotState.isLoading) return;
        
        chatbotState.lastUserQuestion = message;
        addMessage('user', message);
        input.value = '';
        chatbotState.isLoading = true;
        
        const messagesDiv = document.getElementById('chatbot-messages');
        const typingDiv = document.createElement('div');
        typingDiv.className = 'bot-message';
        typingDiv.innerHTML = `
            <div class="typing-indicator">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div style="font-size: 13px; color: #6b7280; margin-left: 8px;">AI is thinking...</div>
            </div>
        `;
        messagesDiv.appendChild(typingDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        
        try {{
            const response = await fetch(`${{config.apiUrl}}/api/chat`, {{
                method: 'POST',
                headers: {{ 'Content-Type': 'application/json' }},
                body: JSON.stringify({{
                    website_id: config.websiteId,
                    question: message,
                    conversation_id: chatbotState.conversationId,
                    user_info: chatbotState.userInfo,
                    session_id: chatbotState.sessionId
                }})
            }});
            
            if (!response.ok) throw new Error(`Chat failed: ${{response.status}}`);
            
            const data = await response.json();
            typingDiv.remove();
            addMessage('bot', data.success ? data.response : 'Sorry, I encountered an error. Please try again.');
            
        }} catch (error) {{
            console.error('Chat error:', error);
            typingDiv.remove();
            addMessage('bot', 'Sorry, I encountered an error. Please try again.');
        }} finally {{
            chatbotState.isLoading = false;
            input.focus();
        }}
    }}
    
    // Setup auto-report
    function setupAutoReport() {{
        if (!config.autoReport || !chatbotState.sessionId) return;
        
        const saveMessagesToStorage = () => {{
            localStorage.setItem('chatbot_messages_' + chatbotState.sessionId, JSON.stringify(chatbotState.messages));
        }};
        
        const sendAutoReport = async () => {{
            if (chatbotState.messages.length < 2) return;
            try {{
                const formData = new FormData();
                formData.append('session_id', chatbotState.sessionId);
                await fetch(`${{config.apiUrl}}/api/chat/auto-report`, {{ method: 'POST', body: formData, keepalive: true }});
            }} catch (error) {{
                const formData = new FormData();
                formData.append('session_id', chatbotState.sessionId);
                navigator.sendBeacon(`${{config.apiUrl}}/api/chat/auto-report`, formData);
            }}
        }};
        
        window.addEventListener('beforeunload', () => {{ saveMessagesToStorage(); sendAutoReport(); }});
        window.addEventListener('pagehide', () => {{ saveMessagesToStorage(); sendAutoReport(); }});
        setInterval(saveMessagesToStorage, 30000);
    }}
    
    // Setup event listeners
    function setupEventListeners() {{
        const toggleBtn = document.getElementById('chatbot-toggle');
        const closeBtn = document.getElementById('chatbot-close');
        const sendBtn = document.getElementById('chatbot-send');
        const inputField = document.getElementById('chatbot-input');
        const chatWindow = document.getElementById('chatbot-window');
        const persistentEnquiryBtn = document.getElementById('persistent-enquiry-btn');
        
        toggleBtn.addEventListener('click', function() {{
            chatbotState.isOpen = !chatbotState.isOpen;
            if (chatbotState.isOpen) {{
                chatWindow.style.display = 'flex';
                setTimeout(() => chatWindow.classList.add('chatbot-window-open'), 10);
                if (chatbotState.userInfo) {{
                    setTimeout(() => inputField.focus(), 100);
                }} else {{
                    const nameInput = document.getElementById('register-name');
                    if (nameInput) setTimeout(() => nameInput.focus(), 100);
                }}
            }} else {{
                chatWindow.classList.remove('chatbot-window-open');
                setTimeout(() => chatWindow.style.display = 'none', 300);
            }}
        }});
        
        closeBtn.addEventListener('click', function() {{
            chatbotState.isOpen = false;
            chatWindow.classList.remove('chatbot-window-open');
            setTimeout(() => chatWindow.style.display = 'none', 300);
        }});
        
        sendBtn.addEventListener('click', sendMessage);
        inputField.addEventListener('keypress', function(e) {{
            if (e.key === 'Enter') sendMessage();
        }});
        
        document.getElementById('show-contact-btn').addEventListener('click', showContactForm);
        if (persistentEnquiryBtn) persistentEnquiryBtn.addEventListener('click', showContactForm);
        
        document.addEventListener('click', function(event) {{
            if (chatbotState.isOpen && !chatWindow.contains(event.target) && !toggleBtn.contains(event.target)) {{
                chatbotState.isOpen = false;
                chatWindow.classList.remove('chatbot-window-open');
                setTimeout(() => chatWindow.style.display = 'none', 300);
            }}
        }});
    }}
    
    // Expose functions globally
    window.chatbotWidget = {{
        showContactForm,
        hideContactForm,
        makeResponsive,
        showPersistentEnquiryButton,
        hidePersistentEnquiryButton
    }};
    
    // Initialize
    if (document.readyState === 'loading') {{
        document.addEventListener('DOMContentLoaded', createChatbot);
    }} else {{
        createChatbot();
    }}
}})();
"""
        
        # Save script file
        script_filename = f"chatbot_{website_id}.js"
        script_path = os.path.join(self.scripts_dir, script_filename)
        
        try:
            with open(script_path, 'w', encoding='utf-8') as f:
                f.write(script_content)
            
            print(f" Generated awesome next-level chatbot theme: {script_path}")
            return script_path
            
        except Exception as e:
            print(f"  Error generating script file: {e}")
            alt_path = os.path.join(os.getcwd(), script_filename)
            with open(alt_path, 'w', encoding='utf-8') as f:
                f.write(script_content)
            return alt_path

# Singleton instance
chatbot_generator = ChatbotGenerator()