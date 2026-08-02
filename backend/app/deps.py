from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import async_session_maker


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Request-scoped async DB session dependency."""
    async with async_session_maker() as session:
        yield session
