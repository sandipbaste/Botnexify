import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
import os
import json
from datetime import datetime
from typing import Dict, Any, List, Optional
from pathlib import Path
import logging
import traceback
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class EmailService:
    def __init__(self):
        # Load default SMTP configuration
        self.smtp_host = os.getenv('SMTP_HOST', 'smtp.gmail.com')
        self.smtp_port = int(os.getenv('SMTP_PORT', 587))
        self.smtp_username = os.getenv('SMTP_USERNAME', '')
        self.smtp_password = os.getenv('SMTP_PASSWORD', '')
        self.default_from_email = os.getenv('DEFAULT_FROM_EMAIL', 'noreply@chatbot.com')
        
        # Test connection
        self.test_smtp_connection()
    
    def test_smtp_connection(self):
        """Test SMTP connection"""
        try:
            with smtplib.SMTP(self.smtp_host, self.smtp_port, timeout=10) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                if self.smtp_username and self.smtp_password:
                    server.login(self.smtp_username, self.smtp_password)
                logger.info(f" SMTP connection successful to {self.smtp_host}:{self.smtp_port}")
                return True
        except Exception as e:
            logger.error(f"  SMTP connection failed: {e}")
            return False
    
    def get_website_env(self, website_id: str) -> Dict[str, str]:
        """Get website-specific environment variables"""
        env_path = Path(f"data/{website_id}/.env")
        env_vars = {}
        
        if env_path.exists():
            try:
                with open(env_path, 'r') as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith('#'):
                            if '=' in line:
                                key, value = line.split('=', 1)
                                env_vars[key.strip()] = value.strip().strip('"\'')
            except Exception as e:
                logger.error(f"Error reading website env: {e}")
        
        # Fallback to global settings if website-specific not found
        if 'SMTP_HOST' not in env_vars:
            env_vars['SMTP_HOST'] = self.smtp_host
        if 'SMTP_PORT' not in env_vars:
            env_vars['SMTP_PORT'] = str(self.smtp_port)
        if 'SMTP_USERNAME' not in env_vars:
            env_vars['SMTP_USERNAME'] = self.smtp_username
        if 'SMTP_PASSWORD' not in env_vars:
            env_vars['SMTP_PASSWORD'] = self.smtp_password
        if 'ADMIN_EMAIL' not in env_vars:
            env_vars['ADMIN_EMAIL'] = self.default_from_email
        
        return env_vars
    
    def send_email(self, to_email: str, subject: str, body: str, 
                  html_body: Optional[str] = None, attachments: List[Dict] = None,
                  website_id: Optional[str] = None) -> Dict[str, Any]:
        """Send email with optional attachments"""
        try:
            # Get email configuration
            if website_id:
                website_env = self.get_website_env(website_id)
                smtp_host = website_env.get('SMTP_HOST', self.smtp_host)
                smtp_port = int(website_env.get('SMTP_PORT', self.smtp_port))
                smtp_username = website_env.get('SMTP_USERNAME', self.smtp_username)
                smtp_password = website_env.get('SMTP_PASSWORD', self.smtp_password)
                from_email = website_env.get('ADMIN_EMAIL', self.default_from_email)
            else:
                smtp_host = self.smtp_host
                smtp_port = self.smtp_port
                smtp_username = self.smtp_username
                smtp_password = self.smtp_password
                from_email = self.default_from_email
            
            # Validate email addresses
            if not to_email or '@' not in to_email:
                return {"success": False, "error": "Invalid recipient email"}
            
            # Create message
            msg = MIMEMultipart()
            msg['From'] = from_email
            msg['To'] = to_email
            msg['Subject'] = subject
            
            # Remove text body, only send HTML
            if html_body:
                html_part = MIMEText(html_body, 'html')
                msg.attach(html_part)
            
            # Add attachments
            if attachments:
                for attachment in attachments:
                    try:
                        if attachment.get('content') and attachment.get('filename'):
                            # Determine content type
                            filename = attachment['filename'].lower()
                            if filename.endswith('.pdf'):
                                mime_type = 'application/pdf'
                            elif filename.endswith('.png'):
                                mime_type = 'image/png'
                            elif filename.endswith('.jpg') or filename.endswith('.jpeg'):
                                mime_type = 'image/jpeg'
                            else:
                                mime_type = 'application/octet-stream'
                            
                            part = MIMEApplication(
                                attachment['content'],
                                _subtype=mime_type.split('/')[1] if '/' in mime_type else 'octet-stream'
                            )
                            part.add_header(
                                'Content-Disposition',
                                'attachment',
                                filename=attachment['filename']
                            )
                            msg.attach(part)
                    except Exception as e:
                        logger.error(f"Error attaching file {attachment.get('filename')}: {e}")
                        continue
            
            # Send email
            context = ssl.create_default_context()
            
            with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as server:
                server.ehlo()
                server.starttls(context=context)
                server.ehlo()
                
                # Login if credentials provided
                if smtp_username and smtp_password:
                    server.login(smtp_username, smtp_password)
                
                server.send_message(msg)
                server.quit()
            
            logger.info(f" Email sent to {to_email}")
            return {"success": True, "message": "Email sent successfully"}
            
        except smtplib.SMTPAuthenticationError as e:
            error_msg = f"SMTP Authentication failed: {e}"
            logger.error(error_msg)
            return {"success": False, "error": "Email authentication failed. Check username/password."}
        except smtplib.SMTPException as e:
            error_msg = f"SMTP Error: {e}"
            logger.error(error_msg)
            return {"success": False, "error": f"SMTP error: {str(e)}"}
        except Exception as e:
            error_msg = f"Email sending error: {e}"
            logger.error(error_msg)
            return {"success": False, "error": str(e)}
    
    def send_password_reset_otp(self, website_id: str, user_email: str, user_name: str, otp: str) -> Dict[str, Any]:
        """Send password reset OTP email to user"""
        try:
            subject = f" Password Reset OTP - {user_name}"
            
            html_body = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {{
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f5f5f5;
            margin: 0;
            padding: 20px;
        }}
        .container {{
            max-width: 500px;
            margin: 0 auto;
            background: white;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
        }}
        .header {{
            background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
            color: white;
            padding: 30px 20px;
            text-align: center;
        }}
        .header h1 {{
            margin: 0;
            font-size: 24px;
        }}
        .content {{
            padding: 30px;
        }}
        .otp-container {{
            text-align: center;
            margin: 30px 0;
        }}
        .otp-code {{
            display: inline-block;
            background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
            color: #92400e;
            font-size: 32px;
            font-weight: bold;
            padding: 20px 40px;
            border-radius: 10px;
            letter-spacing: 10px;
            border: 2px dashed #f59e0b;
            margin: 20px 0;
        }}
        .instructions {{
            background: #f0f9ff;
            border-radius: 8px;
            padding: 15px;
            margin: 20px 0;
            border-left: 4px solid #3b82f6;
        }}
        .instructions ol {{
            margin: 10px 0 0;
            padding-left: 20px;
        }}
        .instructions li {{
            margin-bottom: 8px;
            color: #1e40af;
        }}
        .warning {{
            background: #fef3c7;
            border: 1px solid #f59e0b;
            border-radius: 8px;
            padding: 15px;
            margin: 20px 0;
            text-align: center;
        }}
        .footer {{
            text-align: center;
            padding: 20px;
            background: #f0f0f0;
            color: #666;
            font-size: 12px;
            border-top: 1px solid #e0e0e0;
        }}
        .timestamp {{
            text-align: center;
            color: #666;
            font-size: 14px;
            margin-bottom: 20px;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1> Password Reset</h1>
        </div>
        
        <div class="content">
            <div class="timestamp">
                {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
            </div>
            
            <p>Hello <strong>{user_name}</strong>,</p>
            <p>You have requested to reset your password. Use the OTP below to verify your identity:</p>
            
            <div class="otp-container">
                <div class="otp-code">
                    {otp}
                </div>
            </div>
            
            <div class="instructions">
                <h3 style="margin-top: 0; color: #1e40af;">Instructions:</h3>
                <ol>
                    <li>Enter the OTP in the password reset form</li>
                    <li>Create a new strong password</li>
                    <li>Confirm your new password</li>
                    <li>Click "Reset Password" to complete</li>
                </ol>
            </div>
            
            <div class="warning">
                <p><strong> Important:</strong></p>
                <p>This OTP is valid for 10 minutes only.</p>
                <p>Do not share this OTP with anyone.</p>
                <p>If you didn't request this, please ignore this email.</p>
            </div>
        </div>
        
        <div class="footer">
            <p>This is an automated password reset email from Chatbot Generator.</p>
            <p>Do not reply to this email.</p>
        </div>
    </div>
</body>
</html>"""
            
            # Send email to user
            result = self.send_email(
                to_email=user_email,
                subject=subject,
                body="",  # Empty text body
                html_body=html_body,
                website_id=website_id
            )
            
            return result
            
        except Exception as e:
            error_msg = f"Error sending password reset OTP: {e}"
            logger.error(error_msg)
            traceback.print_exc()
            return {"success": False, "error": str(e)}
    
    def send_registration_notification(self, website_id: str, admin_email: str, 
                                     user_data: Dict[str, Any]) -> Dict[str, Any]:
        """Send notification to admin when user registers"""
        try:
            subject = f" New User Registration - {user_data.get('full_name', 'User')}"
            
            # HTML body
            html_body = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {{
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f5f5f5;
            margin: 0;
            padding: 20px;
        }}
        .container {{
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
        }}
        .header {{
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
            padding: 30px 20px;
            text-align: center;
        }}
        .header h1 {{
            margin: 0;
            font-size: 24px;
        }}
        .content {{
            padding: 30px;
        }}
        .section {{
            margin-bottom: 25px;
            padding: 20px;
            background: #f9f9f9;
            border-radius: 8px;
            border-left: 4px solid #10b981;
        }}
        .section h2 {{
            color: #10b981;
            margin-top: 0;
            font-size: 18px;
        }}
        .field {{
            margin-bottom: 10px;
            display: flex;
        }}
        .label {{
            font-weight: bold;
            color: #555;
            width: 120px;
            flex-shrink: 0;
        }}
        .value {{
            color: #333;
            flex: 1;
        }}
        .footer {{
            text-align: center;
            padding: 20px;
            background: #f0f0f0;
            color: #666;
            font-size: 12px;
            border-top: 1px solid #e0e0e0;
        }}
        .info-box {{
            background: #e8f4f8;
            border: 1px solid #b3e0f2;
            border-radius: 8px;
            padding: 15px;
            margin: 15px 0;
        }}
        .timestamp {{
            text-align: center;
            color: #666;
            font-size: 14px;
            margin-bottom: 20px;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1> New User Registration</h1>
        </div>
        
        <div class="content">
            <div class="timestamp">
                {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
            </div>
            
            <div class="info-box">
                <p style="margin: 0; font-weight: 500;">A new User has registered to chat with your website chatbot.</p>
            </div>
            
            <div class="section">
                <h2> User Information</h2>
                <div class="field">
                    <span class="label">Name:</span>
                    <span class="value">{user_data.get('full_name', 'Not provided')}</span>
                </div>
                <div class="field">
                    <span class="label">Email:</span>
                    <span class="value">{user_data.get('email', 'Not provided')}</span>
                </div>
                <div class="field">
                    <span class="label">Mobile:</span>
                    <span class="value">{user_data.get('mobile', 'Not provided')}</span>
                </div>
                <div class="field">
                    <span class="label">Registration:</span>
                    <span class="value">{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</span>
                </div>
            </div>
        </div>
        
        <div class="footer">
            <p>This User has registered to chat with your website's AI assistant.</p>
            <p>Do not reply to this email.</p>
        </div>
    </div>
</body>
</html>"""
            
            # Send email to admin
            result = self.send_email(
                to_email=admin_email,
                subject=subject,
                body="",  # Empty text body
                html_body=html_body,
                website_id=website_id
            )
            
            return result
            
        except Exception as e:
            error_msg = f"Error sending registration notification: {e}"
            logger.error(error_msg)
            return {"success": False, "error": str(e)}
    
    def send_contact_form_notification(self, website_id: str, admin_email: str, 
                                     form_data: Dict[str, Any]) -> Dict[str, Any]:
        """Send contact form notification to admin"""
        try:
            subject = f" New Contact Form - {form_data.get('name', 'User')}"
            
            # HTML body
            html_body = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {{
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f5f5f5;
            margin: 0;
            padding: 20px;
        }}
        .container {{
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
        }}
        .header {{
            background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
            color: white;
            padding: 30px 20px;
            text-align: center;
        }}
        .header h1 {{
            margin: 0;
            font-size: 24px;
        }}
        .content {{
            padding: 30px;
        }}
        .section {{
            margin-bottom: 25px;
            padding: 20px;
            background: #f9f9f9;
            border-radius: 8px;
            border-left: 4px solid #3b82f6;
        }}
        .section h2 {{
            color: #3b82f6;
            margin-top: 0;
            font-size: 18px;
        }}
        .field {{
            margin-bottom: 10px;
            display: flex;
        }}
        .label {{
            font-weight: bold;
            color: #555;
            width: 120px;
            flex-shrink: 0;
        }}
        .value {{
            color: #333;
            flex: 1;
        }}
        .message-box {{
            background: #fff;
            padding: 15px;
            border: 1px solid #e0e0e0;
            border-radius: 5px;
            margin-top: 10px;
            line-height: 1.5;
        }}
        .footer {{
            text-align: center;
            padding: 20px;
            background: #f0f0f0;
            color: #666;
            font-size: 12px;
            border-top: 1px solid #e0e0e0;
        }}
        .info-box {{
            background: #e7f3ff;
            border: 1px solid #b3d9ff;
            border-radius: 8px;
            padding: 15px;
            margin: 15px 0;
        }}
        .timestamp {{
            text-align: center;
            color: #666;
            font-size: 14px;
            margin-bottom: 20px;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1> New Contact Form</h1>
        </div>
        
        <div class="content">
            <div class="timestamp">
                {datetime.now().strftime('%Y-%m-d %H:%M:%S')}
            </div>
            
            <div class="info-box">
                <p style="margin: 0; font-weight: 500;">A User has submitted a contact form on your website.</p>
            </div>
            
            <div class="section">
                <h2> Contact Information</h2>
                <div class="field">
                    <span class="label">Name:</span>
                    <span class="value">{form_data.get('name', 'Not provided')}</span>
                </div>
                <div class="field">
                    <span class="label">Email:</span>
                    <span class="value">{form_data.get('email', 'Not provided')}</span>
                </div>
                <div class="field">
                    <span class="label">Phone:</span>
                    <span class="value">{form_data.get('phone', 'Not provided')}</span>
                </div>
            </div>
            
            <div class="section">
                <h2> Message</h2>
                <div class="message-box">
                    {form_data.get('message', 'No message provided').replace(chr(10), '<br>')}
                </div>
            </div>
        </div>
        
        <div class="footer">
            <p>This is a contact form submission from your website.</p>
            <p>Do not reply to this email.</p>
        </div>
    </div>
</body>
</html>"""
            
            # Send email to admin
            result = self.send_email(
                to_email=admin_email,
                subject=subject,
                body="",  # Empty text body
                html_body=html_body,
                website_id=website_id
            )
            
            return result
            
        except Exception as e:
            error_msg = f"Error sending contact form notification: {e}"
            logger.error(error_msg)
            return {"success": False, "error": str(e)}
    
    def send_chat_session_report(self, website_id: str, admin_email: str, 
                            conversation_id: str, chat_history: List[Dict[str, Any]],
                            user_info: Dict[str, Any], is_auto_report: bool = False) -> Dict[str, Any]:
        """Send chat session report to admin when user ends chat or browser closes"""
        try:
            subject_type = " Auto-Report" if is_auto_report else " Chat Session Report"
            subject = f"{subject_type} - {user_info.get('full_name', 'User')}"
            
            # Create summary - REMOVE DUPLICATES
            # Filter unique messages based on content and timestamp
            unique_messages = []
            seen_messages = set()
            
            for msg in chat_history:
                # Create a unique identifier for each message
                msg_key = f"{msg.get('role')}_{msg.get('message')}_{msg.get('created_at', '')}"
                
                if msg_key not in seen_messages:
                    seen_messages.add(msg_key)
                    unique_messages.append(msg)
            
            chat_history = unique_messages  # Use filtered list
            
            user_messages = [msg for msg in chat_history if msg.get('role') == 'user']
            assistant_messages = [msg for msg in chat_history if msg.get('role') == 'assistant']
            
            # Get first and last message times
            if chat_history:
                first_time = chat_history[0].get('created_at', 'Unknown')
                last_time = chat_history[-1].get('created_at', 'Unknown')
            else:
                first_time = last_time = 'Unknown'
            
            # Format chat history as HTML table
            chat_history_html = ""
            last_role = None
            consecutive_count = 0
            
            for i, msg in enumerate(chat_history):
                role = " User" if msg.get('role') == 'user' else " Assistant"
                message_time = msg.get('created_at', 'Unknown')
                message_content = msg.get('message', '')
                
                # Check for consecutive duplicate messages
                if i > 0:
                    prev_msg = chat_history[i-1]
                    if (msg.get('role') == prev_msg.get('role') and 
                        msg.get('message') == prev_msg.get('message')):
                        consecutive_count += 1
                        if consecutive_count >= 2:
                            # Skip duplicate message
                            continue
                    else:
                        consecutive_count = 0
                
                # Format time
                try:
                    dt = datetime.fromisoformat(message_time.replace('Z', '+00:00'))
                    formatted_time = dt.strftime('%Y-%m-%d %H:%M:%S')
                except:
                    formatted_time = message_time
                
                # Truncate long messages for table
                display_content = message_content
                if len(display_content) > 500:
                    display_content = display_content[:500] + "..."
                
                row_color = "#f8fafc" if i % 2 == 0 else "#ffffff"
                
                chat_history_html += f"""
                <tr style="background-color: {row_color};">
                    <td style="padding: 12px; border: 1px solid #e2e8f0; text-align: center; font-size: 14px; color: #4a5568;">
                        {i+1}
                    </td>
                    <td style="padding: 12px; border: 1px solid #e2e8f0; text-align: center; font-size: 14px; color: #4a5568;">
                        {formatted_time}
                    </td>
                    <td style="padding: 12px; border: 1px solid #e2e8f0; text-align: center; font-size: 14px; font-weight: 600; color: { '#2d3748' if msg.get('role') == 'user' else '#2b6cb0' };">
                        {role}
                    </td>
                    <td style="padding: 12px; border: 1px solid #e2e8f0; font-size: 14px; color: #2d3748; line-height: 1.5;">
                        {display_content.replace(chr(10), '<br>')}
                    </td>
                </tr>
                """
                
                last_role = msg.get('role')
            
            # Report type indicator
            report_type_html = ""
            if is_auto_report:
                report_type_html = """
                <div style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: white; padding: 10px; border-radius: 8px; text-align: center; margin: 10px 0; font-weight: bold;">
                     AUTO-GENERATED REPORT (Browser Closed/Refreshed)
                </div>
                """
            else:
                report_type_html = """
                <div style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: white; padding: 10px; border-radius: 8px; text-align: center; margin: 10px 0; font-weight: bold;">
                     MANUAL CHAT SESSION REPORT
                </div>
                """
            
            # HTML body
            html_body = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {{
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f5f5f5;
            margin: 0;
            padding: 20px;
        }}
        .container {{
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
        }}
        .header {{
            background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
            color: white;
            padding: 30px 20px;
            text-align: center;
        }}
        .header h1 {{
            margin: 0;
            font-size: 24px;
        }}
        .content {{
            padding: 30px;
        }}
        .section {{
            margin-bottom: 25px;
            padding: 20px;
            background: #f9f9f9;
            border-radius: 8px;
        }}
        .section h2 {{
            color: #8b5cf6;
            margin-top: 0;
            font-size: 18px;
            border-bottom: 2px solid #8b5cf6;
            padding-bottom: 10px;
        }}
        .stats-grid {{
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 15px;
            margin: 15px 0;
        }}
        .stat-card {{
            background: white;
            padding: 15px;
            border-radius: 8px;
            text-align: center;
            border: 1px solid #e0e0e0;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }}
        .stat-number {{
            font-size: 24px;
            font-weight: bold;
            color: #8b5cf6;
        }}
        .stat-label {{
            font-size: 12px;
            color: #666;
            margin-top: 5px;
        }}
        .user-info {{
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            margin: 15px 0;
        }}
        .info-item {{
            background: white;
            padding: 10px;
            border-radius: 6px;
            border: 1px solid #e0e0e0;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }}
        .info-label {{
            font-size: 12px;
            color: #666;
            margin-bottom: 5px;
        }}
        .info-value {{
            font-weight: bold;
            color: #333;
        }}
        .chat-table-container {{
            overflow-x: auto;
            margin: 20px 0;
            border-radius: 8px;
            border: 1px solid #e0e0e0;
        }}
        .footer {{
            text-align: center;
            padding: 20px;
            background: #f0f0f0;
            color: #666;
            font-size: 12px;
            border-top: 1px solid #e0e0e0;
        }}
        .summary-box {{
            background: linear-gradient(135deg, #f0f7ff 0%, #e6f0ff 100%);
            border: 1px solid #c2d9ff;
            border-radius: 8px;
            padding: 15px;
            margin: 15px 0;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            font-family: Arial, sans-serif;
        }}
        th {{
            background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
            color: white;
            padding: 12px;
            text-align: left;
            border: 1px solid #ddd;
            font-weight: 600;
        }}
        .timestamp {{
            text-align: center;
            color: #666;
            font-size: 14px;
            margin-bottom: 20px;
        }}
        .duplicate-note {{
            background: #fff3cd;
            border: 1px solid #ffecb5;
            color: #856404;
            padding: 8px 12px;
            border-radius: 4px;
            margin: 10px 0;
            font-size: 12px;
            text-align: center;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>{subject_type}</h1>
        </div>
        
        <div class="content">
            <div class="timestamp">
                Report Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
            </div>
            
            {report_type_html}
            
            <div class="summary-box">
                <p style="margin: 0; font-weight: 500; color: #1d4ed8;">A user has completed a chat session with your website chatbot.</p>
                <p style="margin: 5px 0 0; font-size: 12px; color: #4b5563;">Note: Duplicate messages have been automatically filtered.</p>
            </div>
            
            <div class="section">
                <h2> User Information</h2>
                <div class="user-info">
                    <div class="info-item">
                        <div class="info-label">Name</div>
                        <div class="info-value">{user_info.get('full_name', 'Not provided')}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Email</div>
                        <div class="info-value">{user_info.get('email', 'Not provided')}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Mobile</div>
                        <div class="info-value">{user_info.get('mobile', 'Not provided')}</div>
                    </div>
                </div>
            </div>
            
            <div class="section">
                <h2> Session Statistics</h2>
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-number">{len(chat_history)}</div>
                        <div class="stat-label">Total Messages</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number">{len(user_messages)}</div>
                        <div class="stat-label">User Messages</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number">{len(assistant_messages)}</div>
                        <div class="stat-label">Assistant Messages</div>
                    </div>
                </div>
                <div style="margin-top: 10px; font-size: 13px; color: #666;">
                    <p><strong>Session Time:</strong> {first_time} to {last_time}</p>
                    <p><strong>Report Type:</strong> {'Auto-generated (browser closed/refreshed)' if is_auto_report else 'Manual report'}</p>
                    <p><strong>Filtered Duplicates:</strong> {len(unique_messages) - len(chat_history)} messages removed</p>
                </div>
            </div>
            
            <div class="section">
                <h2> Complete Chat History</h2>
                <div class="duplicate-note">
                     Note: Consecutive duplicate messages have been filtered automatically
                </div>
                <div class="chat-table-container">
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 50px;">#</th>
                                <th style="width: 150px;">Time</th>
                                <th style="width: 100px;">Role</th>
                                <th>Message</th>
                            </tr>
                        </thead>
                        <tbody>
                            {chat_history_html}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        
        <div class="footer">
            <p>This chat session has been completed. You can view the complete history in your admin dashboard.</p>
            <p>Do not reply to this email.</p>
        </div>
    </div>
</body>
</html>"""
        
            # Send email to admin
            result = self.send_email(
                to_email=admin_email,
                subject=subject,
                body="",  # Empty text body
                html_body=html_body,
                website_id=website_id
            )
            
            return result
            
        except Exception as e:
            error_msg = f"Error sending chat session report: {e}"
            logger.error(error_msg)
            traceback.print_exc()
            return {"success": False, "error": str(e)}
    
    def send_training_completion_email(self, website_id: str, admin_email: str, 
                                     website_name: str, script_url: str,
                                     embed_code: str, training_data: Dict[str, Any]) -> Dict[str, Any]:
        """Send training completion email with script tag (only when script is generated)"""
        try:
            subject = f" Chatbot Ready - {website_name}"
            
            # Extract domain from website URL for cleaner display
            website_url = training_data.get('website_url', '')
            domain = website_url.replace('https://', '').replace('http://', '').replace('www.', '').split('/')[0]
            
            # HTML body
            html_body = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {{
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f5f5f5;
            margin: 0;
            padding: 20px;
        }}
        .container {{
            max-width: 700px;
            margin: 0 auto;
            background: white;
            border-radius: 15px;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }}
        .header {{
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
            padding: 40px 20px;
            text-align: center;
            position: relative;
        }}
        .header h1 {{
            margin: 0;
            font-size: 28px;
            font-weight: 700;
        }}
        .header p {{
            margin: 10px 0 0;
            opacity: 0.9;
            font-size: 16px;
        }}
        .badge {{
            position: absolute;
            top: 20px;
            right: 20px;
            background: rgba(255,255,255,0.2);
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
        }}
        .content {{
            padding: 40px;
        }}
        .success-icon {{
            text-align: center;
            margin-bottom: 30px;
        }}
        .success-icon div {{
            width: 80px;
            height: 80px;
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            border-radius: 50%;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 36px;
            color: white;
        }}
        .info-card {{
            background: #f0f9ff;
            border-radius: 10px;
            padding: 25px;
            margin-bottom: 30px;
            border-left: 4px solid #3b82f6;
        }}
        .info-card h3 {{
            color: #1e40af;
            margin-top: 0;
            font-size: 20px;
        }}
        .info-grid {{
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
            margin: 20px 0;
        }}
        .info-item {{
            background: white;
            padding: 15px;
            border-radius: 8px;
            border: 1px solid #e5e7eb;
        }}
        .info-label {{
            font-size: 12px;
            color: #6b7280;
            margin-bottom: 5px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }}
        .info-value {{
            font-weight: 600;
            color: #111827;
            font-size: 14px;
        }}
        .code-block {{
            background: #1e1e1e;
            color: #d4d4d4;
            padding: 20px;
            border-radius: 8px;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            line-height: 1.5;
            overflow-x: auto;
            margin: 20px 0;
            position: relative;
        }}
        .copy-btn {{
            position: absolute;
            top: 10px;
            right: 10px;
            background: #3b82f6;
            color: white;
            border: none;
            padding: 5px 10px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }}
        .steps {{
            background: #fef3c7;
            border-radius: 10px;
            padding: 25px;
            margin: 30px 0;
            border-left: 4px solid #f59e0b;
        }}
        .steps h3 {{
            color: #92400e;
            margin-top: 0;
        }}
        .steps ol {{
            margin: 15px 0 0;
            padding-left: 20px;
        }}
        .steps li {{
            margin-bottom: 10px;
            color: #92400e;
        }}
        .footer {{
            text-align: center;
            padding: 30px;
            background: #f9fafb;
            color: #6b7280;
            font-size: 12px;
            border-top: 1px solid #e5e7eb;
        }}
        .logo {{
            font-size: 24px;
            font-weight: 700;
            color: #10b981;
            margin-bottom: 10px;
        }}
        .timestamp {{
            text-align: center;
            color: #666;
            font-size: 14px;
            margin-bottom: 30px;
        }}
        .training-stats {{
            background: linear-gradient(135deg, #f0f9ff 0%, #e6f0ff 100%);
            border-radius: 10px;
            padding: 20px;
            margin: 20px 0;
            border: 1px solid #c2d9ff;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <span class="badge"> AI Chatbot</span>
            <h1> Your Chatbot is Ready!</h1>
            <p>{website_name}</p>
        </div>
        
        <div class="content">
            <div class="timestamp">
                {datetime.now().strftime('%B %d, %Y at %H:%M %p')}
            </div>
            
            <div class="success-icon">
                <div></div>
            </div>
            
            <div class="training-stats">
                <div class="info-grid">
                    <div class="info-item">
                        <div class="info-label">Website</div>
                        <div class="info-value">{domain}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Training Date</div>
                        <div class="info-value">{datetime.now().strftime('%B %d, %Y')}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Pages Processed</div>
                        <div class="info-value">{training_data.get('data_points', 0)}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Training Time</div>
                        <div class="info-value">{training_data.get('training_time', 'Completed')}</div>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="footer">
            <div class="logo"> Chatbot Generator</div>
            <p>Thank you for choosing our AI chatbot solution.</p>
            <p style="margin-top: 20px; font-size: 11px; color: #9ca3af;">
                This is an automated message. Please do not reply to this email.
            </p>
        </div>
    </div>
</body>
</html>"""
            
            # Send email to admin
            result = self.send_email(
                to_email=admin_email,
                subject=subject,
                body="",  # Empty text body
                html_body=html_body,
                website_id=website_id
            )
            
            return result
            
        except Exception as e:
            error_msg = f"Error sending training completion email: {e}"
            logger.error(error_msg)
            traceback.print_exc()
            return {"success": False, "error": str(e)}

    
    
    # In EmailService class, add this method:

    def send_welcome_email(self, website_id: str, user_email: str, user_name: str) -> Dict[str, Any]:
        """Send welcome email to user"""
        try:
            subject = f" Welcome to Our Chatbot - {user_name}!"
            
            html_body = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: #3b82f6; color: white; padding: 20px; text-align: center; }}
        .content {{ padding: 20px; background: #f9fafb; }}
        .footer {{ text-align: center; padding: 10px; color: #666; font-size: 12px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1> Welcome to Our AI Chatbot</h1>
        </div>
        <div class="content">
            <h2>Hello {user_name}!</h2>
            <p>Thank you for registering with our AI assistant. We're excited to help you!</p>
            <p>You can now start chatting with our AI assistant anytime.</p>
        </div>
        <div class="footer">
            <p>This is an automated welcome email.</p>
        </div>
    </div>
</body>
</html>"""
        
            # Send email to user
            result = self.send_email(
                to_email=user_email,
                subject=subject,
                body="",  # Empty text body
                html_body=html_body,
                website_id=website_id
            )
            
            return result
            
        except Exception as e:
            error_msg = f"Error sending welcome email: {e}"
            logger.error(error_msg)
            return {"success": False, "error": str(e)}
    
# Singleton instance
email_service = EmailService()