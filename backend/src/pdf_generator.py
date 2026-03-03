import os
from datetime import datetime
from typing import List, Dict, Any
from fpdf import FPDF
import base64
from io import BytesIO
from pathlib import Path

class PDFGenerator:
    def __init__(self):
        pass
    
    def generate_chat_pdf(self, website_id: str, conversation_id: str, 
                         chat_history: List[Dict[str, Any]]) -> bytes:
        """Generate PDF from chat history using FPDF"""
        pdf = FPDF()
        pdf.set_auto_page_break(auto=True, margin=15)
        
        # Add a page
        pdf.add_page()
        
        # Set font
        pdf.set_font("Arial", size=12)
        
        # Title
        pdf.set_font("Arial", 'B', 16)
        pdf.cell(200, 10, txt="Chat History Report", ln=True, align='C')
        pdf.ln(5)
        
        # Website info
        pdf.set_font("Arial", size=12)
        pdf.cell(200, 10, txt=f"Website: {website_id}", ln=True)
        pdf.cell(200, 10, txt=f"Conversation ID: {conversation_id}", ln=True)
        pdf.cell(200, 10, txt=f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", ln=True)
        pdf.ln(10)
        
        # Summary
        pdf.set_font("Arial", 'B', 14)
        pdf.cell(200, 10, txt="Summary", ln=True)
        pdf.set_font("Arial", size=12)
        
        user_count = sum(1 for msg in chat_history if msg.get('role') == 'user')
        assistant_count = sum(1 for msg in chat_history if msg.get('role') == 'assistant')
        
        pdf.cell(200, 10, txt=f"Total Messages: {len(chat_history)}", ln=True)
        pdf.cell(200, 10, txt=f"User Messages: {user_count}", ln=True)
        pdf.cell(200, 10, txt=f"Assistant Messages: {assistant_count}", ln=True)
        pdf.ln(10)
        
        # Chat messages
        pdf.set_font("Arial", 'B', 14)
        pdf.cell(200, 10, txt="Chat Messages", ln=True)
        pdf.ln(5)
        
        for i, msg in enumerate(chat_history, 1):
            role = msg.get('role', 'unknown')
            timestamp = msg.get('created_at', 'Unknown')
            message = msg.get('message', '')
            
            # Message header
            pdf.set_font("Arial", 'B', 12)
            role_text = "👤 User" if role == 'user' else "🤖 Assistant"
            pdf.cell(200, 10, txt=f"Message #{i} - {role_text} - {timestamp}", ln=True)
            
            # Message content
            pdf.set_font("Arial", size=11)
            # Wrap text to fit page width
            pdf.multi_cell(0, 10, txt=message)
            pdf.ln(5)
            
            # Add page break if needed
            if pdf.get_y() > 250:  # Near bottom of page
                pdf.add_page()
        
        # Generate PDF bytes
        return pdf.output(dest='S').encode('latin-1')
    
    def save_pdf_to_file(self, pdf_bytes: bytes, website_id: str, 
                        conversation_id: str) -> str:
        """Save PDF to file and return file path"""
        # Create directory if not exists
        pdf_dir = Path(f"data/{website_id}/chat_history")
        pdf_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"chat_{conversation_id}_{timestamp}.pdf"
        filepath = pdf_dir / filename
        
        # Save PDF
        with open(filepath, 'wb') as f:
            f.write(pdf_bytes)
        
        return str(filepath)
    
    def generate_contact_form_pdf(self, website_id: str, form_data: Dict[str, Any]) -> bytes:
        """Generate PDF for contact form submission"""
        pdf = FPDF()
        pdf.set_auto_page_break(auto=True, margin=15)
        pdf.add_page()
        
        # Title
        pdf.set_font("Arial", 'B', 16)
        pdf.cell(200, 10, txt="Contact Form Submission", ln=True, align='C')
        pdf.ln(5)
        
        # Website info
        pdf.set_font("Arial", size=12)
        pdf.cell(200, 10, txt=f"Website: {website_id}", ln=True)
        pdf.cell(200, 10, txt=f"Submission Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", ln=True)
        pdf.ln(10)
        
        # Form data
        pdf.set_font("Arial", 'B', 14)
        pdf.cell(200, 10, txt="Form Details", ln=True)
        pdf.set_font("Arial", size=12)
        
        fields = [
            ("Name", form_data.get('name', 'N/A')),
            ("Email", form_data.get('email', 'N/A')),
            ("Phone", form_data.get('phone', 'N/A')),
            ("Message", form_data.get('message', 'N/A'))
        ]
        
        for label, value in fields:
            pdf.cell(50, 10, txt=f"{label}:", ln=0)
            if label == "Message":
                pdf.ln(10)
                pdf.multi_cell(0, 10, txt=value)
                pdf.ln(5)
            else:
                pdf.cell(0, 10, txt=value, ln=True)
        
        # Additional form data
        if 'additional_data' in form_data:
            pdf.ln(10)
            pdf.set_font("Arial", 'B', 14)
            pdf.cell(200, 10, txt="Additional Information", ln=True)
            pdf.set_font("Arial", size=12)
            
            for key, value in form_data['additional_data'].items():
                pdf.cell(60, 10, txt=f"{key}:", ln=0)
                pdf.cell(0, 10, txt=str(value), ln=True)
        
        return pdf.output(dest='S').encode('latin-1')

# Singleton instance
pdf_generator = PDFGenerator()