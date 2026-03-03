import os
import json
from typing import List, Dict, Any
from PyPDF2 import PdfReader
from langchain_text_splitters import RecursiveCharacterTextSplitter
import docx
from bs4 import BeautifulSoup

class FileProcessor:
    """Process uploaded files (PDF, DOCX, TXT, HTML) and extract text content"""
    
    def __init__(self):
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            length_function=len,
            separators=["\n\n", "\n", " ", ""]
        )
        
    def process_file(self, file_path: str) -> List[Dict[str, Any]]:
        """Process different file types and extract text content"""
        if not os.path.exists(file_path):
            return [{
                "text": f"File not found: {file_path}",
                "metadata": {"error": True, "source": file_path}
            }]
        
        file_extension = os.path.splitext(file_path)[1].lower()
        
        try:
            if file_extension == '.pdf':
                return self._process_pdf(file_path)
            elif file_extension == '.docx':
                return self._process_docx(file_path)
            elif file_extension == '.txt':
                return self._process_text(file_path)
            elif file_extension == '.html' or file_extension == '.htm':
                return self._process_html(file_path)
            elif file_extension == '.json':
                return self._process_json(file_path)
            else:
                return self._process_unknown(file_path)
        except Exception as e:
            print(f"Error processing file {file_path}: {e}")
            return [{
                "text": f"Error processing file: {str(e)}", 
                "metadata": {"source": file_path, "error": True}
            }]
    
    def _process_pdf(self, file_path: str) -> List[Dict[str, Any]]:
        """Extract text from PDF files"""
        documents = []
        try:
            reader = PdfReader(file_path)
            
            for page_num, page in enumerate(reader.pages):
                text = page.extract_text()
                if text and text.strip():
                    documents.append({
                        "text": text,
                        "metadata": {
                            "source": file_path,
                            "page": page_num + 1,
                            "total_pages": len(reader.pages),
                            "type": "pdf",
                            "filename": os.path.basename(file_path)
                        }
                    })
            
            # Split into chunks if needed
            return self._split_documents(documents)
            
        except Exception as e:
            print(f"Error processing PDF {file_path}: {e}")
            return [{
                "text": f"Could not read PDF file: {str(e)}",
                "metadata": {"source": file_path, "error": True, "type": "pdf"}
            }]
    
    def _process_docx(self, file_path: str) -> List[Dict[str, Any]]:
        """Extract text from DOCX files"""
        try:
            doc = docx.Document(file_path)
            full_text = []
            
            for para in doc.paragraphs:
                if para.text and para.text.strip():
                    full_text.append(para.text)
            
            if full_text:
                text = "\n".join(full_text)
                return [{
                    "text": text,
                    "metadata": {
                        "source": file_path,
                        "type": "docx",
                        "paragraphs": len(full_text),
                        "filename": os.path.basename(file_path)
                    }
                }]
            
            return []
            
        except Exception as e:
            print(f"Error processing DOCX {file_path}: {e}")
            return [{
                "text": f"Could not read DOCX file: {str(e)}",
                "metadata": {"source": file_path, "error": True, "type": "docx"}
            }]
    
    def _process_text(self, file_path: str) -> List[Dict[str, Any]]:
        """Process plain text files"""
        try:
            # Try different encodings
            encodings = ['utf-8', 'utf-8-sig', 'latin-1', 'cp1252']
            
            for encoding in encodings:
                try:
                    with open(file_path, 'r', encoding=encoding) as f:
                        content = f.read()
                    
                    if content and content.strip():
                        return [{
                            "text": content,
                            "metadata": {
                                "source": file_path,
                                "type": "text",
                                "encoding": encoding,
                                "filename": os.path.basename(file_path)
                            }
                        }]
                except UnicodeDecodeError:
                    continue
            
            # If all encodings fail, read as binary
            with open(file_path, 'rb') as f:
                content = f.read()
            
            return [{
                "text": f"Binary file content (size: {len(content)} bytes)",
                "metadata": {
                    "source": file_path,
                    "type": "binary",
                    "filename": os.path.basename(file_path)
                }
            }]
            
        except Exception as e:
            print(f"Error processing text file {file_path}: {e}")
            return [{
                "text": f"Could not read text file: {str(e)}",
                "metadata": {"source": file_path, "error": True, "type": "text"}
            }]
    
    def _process_html(self, file_path: str) -> List[Dict[str, Any]]:
        """Extract text from HTML files"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                html_content = f.read()
            
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # Remove script and style elements
            for script in soup(["script", "style", "nav", "footer"]):
                script.decompose()
            
            # Get text
            text = soup.get_text(separator='\n', strip=True)
            
            # Clean up text
            lines = (line.strip() for line in text.splitlines())
            chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
            text = '\n'.join(chunk for chunk in chunks if chunk)
            
            if text:
                return [{
                    "text": text,
                    "metadata": {
                        "source": file_path,
                        "type": "html",
                        "title": soup.title.string if soup.title else "Untitled",
                        "filename": os.path.basename(file_path)
                    }
                }]
            
            return []
            
        except Exception as e:
            print(f"Error processing HTML {file_path}: {e}")
            return [{
                "text": f"Could not read HTML file: {str(e)}",
                "metadata": {"source": file_path, "error": True, "type": "html"}
            }]
    
    def _process_json(self, file_path: str) -> List[Dict[str, Any]]:
        """Process JSON files"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Convert JSON to text representation
            if isinstance(data, list):
                texts = []
                for i, item in enumerate(data):
                    if isinstance(item, dict):
                        text = json.dumps(item, ensure_ascii=False, indent=2)
                        texts.append({
                            "text": text,
                            "metadata": {
                                "source": file_path,
                                "type": "json",
                                "item_index": i,
                                "total_items": len(data),
                                "filename": os.path.basename(file_path)
                            }
                        })
                    elif isinstance(item, str):
                        texts.append({
                            "text": item,
                            "metadata": {
                                "source": file_path,
                                "type": "json",
                                "item_index": i,
                                "filename": os.path.basename(file_path)
                            }
                        })
                return texts
            elif isinstance(data, dict):
                return [{
                    "text": json.dumps(data, ensure_ascii=False, indent=2),
                    "metadata": {
                        "source": file_path,
                        "type": "json",
                        "filename": os.path.basename(file_path)
                    }
                }]
            else:
                return [{
                    "text": str(data),
                    "metadata": {
                        "source": file_path,
                        "type": "json",
                        "filename": os.path.basename(file_path)
                    }
                }]
            
        except Exception as e:
            print(f"Error processing JSON {file_path}: {e}")
            return [{
                "text": f"Could not read JSON file: {str(e)}",
                "metadata": {"source": file_path, "error": True, "type": "json"}
            }]
    
    def _process_unknown(self, file_path: str) -> List[Dict[str, Any]]:
        """Try to process unknown file types as text"""
        try:
            # Try to read as text first
            result = self._process_text(file_path)
            if result and result[0]["text"]:
                result[0]["metadata"]["type"] = "unknown_text"
                return result
            
            # If text fails, treat as binary
            with open(file_path, 'rb') as f:
                content = f.read()
            
            return [{
                "text": f"Binary file (size: {len(content)} bytes)",
                "metadata": {
                    "source": file_path,
                    "type": "binary",
                    "filename": os.path.basename(file_path)
                }
            }]
            
        except Exception as e:
            return [{
                "text": f"Could not process file: {str(e)}",
                "metadata": {
                    "source": file_path,
                    "type": "unknown",
                    "error": "Failed to read file",
                    "filename": os.path.basename(file_path)
                }
            }]
    
    def _split_documents(self, documents: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Split documents into smaller chunks if they're too large"""
        processed_docs = []
        
        for doc in documents:
            chunks = self.text_splitter.split_text(doc["text"])
            
            for i, chunk in enumerate(chunks):
                processed_docs.append({
                    "text": chunk,
                    "metadata": {
                        **doc["metadata"],
                        "chunk_index": i,
                        "total_chunks": len(chunks)
                    }
                })
        
        return processed_docs
    
    def batch_process_files(self, file_paths: List[str]) -> Dict[str, List[Dict[str, Any]]]:
        """Process multiple files at once"""
        results = {}
        
        for file_path in file_paths:
            if os.path.exists(file_path):
                results[file_path] = self.process_file(file_path)
            else:
                results[file_path] = [{
                    "text": f"File not found: {file_path}",
                    "metadata": {"error": True, "source": file_path}
                }]
        
        return results