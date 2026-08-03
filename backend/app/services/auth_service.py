"""Registration, authentication and token issuance/refresh."""

import uuid
from dataclasses import dataclass

import jwt
from fastapi import HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_csrf_token,
    hash_password,
    verify_password,
)
from app.models.user import User
from app.schemas.user import UserCreate

_ACCESS_TOKEN_MAX_AGE = settings.access_token_expire_minutes * 60
_REFRESH_TOKEN_MAX_AGE = settings.refresh_token_expire_days * 24 * 60 * 60


@dataclass
class IssuedTokens:
    """Superset of `TokenPairResponse` — also carries the CSRF token, which
    is cookie-only and never part of a JSON response body."""

    access_token: str
    refresh_token: str
    csrf_token: str
    token_type: str = "bearer"


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def register(db: AsyncSession, user_in: UserCreate) -> User:
    """Create a new user account. Raises 409 on duplicate email."""
    existing = await get_user_by_email(db, user_in.email)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists.",
        )

    user = User(
        email=user_in.email,
        hashed_password=hash_password(user_in.password),
        full_name=user_in.full_name,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def authenticate(db: AsyncSession, email: str, password: str) -> User:
    """Verify email+password. Raises 401 on failure."""
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect email or password.",
    )

    user = await get_user_by_email(db, email)
    if user is None or not verify_password(password, user.hashed_password):
        raise unauthorized

    return user


def issue_tokens(user: User) -> IssuedTokens:
    """Build a fresh access+refresh+CSRF token set for a user."""
    subject = str(user.id)
    return IssuedTokens(
        access_token=create_access_token(subject),
        refresh_token=create_refresh_token(subject),
        csrf_token=generate_csrf_token(),
    )


def set_auth_cookies(response: Response, tokens: IssuedTokens) -> None:
    """Sets the web client's auth cookies. Native ignores these entirely —
    it authenticates via the `Authorization` header instead (see
    `deps.get_current_user`) — so this is harmless to call unconditionally
    from every route that issues tokens.

    `access_token`/`refresh_token` are httpOnly (never JS-readable, the
    actual XSS mitigation this whole cookie switch is for); `csrf_token`
    isn't — it has to be readable so the web client can echo it back as a
    header (double-submit pattern, checked in `main.py`'s
    `csrf_protection` middleware).
    """
    cookie_kwargs = {"samesite": "lax", "secure": settings.secure_cookies, "path": "/"}
    response.set_cookie("access_token", tokens.access_token, max_age=_ACCESS_TOKEN_MAX_AGE, httponly=True, **cookie_kwargs)
    response.set_cookie("refresh_token", tokens.refresh_token, max_age=_REFRESH_TOKEN_MAX_AGE, httponly=True, **cookie_kwargs)
    response.set_cookie("csrf_token", tokens.csrf_token, max_age=_REFRESH_TOKEN_MAX_AGE, httponly=False, **cookie_kwargs)


def clear_auth_cookies(response: Response) -> None:
    """Logout, web side. Cookies set `httponly=True` can't be cleared by
    JS (`document.cookie`) at all — this has to come from the server."""
    for name in ("access_token", "refresh_token", "csrf_token"):
        response.delete_cookie(name, path="/", samesite="lax", secure=settings.secure_cookies)


async def refresh(db: AsyncSession, refresh_token: str | None) -> IssuedTokens:
    """Verify a refresh token and issue a new access+refresh+CSRF set.

    Raises 401 if the token is missing, invalid, expired, or not a
    `refresh` token, or if the user it refers to no longer exists.
    """
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired refresh token.",
    )

    if refresh_token is None:
        raise unauthorized

    try:
        payload = decode_token(refresh_token)
    except jwt.PyJWTError:
        raise unauthorized

    if payload.get("type") != "refresh":
        raise unauthorized

    user_id = payload.get("sub")
    if user_id is None:
        raise unauthorized
    try:
        user_uuid = uuid.UUID(user_id)
    except (ValueError, TypeError):
        raise unauthorized

    result = await db.execute(select(User).where(User.id == user_uuid))
    user = result.scalar_one_or_none()
    if user is None:
        raise unauthorized

    return issue_tokens(user)
