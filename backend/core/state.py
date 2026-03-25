"""
Hybrid state store: in-memory cache (fast reads) + SQLite write-through (durable).
Thread-safe via RLock. Supports pipeline cancellation and agent status tracking.
"""
import json
import logging
import threading
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

logger = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class PipelineState:
    def __init__(self):
        self._lock = threading.RLock()
        self._pipelines: Dict[str, Dict] = {}
        self._logs: Dict[str, List[Dict]] = {}
        self._sessions: Dict[str, Dict] = {}
        self._cancelled: Set[str] = set()       # pipeline IDs requested for cancellation
        self._running_agents: Dict[str, str] = {}  # pipeline_id -> current agent name
        self._db_available = False

    def init_db(self) -> None:
        try:
            from core.database import PipelineRepository, ResearchRepository, get_db
            with get_db() as db:
                for p in PipelineRepository.list_all(db):
                    self._pipelines[p["id"]] = p
                    self._logs[p["id"]] = PipelineRepository.get_logs(db, p["id"])
                for s in ResearchRepository.list_all(db):
                    self._sessions[s["id"]] = s
            self._db_available = True
            logger.info("State warmed: %d pipelines, %d sessions",
                        len(self._pipelines), len(self._sessions))
        except Exception as exc:
            logger.warning("DB unavailable, in-memory only: %s", exc)
            self._db_available = False

    def _write_db(self, fn, *args, **kwargs) -> None:
        if not self._db_available:
            return
        try:
            from core.database import get_db
            with get_db() as db:
                fn(db, *args, **kwargs)
        except Exception as exc:
            logger.warning("DB write failed (non-fatal): %s", exc)

    # ─── Cancellation ────────────────────────────────────────────────────────

    def request_cancel(self, pid: str) -> bool:
        with self._lock:
            if pid not in self._pipelines:
                return False
            self._cancelled.add(pid)
            return True

    def is_cancelled(self, pid: str) -> bool:
        with self._lock:
            return pid in self._cancelled

    # ─── Agent tracking ──────────────────────────────────────────────────────

    def set_running_agent(self, pid: str, agent_name: str) -> None:
        with self._lock:
            self._running_agents[pid] = agent_name

    def clear_running_agent(self, pid: str) -> None:
        with self._lock:
            self._running_agents.pop(pid, None)

    def get_running_agents(self) -> Dict[str, str]:
        with self._lock:
            return dict(self._running_agents)

    # ─── Pipeline CRUD ────────────────────────────────────────────────────────

    def create_pipeline(self, feature_request: str,
                        gitlab_issue_id: Optional[str] = None) -> str:
        pid = uuid.uuid4().hex[:8]
        stages = {
            "feature_agent": "pending",
            "dependency_agent": "pending",
            "security_agent": "pending",
            "test_runner": "pending",
            "gitlab_mr": "pending",
            "deployment_agent": "pending",
            "research_agent": "pending",
        }
        record = {
            "id": pid,
            "feature_request": feature_request,
            "gitlab_issue_id": gitlab_issue_id,
            "status": "initializing",
            "stages": stages,
            "artifacts": {},
            "created_at": _now(),
            "updated_at": _now(),
        }
        with self._lock:
            self._pipelines[pid] = record
            self._logs[pid] = []

        def _db_create(db, rec):
            from core.database import PipelineRepository
            PipelineRepository.create(db, rec)

        self._write_db(_db_create, record)
        return pid

    def get_pipeline(self, pid: str) -> Optional[Dict]:
        with self._lock:
            p = self._pipelines.get(pid)
            return dict(p) if p else None

    def list_pipelines(self) -> List[Dict]:
        with self._lock:
            return sorted(
                (dict(p) for p in self._pipelines.values()),
                key=lambda x: x["created_at"], reverse=True,
            )

    def update_stage(self, pid: str, stage: str, status: str,
                     artifact: Any = None) -> None:
        with self._lock:
            if pid not in self._pipelines:
                return
            self._pipelines[pid]["stages"][stage] = status
            if artifact is not None:
                self._pipelines[pid]["artifacts"][stage] = artifact
            self._pipelines[pid]["updated_at"] = _now()
            self._recalculate_status(pid)

        def _db_update(db, _pid, _stage, _status, _artifact):
            from core.database import PipelineRepository
            PipelineRepository.update_stage(db, _pid, _stage, _status, _artifact)

        self._write_db(_db_update, pid, stage, status, artifact)

    def _recalculate_status(self, pid: str) -> None:
        vals = list(self._pipelines[pid]["stages"].values())
        if pid in self._cancelled:
            self._pipelines[pid]["status"] = "cancelled"
        elif any(v == "failed" for v in vals):
            self._pipelines[pid]["status"] = "failed"
        elif all(v == "completed" for v in vals):
            self._pipelines[pid]["status"] = "completed"
        elif any(v == "running" for v in vals):
            self._pipelines[pid]["status"] = "running"
        else:
            self._pipelines[pid]["status"] = "in_progress"

    def set_pipeline_status(self, pid: str, status: str) -> None:
        with self._lock:
            if pid in self._pipelines:
                self._pipelines[pid]["status"] = status
                self._pipelines[pid]["updated_at"] = _now()

        def _db_set(db, _pid, _status):
            from core.database import PipelineRepository
            PipelineRepository.set_status(db, _pid, _status)

        self._write_db(_db_set, pid, status)

    # ─── Logs ────────────────────────────────────────────────────────────────

    def add_log(self, pid: str, agent: str, message: str,
                level: str = "info") -> None:
        entry = {"timestamp": _now(), "agent": agent,
                 "message": message, "level": level}
        with self._lock:
            if pid in self._logs:
                self._logs[pid].append(entry)

        def _db_log(db, _pid, _agent, _msg, _lvl):
            from core.database import PipelineRepository
            PipelineRepository.add_log(db, _pid, _agent, _msg, _lvl)

        self._write_db(_db_log, pid, agent, message, level)

    def get_logs(self, pid: str, since: int = 0) -> List[Dict]:
        """Return logs from index `since` onward (for SSE streaming)."""
        with self._lock:
            return list(self._logs.get(pid, []))[since:]

    def get_log_count(self, pid: str) -> int:
        with self._lock:
            return len(self._logs.get(pid, []))

    # ─── Research sessions ───────────────────────────────────────────────────

    def create_research_session(self, pid: str, baseline_ms: float) -> str:
        sid = f"research-{pid}"
        record = {
            "id": sid, "pipeline_id": pid, "status": "running",
            "iterations": [], "baseline_ms": round(baseline_ms, 2),
            "best_ms": None, "best_iteration": 0, "started_at": _now(),
        }
        with self._lock:
            self._sessions[sid] = record

        def _db_create(db, _sid, _pid, _baseline):
            from core.database import ResearchRepository
            ResearchRepository.create(db, _sid, _pid, _baseline)

        self._write_db(_db_create, sid, pid, baseline_ms)
        return sid

    def add_research_iteration(self, sid: str, iteration: Dict) -> None:
        with self._lock:
            if sid not in self._sessions:
                return
            self._sessions[sid]["iterations"].append(iteration)
            times = [it["execution_time_ms"]
                     for it in self._sessions[sid]["iterations"]]
            self._sessions[sid]["best_ms"] = min(times)
            self._sessions[sid]["best_iteration"] = times.index(min(times)) + 1

        def _db_iter(db, _sid, _iter):
            from core.database import ResearchRepository
            ResearchRepository.add_iteration(db, _sid, _iter)

        self._write_db(_db_iter, sid, iteration)

    def complete_research_session(self, sid: str) -> None:
        with self._lock:
            if sid in self._sessions:
                self._sessions[sid]["status"] = "completed"
                self._sessions[sid]["completed_at"] = _now()

        def _db_complete(db, _sid):
            from core.database import ResearchRepository
            ResearchRepository.complete(db, _sid)

        self._write_db(_db_complete, sid)

    def get_research_session(self, sid: str) -> Optional[Dict]:
        with self._lock:
            s = self._sessions.get(sid)
            return dict(s) if s else None

    def get_all_research_sessions(self) -> List[Dict]:
        with self._lock:
            return [dict(s) for s in self._sessions.values()]


state = PipelineState()
