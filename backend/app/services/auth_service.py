"""Registration, authentication and token issuance/refresh."""

import uuid

import jwt
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.user import User
from app.schemas.auth import TokenPairResponse
from app.schemas.user import UserCreate


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


def issue_tokens(user: User) -> TokenPairResponse:
    """Build a fresh access+refresh JWT pair for a user."""
    subject = str(user.id)
    return TokenPairResponse(
        access_token=create_access_token(subject),
        refresh_token=create_refresh_token(subject),
    )


async def refresh(db: AsyncSession, refresh_token: str) -> TokenPairResponse:
    """Verify a refresh token and issue a new access+refresh pair.

    Raises 401 if the token is invalid, expired, or not a `refresh` token,
    or if the user it refers to no longer exists.
    """
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired refresh token.",
    )

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
