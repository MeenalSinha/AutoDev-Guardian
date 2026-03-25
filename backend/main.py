"""
AutoDev Guardian AI — FastAPI Application

Boot order is strict:
1. load_dotenv() — must run before any module-level os.getenv()
2. Logging setup
3. lifespan context manager defined (DB init, seed, cache warm)
4. App instantiated with lifespan
5. Middleware and routers registered
"""
import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv

# ── 1. Environment — MUST be first ────────────────────────────────────────────
load_dotenv(override=False)

# ── 2. Logging ────────────────────────────────────────────────────────────────
from core.logging_config import setup_logging
setup_logging()

import logging
logger = logging.getLogger(__name__)

# ── 3. Remaining imports (env + logging are now configured) ───────────────────
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from api.routes import router as api_router
from api.auth_routes import router as auth_router
from core.database import create_tables
from core.auth import seed_default_user
from core.state import state

# ── 4. Lifespan — defined BEFORE app instantiation ───────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    logger.info("Starting AutoDev Guardian AI...")
    create_tables()
    seed_default_user()
    state.init_db()
    logger.info("AutoDev Guardian AI ready.")
    yield
    logger.info("AutoDev Guardian AI shutting down.")

# ── 5. App ────────────────────────────────────────────────────────────────────

limiter = Limiter(key_func=get_remote_address)

ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000",
).split(",")

app = FastAPI(
    lifespan=lifespan,
    title="AutoDev Guardian AI",
    description="Autonomous, Secure, Self-Improving Software Engineer",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
)

MAX_REQUEST_SIZE = int(os.getenv("MAX_REQUEST_SIZE_BYTES", str(10 * 1024 * 1024)))


@app.middleware("http")
async def limit_request_size(request: Request, call_next):
    cl = request.headers.get("content-length")
    if cl and int(cl) > MAX_REQUEST_SIZE:
        return JSONResponse(status_code=413, content={"detail": "Request too large"})
    return await call_next(request)


# ── 6. Routers ────────────────────────────────────────────────────────────────

app.include_router(api_router, prefix="/api")
app.include_router(auth_router, prefix="/api")


# ── 7. Health ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "AutoDev Guardian AI",
        "version": "1.0.0",
        "demo_mode": os.getenv("DEMO_MODE", "true").lower() == "true",
        "gitlab_mock": os.getenv("GITLAB_MOCK", "true").lower() == "true",
        "db": os.getenv("DATABASE_URL", "sqlite:///./autodev_guardian.db").split("://")[0],
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
