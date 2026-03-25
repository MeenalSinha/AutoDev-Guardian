"""
AutoDev Guardian AI — Full Integration + Unit Test Suite
54 tests covering: auth, pipelines, research, GitLab, deployment,
real bandit SAST, real PyPI, real pytest runner, real benchmarks.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


# ─── Auth fixtures ────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def auth_token():
    r = client.post("/api/auth/token",
        data={"username": "admin", "password": "TestPass123!"},
        headers={"Content-Type": "application/x-www-form-urlencoded"})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["access_token"]

@pytest.fixture
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}"}


# ─── Health ───────────────────────────────────────────────────────────────────

def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    d = r.json()
    assert d["status"] == "ok"
    assert "db" in d
    assert "demo_mode" in d


# ─── Auth ─────────────────────────────────────────────────────────────────────

def test_login_success(auth_token):
    assert len(auth_token) > 20

def test_login_wrong_password():
    r = client.post("/api/auth/token",
        data={"username": "admin", "password": "wrong!"},
        headers={"Content-Type": "application/x-www-form-urlencoded"})
    assert r.status_code == 401

def test_me_authenticated(auth_headers):
    r = client.get("/api/auth/me", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["username"] == "admin"

def test_me_unauthenticated():
    assert client.get("/api/auth/me").status_code == 401

def test_register_and_login():
    import uuid
    u = f"user_{uuid.uuid4().hex[:6]}"
    r = client.post("/api/auth/register", json={"username": u, "email": f"{u}@t.com", "password": "Pass123!!"})
    assert r.status_code == 201
    r2 = client.post("/api/auth/token", data={"username": u, "password": "Pass123!!"},
                     headers={"Content-Type": "application/x-www-form-urlencoded"})
    assert r2.status_code == 200

def test_register_duplicate():
    r = client.post("/api/auth/register", json={"username": "admin", "email": "x@x.com", "password": "Pass123!!"})
    assert r.status_code == 409

def test_register_short_password():
    r = client.post("/api/auth/register", json={"username": "validuser9", "email": "v@v.com", "password": "short"})
    assert r.status_code == 422

def test_register_invalid_username():
    r = client.post("/api/auth/register", json={"username": "bad user!", "email": "b@b.com", "password": "Pass123!!"})
    assert r.status_code == 422


# ─── Stats, Metrics, RAG ──────────────────────────────────────────────────────

def test_stats():
    r = client.get("/api/stats")
    assert r.status_code == 200
    d = r.json()
    assert "pipelines" in d
    assert "rag_documents" in d
    assert "total_deployed" in d
    assert "active_agents" in d

def test_metrics():
    r = client.get("/api/metrics")
    assert r.status_code == 200
    d = r.json()
    assert "system" in d
    assert "pipelines" in d
    assert "research" in d
    assert "cpu_pct" in d["system"]
    assert "memory_pct" in d["system"]

def test_agents_status():
    r = client.get("/api/agents/status")
    assert r.status_code == 200
    d = r.json()
    assert "running_count" in d
    assert "agents" in d

def test_rag_stats():
    r = client.get("/api/rag/stats")
    assert r.status_code == 200
    assert r.json()["total_documents"] >= 7

def test_rag_search_valid():
    r = client.get("/api/rag/search?query=SQL+injection")
    assert r.status_code == 200
    assert isinstance(r.json()["results"], list)

def test_rag_search_empty():
    assert client.get("/api/rag/search?query=").status_code == 400

def test_rag_search_top_k_too_large():
    assert client.get("/api/rag/search?query=test&top_k=999").status_code == 400


# ─── Pipelines ────────────────────────────────────────────────────────────────

def test_list_pipelines():
    r = client.get("/api/pipelines")
    assert r.status_code == 200
    assert "pipelines" in r.json()

def test_start_pipeline_missing_body():
    assert client.post("/api/pipeline/start", json={}).status_code == 422

def test_start_pipeline_too_short():
    assert client.post("/api/pipeline/start", json={"feature_request": "short"}).status_code == 422

def test_start_pipeline_valid():
    r = client.post("/api/pipeline/start",
                    json={"feature_request": "Add JWT authentication with refresh token rotation"})
    assert r.status_code == 200
    d = r.json()
    assert "pipeline_id" in d
    assert d["status"] == "started"
    assert d["stages"] == 7

def test_get_pipeline():
    r1 = client.post("/api/pipeline/start",
                     json={"feature_request": "Implement paginated list endpoint for product catalog"})
    pid = r1.json()["pipeline_id"]
    r2 = client.get(f"/api/pipeline/{pid}")
    assert r2.status_code == 200
    d = r2.json()
    assert d["id"] == pid
    assert len(d["stages"]) == 7  # 7-stage pipeline

def test_get_pipeline_not_found():
    assert client.get("/api/pipeline/00000000").status_code == 404

def test_pipeline_logs_with_since():
    r1 = client.post("/api/pipeline/start",
                     json={"feature_request": "Add rate limiting middleware to all public endpoints"})
    pid = r1.json()["pipeline_id"]
    r2 = client.get(f"/api/pipeline/{pid}/logs?since=0")
    assert r2.status_code == 200
    d = r2.json()
    assert "logs" in d
    assert "total" in d  # new field

def test_pipeline_logs_not_found():
    assert client.get("/api/pipeline/deadbeef/logs").status_code == 404

def test_pipeline_cancel():
    r1 = client.post("/api/pipeline/start",
                     json={"feature_request": "Build async file upload handler with S3 integration"})
    pid = r1.json()["pipeline_id"]
    import time; time.sleep(0.2)  # let pipeline start
    r2 = client.post(f"/api/pipeline/{pid}/cancel")
    assert r2.status_code == 200
    assert r2.json()["status"] == "cancellation_requested"

def test_pipeline_cancel_not_found():
    assert client.post("/api/pipeline/deadbeef/cancel").status_code == 404

def test_pipeline_export():
    r1 = client.post("/api/pipeline/start",
                     json={"feature_request": "Add background task queue for notification emails"})
    pid = r1.json()["pipeline_id"]
    r2 = client.get(f"/api/pipeline/{pid}/export")
    assert r2.status_code == 200
    assert "application/zip" in r2.headers.get("content-type", "")
    assert len(r2.content) > 100  # non-empty ZIP


# ─── Research ─────────────────────────────────────────────────────────────────

def test_research_sessions():
    r = client.get("/api/research/sessions")
    assert r.status_code == 200
    assert "sessions" in r.json()

def test_research_session_not_found():
    assert client.get("/api/research/session/nonexistent").status_code == 404

def test_research_trigger_bad_pipeline():
    r = client.post("/api/research/trigger", json={"pipeline_id": "deadbeef", "num_iterations": 1})
    assert r.status_code == 404

def test_research_trigger_valid():
    r1 = client.post("/api/pipeline/start",
                     json={"feature_request": "Add async task queue for background email sending"})
    pid = r1.json()["pipeline_id"]
    r2 = client.post("/api/research/trigger", json={"pipeline_id": pid, "num_iterations": 1})
    assert r2.status_code == 200
    assert "num_iterations" in r2.json()


# ─── GitLab ───────────────────────────────────────────────────────────────────

def test_gitlab_create_issue():
    r = client.post("/api/gitlab/issue",
                    json={"title": "Test Issue", "description": "Desc", "labels": ["test"]})
    assert r.status_code == 200
    assert r.json()["issue"]["title"] == "Test Issue"
    assert r.json()["issue"]["mock"] is True

def test_gitlab_list_mrs():
    assert "merge_requests" in client.get("/api/gitlab/mrs").json()

def test_gitlab_list_pipelines():
    assert "pipelines" in client.get("/api/gitlab/pipelines").json()


# ─── Deployment ───────────────────────────────────────────────────────────────

def test_deployment_status_no_artifact():
    r1 = client.post("/api/pipeline/start",
                     json={"feature_request": "Create user profile management API with CRUD operations"})
    pid = r1.json()["pipeline_id"]
    r2 = client.get(f"/api/deploy/{pid}")
    assert r2.status_code == 200
    d = r2.json()
    assert "deployment_status" in d
    assert d["pipeline_id"] == pid

def test_deployment_status_not_found():
    assert client.get("/api/deploy/deadbeef").status_code == 404

def test_deployment_agent_direct():
    """Test deployment agent runs and produces a valid Dockerfile."""
    from core.state import PipelineState
    from core.database import create_tables
    create_tables()
    s = PipelineState()
    s.init_db()
    pid = s.create_pipeline("deployment agent direct test feature request here")
    from agents.deployment_agent import run as run_deploy
    result = run_deploy(pid, "def main():\n    return 'hello'\n", {"passed": 5, "total": 5})
    assert result["status"] in ("deployed", "degraded")
    assert "dockerfile" in result
    assert "FROM python" in result["dockerfile"]
    assert result["health_checks"]
    assert "deployment_url" in result


# ─── Real bandit SAST ─────────────────────────────────────────────────────────

def test_real_bandit_shell_injection():
    from agents.security_agent import _run_bandit
    findings = _run_bandit("import subprocess\ndef run(cmd):\n    subprocess.call(cmd, shell=True)\n")
    assert len(findings) > 0
    assert any("shell" in f["name"].lower() or "subprocess" in f["name"].lower() for f in findings)

def test_real_bandit_sql_injection():
    from agents.security_agent import _run_bandit
    findings = _run_bandit("def get(uid):\n    return f'SELECT * FROM users WHERE id = {uid}'\n")
    assert len(findings) > 0
    assert any("sql" in f["name"].lower() or "B608" in f.get("bandit_id","") for f in findings)

def test_real_bandit_clean_code():
    from agents.security_agent import _run_bandit
    code = ("from sqlalchemy import text\nasync def get_user(db, uid: int):\n"
            "    return await db.execute(text('SELECT id FROM users WHERE id=:u'), {'u': uid})\n")
    findings = _run_bandit(code)
    assert not any(f["severity"] in ("HIGH", "CRITICAL") for f in findings)

def test_real_bandit_owasp_mapping():
    from agents.security_agent import _run_bandit
    findings = _run_bandit("import subprocess\nsubprocess.call('ls', shell=True)\n")
    for f in findings:
        assert f["owasp_ref"].startswith("A"), f"Bad OWASP ref: {f['owasp_ref']}"


# ─── Real PyPI ────────────────────────────────────────────────────────────────

def test_real_pypi_fetch():
    from agents.dependency_agent import _fetch_pypi_info
    info = _fetch_pypi_info("requests")
    assert info is not None
    parts = [int(x) for x in info["latest_version"].split(".")[:2]]
    assert parts >= [2, 31]

def test_real_pypi_unknown_package():
    from agents.dependency_agent import _fetch_pypi_info
    assert _fetch_pypi_info("this-package-does-not-exist-xyz-abc-123") is None

def test_cve_detection_vulnerable():
    from agents.dependency_agent import _check_cves
    cves = _check_cves("requests", "2.28.1")
    assert any("CVE-2023-32681" in c["cve"] for c in cves)

def test_cve_detection_patched():
    from agents.dependency_agent import _check_cves
    assert _check_cves("requests", "2.31.0") == []

def test_dependency_parser():
    from agents.dependency_agent import _parse_requirements
    pkgs = _parse_requirements("fastapi==0.88.0\nrequests==2.28.1\n# comment\npydantic==1.10.4")
    assert len(pkgs) == 3

def test_version_comparison():
    from agents.dependency_agent import _version_tuple
    assert _version_tuple("2.31.0") > _version_tuple("2.28.1")


# ─── Real pytest runner ───────────────────────────────────────────────────────

def test_real_pytest_passes():
    from agents.test_runner import run as run_tests
    from core.state import PipelineState
    from core.database import create_tables
    create_tables()
    s = PipelineState(); s.init_db()
    pid = s.create_pipeline("real pytest test pipeline for unit test verification")
    output = '''
```python
def add(a: float, b: float) -> float:
    return a + b
```
```python
import pytest
def test_add():
    from solution import add
    assert add(2, 3) == 5
def test_add_negative():
    from solution import add
    assert add(-1, 1) == 0
```
'''
    result = run_tests(pid, output)
    assert result["real_execution"] is True
    assert result["passed"] == 2
    assert result["failed"] == 0

def test_real_pytest_detects_failures():
    from agents.test_runner import run as run_tests
    from core.state import PipelineState
    from core.database import create_tables
    create_tables()
    s = PipelineState(); s.init_db()
    pid = s.create_pipeline("real pytest failure detection test pipeline here")
    output = '''
```python
def bad_add(a, b): return a - b
```
```python
def test_add():
    from solution import bad_add
    assert bad_add(2, 3) == 5
```
'''
    result = run_tests(pid, output)
    assert result["real_execution"] is True
    assert result["failed"] >= 1


# ─── Real benchmarks ──────────────────────────────────────────────────────────

def test_real_benchmark_positive():
    from agents.research_agent import _benchmark_code
    metrics = _benchmark_code("x = sum(range(1000))", runs=3)
    assert metrics["exit_code"] == 0
    assert metrics["execution_time_ms"] > 0

def test_real_benchmark_invalid_code():
    from agents.research_agent import _benchmark_code
    metrics = _benchmark_code("def broken(: pass", runs=1)
    assert metrics["exit_code"] != 0

def test_real_benchmark_lru_faster():
    from agents.research_agent import _benchmark_code
    slow = "def fib(n):\n    return fib(n-1)+fib(n-2) if n>1 else n\nfib(20)\n"
    fast = "import functools\n@functools.lru_cache\ndef fib(n):\n    return fib(n-1)+fib(n-2) if n>1 else n\nfib(20)\n"
    assert _benchmark_code(fast, runs=3)["execution_time_ms"] < _benchmark_code(slow, runs=3)["execution_time_ms"]


# ─── Core layer ───────────────────────────────────────────────────────────────

def test_state_7_stages():
    from core.state import PipelineState
    s = PipelineState()
    pid = s.create_pipeline("seven stage test pipeline feature request string")
    p = s.get_pipeline(pid)
    assert "deployment_agent" in p["stages"]
    assert len(p["stages"]) == 7

def test_state_cancellation():
    from core.state import PipelineState
    s = PipelineState()
    pid = s.create_pipeline("cancellation test feature request string here")
    assert s.is_cancelled(pid) is False
    assert s.request_cancel(pid) is True
    assert s.is_cancelled(pid) is True

def test_state_agent_tracking():
    from core.state import PipelineState
    s = PipelineState()
    pid = s.create_pipeline("agent tracking test pipeline feature request here")
    s.set_running_agent(pid, "Security Triage")
    assert s.get_running_agents()[pid] == "Security Triage"
    s.clear_running_agent(pid)
    assert pid not in s.get_running_agents()

def test_state_rlock_baseline():
    from core.state import PipelineState
    s = PipelineState()
    pid = s.create_pipeline("state rlock baseline test feature request string")
    sid = s.create_research_session(pid, baseline_ms=185.5)
    assert s.get_research_session(sid)["baseline_ms"] == 185.5

def test_vector_db_no_aliasing():
    from core.vector_db import VectorDB
    db = VectorDB()
    meta = {"pipeline_id": "abc", "tags": ["test"]}
    original = set(meta.keys())
    db.store_code("print('hello')", meta)
    assert set(meta.keys()) == original

def test_database_write_through():
    from core.state import PipelineState
    from core.database import create_tables, PipelineRepository, get_db
    import time
    create_tables()
    s = PipelineState(); s.init_db()
    pid = s.create_pipeline("DB write-through verification test feature request string")
    time.sleep(0.1)
    with get_db() as db:
        row = PipelineRepository.get(db, pid)
    assert row is not None

def test_auth_jwt_roundtrip():
    from core.auth import create_access_token, decode_token
    token = create_access_token("u-123", "testuser")
    payload = decode_token(token)
    assert payload["sub"] == "u-123"

def test_argon2_hash_verify():
    from core.auth import hash_password, verify_password
    h = hash_password("MyPass123!")
    assert verify_password("MyPass123!", h) is True
    assert verify_password("Wrong!", h) is False


# ─── Cleanup ──────────────────────────────────────────────────────────────────

def test_zzz_cleanup():
    db_path = os.getenv("DATABASE_URL", "").replace("sqlite:///./", "")
    if db_path and os.path.exists(db_path):
        os.remove(db_path)
    assert True
