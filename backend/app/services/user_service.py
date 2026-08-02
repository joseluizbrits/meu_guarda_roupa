"""Business logic for the current user's own profile."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.schemas.user import UserUpdate


async def update_user(db: AsyncSession, user: User, user_in: UserUpdate) -> User:
    if user_in.full_name is not None:
        user.full_name = user_in.full_name

    await db.commit()
    await db.refresh(user)
    return user
