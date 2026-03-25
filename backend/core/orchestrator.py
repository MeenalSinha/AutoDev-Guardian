"""
Pipeline Orchestrator — Full 7-stage SDLC automation.

Stages (spec-compliant):
  1. Feature Builder Agent     — code generation
  2. Dependency Healer Agent   — real PyPI vulnerability healing
  3. Security Triage Agent     — real bandit SAST
  4. Test Runner               — real pytest execution
  5. GitLab Workflow           — Issue → Branch → MR → CI Pipeline
  6. Deployment Agent          — Dockerfile + health checks  ← NEW
  7. Auto-Research Agent       — real timeit optimization loop

Each stage is independently try/except guarded.
Supports cancellation via state.is_cancelled(pid).
"""
import logging
import threading

from core.state import state
from gitlab.client import gitlab_client
import agents.feature_agent as feature_agent
import agents.dependency_agent as dependency_agent
import agents.security_agent as security_agent
import agents.test_runner as test_runner
import agents.research_agent as research_agent
import agents.deployment_agent as deployment_agent

logger = logging.getLogger(__name__)


def _check_cancel(pipeline_id: str, stage_name: str) -> bool:
    """Returns True and marks stage if pipeline was cancelled."""
    if state.is_cancelled(pipeline_id):
        state.update_stage(pipeline_id, stage_name, "cancelled")
        state.add_log(pipeline_id, "Orchestrator",
                      f"Stage {stage_name} cancelled by user request", "warning")
        return True
    return False


def run_pipeline(pipeline_id: str, feature_request: str,
                 requirements_txt: str = None):
    """
    Full 7-stage autonomous SDLC pipeline.
    Runs in a daemon background thread.
    """
    state.set_pipeline_status(pipeline_id, "running")
    state.add_log(pipeline_id, "Orchestrator",
                  f"Pipeline started. Feature: {feature_request[:80]}...")

    generated_code = "# Feature code could not be generated"
    test_result = {}

    # ── Stage 1: Feature Builder ──────────────────────────────────────────────
    if _check_cancel(pipeline_id, "feature_agent"):
        return
    try:
        state.add_log(pipeline_id, "Orchestrator", "Stage 1/7: Feature Builder Agent")
        state.set_running_agent(pipeline_id, "Feature Builder")
        result = feature_agent.run(pipeline_id, feature_request)
        generated_code = result.get("generated_code", generated_code)
    except Exception as exc:
        logger.exception("Feature agent failed: %s", exc)
        state.update_stage(pipeline_id, "feature_agent", "failed")
        state.add_log(pipeline_id, "FeatureAgent", f"Failed: {exc}", "error")
    finally:
        state.clear_running_agent(pipeline_id)

    # ── Stage 2: Dependency Healer ────────────────────────────────────────────
    if _check_cancel(pipeline_id, "dependency_agent"):
        return
    try:
        state.add_log(pipeline_id, "Orchestrator", "Stage 2/7: Dependency Healer Agent")
        state.set_running_agent(pipeline_id, "Dependency Healer")
        dependency_agent.run(pipeline_id, requirements_txt)
    except Exception as exc:
        logger.exception("Dependency agent failed: %s", exc)
        state.update_stage(pipeline_id, "dependency_agent", "failed")
        state.add_log(pipeline_id, "DependencyAgent", f"Failed: {exc}", "error")
    finally:
        state.clear_running_agent(pipeline_id)

    # ── Stage 3: Security Triage ──────────────────────────────────────────────
    if _check_cancel(pipeline_id, "security_agent"):
        return
    try:
        state.add_log(pipeline_id, "Orchestrator", "Stage 3/7: Security Triage Agent")
        state.set_running_agent(pipeline_id, "Security Triage")
        security_agent.run(pipeline_id, generated_code)
    except Exception as exc:
        logger.exception("Security agent failed: %s", exc)
        state.update_stage(pipeline_id, "security_agent", "failed")
        state.add_log(pipeline_id, "SecurityAgent", f"Failed: {exc}", "error")
    finally:
        state.clear_running_agent(pipeline_id)

    # ── Stage 4: Test Runner ──────────────────────────────────────────────────
    if _check_cancel(pipeline_id, "test_runner"):
        return
    try:
        state.add_log(pipeline_id, "Orchestrator", "Stage 4/7: Test Runner")
        state.set_running_agent(pipeline_id, "Test Runner")
        test_result = test_runner.run(pipeline_id, generated_code)
    except Exception as exc:
        logger.exception("Test runner failed: %s", exc)
        state.update_stage(pipeline_id, "test_runner", "failed")
        state.add_log(pipeline_id, "TestRunner", f"Failed: {exc}", "error")
    finally:
        state.clear_running_agent(pipeline_id)

    # ── Stage 5: GitLab Workflow ──────────────────────────────────────────────
    if _check_cancel(pipeline_id, "gitlab_mr"):
        return
    try:
        state.add_log(pipeline_id, "Orchestrator",
                      "Stage 5/7: GitLab Workflow (Issue → MR → Pipeline)")
        state.set_running_agent(pipeline_id, "GitLab")
        gitlab_client.simulate_full_workflow(
            pipeline_id, feature_request, generated_code)
    except Exception as exc:
        logger.exception("GitLab workflow failed: %s", exc)
        state.update_stage(pipeline_id, "gitlab_mr", "failed")
        state.add_log(pipeline_id, "GitLab", f"Failed: {exc}", "error")
    finally:
        state.clear_running_agent(pipeline_id)

    # ── Stage 6: Deployment ───────────────────────────────────────────────────
    if _check_cancel(pipeline_id, "deployment_agent"):
        return
    try:
        state.add_log(pipeline_id, "Orchestrator", "Stage 6/7: Deployment Agent")
        state.set_running_agent(pipeline_id, "Deployment")
        deployment_agent.run(pipeline_id, generated_code, test_result)
    except Exception as exc:
        logger.exception("Deployment agent failed: %s", exc)
        state.update_stage(pipeline_id, "deployment_agent", "failed")
        state.add_log(pipeline_id, "DeploymentAgent", f"Failed: {exc}", "error")
    finally:
        state.clear_running_agent(pipeline_id)

    # ── Stage 7: Auto-Research ────────────────────────────────────────────────
    if _check_cancel(pipeline_id, "research_agent"):
        return
    try:
        state.add_log(pipeline_id, "Orchestrator",
                      "Stage 7/7: Auto-Research Agent (self-improvement loop)")
        state.set_running_agent(pipeline_id, "Auto-Research")
        res = research_agent.run(pipeline_id, generated_code, num_iterations=4)
        pct = res.get("total_improvement_pct", 0)
        state.add_log(
            pipeline_id, "Orchestrator",
            f"All 7 stages complete. Performance improved {pct}% via auto-research.",
            "success",
        )
    except Exception as exc:
        logger.exception("Research agent failed: %s", exc)
        state.update_stage(pipeline_id, "research_agent", "failed")
        state.add_log(pipeline_id, "ResearchAgent", f"Failed: {exc}", "error")
    finally:
        state.clear_running_agent(pipeline_id)

    p = state.get_pipeline(pipeline_id)
    if p:
        logger.info("Pipeline %s done: %s", pipeline_id, p["status"])


def start_pipeline_async(pipeline_id: str, feature_request: str,
                         requirements_txt: str = None) -> threading.Thread:
    t = threading.Thread(
        target=run_pipeline,
        args=(pipeline_id, feature_request, requirements_txt),
        daemon=True,
        name=f"pipeline-{pipeline_id}",
    )
    t.start()
    return t
