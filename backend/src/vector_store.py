import os
import json
import pickle
from typing import List, Dict, Any, Optional
from datetime import datetime
from dotenv import load_dotenv
import numpy as np
import uuid
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue, PayloadSchemaType
)
from langchain_huggingface import HuggingFaceEndpointEmbeddings

load_dotenv()

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
            
        # Initialize HuggingFace embeddings
        print("🔄 Initializing HuggingFace embeddings model (SINGLETON)...")
        try:
            self.embeddings = HuggingFaceEndpointEmbeddings(
                model_name="sentence-transformers/all-MiniLM-L6-v2",
                model_kwargs={'device': 'cpu'},
                encode_kwargs={'normalize_embeddings': True}
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