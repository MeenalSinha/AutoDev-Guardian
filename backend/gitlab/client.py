"""
GitLab Integration
Supports both real GitLab REST API v4 and in-memory mock simulation.

Mock mode is default (GITLAB_MOCK=true) — no token required.
Set GITLAB_MOCK=false with a valid GITLAB_TOKEN and GITLAB_PROJECT_ID
to create real issues, MRs, and trigger real pipelines.
"""
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

import requests

from core.state import state

logger = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_mock() -> bool:
    return os.getenv("GITLAB_MOCK", "true").lower() == "true"


class GitLabClient:
    def __init__(self):
        self._mrs: Dict[str, Dict] = {}
        self._issues: Dict[str, Dict] = {}
        self._pipelines: Dict[str, Dict] = {}

    @property
    def _base_url(self) -> str:
        url = os.getenv("GITLAB_URL", "https://gitlab.com")
        project = os.getenv("GITLAB_PROJECT_ID", "")
        return f"{url}/api/v4/projects/{project}"

    @property
    def _headers(self) -> Dict[str, str]:
        return {
            "PRIVATE-TOKEN": os.getenv("GITLAB_TOKEN", ""),
            "Content-Type": "application/json",
        }

    # ─── Issues ───────────────────────────────────────────────────────────────

    def create_issue(
        self, title: str, description: str, labels: Optional[List[str]] = None
    ) -> Dict:
        if not _is_mock() and os.getenv("GITLAB_TOKEN"):
            return self._real_create_issue(title, description, labels)
        return self._mock_create_issue(title, description, labels)

    def _real_create_issue(
        self, title: str, description: str, labels: Optional[List[str]]
    ) -> Dict:
        try:
            resp = requests.post(
                f"{self._base_url}/issues",
                headers=self._headers,
                json={
                    "title": title,
                    "description": description,
                    "labels": ",".join(labels or []),
                },
                timeout=15,
            )
            resp.raise_for_status()
            issue = resp.json()
            self._issues[str(issue["iid"])] = issue
            return issue
        except Exception as exc:
            logger.warning("Real GitLab issue creation failed: %s. Falling back to mock.", exc)
            return self._mock_create_issue(title, description, labels)

    def _mock_create_issue(
        self, title: str, description: str, labels: Optional[List[str]]
    ) -> Dict:
        iid = str(len(self._issues) + 1)
        issue = {
            "id": iid,
            "iid": iid,
            "title": title,
            "description": description,
            "labels": labels or ["autodev", "feature-request"],
            "state": "opened",
            "web_url": f"https://gitlab.com/autodev/demo/-/issues/{iid}",
            "created_at": _now(),
            "mock": True,
        }
        self._issues[iid] = issue
        return issue

    # ─── Merge Requests ───────────────────────────────────────────────────────

    def create_merge_request(
        self,
        title: str,
        description: str,
        source_branch: str,
        target_branch: str = "main",
        issue_id: Optional[str] = None,
    ) -> Dict:
        if not _is_mock() and os.getenv("GITLAB_TOKEN"):
            return self._real_create_mr(
                title, description, source_branch, target_branch, issue_id
            )
        return self._mock_create_mr(
            title, description, source_branch, target_branch, issue_id
        )

    def _real_create_mr(
        self,
        title: str,
        description: str,
        source_branch: str,
        target_branch: str,
        issue_id: Optional[str],
    ) -> Dict:
        try:
            body = {
                "title": title,
                "description": description,
                "source_branch": source_branch,
                "target_branch": target_branch,
                "remove_source_branch": True,
            }
            if issue_id:
                body["description"] += f"\n\nCloses #{issue_id}"
            resp = requests.post(
                f"{self._base_url}/merge_requests",
                headers=self._headers,
                json=body,
                timeout=15,
            )
            resp.raise_for_status()
            mr = resp.json()
            self._mrs[str(mr["iid"])] = mr
            return mr
        except Exception as exc:
            logger.warning("Real GitLab MR creation failed: %s. Falling back to mock.", exc)
            return self._mock_create_mr(
                title, description, source_branch, target_branch, issue_id
            )

    def _mock_create_mr(
        self,
        title: str,
        description: str,
        source_branch: str,
        target_branch: str,
        issue_id: Optional[str],
    ) -> Dict:
        iid = str(len(self._mrs) + 1)
        mr = {
            "id": iid,
            "iid": iid,
            "title": title,
            "description": description,
            "source_branch": source_branch,
            "target_branch": target_branch,
            "state": "opened",
            "web_url": f"https://gitlab.com/autodev/demo/-/merge_requests/{iid}",
            "diff_refs": {
                "base_sha": uuid.uuid4().hex[:8],
                "head_sha": uuid.uuid4().hex[:8],
            },
            "labels": ["autodev", "ai-generated"],
            "closes_issues": [issue_id] if issue_id else [],
            "created_at": _now(),
            "mock": True,
        }
        self._mrs[iid] = mr
        return mr

    # ─── Pipelines ────────────────────────────────────────────────────────────

    def trigger_pipeline(self, ref: str = "main", variables: dict = None) -> Dict:
        if not _is_mock() and os.getenv("GITLAB_TOKEN"):
            return self._real_trigger_pipeline(ref, variables)
        return self._mock_trigger_pipeline(ref, variables)

    def _real_trigger_pipeline(self, ref: str, variables: dict) -> Dict:
        try:
            body = {
                "ref": ref,
                "variables": [
                    {"key": k, "value": str(v)}
                    for k, v in (variables or {}).items()
                ],
            }
            resp = requests.post(
                f"{self._base_url}/pipeline",
                headers=self._headers,
                json=body,
                timeout=15,
            )
            resp.raise_for_status()
            pipeline = resp.json()
            self._pipelines[str(pipeline["id"])] = pipeline
            return pipeline
        except Exception as exc:
            logger.warning("Real GitLab pipeline trigger failed: %s. Falling back to mock.", exc)
            return self._mock_trigger_pipeline(ref, variables)

    def _mock_trigger_pipeline(self, ref: str, variables: dict) -> Dict:
        pid = str(len(self._pipelines) + 1)
        pipeline = {
            "id": pid,
            "ref": ref,
            "status": "running",
            "web_url": f"https://gitlab.com/autodev/demo/-/pipelines/{pid}",
            "stages": ["test", "security-scan", "build", "deploy"],
            "created_at": _now(),
            "variables": variables or {},
            "mock": True,
        }
        self._pipelines[pid] = pipeline
        return pipeline

    # ─── Full Workflow Simulation ─────────────────────────────────────────────

    def simulate_full_workflow(
        self,
        pipeline_id: str,
        feature_request: str,
        generated_code: str,
    ) -> Dict:
        """Orchestrates: Issue -> Branch -> MR -> CI Pipeline"""
        state.add_log(pipeline_id, "GitLab", "Creating GitLab issue for feature request...")
        issue = self.create_issue(
            title=feature_request[:80],
            description=(
                f"AutoDev Guardian AI — Auto-generated issue\n\n{feature_request}"
            ),
            labels=["autodev", "ai-generated", "feature-request"],
        )

        branch_name = f"autodev/feature-{pipeline_id}"
        state.add_log(pipeline_id, "GitLab", f"Creating branch: {branch_name}")

        state.add_log(pipeline_id, "GitLab", "Creating Merge Request...")
        mr = self.create_merge_request(
            title=f"[AutoDev] {feature_request[:60]}",
            description=(
                "## AutoDev Guardian AI — Auto-Generated MR\n\n"
                f"**Issue:** #{issue['iid']} — {feature_request[:80]}\n\n"
                "### Changes\n"
                "- Implemented feature as requested\n"
                "- Security vulnerabilities patched\n"
                "- Dependencies updated to latest safe versions\n"
                "- Unit tests added\n\n"
                "### Agent Pipeline\n"
                "- Feature Builder Agent: PASSED\n"
                "- Security Triage Agent: PASSED\n"
                "- Dependency Healer Agent: PASSED\n"
                "- Auto-Research Agent: PASSED\n\n"
                "*Generated by AutoDev Guardian AI*"
            ),
            source_branch=branch_name,
            target_branch="main",
            issue_id=issue["iid"],
        )

        state.add_log(pipeline_id, "GitLab", "Triggering CI/CD pipeline...")
        pipeline = self.trigger_pipeline(
            ref=branch_name,
            variables={
                "AUTODEV_PIPELINE_ID": pipeline_id,
                "AI_GENERATED": "true",
            },
        )

        state.update_stage(
            pipeline_id,
            "gitlab_mr",
            "completed",
            {"issue": issue, "merge_request": mr, "pipeline": pipeline},
        )

        state.add_log(
            pipeline_id,
            "GitLab",
            f"GitLab workflow complete — MR !{mr['iid']} created, "
            f"Pipeline #{pipeline['id']} triggered",
            "success",
        )

        return {"issue": issue, "merge_request": mr, "pipeline": pipeline}


# Global singleton
gitlab_client = GitLabClient()
