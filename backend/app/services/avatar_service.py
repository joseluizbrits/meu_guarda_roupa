"""Upsert/read of a user's avatar configuration (one record per user)."""

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.avatar import Avatar
from app.models.user import User
from app.schemas.avatar import AvatarRead, AvatarUpsert
from app.services import asset_service


async def get_avatar(db: AsyncSession, user: User) -> Avatar | None:
    result = await db.execute(select(Avatar).where(Avatar.user_id == user.id))
    return result.scalar_one_or_none()


async def upsert_avatar(db: AsyncSession, user: User, data: AvatarUpsert) -> Avatar:
    """Create or update the caller's avatar config.

    Raises 400 if `face_texture_asset_id` is set but doesn't reference an
    asset owned by this user — a user must not be able to point their
    avatar at someone else's asset.
    """
    if data.face_texture_asset_id is not None:
        asset = await asset_service.get_asset(db, data.face_texture_asset_id)
        if asset is None or asset.owner_user_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="face_texture_asset_id does not reference an asset you own.",
            )

    avatar = await get_avatar(db, user)

    if avatar is None:
        avatar = Avatar(user_id=user.id, **data.model_dump())
        db.add(avatar)
    else:
        for field, value in data.model_dump().items():
            setattr(avatar, field, value)

    await db.commit()
    await db.refresh(avatar)
    return avatar


async def to_read(db: AsyncSession, avatar: Avatar) -> AvatarRead:
    """Build the response schema, resolving the face texture's download URL
    server-side so the client doesn't need a second round-trip to render."""
    face_texture_url = None
    if avatar.face_texture_asset_id is not None:
        face_texture_url = await asset_service.get_download_url(
            db, avatar.face_texture_asset_id
        )

    return AvatarRead(
        id=avatar.id,
        base_mesh_id=avatar.base_mesh_id,
        morph_params=avatar.morph_params,
        face_texture_asset_id=avatar.face_texture_asset_id,
        face_texture_url=face_texture_url,
        updated_at=avatar.updated_at,
    )
