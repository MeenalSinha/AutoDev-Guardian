"""
Pytest session setup.

Creates DB tables and seeds the admin user BEFORE any test imports the app,
so that the auth fixture can log in without a "no such table: users" error.
"""
import os

# Env must be set before any local imports that read os.getenv() at module level
os.environ.setdefault("DEMO_MODE", "true")
os.environ.setdefault("GITLAB_MOCK", "true")
os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:3000")
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_autodev.db")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-32-chars-minimum!!")
os.environ.setdefault("JWT_EXPIRE_MINUTES", "60")
os.environ.setdefault("DEFAULT_ADMIN_PASSWORD", "TestPass123!")
os.environ.setdefault("LOG_LEVEL", "ERROR")

# Now safe to import DB layer
from core.database import create_tables
from core.auth import seed_default_user


def pytest_sessionstart(worker_id=None):
    """Called once before any tests are collected or run."""
    create_tables()
    seed_default_user()
