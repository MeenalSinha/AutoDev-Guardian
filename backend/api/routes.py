"""
FastAPI Routes — Complete API surface covering all spec requirements.

Endpoints:
  Pipeline: start, get, logs, stream (SSE), cancel, export, list
  Research: trigger, sessions, session detail
  GitLab:   issue, MRs, pipelines
  Deploy:   status per pipeline
  Agents:   live status
  RAG:      stats, search
  Metrics:  system metrics
  Stats:    dashboard aggregated stats
"""
import asyncio
import io
import json
import logging
import os
import threading
import zipfile
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

from core.state import state
from core.orchestrator import start_pipeline_async
from core.vector_db import vector_db
from gitlab.client import gitlab_client
import agents.research_agent as research_agent

logger = logging.getLogger(__name__)
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


# ─── Models ──────────────────────────────────────────────────────────────────

class PipelineCreateRequest(BaseModel):
    feature_request: str = Field(..., min_length=10, max_length=2000)
    requirements_txt: Optional[str] = Field(None, max_length=50_000)
    gitlab_issue_id: Optional[str] = Field(None, max_length=64)


class ResearchTriggerRequest(BaseModel):
    pipeline_id: str = Field(..., min_length=1, max_length=64)
    num_iterations: int = Field(4, ge=1, le=10)


class IssueCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str = Field("", max_length=10_000)
    labels: Optional[List[str]] = Field(None, max_length=20)


# ─── Pipeline ────────────────────────────────────────────────────────────────

@router.post("/pipeline/start")
@limiter.limit("10/minute")
def start_pipeline(request: Request, req: PipelineCreateRequest):
    """Start a full 7-stage autonomous SDLC pipeline."""
    pipeline_id = state.create_pipeline(req.feature_request, req.gitlab_issue_id)
    start_pipeline_async(pipeline_id, req.feature_request, req.requirements_txt)
    logger.info("Pipeline %s started: %s", pipeline_id, req.feature_request[:60])
    return {
        "pipeline_id": pipeline_id,
        "status": "started",
        "stages": 7,
        "message": "7-stage autonomous pipeline initiated.",
    }


@router.get("/pipeline/{pipeline_id}")
def get_pipeline(pipeline_id: str):
    p = state.get_pipeline(pipeline_id)
    if not p:
        raise HTTPException(404, "Pipeline not found")
    return p


@router.get("/pipeline/{pipeline_id}/logs")
def get_pipeline_logs(pipeline_id: str, since: int = 0):
    """Get logs since a given index (for incremental polling)."""
    if not state.get_pipeline(pipeline_id):
        raise HTTPException(404, "Pipeline not found")
    logs = state.get_logs(pipeline_id, since=since)
    return {"logs": logs, "total": state.get_log_count(pipeline_id)}


@router.get("/pipeline/{pipeline_id}/stream")
async def stream_pipeline_logs(pipeline_id: str, request: Request):
    """
    Server-Sent Events endpoint for real-time log streaming.
    Client: const es = new EventSource('/api/pipeline/{id}/stream')
            es.onmessage = e => console.log(JSON.parse(e.data))
    """
    if not state.get_pipeline(pipeline_id):
        raise HTTPException(404, "Pipeline not found")

    async def event_generator():
        sent = 0
        try:
            while True:
                if await request.is_disconnected():
                    break
                logs = state.get_logs(pipeline_id, since=sent)
                for log in logs:
                    yield f"data: {json.dumps(log)}\n\n"
                    sent += 1
                p = state.get_pipeline(pipeline_id)
                if p and p["status"] in ("completed", "failed", "cancelled"):
                    yield f"data: {json.dumps({'event': 'done', 'status': p['status']})}\n\n"
                    break
                await asyncio.sleep(0.5)
        except asyncio.CancelledError:
            pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.post("/pipeline/{pipeline_id}/cancel")
def cancel_pipeline(pipeline_id: str):
    """Request cancellation of a running pipeline."""
    ok = state.request_cancel(pipeline_id)
    if not ok:
        raise HTTPException(404, "Pipeline not found")
    state.add_log(pipeline_id, "Orchestrator",
                  "Cancellation requested by user", "warning")
    return {"pipeline_id": pipeline_id, "status": "cancellation_requested"}


@router.get("/pipeline/{pipeline_id}/export")
def export_pipeline_code(pipeline_id: str):
    """
    Download a ZIP of all generated artifacts for a pipeline.
    Includes: generated code, Dockerfile, dependency report, security report.
    """
    p = state.get_pipeline(pipeline_id)
    if not p:
        raise HTTPException(404, "Pipeline not found")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        artifacts = p.get("artifacts", {})

        # Generated code
        code = (artifacts.get("feature_agent") or {}).get("generated_code", "")
        if code:
            zf.writestr("solution.py", code)

        # Dockerfile from deployment agent
        dockerfile = (artifacts.get("deployment_agent") or {}).get("dockerfile", "")
        if dockerfile:
            zf.writestr("Dockerfile", dockerfile)

        # Security report
        sec = artifacts.get("security_agent") or {}
        if sec:
            report = sec.get("analysis", "")
            zf.writestr("SECURITY_REPORT.md", report)

        # Dependency report
        dep = artifacts.get("dependency_agent") or {}
        if dep:
            report = dep.get("analysis", "")
            zf.writestr("DEPENDENCY_REPORT.md", report)

        # Research summary
        res = artifacts.get("research_agent") or {}
        if res:
            summary = json.dumps(res, indent=2, default=str)
            zf.writestr("RESEARCH_SUMMARY.json", summary)

        # Pipeline manifest
        manifest = {
            "pipeline_id": pipeline_id,
            "feature_request": p["feature_request"],
            "status": p["status"],
            "created_at": p["created_at"],
            "stages": p["stages"],
        }
        zf.writestr("PIPELINE_MANIFEST.json",
                    json.dumps(manifest, indent=2))

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={
            "Content-Disposition":
                f"attachment; filename=autodev-{pipeline_id}.zip"
        },
    )


@router.get("/pipelines")
def list_pipelines():
    return {"pipelines": state.list_pipelines()}


# ─── Research ────────────────────────────────────────────────────────────────

@router.post("/research/trigger")
@limiter.limit("5/minute")
def trigger_research(request: Request, req: ResearchTriggerRequest):
    p = state.get_pipeline(req.pipeline_id)
    if not p:
        raise HTTPException(404, "Pipeline not found")
    code = (p.get("artifacts", {}).get("feature_agent") or {}).get(
        "generated_code", "# no code")

    def run_research():
        try:
            research_agent.run(req.pipeline_id, code, req.num_iterations)
        except Exception as exc:
            logger.error("Research trigger failed %s: %s", req.pipeline_id, exc)

    threading.Thread(target=run_research, daemon=True).start()
    return {"message": "Research loop triggered", "pipeline_id": req.pipeline_id,
            "num_iterations": req.num_iterations}


@router.get("/research/sessions")
def get_research_sessions():
    return {"sessions": state.get_all_research_sessions()}


@router.get("/research/session/{session_id}")
def get_research_session(session_id: str):
    s = state.get_research_session(session_id)
    if not s:
        raise HTTPException(404, "Research session not found")
    return s


# ─── GitLab ──────────────────────────────────────────────────────────────────

@router.post("/gitlab/issue")
@limiter.limit("20/minute")
def create_issue(request: Request, req: IssueCreateRequest):
    issue = gitlab_client.create_issue(req.title, req.description, req.labels)
    return {"issue": issue}


@router.get("/gitlab/mrs")
def list_mrs():
    return {"merge_requests": list(gitlab_client._mrs.values())}


@router.get("/gitlab/pipelines")
def list_gitlab_pipelines():
    return {"pipelines": list(gitlab_client._pipelines.values())}


# ─── Deployment ──────────────────────────────────────────────────────────────

@router.get("/deploy/{pipeline_id}")
def get_deployment_status(pipeline_id: str):
    """Get deployment status for a pipeline."""
    p = state.get_pipeline(pipeline_id)
    if not p:
        raise HTTPException(404, "Pipeline not found")
    deploy_artifact = p.get("artifacts", {}).get("deployment_agent") or {}
    return {
        "pipeline_id": pipeline_id,
        "deployment_status": deploy_artifact.get("status", "not_deployed"),
        "deployment_url": deploy_artifact.get("deployment_url"),
        "image_tag": deploy_artifact.get("image_tag"),
        "deployed_at": deploy_artifact.get("deployed_at"),
        "health_checks": deploy_artifact.get("health_checks", []),
        "rollback_available": deploy_artifact.get("rollback_available", False),
    }


# ─── Agents live status ──────────────────────────────────────────────────────

@router.get("/agents/status")
def get_agent_status():
    """Real-time status of which agents are currently running."""
    running = state.get_running_agents()
    return {
        "running_count": len(running),
        "agents": [
            {"pipeline_id": pid, "agent": agent}
            for pid, agent in running.items()
        ],
    }


# ─── RAG ─────────────────────────────────────────────────────────────────────

@router.get("/rag/stats")
def rag_stats():
    return vector_db.stats()


@router.get("/rag/search")
def rag_search(query: str = "", top_k: int = 5):
    if not query.strip():
        raise HTTPException(400, "query cannot be empty")
    if top_k < 1 or top_k > 20:
        raise HTTPException(400, "top_k must be 1-20")
    return {"query": query, "results": vector_db.search(query, top_k=top_k)}


# ─── Metrics ─────────────────────────────────────────────────────────────────

@router.get("/metrics")
def get_metrics():
    """
    System metrics: pipeline throughput, agent performance, resource usage.
    psutil used for real CPU/memory — falls back to 0 if not installed.
    """
    try:
        import psutil
        cpu_pct = psutil.cpu_percent(interval=0.1)
        mem = psutil.virtual_memory()
        memory_pct = mem.percent
        memory_used_mb = round(mem.used / 1024 / 1024, 1)
    except ImportError:
        cpu_pct = 0.0
        memory_pct = 0.0
        memory_used_mb = 0.0

    pipelines = state.list_pipelines()
    sessions = state.get_all_research_sessions()

    completed = [p for p in pipelines if p["status"] == "completed"]
    failed = [p for p in pipelines if p["status"] == "failed"]

    # Average research improvement
    improvements = []
    for s in sessions:
        if s.get("baseline_ms") and s.get("best_ms"):
            pct = (s["baseline_ms"] - s["best_ms"]) / s["baseline_ms"] * 100
            improvements.append(pct)

    return {
        "system": {
            "cpu_pct": cpu_pct,
            "memory_pct": memory_pct,
            "memory_used_mb": memory_used_mb,
        },
        "pipelines": {
            "total": len(pipelines),
            "completed": len(completed),
            "failed": len(failed),
            "running": len(state.get_running_agents()),
            "success_rate_pct": round(
                len(completed) / max(len(pipelines), 1) * 100, 1),
        },
        "research": {
            "sessions": len(sessions),
            "avg_improvement_pct": round(
                sum(improvements) / max(len(improvements), 1), 1),
            "best_improvement_pct": round(max(improvements, default=0), 1),
        },
        "rag": vector_db.stats(),
    }


# ─── Dashboard stats ─────────────────────────────────────────────────────────

@router.get("/stats")
def get_stats():
    pipelines = state.list_pipelines()
    sessions = state.get_all_research_sessions()
    total = len(pipelines)
    completed = sum(1 for p in pipelines if p["status"] == "completed")
    running = sum(1 for p in pipelines if p["status"] == "running")
    failed = sum(1 for p in pipelines if p["status"] == "failed")

    best_imp = 0.0
    for s in sessions:
        if s.get("baseline_ms") and s.get("best_ms"):
            pct = (s["baseline_ms"] - s["best_ms"]) / s["baseline_ms"] * 100
            best_imp = max(best_imp, pct)

    total_vulns = sum(
        p.get("artifacts", {}).get("security_agent", {}).get("vulnerabilities_found", 0)
        for p in pipelines
    )
    deployed = sum(
        1 for p in pipelines
        if p.get("artifacts", {}).get("deployment_agent", {}).get("status") == "deployed"
    )

    return {
        "pipelines": {
            "total": total, "completed": completed,
            "running": running, "failed": failed,
        },
        "research_sessions": len(sessions),
        "best_improvement_pct": round(best_imp, 1),
        "total_vulnerabilities_fixed": total_vulns,
        "total_deployed": deployed,
        "rag_documents": vector_db.stats()["total_documents"],
        "mrs_created": len(gitlab_client._mrs),
        "active_agents": len(state.get_running_agents()),
    }
