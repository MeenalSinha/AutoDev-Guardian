"""
Authentication endpoints.

POST /api/auth/token    — login, returns JWT
POST /api/auth/register — create new user
GET  /api/auth/me       — current user info
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, Field, EmailStr
from slowapi import Limiter
from slowapi.util import get_remote_address

from core.auth import (
    authenticate_user, create_user, create_access_token,
    get_user_by_username, require_user, UserPublic, TokenResponse,
    EXPIRE_MINUTES
)
from core.database import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=32, pattern=r"^[a-zA-Z0-9_]+$")
    email: str = Field(..., min_length=5, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)


@router.post("/token", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(request: Request, form: OAuth2PasswordRequestForm = Depends()):
    """Standard OAuth2 password flow. Returns a Bearer JWT."""
    with get_db() as db:
        user_dict = authenticate_user(db, form.username, form.password)
    if not user_dict:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = create_access_token(user_dict["id"], user_dict["username"])
    logger.info("User logged in: %s", user_dict["username"])
    return TokenResponse(access_token=token, expires_in=EXPIRE_MINUTES * 60)


@router.post("/register", response_model=UserPublic, status_code=201)
@limiter.limit("5/minute")
def register(request: Request, req: RegisterRequest):
    """Register a new user account."""
    with get_db() as db:
        if get_user_by_username(db, req.username):
            raise HTTPException(status_code=409, detail="Username already taken")
        user_dict = create_user(db, req.username, req.email, req.password)
    logger.info("New user registered: %s", req.username)
    return UserPublic(**user_dict)


@router.get("/me", response_model=UserPublic)
def me(current_user: UserPublic = Depends(require_user)):
    """Returns the currently authenticated user's profile."""
    return current_user
