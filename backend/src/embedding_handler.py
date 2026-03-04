import os
import json
import pickle
from typing import List, Dict, Any, Optional
from datetime import datetime
import numpy as np
import uuid
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct, Filter, FieldCondition, 
    MatchValue, PayloadSchemaType
)
from langchain_huggingface import HuggingFaceEndpointEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from dotenv import load_dotenv
from src.token_counter import token_counter

load_dotenv()

class EmbeddingHandler:
    _instance = None
    _initialized = False
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        """Initialize HuggingFace embedding model and Qdrant client - SINGLETON PATTERN"""
        # Skip initialization if already done
        if EmbeddingHandler._initialized:
            return
            
        # Initialize HuggingFace embeddings - FIXED VERSION
        print("🔄 Initializing HuggingFace embeddings model (SINGLETON)...")
        try:
            # Correct initialization for HuggingFaceEndpointEmbeddings
            self.embeddings = HuggingFaceEndpointEmbeddings(
                repo_id="sentence-transformers/all-MiniLM-L6-v2",  # Changed from model_name to repo_id
                task="feature-extraction",  # Add task parameter
                huggingfacehub_api_token=os.getenv("HUGGINGFACEHUB_API_TOKEN"),  # Add API token if needed
            )
            
            # Test embedding generation
            test_embedding = self.embeddings.embed_query("Test query")
            self.dimension = len(test_embedding)
            print(f"✅ HuggingFace embeddings initialized successfully. Dimension: {self.dimension}")
            
        except Exception as e:
            print(f"❌ Error initializing HuggingFace embeddings: {e}")
            raise

        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            separators=["\n\n", "\n", " ", ""],
        )
        
        # Initialize Qdrant client
        qdrant_api_key = os.getenv("QDRANT_CLOUD_API_KEY")
        qdrant_url = os.getenv("QDRANT_CLOUD_URL")
        qdrant_port = int(os.getenv("QDRANT_CLOUD_PORT", 6333))
        
        if not qdrant_api_key or not qdrant_url:
            raise ValueError("QDRANT_CLOUD_API_KEY and QDRANT_CLOUD_URL must be set in environment variables")
        
        print(f"🔄 Initializing Qdrant client (SINGLETON)...")
        self.qdrant_client = QdrantClient(
            url=qdrant_url,
            port=qdrant_port,
            api_key=qdrant_api_key,
            prefer_grpc=True
        )
        
        self.collection_name = os.getenv("QDRANT_COLLECTION_NAME", "chatbot_embeddings")
        
        print(f"✅ Qdrant client initialized: {qdrant_url}")
        
        # Mark as initialized
        EmbeddingHandler._initialized = True

    def ensure_index_exists(self):
        """Ensure that the website_id index exists in the collection"""
        try:
            # Check if collection exists
            collections = self.qdrant_client.get_collections()
            collection_exists = any(c.name == self.collection_name for c in collections.collections)
            
            if not collection_exists:
                print(f"⚠️ Collection {self.collection_name} does not exist yet")
                return False
            
            # Try to create index (will fail if already exists, which is fine)
            try:
                self.qdrant_client.create_payload_index(
                    collection_name=self.collection_name,
                    field_name="website_id",
                    field_schema=PayloadSchemaType.KEYWORD
                )
                print(f"✅ Created index on website_id field")
                return True
            except Exception as e:
                # Index might already exist
                if "already exists" in str(e).lower():
                    print(f"✅ Index on website_id already exists")
                    return True
                else:
                    print(f"⚠️ Could not create index: {e}")
                    return False
                    
        except Exception as e:
            print(f"❌ Error ensuring index exists: {e}")
            return False

    def check_embeddings_exist(self, website_id: str) -> bool:
        """
        Check if embeddings exist for a website in Qdrant Cloud
        This method uses scroll without filter if index doesn't exist
        """
        try:
            # First try with filter (requires index)
            try:
                search_filter = Filter(
                    must=[
                        FieldCondition(
                            key="website_id",
                            match=MatchValue(value=website_id)
                        )
                    ]
                )
                
                count_result = self.qdrant_client.count(
                    collection_name=self.collection_name,
                    count_filter=search_filter,
                    exact=True
                )
                
                has_embeddings = count_result.count > 0
                print(f"📊 Found {count_result.count} embeddings for website {website_id} in Qdrant")
                return has_embeddings
                
            except Exception as filter_error:
                # If filter fails (index missing), fall back to scroll and manual filter
                print(f"⚠️ Filter failed, falling back to scroll: {filter_error}")
                
                # Scroll through all points and filter manually
                all_points = []
                next_page_offset = None
                
                while True:
                    scroll_result = self.qdrant_client.scroll(
                        collection_name=self.collection_name,
                        limit=100,
                        offset=next_page_offset,
                        with_payload=True
                    )
                    
                    all_points.extend(scroll_result[0])
                    next_page_offset = scroll_result[1]
                    
                    if next_page_offset is None:
                        break
                
                # Filter manually
                website_points = [p for p in all_points if p.payload.get("website_id") == website_id]
                has_embeddings = len(website_points) > 0
                
                print(f"📊 Found {len(website_points)} embeddings for website {website_id} via manual filter")
                return has_embeddings
                
        except Exception as e:
            print(f"❌ Error checking embeddings in Qdrant: {e}")
            return False

    # =========================
    # CREATE EMBEDDINGS - ONLY IN QDRANT CLOUD
    # =========================
    def create_embeddings(
        self,
        website_id: str,
        website_data: List[Dict[str, Any]],
        base_dir: str = "data",
        include_uploads: bool = True,
        user_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Create embeddings from website data - store ONLY in Qdrant Cloud"""
        website_dir = os.path.join(base_dir, website_id)
        
        # Create directory if it doesn't exist (for website data only, NOT for embeddings)
        os.makedirs(website_dir, exist_ok=True)

        documents = []
        
        print(f"📊 Processing {len(website_data)} website data items...")
        
        # Process website data - handle different data structures
        for i, page in enumerate(website_data):
            try:
                print(f"\n📄 Processing page {i+1}/{len(website_data)}")
                
                # Extract content based on structure
                content = ""
                metadata = {}
                
                if isinstance(page, dict):
                    # Try different possible content fields
                    if "content" in page:
                        content = page["content"]
                    elif "text" in page:
                        content = page["text"]
                    elif "Content" in page:
                        content = page["Content"]
                    elif "body" in page:
                        content = page["body"]
                    else:
                        # Try to find any text field
                        for key, value in page.items():
                            if isinstance(value, str) and len(value) > 100 and key not in ['metadata', 'url', 'title']:
                                content = value
                                break
                    
                    # If still no content, check if page is a tuple
                    if not content and isinstance(page, tuple) and len(page) >= 2:
                        content = page[1] if len(page) > 1 else ""
                    
                    # Extract metadata
                    if "metadata" in page and isinstance(page["metadata"], dict):
                        metadata.update(page["metadata"])
                    
                    # Add additional info from page
                    for key, value in page.items():
                        if key not in ["content", "text", "Content", "body", "metadata"]:
                            if isinstance(value, (str, int, float)):
                                metadata[key] = value
                
                # Convert content to string if not already
                if content and not isinstance(content, str):
                    try:
                        content = str(content)
                    except:
                        content = ""
                
                # Skip if no content found
                if not content or len(content.strip()) < 50:
                    print(f"⚠️ Skipping page {i+1}: No sufficient content (len={len(content) if content else 0})")
                    continue
                
                # Split into chunks
                chunks = self.text_splitter.split_text(content)
                print(f"✂️ Split into {len(chunks)} chunks")
                
                for chunk_idx, chunk in enumerate(chunks):
                    if not chunk.strip():
                        continue
                        
                    # Ensure required fields in metadata
                    doc_metadata = metadata.copy()
                    
                    # Get title from page or metadata
                    title = ""
                    if isinstance(page, dict):
                        title = page.get("title", "")
                        if not title and "metadata" in page and isinstance(page["metadata"], dict):
                            title = page["metadata"].get("title", "")
                    
                    doc_metadata.setdefault("title", title or f"Page {i+1}")
                    doc_metadata.setdefault("url", page.get("url", "") if isinstance(page, dict) else "")
                    doc_metadata.setdefault("source_type", "website")
                    doc_metadata.setdefault("website_id", website_id)
                    doc_metadata.setdefault("page_index", i)
                    doc_metadata.setdefault("chunk_index", chunk_idx)
                    doc_metadata.setdefault("total_chunks", len(chunks))
                    doc_metadata.setdefault("document_id", str(uuid.uuid4()))
                    
                    # Add extraction method if available
                    if isinstance(page, dict) and "metadata" in page and isinstance(page["metadata"], dict):
                        if "extraction_method" in page["metadata"]:
                            doc_metadata["extraction_method"] = page["metadata"]["extraction_method"]
                    
                    documents.append({
                        "text": chunk,
                        "metadata": doc_metadata
                    })
                    
            except Exception as e:
                print(f"❌ Error processing page {i+1}: {e}")
                import traceback
                traceback.print_exc()
                continue

        print(f"✅ Created {len(documents)} total chunks from website content")

        # Process uploaded files if requested
        upload_docs_count = 0
        if include_uploads:
            uploads_docs = self._load_uploaded_documents(website_id, base_dir)
            upload_docs_count = len(uploads_docs)
            documents.extend(uploads_docs)
            print(f"📄 Added {upload_docs_count} upload chunks")

        if not documents:
            raise ValueError("No documents to embed")

        # Save debug info locally (optional - for debugging only, NOT embeddings)
        debug_file = os.path.join(website_dir, "embedding_debug.json")
        try:
            with open(debug_file, 'w', encoding='utf-8') as f:
                debug_data = []
                for doc in documents[:10]:
                    debug_data.append({
                        "text_preview": doc["text"][:200] + "..." if len(doc["text"]) > 200 else doc["text"],
                        "metadata": doc["metadata"],
                        "text_length": len(doc["text"])
                    })
                json.dump(debug_data, f, indent=2, ensure_ascii=False)
            print(f"📝 Saved debug info to {debug_file}")
        except Exception as e:
            print(f"⚠️ Could not save debug file: {e}")

        texts = [doc["text"] for doc in documents]
        
        print(f"\n🤖 Creating embeddings with HuggingFace for {len(texts)} total chunks...")
        
        # Track embedding tokens
        token_data = token_counter.track_embedding_tokens(
            website_id=website_id,
            user_id=user_id,
            texts=texts,
            model="sentence-transformers/all-MiniLM-L6-v2",
            operation_type="training",
            metadata={'document_count': len(documents)}
        )
        
        print(f"📊 Embedding token usage: {token_data['embedding_tokens']} tokens")
        
        # HuggingFace embeddings
        try:
            print("⏳ Generating embeddings with HuggingFace all-MiniLM-L6-v2...")
            vectors = self.embeddings.embed_documents(texts)
            embeddings_np = np.array(vectors).astype("float32")
            
            dimension = embeddings_np.shape[1]
            print(f"📐 Embedding dimension: {dimension}")
            print(f"📊 Number of vectors: {len(vectors)}")
            
            # Store in Qdrant Cloud ONLY (no local storage of embeddings)
            self._store_in_qdrant(website_id, embeddings_np, documents)
            
            # Save only metadata locally, NOT the embeddings
            info = {
                "website_id": website_id,
                "num_chunks": len(documents),
                "num_vectors": len(vectors),
                "embedding_dimension": dimension,
                "embedding_model": "sentence-transformers/all-MiniLM-L6-v2",
                "vector_store": "qdrant_cloud",
                "collection_name": self.collection_name,
                "created_at": datetime.now().isoformat(),
                "includes_uploads": include_uploads,
                "upload_count": upload_docs_count,
                "website_chunks": len(documents) - upload_docs_count,
                "storage_location": "qdrant_cloud_only",
                "embedding_tokens": token_data['embedding_tokens']
            }

            with open(os.path.join(website_dir, "info.json"), "w") as f:
                json.dump(info, f, indent=2)

            print(f"\n✅ Embeddings created successfully and stored in Qdrant Cloud ONLY!")
            print(f"📊 Total chunks: {len(documents)}")
            print(f"📊 Total vectors: {len(vectors)}")
            print(f"🏢 Qdrant collection: {self.collection_name}")
            print(f"💾 Storage: Qdrant Cloud only (no local embedding files)")
            
            return info
            
        except Exception as e:
            print(f"❌ Error creating embeddings: {str(e)}")
            import traceback
            traceback.print_exc()
            
            # Save error info
            error_file = os.path.join(website_dir, "embedding_error.json")
            with open(error_file, 'w') as f:
                json.dump({
                    "error": str(e),
                    "document_count": len(documents),
                    "timestamp": datetime.now().isoformat()
                }, f, indent=2)
            
            raise

    def _store_in_qdrant(self, website_id: str, embeddings: np.ndarray, documents: List[Dict[str, Any]]):
        """Store embeddings in Qdrant collection"""
        try:
            # Check if collection exists
            collections = self.qdrant_client.get_collections()
            collection_exists = False
            for collection in collections.collections:
                if collection.name == self.collection_name:
                    collection_exists = True
                    break
            
            if not collection_exists:
                print(f"📦 Creating new Qdrant collection: {self.collection_name}")
                # Create collection with proper configuration
                self.qdrant_client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=VectorParams(
                        size=embeddings.shape[1],
                        distance=Distance.COSINE
                    )
                )
                print(f"✅ Collection created: {self.collection_name}")
                
                # Create index on website_id for faster filtered searches
                try:
                    self.qdrant_client.create_payload_index(
                        collection_name=self.collection_name,
                        field_name="website_id",
                        field_schema=PayloadSchemaType.KEYWORD
                    )
                    print(f"✅ Created index on website_id field")
                except Exception as e:
                    print(f"⚠️ Could not create index: {e}")
            else:
                print(f"📦 Using existing Qdrant collection: {self.collection_name}")
                # Ensure index exists even for existing collection
                self.ensure_index_exists()
            
            # Prepare points for Qdrant - use sequential integer IDs
            points = []
            for i, (embedding, doc) in enumerate(zip(embeddings, documents)):
                # Use sequential ID (Qdrant accepts integers)
                point_id = i
                
                # Prepare payload
                payload = {
                    "text": doc["text"],
                    "website_id": website_id,
                    "document_id": doc["metadata"].get("document_id", str(uuid.uuid4())),
                    **doc["metadata"]
                }
                
                point = PointStruct(
                    id=point_id,
                    vector=embedding.tolist(),
                    payload=payload
                )
                points.append(point)
            
            print(f"📤 Preparing to upload {len(points)} vectors to Qdrant...")
            
            # Upload in batches
            batch_size = 32
            total_batches = (len(points) - 1) // batch_size + 1
            
            for batch_idx in range(0, len(points), batch_size):
                batch = points[batch_idx:batch_idx + batch_size]
                batch_num = batch_idx // batch_size + 1
                
                print(f"📤 Uploading batch {batch_num}/{total_batches} ({len(batch)} vectors)...")
                
                try:
                    self.qdrant_client.upsert(
                        collection_name=self.collection_name,
                        points=batch,
                        wait=True
                    )
                    print(f"✅ Batch {batch_num}/{total_batches} uploaded successfully")
                except Exception as batch_error:
                    print(f"⚠️ Error uploading batch {batch_num}: {batch_error}")
                    # Try with smaller batch
                    if batch_size > 10:
                        batch_size = max(10, batch_size // 2)
                        print(f"⚠️ Reducing batch size to {batch_size}")
                        continue
                    else:
                        raise
            
            print(f"✅ Successfully stored {len(points)} vectors in Qdrant")
            
            # Verify the upload
            try:
                collection_info = self.qdrant_client.get_collection(self.collection_name)
                print(f"📊 Collection stats: {collection_info.points_count} total points")
            except Exception as e:
                print(f"⚠️ Could not verify collection stats: {e}")
            
        except Exception as e:
            print(f"❌ Error storing in Qdrant: {str(e)}")
            raise

    def _load_uploaded_documents(self, website_id: str, base_dir: str) -> List[Dict[str, Any]]:
        """Load processed documents from uploaded files"""
        upload_dir = os.path.join(base_dir, website_id, "uploads")
        if not os.path.exists(upload_dir):
            return []

        documents = []
        
        # Load uploads metadata
        uploads_meta = os.path.join(upload_dir, "uploads_metadata.json")
        if os.path.exists(uploads_meta):
            try:
                with open(uploads_meta, 'r', encoding='utf-8') as f:
                    uploads_data = json.load(f)
                
                # Process each uploaded file
                for upload in uploads_data:
                    if upload.get('processed', False):
                        processed_file = os.path.join(upload_dir, 
                                                     f"{upload['saved_filename']}_processed.json")
                        if os.path.exists(processed_file):
                            with open(processed_file, 'r', encoding='utf-8') as f:
                                file_docs = json.load(f)
                            
                            for doc in file_docs:
                                if isinstance(doc, dict) and "text" in doc:
                                    doc_metadata = doc.get("metadata", {})
                                    doc_metadata["source_type"] = 'upload'
                                    doc_metadata["upload_filename"] = upload['original_filename']
                                    doc_metadata["uploaded_at"] = upload.get('uploaded_at', '')
                                    doc_metadata["website_id"] = website_id
                                    doc_metadata["document_id"] = str(uuid.uuid4())
                                    
                                    documents.append({
                                        "text": doc["text"],
                                        "metadata": doc_metadata
                                    })
                                
            except Exception as e:
                print(f"⚠️ Error loading uploaded documents: {e}")
        
        return documents

    # =========================
    # SEARCH - ONLY FROM QDRANT CLOUD
    # =========================
    def search_similar_content(
        self,
        website_id: str,
        query: str,
        top_k: int = 5,
        search_uploads: bool = True,
        score_threshold: float = 0.1
    ) -> List[Dict[str, Any]]:
        """
        Search for similar content - ONLY from Qdrant Cloud
        Handles missing index by falling back to manual filtering
        """
        try:
            print(f"🔍 Searching in Qdrant Cloud for: '{query[:50]}...' in website: {website_id}")
            
            # Generate query embedding with HuggingFace
            query_vector = np.array(
                self.embeddings.embed_query(query)
            ).astype("float32").tolist()
            
            # Try search with filter first (requires index)
            try:
                search_filter = Filter(
                    must=[
                        FieldCondition(
                            key="website_id",
                            match=MatchValue(value=website_id)
                        )
                    ]
                )
                
                search_result = self.qdrant_client.query_points(
                    collection_name=self.collection_name,
                    query=query_vector,
                    query_filter=search_filter,
                    limit=top_k * 3,
                    with_payload=True,
                    with_vectors=False,
                    score_threshold=score_threshold
                )
                
                results = []
                for hit in search_result.points:
                    payload = hit.payload
                    similarity = hit.score
                    
                    if not search_uploads:
                        source_type = payload.get("source_type", "website")
                        if source_type != "website":
                            continue
                    
                    results.append({
                        "text": payload.get("text", ""),
                        "metadata": {k: v for k, v in payload.items() if k != "text"},
                        "similarity_score": float(similarity),
                    })
                
                print(f"✅ Found {len(results)} results using filtered search")
                results.sort(key=lambda x: x["similarity_score"], reverse=True)
                return results[:top_k]
                
            except Exception as filter_error:
                # If filter fails (index missing), fall back to scroll and manual filter
                print(f"⚠️ Filtered search failed, falling back to manual filtering: {filter_error}")
                
                # Search without filter first to get candidates
                search_result = self.qdrant_client.query_points(
                    collection_name=self.collection_name,
                    query=query_vector,
                    limit=top_k * 10,  # Get more results to filter
                    with_payload=True,
                    with_vectors=False,
                    score_threshold=score_threshold
                )
                
                results = []
                for hit in search_result.points:
                    payload = hit.payload
                    similarity = hit.score
                    
                    # Manual filter by website_id
                    if payload.get("website_id") != website_id:
                        continue
                    
                    if not search_uploads:
                        source_type = payload.get("source_type", "website")
                        if source_type != "website":
                            continue
                    
                    results.append({
                        "text": payload.get("text", ""),
                        "metadata": {k: v for k, v in payload.items() if k != "text"},
                        "similarity_score": float(similarity),
                    })
                
                print(f"✅ Found {len(results)} results using manual filtering")
                results.sort(key=lambda x: x["similarity_score"], reverse=True)
                return results[:top_k]
            
        except Exception as e:
            print(f"❌ Error searching embeddings in Qdrant: {e}")
            import traceback
            traceback.print_exc()
            return []

    def search_uploaded_content(
        self,
        website_id: str,
        query: str,
        top_k: int = 3,
        score_threshold: float = 0.1
    ) -> List[Dict[str, Any]]:
        """Specifically search uploaded files - ONLY from Qdrant Cloud"""
        try:
            print(f"🔍 Searching uploaded content in Qdrant for: '{query[:50]}...'")
            
            # Generate query embedding
            query_vector = np.array(
                self.embeddings.embed_query(query)
            ).astype("float32").tolist()
            
            # Try filtered search first
            try:
                search_filter = Filter(
                    must=[
                        FieldCondition(
                            key="website_id",
                            match=MatchValue(value=website_id)
                        ),
                        FieldCondition(
                            key="source_type",
                            match=MatchValue(value="upload")
                        )
                    ]
                )
                
                search_result = self.qdrant_client.query_points(
                    collection_name=self.collection_name,
                    query=query_vector,
                    query_filter=search_filter,
                    limit=top_k * 2,
                    with_payload=True,
                    with_vectors=False,
                    score_threshold=score_threshold
                )
                
                results = []
                for hit in search_result.points:
                    payload = hit.payload
                    similarity = hit.score
                    
                    results.append({
                        "text": payload.get("text", ""),
                        "metadata": {k: v for k, v in payload.items() if k != "text"},
                        "similarity_score": float(similarity),
                    })
                
                print(f"✅ Found {len(results)} upload results using filtered search")
                return results[:top_k]
                
            except Exception as filter_error:
                # Fall back to manual filtering
                print(f"⚠️ Filtered upload search failed, falling back to manual filtering")
                
                search_result = self.qdrant_client.query_points(
                    collection_name=self.collection_name,
                    query=query_vector,
                    limit=top_k * 5,
                    with_payload=True,
                    with_vectors=False,
                    score_threshold=score_threshold
                )
                
                results = []
                for hit in search_result.points:
                    payload = hit.payload
                    similarity = hit.score
                    
                    if payload.get("website_id") != website_id:
                        continue
                    
                    if payload.get("source_type") != "upload":
                        continue
                    
                    results.append({
                        "text": payload.get("text", ""),
                        "metadata": {k: v for k, v in payload.items() if k != "text"},
                        "similarity_score": float(similarity),
                    })
                
                print(f"✅ Found {len(results)} upload results using manual filtering")
                return results[:top_k]
            
        except Exception as e:
            print(f"❌ Error searching uploaded content: {e}")
            return []

    def get_document_stats(self, website_id: str) -> Dict[str, Any]:
        """Get statistics about documents in Qdrant"""
        try:
            # Try with filter first
            try:
                search_filter = Filter(
                    must=[
                        FieldCondition(
                            key="website_id",
                            match=MatchValue(value=website_id)
                        )
                    ]
                )
                
                count_result = self.qdrant_client.count(
                    collection_name=self.collection_name,
                    count_filter=search_filter,
                    exact=True
                )
                total_documents = count_result.count
                
            except:
                # Fallback to scroll
                all_points = []
                next_page_offset = None
                
                while True:
                    scroll_result = self.qdrant_client.scroll(
                        collection_name=self.collection_name,
                        limit=100,
                        offset=next_page_offset,
                        with_payload=True
                    )
                    
                    all_points.extend(scroll_result[0])
                    next_page_offset = scroll_result[1]
                    
                    if next_page_offset is None:
                        break
                
                website_points = [p for p in all_points if p.payload.get("website_id") == website_id]
                total_documents = len(website_points)
            
            stats = {
                "total_documents": total_documents,
                "website_documents": 0,
                "upload_documents": 0,
                "document_types": {},
                "file_types": {},
                "vector_store": "qdrant_cloud",
                "collection_name": self.collection_name,
                "storage_location": "qdrant_cloud_only"
            }
            
            # Get type breakdown (limit to 1000 for performance)
            try:
                search_filter = Filter(
                    must=[
                        FieldCondition(
                            key="website_id",
                            match=MatchValue(value=website_id)
                        )
                    ]
                )
                
                scroll_result = self.qdrant_client.scroll(
                    collection_name=self.collection_name,
                    filter=search_filter,
                    limit=1000,
                    with_payload=True
                )
                
                for point in scroll_result[0]:
                    payload = point.payload
                    source_type = payload.get("source_type", "website")
                    
                    if source_type == "website":
                        stats["website_documents"] += 1
                        doc_type = payload.get("type", "unknown")
                        stats["document_types"][doc_type] = stats["document_types"].get(doc_type, 0) + 1
                    else:
                        stats["upload_documents"] += 1
                        file_type = payload.get("type", "unknown")
                        stats["file_types"][file_type] = stats["file_types"].get(file_type, 0) + 1
            except:
                pass
            
            return stats
            
        except Exception as e:
            print(f"❌ Error getting document stats: {e}")
            return {"error": str(e), "vector_store": "qdrant_cloud"}

    def delete_website_embeddings(self, website_id: str):
        """Delete all embeddings for a website from Qdrant"""
        try:
            # Try with filter first
            try:
                filter_condition = Filter(
                    must=[
                        FieldCondition(
                            key="website_id",
                            match=MatchValue(value=website_id)
                        )
                    ]
                )
                
                # Get points to delete
                scroll_result = self.qdrant_client.scroll(
                    collection_name=self.collection_name,
                    filter=filter_condition,
                    limit=100
                )
                
                if scroll_result[0]:
                    points_to_delete = [p.id for p in scroll_result[0]]
                    
                    self.qdrant_client.delete(
                        collection_name=self.collection_name,
                        points_selector=points_to_delete
                    )
                    print(f"✅ Deleted {len(points_to_delete)} embeddings for website: {website_id}")
                
                return True
                
            except:
                # Fallback to manual filtering
                all_points = []
                next_page_offset = None
                
                while True:
                    scroll_result = self.qdrant_client.scroll(
                        collection_name=self.collection_name,
                        limit=100,
                        offset=next_page_offset,
                        with_payload=True
                    )
                    
                    all_points.extend(scroll_result[0])
                    next_page_offset = scroll_result[1]
                    
                    if next_page_offset is None:
                        break
                
                points_to_delete = [p.id for p in all_points if p.payload.get("website_id") == website_id]
                
                if points_to_delete:
                    self.qdrant_client.delete(
                        collection_name=self.collection_name,
                        points_selector=points_to_delete
                    )
                    print(f"✅ Deleted {len(points_to_delete)} embeddings for website: {website_id}")
                
                return True
            
        except Exception as e:
            print(f"❌ Error deleting website embeddings: {e}")
            return False

    def get_collection_stats(self):
        """Get Qdrant collection statistics"""
        try:
            collection_info = self.qdrant_client.get_collection(self.collection_name)
            return {
                "collection_name": self.collection_name,
                "vectors_count": collection_info.vectors_count,
                "points_count": collection_info.points_count,
                "indexed_vectors_count": collection_info.indexed_vectors_count,
                "status": "ok"
            }
        except Exception as e:
            return {
                "error": str(e),
                "collection_name": self.collection_name,
                "status": "error"
            }

    def test_qdrant_connection(self):
        """Test Qdrant connection and basic operations"""
        try:
            # Test connection by getting collections
            collections = self.qdrant_client.get_collections()
            print(f"✅ Qdrant connection successful")
            print(f"📊 Available collections: {[c.name for c in collections.collections]}")
            
            # Test if our collection exists
            collection_exists = any(c.name == self.collection_name for c in collections.collections)
            
            if collection_exists:
                print(f"✅ Collection '{self.collection_name}' exists")
                # Get collection info
                collection_info = self.qdrant_client.get_collection(self.collection_name)
                print(f"📊 Collection stats: {collection_info.points_count} points")
                
                # Ensure index exists
                self.ensure_index_exists()
                
                # Test a simple search
                try:
                    test_vector = [0.1] * self.dimension
                    test_result = self.qdrant_client.query_points(
                        collection_name=self.collection_name,
                        query=test_vector,
                        limit=1,
                        with_payload=False
                    )
                    print(f"✅ Search test successful")
                except Exception as search_error:
                    print(f"⚠️ Search test failed: {search_error}")
            else:
                print(f"⚠️ Collection '{self.collection_name}' does not exist")
            
            return {
                "success": True,
                "connection": "ok",
                "collection_exists": collection_exists,
                "collection_name": self.collection_name,
                "dimension": self.dimension
            }
            
        except Exception as e:
            print(f"❌ Qdrant connection failed: {e}")
            return {
                "success": False,
                "error": str(e),
                "connection": "failed"
            }


class VectorStore:
    """Qdrant Vector Store using HuggingFace embeddings - Cloud only storage"""
    
    _instance = None
    _initialized = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        """Initialize VectorStore - SINGLETON PATTERN"""
        # Skip initialization if already done
        if VectorStore._initialized:
            return
            
        # Initialize HuggingFace embeddings - FIXED VERSION
        print("🔄 Initializing HuggingFace embeddings model (SINGLETON)...")
        try:
            self.embeddings = HuggingFaceEndpointEmbeddings(
                repo_id="sentence-transformers/all-MiniLM-L6-v2",  # Changed from model_name to repo_id
                task="feature-extraction",  # Add task parameter
                huggingfacehub_api_token=os.getenv("HUGGINGFACEHUB_API_TOKEN"),  # Add API token if needed
            )
            
            # Get dimension by testing
            test_embedding = self.embeddings.embed_query("Test")
            self.dimension = len(test_embedding)
            print(f"✅ HuggingFace embeddings initialized. Dimension: {self.dimension}")
            
        except Exception as e:
            print(f"❌ Error initializing HuggingFace embeddings: {e}")
            raise
        
        # Initialize Qdrant client
        qdrant_api_key = os.getenv("QDRANT_CLOUD_API_KEY")
        qdrant_url = os.getenv("QDRANT_CLOUD_URL")
        qdrant_port = int(os.getenv("QDRANT_CLOUD_PORT", 6333))
        
        if not qdrant_api_key or not qdrant_url:
            raise ValueError("QDRANT_CLOUD_API_KEY and QDRANT_CLOUD_URL must be set in environment variables")
        
        print(f"🔄 Initializing Qdrant client (SINGLETON)...")
        self.qdrant_client = QdrantClient(
            url=qdrant_url,
            port=qdrant_port,
            api_key=qdrant_api_key,
            prefer_grpc=True
        )
        
        self.collection_name = os.getenv("QDRANT_COLLECTION_NAME")
        
        # We don't store documents locally anymore
        self.website_id: Optional[str] = None
        
        print(f"✅ Qdrant VectorStore initialized (Cloud only): {qdrant_url}")
        
        # Mark as initialized
        VectorStore._initialized = True

    # =========================
    # CREATE STORE - CLOUD ONLY
    # =========================
    def create_from_documents(
        self,
        documents: List[Dict[str, Any]],
        website_id: str,
        base_dir: str = "data",
    ) -> Dict[str, Any]:
        self.website_id = website_id

        texts = [doc["text"] for doc in documents]
        vectors = self.embeddings.embed_documents(texts)

        embeddings_np = np.array(vectors).astype("float32")
        dimension = embeddings_np.shape[1]

        # Store in Qdrant Cloud ONLY
        self._store_in_qdrant(embeddings_np, documents, website_id)

        # Save only config locally, NOT the embeddings
        store_dir = os.path.join(base_dir, website_id, "vector_store")
        os.makedirs(store_dir, exist_ok=True)
        
        with open(os.path.join(store_dir, "config.json"), "w") as f:
            json.dump(
                {
                    "website_id": website_id,
                    "dimension": dimension,
                    "embedding_model": "sentence-transformers/all-MiniLM-L6-v2",
                    "vector_store": "qdrant_cloud",
                    "collection_name": self.collection_name,
                    "storage_location": "qdrant_cloud_only",
                    "created_at": datetime.now().isoformat(),
                },
                f,
                indent=2,
            )

        return {
            "website_id": website_id,
            "num_documents": len(documents),
            "dimension": dimension,
            "embedding_model": "sentence-transformers/all-MiniLM-L6-v2",
            "vector_store": "qdrant_cloud",
            "collection_name": self.collection_name,
            "storage_location": "qdrant_cloud_only",
            "created_at": datetime.now().isoformat(),
        }

    def _store_in_qdrant(self, embeddings: np.ndarray, documents: List[Dict[str, Any]], website_id: str):
        """Store embeddings in Qdrant"""
        try:
            # Check if collection exists
            collections = self.qdrant_client.get_collections()
            collection_exists = False
            for collection in collections.collections:
                if collection.name == self.collection_name:
                    collection_exists = True
                    break
            
            if not collection_exists:
                print(f"📦 Creating Qdrant collection: {self.collection_name}")
                self.qdrant_client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=VectorParams(
                        size=embeddings.shape[1],
                        distance=Distance.COSINE
                    )
                )
                
                # Create index on website_id for faster filtered searches
                try:
                    self.qdrant_client.create_payload_index(
                        collection_name=self.collection_name,
                        field_name="website_id",
                        field_schema=PayloadSchemaType.KEYWORD
                    )
                    print(f"✅ Created index on website_id field")
                except Exception as e:
                    print(f"⚠️ Could not create index: {e}")
            
            # Prepare points - use sequential integer IDs
            points = []
            for i, (embedding, doc) in enumerate(zip(embeddings, documents)):
                point_id = i  # Simple sequential ID
                
                payload = {
                    "text": doc["text"],
                    "website_id": website_id,
                    "document_id": str(uuid.uuid4()),
                    **doc.get("metadata", {})
                }
                
                point = PointStruct(
                    id=point_id,
                    vector=embedding.tolist(),
                    payload=payload
                )
                points.append(point)
            
            # Upload in smaller batches
            batch_size = 32
            total_batches = (len(points) - 1) // batch_size + 1
            
            for batch_idx in range(0, len(points), batch_size):
                batch = points[batch_idx:batch_idx + batch_size]
                batch_num = batch_idx // batch_size + 1
                
                print(f"📤 Uploading batch {batch_num}/{total_batches} ({len(batch)} vectors)...")
                
                self.qdrant_client.upsert(
                    collection_name=self.collection_name,
                    points=batch,
                    wait=True
                )
                
                print(f"✅ Batch {batch_num}/{total_batches} uploaded")
            
            print(f"✅ Stored {len(points)} vectors in Qdrant Cloud")
            
        except Exception as e:
            print(f"❌ Error storing in Qdrant: {str(e)}")
            raise

    # =========================
    # SEARCH - FROM QDRANT CLOUD
    # =========================
    def similarity_search(
        self,
        query: str,
        k: int = 5,
        score_threshold: float = 0.3,
        website_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Search for similar content - ONLY from Qdrant Cloud
        """
        target_website_id = website_id or self.website_id
        
        if not target_website_id:
            return []

        try:
            # Generate query embedding with HuggingFace
            query_vector = np.array(
                self.embeddings.embed_query(query)
            ).astype("float32").tolist()
            
            # Create filter for website_id
            search_filter = Filter(
                must=[
                    FieldCondition(
                        key="website_id",
                        match=MatchValue(value=target_website_id)
                    )
                ]
            )
            
            # Search with filter
            search_result = self.qdrant_client.query_points(
                collection_name=self.collection_name,
                query=query_vector,
                query_filter=search_filter,
                limit=k * 2,
                with_payload=True,
                with_vectors=False
            )
            
            results = []
            for hit in search_result.points:
                similarity = hit.score
                if similarity >= score_threshold:
                    payload = hit.payload
                    text = payload.pop("text", "")
                    
                    results.append(
                        {
                            "document": {"text": text, "metadata": payload},
                            "metadata": payload,
                            "similarity_score": float(similarity),
                        }
                    )
            
            results.sort(key=lambda x: x["similarity_score"], reverse=True)
            return results[:k]
            
        except Exception as e:
            print(f"❌ Qdrant search error: {e}")
            return []

    # =========================
    # STATS
    # =========================
    def get_stats(self, website_id: Optional[str] = None) -> Dict[str, Any]:
        target_website_id = website_id or self.website_id
        
        stats = {
            "website_id": target_website_id,
            "vector_store": "qdrant_cloud",
            "collection_name": self.collection_name,
            "embedding_model": "sentence-transformers/all-MiniLM-L6-v2",
            "storage_location": "qdrant_cloud_only"
        }
        
        try:
            if target_website_id:
                # Use filter to get only points for this website
                filter_condition = Filter(
                    must=[
                        FieldCondition(
                            key="website_id",
                            match=MatchValue(value=target_website_id)
                        )
                    ]
                )
                
                # Count points for this website
                scroll_result = self.qdrant_client.scroll(
                    collection_name=self.collection_name,
                    filter=filter_condition,
                    limit=1,  # Just get first to count
                    with_payload=False
                )
                
                # Get total count (approximate - would need to scroll all for exact count)
                # For exact count, we can use count_points with filter
                try:
                    count_result = self.qdrant_client.count(
                        collection_name=self.collection_name,
                        count_filter=filter_condition,
                        exact=True
                    )
                    stats["website_documents"] = count_result.count
                except:
                    stats["website_documents"] = len(scroll_result[0])
                
                # Get collection info
                collection_info = self.qdrant_client.get_collection(self.collection_name)
                stats["collection_points"] = collection_info.points_count
            
            return stats
            
        except Exception as e:
            print(f"❌ Error getting stats: {e}")
            stats["error"] = str(e)
            return stats

    def get_collection_info(self):
        """Get Qdrant collection information"""
        try:
            collection_info = self.qdrant_client.get_collection(self.collection_name)
            return {
                "collection_name": self.collection_name,
                "status": "ok",
                "vectors_count": collection_info.vectors_count,
                "points_count": collection_info.points_count,
                "indexed_vectors_count": collection_info.indexed_vectors_count,
                "config": collection_info.config.dict() if collection_info.config else {}
            }
        except Exception as e:
            return {
                "collection_name": self.collection_name,
                "status": "error",
                "error": str(e)
            }