import uuid
from typing import AsyncGenerator

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.db.base import async_session_maker
from app.models.user import User


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Request-scoped async DB session dependency."""
    async with async_session_maker() as session:
        yield session


# tokenUrl points at the login route for OpenAPI docs; auth itself is
# stateless JWT verified below, not an OAuth2 flow.
_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


async def get_current_user(
    token: str | None = Depends(_oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Extract and validate a Bearer access token, then load the user.

    401 on any failure: missing header, bad signature, expired, wrong
    `type` claim, or the user no longer exists.
    """
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if token is None:
        raise unauthorized

    try:
        payload = decode_token(token)
    except jwt.PyJWTError:
        raise unauthorized

    if payload.get("type") != "access":
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

    return user
