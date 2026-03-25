"""
JWT Authentication layer.

Passwords hashed with Argon2id (argon2-cffi) — winner of the Password Hashing
Competition, recommended over bcrypt for new projects. No 72-byte length limit.

Tokens signed with HS256 (python-jose). Expiry via JWT_EXPIRE_MINUTES env var.

Default demo credentials created on first boot if no users exist:
  username: admin  |  password: AdminPass123!
  (Override via DEFAULT_ADMIN_PASSWORD env var)
"""
import os
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy.orm import Session

from core.database import UserModel, get_db

logger = logging.getLogger(__name__)

# ─── Config ──────────────────────────────────────────────────────────────────

SECRET_KEY = os.getenv(
    "JWT_SECRET_KEY",
    "CHANGE_ME_IN_PRODUCTION_use_openssl_rand_hex_32"
)
ALGORITHM = "HS256"
EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "480"))

# Argon2id with OWASP-recommended parameters (time=2, memory=64MB, parallelism=1)
_ph = PasswordHasher(time_cost=2, memory_cost=65536, parallelism=1)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token", auto_error=False)


# ─── Pydantic schemas ─────────────────────────────────────────────────────────

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class UserPublic(BaseModel):
    id: str
    username: str
    email: str
    is_active: bool


# ─── Password helpers ─────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    """Hash password with Argon2id."""
    return _ph.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """Verify password against Argon2id hash. Returns False on any failure."""
    try:
        return _ph.verify(hashed, plain)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


# ─── Token helpers ────────────────────────────────────────────────────────────

def create_access_token(user_id: str, username: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=EXPIRE_MINUTES)
    payload = {
        "sub": user_id,
        "username": username,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


# ─── User management ──────────────────────────────────────────────────────────

def get_user_by_username(db: Session, username: str) -> Optional[UserModel]:
    return (
        db.query(UserModel)
        .filter(UserModel.username == username)
        .first()
    )


def create_user(
    db: Session, username: str, email: str, password: str
) -> dict:
    """Returns a plain dict so callers are never exposed to a detached ORM instance."""
    user = UserModel(
        id=str(uuid.uuid4()),
        username=username,
        email=email,
        hashed_password=hash_password(password),
        is_active=True,
        created_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    # Eagerly read scalars while session is open
    return {"id": user.id, "username": user.username,
            "email": user.email, "is_active": user.is_active}


def authenticate_user(
    db: Session, username: str, password: str
) -> Optional[dict]:
    """Returns a plain dict so callers are never exposed to a detached ORM instance."""
    user = get_user_by_username(db, username)
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    user.last_login = datetime.now(timezone.utc)
    # Eagerly read scalars before commit() expires the instance
    result = {"id": user.id, "username": user.username,
              "email": user.email, "is_active": user.is_active}
    db.commit()
    return result


# ─── FastAPI dependencies ─────────────────────────────────────────────────────

def get_current_user(
    token: str = Depends(oauth2_scheme),
) -> Optional[UserPublic]:
    """
    Returns authenticated user or None.
    Use require_user() for routes that must be authenticated.
    """
    if not token:
        return None
    payload = decode_token(token)
    if not payload:
        return None
    with get_db() as db:
        user = db.get(UserModel, payload.get("sub"))
        if not user or not user.is_active:
            return None
        return UserPublic(
            id=user.id,
            username=user.username,
            email=user.email,
            is_active=user.is_active,
        )


def require_user(
    current_user: Optional[UserPublic] = Depends(get_current_user),
) -> UserPublic:
    """FastAPI dependency that raises 401 if no valid token is provided."""
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return current_user


# ─── First-boot admin seed ────────────────────────────────────────────────────

def seed_default_user() -> None:
    """Create default admin user on first boot if the users table is empty."""
    default_password = os.getenv("DEFAULT_ADMIN_PASSWORD", "AdminPass123!")
    try:
        with get_db() as db:
            if db.query(UserModel).count() == 0:
                create_user(db, "admin", "admin@autodev.local", default_password)
                logger.info(
                    "Default admin created. username=admin password=%s "
                    "(override via DEFAULT_ADMIN_PASSWORD env var)",
                    default_password,
                )
    except Exception as exc:
        logger.warning("Could not seed default user: %s", exc)
