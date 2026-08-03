"""CRUD for a user's wardrobe items (a user has many, most-recent-first)."""

import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.wardrobe_item import WardrobeItem
from app.schemas.wardrobe_item import (
    WardrobeItemCreate,
    WardrobeItemRead,
    WardrobeItemUpdate,
)
from app.services import asset_service


async def create_item(
    db: AsyncSession, user: User, data: WardrobeItemCreate
) -> WardrobeItem:
    """Create a wardrobe item for the caller.

    Raises 400 if `photo_asset_id` doesn't reference an asset owned by this
    user — a user must not be able to point a wardrobe item at someone
    else's asset (same check/reasoning as avatar's face-texture ownership
    check).
    """
    asset = await asset_service.get_asset(db, data.photo_asset_id)
    if asset is None or asset.owner_user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="photo_asset_id does not reference an asset you own.",
        )

    item = WardrobeItem(user_id=user.id, **data.model_dump())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


async def list_items(db: AsyncSession, user: User) -> list[WardrobeItem]:
    result = await db.execute(
        select(WardrobeItem)
        .where(WardrobeItem.user_id == user.id)
        .order_by(WardrobeItem.created_at.desc())
    )
    return list(result.scalars().all())


async def get_item(
    db: AsyncSession, user: User, item_id: uuid.UUID
) -> WardrobeItem | None:
    """Only returns the item if it belongs to `user`.

    Returns `None` on a mismatch, same as not found, so item existence
    isn't revealed to non-owners.
    """
    result = await db.execute(
        select(WardrobeItem).where(WardrobeItem.id == item_id)
    )
    item = result.scalar_one_or_none()
    if item is None or item.user_id != user.id:
        return None
    return item


async def update_item(
    db: AsyncSession, user: User, item_id: uuid.UUID, data: WardrobeItemUpdate
) -> WardrobeItem | None:
    item = await get_item(db, user, item_id)
    if item is None:
        return None

    for field, value in data.model_dump().items():
        setattr(item, field, value)

    await db.commit()
    await db.refresh(item)
    return item


async def delete_item(db: AsyncSession, user: User, item_id: uuid.UUID) -> bool:
    item = await get_item(db, user, item_id)
    if item is None:
        return False

    await db.delete(item)
    await db.commit()
    return True


async def to_read(db: AsyncSession, item: WardrobeItem) -> WardrobeItemRead:
    """Build the response schema, resolving the photo's download URL
    server-side so the client doesn't need a second round-trip to render."""
    photo_url = await asset_service.get_download_url(db, item.photo_asset_id)

    return WardrobeItemRead(
        id=item.id,
        category=item.category,
        photo_asset_id=item.photo_asset_id,
        photo_url=photo_url,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )
