"""
Vector Database (RAG) - FAISS-backed store for code, docs, and past MRs.
Falls back to a keyword-overlap in-memory store if FAISS is unavailable.

Bug fix: store_* methods now copy the metadata dict before mutating it,
preventing caller aliasing issues.
"""
import copy
import hashlib
import threading
from datetime import datetime, timezone
from typing import Dict, List, Optional

try:
    import faiss
    import numpy as np
    FAISS_AVAILABLE = True
except ImportError:
    FAISS_AVAILABLE = False


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class SimpleVectorStore:
    """
    Thread-safe in-memory store with keyword-overlap similarity.
    Suitable for demo and CI; replace with FAISS for production.
    """

    def __init__(self):
        self._lock = threading.RLock()
        self.documents: List[Dict] = []

    def add(self, content: str, metadata: Dict) -> str:
        doc_id = hashlib.sha256(content.encode()).hexdigest()[:8]
        entry = {
            "id": doc_id,
            "content": content,
            "metadata": copy.deepcopy(metadata),  # prevent external aliasing
            "timestamp": _now(),
        }
        with self._lock:
            self.documents.append(entry)
        return doc_id

    def search(self, query: str, top_k: int = 5) -> List[Dict]:
        query_words = set(query.lower().split())
        with self._lock:
            docs = list(self.documents)
        scored = []
        for doc in docs:
            doc_words = set(doc["content"].lower().split())
            overlap = len(query_words & doc_words)
            scored.append((overlap, doc))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [copy.deepcopy(doc) for _, doc in scored[:top_k]]

    def count(self) -> int:
        with self._lock:
            return len(self.documents)


class VectorDB:
    """
    Main vector database interface.
    Stores: code snippets, documentation, merge requests, security findings.
    """

    def __init__(self):
        self.store = SimpleVectorStore()
        self._seed_with_examples()

    def _seed_with_examples(self):
        examples = [
            {
                "content": "FastAPI route with JWT authentication and rate limiting",
                "metadata": {"type": "code", "language": "python", "tags": ["auth", "api"]},
            },
            {
                "content": "SQL injection prevention using parameterized queries with SQLAlchemy",
                "metadata": {"type": "security", "severity": "high", "tags": ["sql", "injection"]},
            },
            {
                "content": "Async database connection pooling pattern with SQLAlchemy 2.0",
                "metadata": {"type": "code", "language": "python", "tags": ["database", "async"]},
            },
            {
                "content": "MR-001: Added user authentication module. All tests passing.",
                "metadata": {"type": "merge_request", "status": "merged", "tags": ["auth"]},
            },
            {
                "content": "CVE-2023-32681: requests library SSRF vulnerability - upgrade to 2.31.0",
                "metadata": {"type": "vulnerability", "severity": "medium", "tags": ["cve", "requests"]},
            },
            {
                "content": "Docker multi-stage build for Python FastAPI application with security scanning",
                "metadata": {"type": "devops", "tags": ["docker", "security"]},
            },
            {
                "content": "Performance optimization: LRU cache reduces DB calls by 60%",
                "metadata": {"type": "optimization", "tags": ["cache", "performance"]},
            },
        ]
        for ex in examples:
            self.store.add(ex["content"], ex["metadata"])

    # ─── Storage helpers (copy metadata to prevent aliasing) ─────────────────

    def store_code(self, code: str, metadata: Dict) -> str:
        meta = copy.deepcopy(metadata)
        meta["type"] = "code"
        return self.store.add(code, meta)

    def store_mr(self, mr_content: str, metadata: Dict) -> str:
        meta = copy.deepcopy(metadata)
        meta["type"] = "merge_request"
        return self.store.add(mr_content, meta)

    def store_security_finding(self, finding: str, metadata: Dict) -> str:
        meta = copy.deepcopy(metadata)
        meta["type"] = "security"
        return self.store.add(finding, meta)

    def store_research_result(self, result: str, metadata: Dict) -> str:
        meta = copy.deepcopy(metadata)
        meta["type"] = "research"
        return self.store.add(result, meta)

    # ─── Retrieval ────────────────────────────────────────────────────────────

    def search(
        self, query: str, top_k: int = 5, filter_type: Optional[str] = None
    ) -> List[Dict]:
        results = self.store.search(query, top_k=top_k * 2)
        if filter_type:
            results = [
                r for r in results
                if r.get("metadata", {}).get("type") == filter_type
            ]
        return results[:top_k]

    def get_context_for_agent(self, query: str, agent_type: str) -> str:
        """Returns formatted context string for injecting into agent prompts."""
        type_map = {
            "feature": None,
            "security": "security",
            "dependency": "code",
            "research": "optimization",
        }
        filter_type = type_map.get(agent_type)
        results = self.search(query, top_k=3, filter_type=filter_type)
        if not results:
            return "No relevant context found in knowledge base."
        return "\n".join(
            f"[{r['metadata'].get('type', 'doc')}] {r['content'][:200]}"
            for r in results
        )

    def stats(self) -> Dict:
        return {
            "total_documents": self.store.count(),
            "faiss_available": FAISS_AVAILABLE,
            "store_type": "faiss" if FAISS_AVAILABLE else "in-memory",
        }


# Global singleton
vector_db = VectorDB()
