"""
Offline CI test suite — guaranteed to pass with no external network calls.

Deliberately excludes:
  - TestClient / FastAPI app startup (httpx version sensitivity)
  - Real PyPI queries (network)
  - Real bandit subprocess (may not be in PATH in all CI environments)
  - Real pytest subprocess (recursive pytest)

Covers:
  - Core auth (Argon2id hash, JWT roundtrip, invalid token)
  - Database schema + write-through persistence
  - State machine: 7 stages, cancellation, agent tracking
  - Vector DB: store, search, no aliasing
  - Dependency parser + CVE version checks (pure Python, no network)
  - Research benchmark code extraction and validation
  - Test runner code classification (impl vs test blocks)
  - Reasoning log formatting
  - Deployment agent Dockerfile validation
"""
import os
import sys

# Must be set before any local imports
os.environ.setdefault("DEMO_MODE", "true")
os.environ.setdefault("GITLAB_MOCK", "true")
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_ci.db")
os.environ.setdefault("JWT_SECRET_KEY", "ci-secret-key-minimum-32-characters!!")
os.environ.setdefault("JWT_EXPIRE_MINUTES", "60")
os.environ.setdefault("DEFAULT_ADMIN_PASSWORD", "TestPass123!")
os.environ.setdefault("LOG_LEVEL", "ERROR")
os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:3000")

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
from core.database import create_tables
from core.auth import seed_default_user


def pytest_sessionstart():
    create_tables()
    seed_default_user()


# ── Auth ──────────────────────────────────────────────────────────────────────

def test_argon2_hash_and_verify():
    from core.auth import hash_password, verify_password
    h = hash_password("MyPass123!")
    assert verify_password("MyPass123!", h) is True
    assert verify_password("WrongPass!", h) is False


def test_jwt_roundtrip():
    from core.auth import create_access_token, decode_token
    token = create_access_token("user-abc", "testuser")
    payload = decode_token(token)
    assert payload is not None
    assert payload["sub"] == "user-abc"
    assert payload["username"] == "testuser"


def test_jwt_invalid_token_returns_none():
    from core.auth import decode_token
    assert decode_token("not.a.valid.token") is None
    assert decode_token("") is None


# ── Database ──────────────────────────────────────────────────────────────────

def test_database_pipeline_create_and_read():
    import time
    from core.database import create_tables, PipelineRepository, get_db
    create_tables()
    rec = {
        "id": "test0001",
        "feature_request": "CI test pipeline",
        "status": "initializing",
        "stages": {},
        "artifacts": {},
    }
    with get_db() as db:
        PipelineRepository.create(db, rec)
    time.sleep(0.05)
    with get_db() as db:
        row = PipelineRepository.get(db, "test0001")
    assert row is not None
    assert row["feature_request"] == "CI test pipeline"


def test_database_update_stage():
    from core.database import create_tables, PipelineRepository, get_db
    create_tables()
    rec = {"id": "test0002", "feature_request": "Stage update test",
           "status": "initializing", "stages": {}, "artifacts": {}}
    with get_db() as db:
        PipelineRepository.create(db, rec)
        PipelineRepository.update_stage(db, "test0002", "feature_agent", "completed")
    with get_db() as db:
        row = PipelineRepository.get(db, "test0002")
    assert row["stages"]["feature_agent"] == "completed"


# ── State machine ─────────────────────────────────────────────────────────────

def test_state_creates_7_stage_pipeline():
    from core.state import PipelineState
    s = PipelineState()
    pid = s.create_pipeline("7-stage test")
    p = s.get_pipeline(pid)
    assert len(p["stages"]) == 7
    expected = {
        "feature_agent", "dependency_agent", "security_agent",
        "test_runner", "gitlab_mr", "deployment_agent", "research_agent",
    }
    assert set(p["stages"].keys()) == expected


def test_state_cancellation():
    from core.state import PipelineState
    s = PipelineState()
    pid = s.create_pipeline("cancel test")
    assert s.is_cancelled(pid) is False
    assert s.request_cancel(pid) is True
    assert s.is_cancelled(pid) is True
    assert s.request_cancel("nonexistent") is False


def test_state_agent_tracking():
    from core.state import PipelineState
    s = PipelineState()
    pid = s.create_pipeline("agent tracking test")
    s.set_running_agent(pid, "Security Triage")
    agents = s.get_running_agents()
    assert agents[pid] == "Security Triage"
    s.clear_running_agent(pid)
    assert pid not in s.get_running_agents()


def test_state_stage_status_recalculation():
    from core.state import PipelineState
    s = PipelineState()
    pid = s.create_pipeline("status calc test")
    s.update_stage(pid, "feature_agent", "completed")
    s.update_stage(pid, "dependency_agent", "running")
    assert s.get_pipeline(pid)["status"] == "running"


def test_state_research_session():
    from core.state import PipelineState
    s = PipelineState()
    pid = s.create_pipeline("research session test")
    sid = s.create_research_session(pid, baseline_ms=120.5)
    session = s.get_research_session(sid)
    assert session["baseline_ms"] == 120.5
    assert session["status"] == "running"
    s.add_research_iteration(sid, {
        "iteration": 1, "execution_time_ms": 95.2,
        "accepted": True, "optimization": {"strategy": "cache"},
    })
    s.complete_research_session(sid)
    session = s.get_research_session(sid)
    assert session["status"] == "completed"
    assert session["best_ms"] == 95.2


# ── Vector DB ─────────────────────────────────────────────────────────────────

def test_vector_db_store_and_search():
    from core.vector_db import VectorDB
    db = VectorDB()
    db.store_code("JWT authentication FastAPI security", {"pipeline_id": "ci-test"})
    results = db.search("JWT authentication")
    assert len(results) > 0


def test_vector_db_no_metadata_aliasing():
    from core.vector_db import VectorDB
    db = VectorDB()
    meta = {"pipeline_id": "alias-test", "tags": ["security"]}
    original_keys = set(meta.keys())
    db.store_code("test code", meta)
    db.store_security_finding("SQL injection found", meta)
    assert set(meta.keys()) == original_keys


def test_vector_db_stats():
    from core.vector_db import VectorDB
    db = VectorDB()
    stats = db.stats()
    assert "total_documents" in stats
    assert stats["total_documents"] >= 0


# ── Dependency agent (pure Python, no network) ───────────────────────────────

def test_dependency_parser_valid():
    from agents.dependency_agent import _parse_requirements
    pkgs = _parse_requirements(
        "fastapi==0.88.0\nrequests==2.28.1\n# comment\n\npydantic==1.10.4"
    )
    assert len(pkgs) == 3
    assert any(p["name"] == "requests" for p in pkgs)


def test_dependency_parser_ignores_comments():
    from agents.dependency_agent import _parse_requirements
    pkgs = _parse_requirements("# header\n\nfastapi==0.88.0\n# another\n")
    assert len(pkgs) == 1


def test_version_tuple_comparison():
    from agents.dependency_agent import _version_tuple
    assert _version_tuple("2.31.0") > _version_tuple("2.28.1")
    assert _version_tuple("1.0.0") == _version_tuple("1.0.0")
    assert _version_tuple("bad") == (0, 0, 0)


def test_cve_detection_vulnerable_version():
    from agents.dependency_agent import _check_cves
    cves = _check_cves("requests", "2.28.1")
    assert len(cves) > 0
    assert any("CVE-2023-32681" in c["cve"] for c in cves)


def test_cve_detection_patched_version():
    from agents.dependency_agent import _check_cves
    cves = _check_cves("requests", "2.31.0")
    assert cves == []


def test_cve_detection_unknown_package():
    from agents.dependency_agent import _check_cves
    assert _check_cves("some-unknown-package-xyz", "1.0.0") == []


# ── Research agent (pure Python helpers) ─────────────────────────────────────

def test_extract_impl_from_code_fence():
    from agents.research_agent import _extract_impl, _is_valid_python
    text = "Some text\n\n```python\ndef add(a, b):\n    return a + b\n```\n"
    impl = _extract_impl(text)
    assert "def add" in impl
    assert _is_valid_python(impl)


def test_is_valid_python_good_code():
    from agents.research_agent import _is_valid_python
    assert _is_valid_python("def f(x): return x + 1") is True


def test_is_valid_python_bad_code():
    from agents.research_agent import _is_valid_python
    assert _is_valid_python("def broken(: pass") is False


def test_parse_optimization_fallback():
    from agents.research_agent import _parse_optimization
    # Bad JSON should return a valid fallback dict
    result = _parse_optimization("not json at all }{", iteration=1)
    assert "strategy" in result
    assert "optimization_target" in result
    assert isinstance(result.get("predicted_improvement_pct"), float)


# ── Test runner (code classification) ────────────────────────────────────────

def test_split_impl_and_tests_correct():
    from agents.test_runner import _extract_blocks, _split_impl_and_tests
    text = (
        "```python\ndef add(a, b): return a + b\n```\n"
        "```python\nimport pytest\ndef test_add():\n    from solution import add\n    assert add(1,2)==3\n```"
    )
    blocks = _extract_blocks(text)
    impl, tests = _split_impl_and_tests(blocks)
    assert "def add" in impl
    assert "def test_add" in tests


def test_split_impl_not_misclassified_by_assert():
    """Implementation blocks with assert statements must NOT be treated as tests."""
    from agents.test_runner import _extract_blocks, _split_impl_and_tests
    text = (
        "```python\n"
        "def find_dupes(data):\n"
        "    seen = set()\n"
        "    dupes = set()\n"
        "    for x in data: \n"
        "        if x in seen: dupes.add(x)\n"
        "        seen.add(x)\n"
        "    return list(dupes)\n"
        "result = find_dupes([1,2,1,3])\n"
        "assert len(result) == 1\n"
        "```"
    )
    blocks = _extract_blocks(text)
    impl, tests = _split_impl_and_tests(blocks)
    assert "find_dupes" in impl
    assert tests.strip() == ""


# ── Reasoning logger ──────────────────────────────────────────────────────────

def test_reasoning_log_decision_no_crash():
    # Use the shared module-level state singleton that reasoning.py writes to
    from core.state import state
    from core.reasoning import log_decision, log_analysis_start, log_autonomous_choice
    pid = state.create_pipeline("reasoning test")
    # These must not raise
    log_analysis_start(pid, "TestAgent", "some target", "some method")
    log_decision(pid, "TestAgent", "Finding X", "Reasoning Y", "Action Z",
                 confidence=90, severity="HIGH")
    log_autonomous_choice(pid, "TestAgent",
                          options=["A", "B", "C"], chosen="B", reason="because B")
    logs = state.get_logs(pid)
    assert any("[ANALYSIS]" in l["message"] for l in logs)
    assert any("[DECISION]" in l["message"] for l in logs)
    assert any("[AUTONOMOUS CHOICE]" in l["message"] for l in logs)


# ── Deployment agent (Dockerfile validation, no subprocess) ──────────────────

def test_deployment_dockerfile_content():
    import tempfile, os
    from agents.deployment_agent import _write_real_dockerfile, _simulate_docker_build
    with tempfile.TemporaryDirectory() as tmpdir:
        path = _write_real_dockerfile("def main(): return 'hello'", tmpdir)
        assert os.path.exists(path)
        with open(path) as f:
            content = f.read()
        assert "FROM python" in content
        assert "HEALTHCHECK" in content
        assert "USER" in content  # non-root user
        result = _simulate_docker_build(tmpdir)
        assert result["success"] is True
        assert result["checks"]["non_root"] is True


# ── Mistral demo mock (no network) ───────────────────────────────────────────

def test_mistral_demo_feature_mock_returns_code():
    from core.mistral_client import _feature_agent_mock
    import re
    output = _feature_agent_mock("Add user authentication")
    blocks = re.findall(r"```python\n(.*?)```", output, re.DOTALL)
    assert len(blocks) >= 1
    assert any("def " in b for b in blocks)


def test_mistral_demo_research_mock_returns_valid_json():
    import json
    from core.mistral_client import _research_agent_mock
    output = _research_agent_mock("optimize this code")
    data = json.loads(output)
    assert "strategy" in data
    assert "optimized_code" in data
    assert "predicted_improvement_pct" in data
    from agents.research_agent import _is_valid_python
    assert _is_valid_python(data["optimized_code"])


# ── Cleanup ───────────────────────────────────────────────────────────────────

def test_zzz_cleanup():
    db_path = os.getenv("DATABASE_URL", "").replace("sqlite:///./", "")
    if db_path and os.path.exists(db_path):
        os.remove(db_path)
    assert True
