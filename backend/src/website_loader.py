#website_loader

import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
from typing import List, Dict, Set, Tuple, Optional
import time
import re
import json
from datetime import datetime
import concurrent.futures
import asyncio
from playwright.async_api import async_playwright
import nest_asyncio

# Apply nest_asyncio to handle nested event loops
nest_asyncio.apply()

class WebsiteLoader:
    def __init__(self, max_pages=50, max_depth=3):
        self.max_pages = max_pages
        self.max_depth = max_depth
        self.visited_urls = set()
        self.base_domain = None
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        })
        self.session.verify = False
        self.session.timeout = 30
        
    def _clean_text(self, text: str) -> str:
        """Clean extracted text"""
        return " ".join(text.split())
    
    async def _extract_visible_text_playwright(self, page) -> str:
        """Extract visible text using Playwright (from your reference code)"""
        html = await page.content()
        soup = BeautifulSoup(html, "html.parser")

        # Remove unwanted elements exactly as in reference code
        for tag in soup(["script", "style", "noscript"]):
            tag.decompose()

        # Get text with proper spacing
        text = soup.get_text(" ")
        return self._clean_text(text)
    
    async def _crawl_react_website_comprehensive(self, url: str) -> List[Tuple[str, str, BeautifulSoup]]:
        """Comprehensive React website crawler based on your reference code"""
        print(f"🔍 Using comprehensive Playwright crawler for React website: {url}")
        
        all_pages = []
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()

            # Navigate to base URL
            await page.goto(url)
            await page.wait_for_timeout(4000)  # Wait for initial render

            # Extract home page
            home_text = await self._extract_visible_text_playwright(page)
            home_html = await page.content()
            home_soup = BeautifulSoup(home_html, "html.parser")
            
            all_pages.append((url, home_text, home_soup))
            self.visited_urls.add(url)
            
            print(f"✅ Extracted home page: {len(home_text)} chars")
            
            # Get ALL links from the page
            links = await page.query_selector_all("a")
            print(f"🔗 Found {len(links)} total links on home page")
            
            visited = set([url])
            links_to_visit = []
            
            # Process all links
            for link in links:
                try:
                    href = await link.get_attribute("href")
                    
                    if not href:
                        continue
                    
                    # Skip anchors, javascript, mailto, tel
                    if href.startswith(('#', 'javascript:', 'mailto:', 'tel:')):
                        continue
                    
                    # Make absolute URL
                    if href.startswith('/'):
                        full_url = urljoin(url, href)
                    elif 'http' in href:
                        full_url = href
                    else:
                        full_url = urljoin(url, href)
                    
                    # Normalize URL
                    parsed = urlparse(full_url)
                    full_url = parsed._replace(fragment='').geturl()
                    
                    # Check if same domain
                    if parsed.netloc != self.base_domain:
                        continue
                    
                    # Check if already visited or queued
                    if full_url in visited or full_url in links_to_visit:
                        continue
                    
                    # Check if binary file
                    if self._is_binary_file(full_url):
                        continue
                    
                    # Check if excluded URL
                    if self._is_excluded_url(full_url):
                        continue
                    
                    links_to_visit.append(full_url)
                    
                except Exception as e:
                    print(f"⚠️ Error processing link: {e}")
                    continue
            
            print(f"📋 Will visit {len(links_to_visit)} internal links")
            
            # Visit each link (EXACTLY as in your reference code)
            for i, link_url in enumerate(links_to_visit):
                if len(visited) >= self.max_pages:
                    break
                
                try:
                    print(f"  [{i+1}/{len(links_to_visit)}] Clicking link to: {link_url}")
                    
                    # Try to click the link directly first (like reference code)
                    try:
                        # Find the link again
                        await page.goto(url)  # Go back to home
                        await page.wait_for_timeout(1000)
                        
                        link_selector = f'a[href*="{link_url.split("/")[-1]}"]'
                        await page.click(link_selector)
                        await page.wait_for_timeout(3000)
                        
                    except:
                        # If clicking fails, navigate directly
                        await page.goto(link_url)
                        await page.wait_for_timeout(3000)
                    
                    # Get current URL after navigation
                    current_url = page.url
                    
                    if current_url in visited:
                        await page.go_back()
                        await page.wait_for_timeout(1000)
                        continue
                    
                    visited.add(current_url)
                    self.visited_urls.add(current_url)
                    
                    # Extract text
                    page_text = await self._extract_visible_text_playwright(page)
                    page_html = await page.content()
                    page_soup = BeautifulSoup(page_html, "html.parser")
                    
                    all_pages.append((current_url, page_text, page_soup))
                    
                    print(f"    ✅ Extracted: {current_url} ({len(page_text)} chars)")
                    
                    # Go back to continue with other links
                    await page.go_back()
                    await page.wait_for_timeout(1000)
                    
                except Exception as e:
                    print(f"    ❌ Error extracting {link_url}: {str(e)[:100]}")
                    continue
            
            await browser.close()
            
            print(f"🎯 Comprehensive React crawl completed: {len(all_pages)} pages extracted")
        
        return all_pages
    
    def extract_website_data(self, url: str) -> List[Dict[str, any]]:
        """Extract all content from website with DEEP comprehensive processing"""
        parsed_url = urlparse(url)
        self.base_domain = parsed_url.netloc
        self.visited_urls.clear()
        
        # Ensure URL has scheme
        if not parsed_url.scheme:
            url = "https://" + url
        
        print(f"🚀 Starting DEEP comprehensive extraction from: {url}")
        print(f"🔧 Max pages: {self.max_pages}, Max depth: {self.max_depth}")
        
        # Step 1: Detect website type
        is_react = self._detect_react_website_sync(url)
        
        # Step 2: Deep crawl based on website type
        all_pages = []
        
        if is_react:
            print("⚛️ Detected React/JavaScript website, using comprehensive Playwright crawler...")
            try:
                # Run the comprehensive React crawler
                all_pages = asyncio.run(self._crawl_react_website_comprehensive(url))
            except Exception as e:
                print(f"❌ React crawl failed with error: {e}")
                print("⚠️ Falling back to traditional crawling...")
                all_pages = self._deep_crawl_website(url)
        else:
            print("🌐 Traditional HTML website, using requests...")
            all_pages = self._deep_crawl_website(url)
        
        # Step 3: Process each page with comprehensive content extraction
        processed_pages = []
        
        print(f"📊 Processing {len(all_pages)} pages with deep content extraction...")
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            future_to_page = {
                executor.submit(self._process_page_deep, page_url, page_content, soup): page_url 
                for page_url, page_content, soup in all_pages
            }
            
            for future in concurrent.futures.as_completed(future_to_page):
                page_url = future_to_page[future]
                try:
                    page_documents = future.result()
                    processed_pages.extend(page_documents)
                    print(f"✅ Processed: {page_url[:50]}... ({len(page_documents)} documents)")
                except Exception as e:
                    print(f"❌ Error processing {page_url}: {e}")
        
        # Step 4: Add metadata and summary documents
        enhanced_pages = self._add_metadata_documents(processed_pages, url)
        
        # Step 5: Save raw data for debugging
        self._save_raw_data(all_pages, processed_pages, url)
        
        print(f"🎉 Extraction complete: {len(enhanced_pages)} total documents")
        print(f"📈 Content types breakdown:")
        
        # Count document types
        doc_types = {}
        for doc in enhanced_pages:
            doc_type = doc.get("metadata", {}).get("content_type", "unknown")
            doc_types[doc_type] = doc_types.get(doc_type, 0) + 1
        
        for doc_type, count in doc_types.items():
            print(f"   • {doc_type}: {count} documents")
        
        return enhanced_pages

    def _save_raw_data(self, all_pages: List[Tuple[str, str, BeautifulSoup]], 
                    processed_pages: List[Dict[str, any]], url: str):
        """Save raw extracted data for debugging"""
        try:
            import json
            from datetime import datetime
            
            # Create debug directory
            domain = self.base_domain.replace('.', '_')
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            debug_dir = f"debug_extraction_{domain}_{timestamp}"
            os.makedirs(debug_dir, exist_ok=True)
            
            # Save all_pages data
            all_pages_data = []
            for page_url, page_content, soup in all_pages:
                all_pages_data.append({
                    "url": page_url,
                    "content_length": len(page_content),
                    "content_preview": page_content[:500] if page_content else "",
                    "title": soup.title.string if soup.title else "",
                    "has_soup": soup is not None
                })
            
            with open(os.path.join(debug_dir, "all_pages.json"), 'w', encoding='utf-8') as f:
                json.dump(all_pages_data, f, indent=2, ensure_ascii=False)
            
            # Save processed pages data
            with open(os.path.join(debug_dir, "processed_pages.json"), 'w', encoding='utf-8') as f:
                json.dump(processed_pages, f, indent=2, ensure_ascii=False)
            
            # Save summary
            summary = {
                "url": url,
                "base_domain": self.base_domain,
                "total_pages": len(all_pages),
                "total_documents": len(processed_pages),
                "visited_urls": list(self.visited_urls),
                "timestamp": datetime.now().isoformat()
            }
            
            with open(os.path.join(debug_dir, "summary.json"), 'w', encoding='utf-8') as f:
                json.dump(summary, f, indent=2, ensure_ascii=False)
            
            print(f"📁 Debug data saved to: {debug_dir}")
            
        except Exception as e:
            print(f"⚠️ Could not save debug data: {e}")
    
    def _detect_react_website_sync(self, url: str) -> bool:
        """Detect if website is React-based (synchronous version)"""
        try:
            response = self.session.get(url, timeout=10)
            soup = BeautifulSoup(response.content, 'html.parser')
            html_str = str(soup).lower()
            
            # Check for React indicators (comprehensive list)
            react_indicators = [
                'react-app', 'react-root', '_next', '__next_data__', 
                'data-reactroot', 'data-reactid', 'react-dom',
                '<!-- react-empty:', 'react-mount-point',
                'id="__next"', 'id="root"', 'class="app"',
                'nextjs-portal', 'next-error', 'next-head'
            ]
            
            # Check HTML for React markers
            for indicator in react_indicators:
                if indicator in html_str:
                    print(f"🔍 Found React indicator: {indicator}")
                    return True
            
            # Check script tags
            scripts = soup.find_all('script')
            for script in scripts:
                src = script.get('src', '')
                if any(keyword in src.lower() for keyword in ['react', 'next', 'vue', 'angular', 'svelte']):
                    print(f"🔍 Found framework script: {src}")
                    return True
            
            # Check for SPA patterns
            # 1. Minimal HTML with root div
            body_elements = soup.find_all(['div', 'p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
            if len(body_elements) < 10 and soup.find('div', id=['root', 'app', '__next']):
                print("🔍 Detected SPA pattern: Minimal HTML with root div")
                return True
            
            # 2. Many script tags
            if len(scripts) > 5:
                print(f"🔍 Many script tags ({len(scripts)}), likely SPA")
                return True
            
            # 3. Check for common React attributes
            for tag in soup.find_all(True):
                attrs = str(tag.attrs).lower()
                if 'react' in attrs or 'data-react' in attrs:
                    print("🔍 Found React attributes")
                    return True
            
            return False
            
        except Exception as e:
            print(f"⚠️ Error detecting React website: {e}")
            return False
    
    def _deep_crawl_website(self, url: str) -> List[Tuple[str, str, BeautifulSoup]]:
        """Deep crawl website with comprehensive link discovery"""
        all_pages = []
        queue = [(url, 0)]  # (url, depth)
        
        while queue and len(self.visited_urls) < self.max_pages:
            current_url, depth = queue.pop(0)
            
            if current_url in self.visited_urls or depth > self.max_depth:
                continue
            
            try:
                print(f"  📥 [Depth {depth}] Crawling: {current_url}")
                
                response = self.session.get(current_url, timeout=20)
                response.raise_for_status()
                
                # Check content type
                content_type = response.headers.get('Content-Type', '')
                if 'text/html' not in content_type.lower():
                    print(f"  ⚠️ Skipping non-HTML: {content_type}")
                    continue
                
                soup = BeautifulSoup(response.content, 'html.parser')
                html_content = response.text
                
                # Add to visited and pages list
                self.visited_urls.add(current_url)
                all_pages.append((current_url, html_content, soup))
                
                # Extract ALL links for deep crawling
                if depth < self.max_depth:
                    links = self._extract_all_links(soup, current_url)
                    
                    # Add new links to queue
                    for link_url in links:
                        if (link_url not in self.visited_urls and 
                            link_url not in [u for u, _ in queue] and
                            len(self.visited_urls) + len(queue) < self.max_pages):
                            queue.append((link_url, depth + 1))
                
                # Rate limiting
                time.sleep(0.2)
                
            except requests.exceptions.Timeout:
                print(f"  ⏰ Timeout crawling {current_url}")
            except requests.exceptions.SSLError:
                print(f"  🔒 SSL error for {current_url}")
                try:
                    response = self.session.get(current_url, verify=False, timeout=20)
                    if response.status_code == 200:
                        soup = BeautifulSoup(response.content, 'html.parser')
                        html_content = response.text
                        self.visited_urls.add(current_url)
                        all_pages.append((current_url, html_content, soup))
                except Exception as e:
                    print(f"  ❌ SSL retry failed: {e}")
            except Exception as e:
                print(f"  ❌ Error crawling {current_url}: {str(e)[:100]}")
        
        print(f"  📊 Crawl completed: {len(all_pages)} pages found")
        return all_pages
    
    def _extract_all_links(self, soup: BeautifulSoup, base_url: str) -> Set[str]:
        """Extract ALL crawlable links from page"""
        links = set()
        
        for link in soup.find_all('a', href=True):
            href = link['href'].strip()
            if not href or href.startswith(('mailto:', 'tel:', 'javascript:', '#')):
                continue
            
            # Handle relative URLs
            try:
                full_url = urljoin(base_url, href)
                parsed_url = urlparse(full_url)
                
                # Normalize URL
                full_url = parsed_url._replace(fragment='').geturl()
                
                # Only follow links from same domain
                if parsed_url.netloc == self.base_domain:
                    # Check if it's a binary file
                    if self._is_binary_file(full_url):
                        continue
                    
                    # Check if it's an excluded URL pattern
                    if self._is_excluded_url(full_url):
                        continue
                    
                    links.add(full_url)
            except:
                continue
        
        return links
    
    def _process_page_deep(self, url: str, html_content: str, soup: BeautifulSoup) -> List[Dict[str, any]]:
        """Process a single page with DEEP content extraction"""
        documents = []
        
        try:
            # Extract page title
            title = soup.title.string if soup.title else url
            
            # Strategy 1: Extract main content with multiple methods
            main_content = self._extract_deep_content(soup)
            
            if main_content and len(main_content) > 100:
                # Create main content document
                main_doc = {
                    "url": url,
                    "title": str(title)[:200],
                    "content": main_content,
                    "text": main_content,
                    "metadata": {
                        "source": url,
                        "domain": self.base_domain,
                        "length": len(main_content),
                        "content_type": "main_content",
                        "extraction_method": "deep_crawl",
                        "timestamp": datetime.now().isoformat()
                    }
                }
                documents.append(main_doc)
            
            # Strategy 2: Extract full page text
            full_text = soup.get_text(separator='\n', strip=True)
            cleaned_text = self._clean_extracted_content(full_text)
            
            if cleaned_text and len(cleaned_text) > 100:
                full_text_doc = {
                    "url": url,
                    "title": f"{title} - Full Text",
                    "content": cleaned_text,
                    "text": cleaned_text,
                    "metadata": {
                        "source": url,
                        "domain": self.base_domain,
                        "length": len(cleaned_text),
                        "content_type": "full_text",
                        "extraction_method": "deep_crawl",
                        "timestamp": datetime.now().isoformat()
                    }
                }
                documents.append(full_text_doc)
            
            # Strategy 3: Extract structured content by sections
            section_docs = self._extract_content_by_sections(soup, url, title)
            documents.extend(section_docs)
            
            # Strategy 4: Extract headings structure
            headings_content = self._extract_headings_structure(soup)
            if headings_content:
                headings_doc = {
                    "url": url,
                    "title": f"{title} - Headings Structure",
                    "content": headings_content,
                    "text": headings_content,
                    "metadata": {
                        "source": url,
                        "domain": self.base_domain,
                        "content_type": "headings_structure",
                        "extraction_method": "deep_crawl",
                        "timestamp": datetime.now().isoformat()
                    }
                }
                documents.append(headings_doc)
            
            # Strategy 5: Extract metadata and SEO information
            metadata_content = self._extract_seo_metadata(soup, url)
            if metadata_content:
                metadata_doc = {
                    "url": url,
                    "title": f"{title} - SEO Metadata",
                    "content": metadata_content,
                    "text": metadata_content,
                    "metadata": {
                        "source": url,
                        "domain": self.base_domain,
                        "content_type": "seo_metadata",
                        "extraction_method": "deep_crawl",
                        "timestamp": datetime.now().isoformat()
                    }
                }
                documents.append(metadata_doc)
            
            # Strategy 6: Extract lists and tables
            lists_content = self._extract_lists_and_tables(soup)
            if lists_content:
                lists_doc = {
                    "url": url,
                    "title": f"{title} - Lists & Tables",
                    "content": lists_content,
                    "text": lists_content,
                    "metadata": {
                        "source": url,
                        "domain": self.base_domain,
                        "content_type": "lists_tables",
                        "extraction_method": "deep_crawl",
                        "timestamp": datetime.now().isoformat()
                    }
                }
                documents.append(lists_doc)
            
        except Exception as e:
            print(f"  ❌ Error in deep processing {url}: {e}")
        
        return documents
    
    def _extract_deep_content(self, soup: BeautifulSoup) -> str:
        """Extract content using DEEP multiple strategies"""
        content_parts = []
        
        # Strategy 1: Extract from semantic HTML5 elements
        semantic_elements = [
            ('main', 'Main Content'),
            ('article', 'Article Content'),
            ('section', 'Section Content'),
            ('div[class*="content"]', 'Content Div'),
            ('div[class*="main"]', 'Main Div'),
            ('div[class*="article"]', 'Article Div'),
            ('div[class*="post"]', 'Post Content'),
            ('div[class*="entry"]', 'Entry Content'),
            ('div[class*="body"]', 'Body Content'),
            ('div[class*="text"]', 'Text Content'),
            ('div[class*="story"]', 'Story Content'),
            ('div[class*="page"]', 'Page Content'),
            ('div[id*="content"]', 'Content ID'),
            ('div[id*="main"]', 'Main ID'),
            ('div[id*="article"]', 'Article ID'),
        ]
        
        for selector, label in semantic_elements:
            try:
                elements = soup.select(selector)
                for element in elements[:3]:  # Limit to first 3 matches
                    # Clone element to avoid modifying original
                    element_copy = BeautifulSoup(str(element), 'html.parser')
                    
                    # Remove unwanted elements
                    for unwanted in element_copy.select('script, style, nav, header, footer, aside, form, iframe, noscript'):
                        unwanted.decompose()
                    
                    # Remove empty elements
                    for empty in element_copy.find_all(lambda tag: not tag.get_text(strip=True)):
                        empty.decompose()
                    
                    text = element_copy.get_text(separator='\n', strip=True)
                    if text and len(text) > 100:
                        content_parts.append(f"=== {label} ===\n{text}\n")
            except:
                continue
        
        # Strategy 2: Extract all paragraphs with context
        paragraphs = soup.find_all(['p', 'div'])
        paragraph_texts = []
        
        for para in paragraphs:
            # Skip if parent is already processed
            if para.find_parents(['main', 'article', 'section', 'div[class*="content"]', 'div[class*="main"]']):
                continue
            
            text = para.get_text(strip=True)
            if text and len(text) > 30:  # Minimum paragraph length
                # Check if it's meaningful content (not just navigation/menu)
                if not self._is_navigation_text(text):
                    paragraph_texts.append(text)
        
        if paragraph_texts:
            content_parts.append("=== Paragraphs ===\n" + '\n'.join(paragraph_texts) + "\n")
        
        # Strategy 3: Extract headings with following content
        headings = soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
        heading_sections = []
        
        for heading in headings:
            heading_text = heading.get_text(strip=True)
            if heading_text and len(heading_text) < 200:
                # Get content after heading until next heading
                section_content = []
                next_elem = heading.find_next_sibling()
                
                while next_elem and next_elem.name not in ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']:
                    if next_elem.name in ['p', 'div', 'span']:
                        elem_text = next_elem.get_text(strip=True)
                        if elem_text and len(elem_text) > 20:
                            section_content.append(elem_text)
                    next_elem = next_elem.find_next_sibling()
                
                if section_content:
                    heading_sections.append(f"{heading.name.upper()}: {heading_text}\n" + '\n'.join(section_content[:5]))
        
        if heading_sections:
            content_parts.append("=== Heading Sections ===\n" + '\n\n'.join(heading_sections) + "\n")
        
        # Strategy 4: Extract from common content patterns
        content_patterns = [
            ('meta[name="description"]', 'content', 'Meta Description'),
            ('meta[property="og:description"]', 'content', 'OpenGraph Description'),
            ('meta[name="twitter:description"]', 'content', 'Twitter Description'),
            ('meta[name="keywords"]', 'content', 'Keywords'),
        ]
        
        for selector, attr, label in content_patterns:
            elements = soup.select(selector)
            for element in elements:
                content = element.get(attr, '').strip()
                if content:
                    content_parts.append(f"=== {label} ===\n{content}\n")
        
        # Combine all content
        combined_content = '\n'.join(content_parts)
        cleaned_content = self._clean_extracted_content(combined_content)
        
        return cleaned_content
    
    def _extract_content_by_sections(self, soup: BeautifulSoup, url: str, title: str) -> List[Dict[str, any]]:
        """Extract content organized by page sections"""
        sections = []
        
        # Common section selectors
        section_selectors = [
            'header', 'nav', 'main', 'article', 'section', 
            'aside', 'footer', '.header', '.navbar', '.main',
            '.content', '.article', '.post', '.entry', '.body',
            '.section', '.aside', '.sidebar', '.footer'
        ]
        
        for selector in section_selectors:
            elements = soup.select(selector)
            for idx, element in enumerate(elements[:5]):  # Limit to first 5 of each type
                # Remove unwanted elements
                element_copy = BeautifulSoup(str(element), 'html.parser')
                for unwanted in element_copy.select('script, style, iframe, noscript'):
                    unwanted.decompose()
                
                text = element_copy.get_text(separator='\n', strip=True)
                if text and len(text) > 50:
                    section_name = selector.replace('.', '').replace('#', '')
                    
                    section_doc = {
                        "url": url,
                        "title": f"{title} - {section_name.capitalize()} {idx+1}",
                        "content": text,
                        "text": text,
                        "metadata": {
                            "source": url,
                            "domain": self.base_domain,
                            "section": section_name,
                            "section_index": idx,
                            "length": len(text),
                            "content_type": "section_content",
                            "extraction_method": "deep_crawl",
                            "timestamp": datetime.now().isoformat()
                        }
                    }
                    sections.append(section_doc)
        
        return sections
    
    def _extract_headings_structure(self, soup: BeautifulSoup) -> str:
        """Extract hierarchical headings structure with context"""
        headings = []
        
        for i in range(1, 7):
            level_headings = soup.find_all(f'h{i}')
            for heading in level_headings:
                text = heading.get_text(strip=True)
                if text and len(text) < 300:
                    # Get parent context
                    parent = heading.find_parent(['div', 'section', 'article', 'main'])
                    parent_class = parent.get('class', [''])[0] if parent and parent.get('class') else ''
                    
                    headings.append({
                        'level': i,
                        'text': text,
                        'parent': parent_class,
                        'full_path': f"{'#' * i} {text} [in: {parent_class}]"
                    })
        
        if headings:
            # Organize by hierarchy
            organized = []
            for heading in headings:
                organized.append(heading['full_path'])
            
            return '\n'.join(organized)
        return ""
    
    def _extract_seo_metadata(self, soup: BeautifulSoup, url: str) -> str:
        """Extract comprehensive SEO metadata"""
        metadata = []
        
        # Basic metadata
        title = soup.title.string if soup.title else "No Title"
        metadata.append(f"Page Title: {title}")
        
        # Meta tags
        meta_tags = soup.find_all('meta')
        for tag in meta_tags:
            name = tag.get('name', '') or tag.get('property', '')
            content = tag.get('content', '')
            
            if name and content and len(content) < 500:
                if any(keyword in name.lower() for keyword in ['description', 'keyword', 'title', 'og:', 'twitter:']):
                    metadata.append(f"{name}: {content}")
        
        # Canonical URL
        canonical = soup.find('link', rel='canonical')
        if canonical and canonical.get('href'):
            metadata.append(f"Canonical URL: {canonical.get('href')}")
        
        # Structured data
        structured_data = soup.find_all('script', type='application/ld+json')
        if structured_data:
            metadata.append(f"Structured Data Found: {len(structured_data)} items")
        
        # Headings count
        for i in range(1, 7):
            count = len(soup.find_all(f'h{i}'))
            if count > 0:
                metadata.append(f"H{i} Count: {count}")
        
        # Word count estimate
        all_text = soup.get_text()
        word_count = len(all_text.split())
        metadata.append(f"Estimated Word Count: {word_count}")
        
        if metadata:
            return '\n'.join(metadata)
        return ""
    
    def _extract_lists_and_tables(self, soup: BeautifulSoup) -> str:
        """Extract content from lists and tables"""
        extracted = []
        
        # Lists
        lists = soup.find_all(['ul', 'ol'])
        for list_elem in lists[:10]:  # Limit to first 10 lists
            items = list_elem.find_all('li')
            if items:
                list_content = []
                for item in items[:20]:  # Limit to 20 items per list
                    text = item.get_text(strip=True)
                    if text and len(text) < 500:
                        list_content.append(f"• {text}")
                
                if list_content:
                    extracted.append("List:\n" + '\n'.join(list_content))
        
        # Tables
        tables = soup.find_all('table')
        for table in tables[:5]:  # Limit to first 5 tables
            rows = table.find_all('tr')
            if rows:
                table_content = []
                for row in rows[:10]:  # Limit to 10 rows
                    cells = row.find_all(['td', 'th'])
                    cell_texts = [cell.get_text(strip=True) for cell in cells if cell.get_text(strip=True)]
                    if cell_texts:
                        table_content.append(' | '.join(cell_texts))
                
                if table_content:
                    extracted.append("Table:\n" + '\n'.join(table_content))
        
        if extracted:
            return '\n\n'.join(extracted)
        return ""
    
    def _clean_extracted_content(self, content: str) -> str:
        """Clean and normalize extracted content"""
        if not content:
            return ""
        
        # Remove extra whitespace
        content = re.sub(r'\n\s*\n', '\n\n', content)
        content = re.sub(r'[ \t]+', ' ', content)
        
        # Remove common noise patterns
        noise_patterns = [
            r'^(\d+\.?\s*)$',
            r'^[•\-*]\s*$',
            r'^©\s*\d{4}.*$',
            r'^All rights reserved.*$',
            r'^Privacy Policy.*$',
            r'^Terms of Service.*$',
            r'^Cookie Policy.*$',
            r'^Back to top.*$',
            r'^Scroll to top.*$',
            r'^Loading.*$',
            r'^Please wait.*$',
            r'^[\s\S]{0,5}@[\s\S]{0,20}\.(com|org|net|edu|gov)$',  # Email addresses
        ]
        
        lines = content.split('\n')
        cleaned_lines = []
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Skip very short lines that are likely noise
            if len(line) < 3 and re.match(r'^[\W\d]*$', line):
                continue
            
            # Skip noise patterns
            if any(re.match(pattern, line, re.IGNORECASE) for pattern in noise_patterns):
                continue
            
            # Skip common navigation/menu text
            if self._is_navigation_text(line):
                continue
            
            cleaned_lines.append(line)
        
        # Join and remove excessive newlines
        result = '\n'.join(cleaned_lines)
        result = re.sub(r'(\n){3,}', '\n\n', result)
        
        return result
    
    def _is_navigation_text(self, text: str) -> bool:
        """Check if text is likely navigation/menu content"""
        navigation_keywords = [
            'home', 'about', 'services', 'contact', 'login', 'sign up', 'signup',
            'register', 'cart', 'shop', 'products', 'blog', 'news', 'careers',
            'faq', 'help', 'support', 'privacy', 'terms', 'cookie', 'policy',
            'menu', 'navigation', 'nav', 'sidebar', 'header', 'footer'
        ]
        
        text_lower = text.lower()
        
        # Check for navigation patterns
        if len(text) < 30 and any(keyword in text_lower for keyword in navigation_keywords):
            return True
        
        # Check for button-like text
        if re.match(r'^[A-Z][a-z]+(\s[A-Z][a-z]+)*$', text) and len(text) < 25:
            return True
        
        return False
    
    def _add_metadata_documents(self, processed_pages: List[Dict], base_url: str) -> List[Dict]:
        """Add metadata and summary documents to the collection"""
        enhanced_pages = processed_pages.copy()
        
        if not processed_pages:
            return enhanced_pages
        
        # Create comprehensive summary document
        total_content = sum(len(p.get('content', '')) for p in processed_pages)
        total_words = sum(len(p.get('content', '').split()) for p in processed_pages)
        
        # Group by content type
        content_by_type = {}
        for doc in processed_pages:
            doc_type = doc.get("metadata", {}).get("content_type", "unknown")
            if doc_type not in content_by_type:
                content_by_type[doc_type] = []
            content_by_type[doc_type].append(doc)
        
        # Determine website type based on extraction method
        website_type = "React/SPA" if any("playwright" in str(p.get('metadata', {})) for p in processed_pages) else "Traditional HTML"
        
        summary_content = f"""
        ===== WEBSITE EXTRACTION COMPREHENSIVE SUMMARY =====
        
        Source Website: {base_url}
        Domain: {self.base_domain}
        Website Type: {website_type}
        Extraction Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
        
        ===== STATISTICS =====
        Total Pages Processed: {len(self.visited_urls)}
        Total Documents Extracted: {len(processed_pages)}
        Total Content Characters: {total_content:,}
        Estimated Total Words: {total_words:,}
        
        ===== DOCUMENT TYPE BREAKDOWN =====
        {chr(10).join(f'- {doc_type}: {len(docs)} documents' for doc_type, docs in content_by_type.items())}
        
        ===== TOP PAGES BY CONTENT LENGTH =====
        {chr(10).join(f'- {p.get("title", "Untitled")[:50]}... ({len(p.get("content", "")):,} chars)' for p in sorted(processed_pages, key=lambda x: len(x.get('content', '')), reverse=True)[:10])}
        
        ===== EXTRACTION METHODOLOGY =====
        • Website Type: {website_type}
        • Extraction Method: {"Playwright (for React/SPA)" if website_type == "React/SPA" else "Requests + BeautifulSoup"}
        • Deep crawling up to {self.max_depth} levels
        • Multiple content extraction strategies per page
        • Parallel processing for efficiency
        • Comprehensive cleaning and normalization
        
        ===== CONTENT TYPES INCLUDED =====
        • Main content from semantic HTML elements
        • Full page text
        • Section-based content
        • Headings structure
        • SEO metadata
        • Lists and tables
        • Page sections (header, main, footer, etc.)
        
        ===== NOTES =====
        This extraction includes both crawled pages and deep content analysis.
        The chatbot will have access to comprehensive information about the website.
        """
        
        summary_doc = {
            "url": base_url,
            "title": "COMPREHENSIVE EXTRACTION SUMMARY",
            "content": summary_content.strip(),
            "text": summary_content.strip(),
            "metadata": {
                "source": base_url,
                "domain": self.base_domain,
                "website_type": website_type,
                "content_type": "comprehensive_summary",
                "extraction_method": "deep_crawl_summary",
                "timestamp": datetime.now().isoformat(),
                "statistics": {
                    "total_pages": len(self.visited_urls),
                    "total_documents": len(processed_pages),
                    "total_characters": total_content,
                    "total_words": total_words,
                    "document_types": {doc_type: len(docs) for doc_type, docs in content_by_type.items()}
                }
            }
        }
        enhanced_pages.insert(0, summary_doc)  # Add at beginning
        
        # Add sitemap-like document
        sitemap_content = f"""
        ===== WEBSITE SITEMAP =====
        Domain: {self.base_domain}
        Website Type: {website_type}
        Total Pages: {len(self.visited_urls)}
        Crawled URLs:
        
        {chr(10).join(f'- {url}' for url in sorted(list(self.visited_urls)))}
        """
        
        sitemap_doc = {
            "url": base_url,
            "title": "WEBSITE SITEMAP",
            "content": sitemap_content.strip(),
            "text": sitemap_content.strip(),
            "metadata": {
                "source": base_url,
                "domain": self.base_domain,
                "website_type": website_type,
                "content_type": "sitemap",
                "extraction_method": "deep_crawl_sitemap",
                "timestamp": datetime.now().isoformat(),
                "url_count": len(self.visited_urls)
            }
        }
        enhanced_pages.insert(1, sitemap_doc)
        
        return enhanced_pages
    
    def _is_binary_file(self, url: str) -> bool:
        """Check if URL points to a binary file"""
        binary_extensions = [
            '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg', '.webp',
            '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
            '.zip', '.rar', '.tar', '.gz', '.7z',
            '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv',
            '.exe', '.dll', '.so', '.bin', '.woff', '.woff2', '.ttf', '.eot'
        ]
        
        url_lower = url.lower()
        return any(url_lower.endswith(ext) for ext in binary_extensions)
    
    def _is_excluded_url(self, url: str) -> bool:
        """Check if URL should be excluded"""
        excluded_patterns = [
            '/wp-json/', '/wp-admin/', '/wp-content/uploads/', '/wp-includes/',
            '/feed/', '/rss/', '/atom/', '/sitemap.xml', '/sitemap_index.xml',
            '.xml', '.json', '.js', '.css', '.pdf', '.jpg', '.jpeg', '.png', '.gif',
            '/login', '/signup', '/logout', '/admin', '/dashboard',
            '/api/', '/ajax/', '/wp-login.php',
            '/cdn-cgi/', '/_next/', '/static/', '/assets/', '/images/', '/img/',
            '/fonts/', '/uploads/', '/downloads/', '/media/', '/video/', '/audio/',
            '.webmanifest', '.ico', '.txt', '.csv', '.zip', '.rar'
        ]
        
        url_lower = url.lower()
        return any(pattern in url_lower for pattern in excluded_patterns)


# Helper function for backward compatibility
def extract_website_data(url: str, max_pages: int = 50, max_depth: int = 3) -> List[Dict[str, any]]:
    """Helper function to extract website data with DEEP comprehensive processing"""
    loader = WebsiteLoader(max_pages=max_pages, max_depth=max_depth)
    return loader.extract_website_data(url)


# Example usage and testing
if __name__ == "__main__":
    # Test the enhanced loader
    test_url = "https://example.com"
    
    print(f"Testing DEEP extraction on: {test_url}")
    print("=" * 70)
    
    loader = WebsiteLoader(max_pages=20, max_depth=2)
    results = loader.extract_website_data(test_url)
    
    print(f"\n{'=' * 70}")
    print(f"📊 FINAL RESULTS for {test_url}:")
    print(f"Total documents extracted: {len(results)}")
    
    # Show document types
    doc_types = {}
    for doc in results:
        doc_type = doc['metadata'].get('content_type', 'unknown')
        doc_types[doc_type] = doc_types.get(doc_type, 0) + 1
    
    print(f"\nDocument type breakdown:")
    for doc_type, count in doc_types.items():
        print(f"  {doc_type}: {count} documents")
    
    # Show sample content
    if results:
        print(f"\n📝 Sample from first document:")
        content = results[0]['content'][:500]
        print(f"{content}...")
        
        print(f"\n📝 Sample from main content document:")
        main_contents = [doc for doc in results if doc['metadata'].get('content_type') == 'main_content']
        if main_contents:
            content = main_contents[0]['content'][:500]
            print(f"{content}...")