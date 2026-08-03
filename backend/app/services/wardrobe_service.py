"""CRUD for a user's wardrobe items (a user has many, most-recent-first)."""

import logging
import uuid

from fastapi import BackgroundTasks, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.storage import s3_client
from app.db.base import async_session_maker
from app.models.asset import Asset
from app.models.garment_ml_analysis import GarmentMlAnalysis
from app.models.user import User
from app.models.wardrobe_item import WardrobeItem
from app.schemas.wardrobe_item import (
    WardrobeItemCreate,
    WardrobeItemRead,
    WardrobeItemSetTexture,
    WardrobeItemUpdate,
)
from app.services import ai_image_service, asset_service

logger = logging.getLogger(__name__)


async def create_item(
    db: AsyncSession,
    user: User,
    data: WardrobeItemCreate,
    background_tasks: BackgroundTasks,
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

    item_fields = data.model_dump(exclude={"ml_analysis"})
    item = WardrobeItem(user_id=user.id, **item_fields)
    db.add(item)
    await db.commit()
    await db.refresh(item)

    if data.ml_analysis is not None:
        analysis = GarmentMlAnalysis(
            wardrobe_item_id=item.id,
            **data.ml_analysis.model_dump(),
        )
        db.add(analysis)
        await db.commit()

    # Fire-and-forget: runs after the response is sent, so it never slows
    # down (or can fail) the actual save. See _generate_ai_photo.
    background_tasks.add_task(_generate_ai_photo, item.id)

    return item


async def _generate_ai_photo(item_id: uuid.UUID) -> None:
    """Downloads the item's raw photo, asks OpenAI for a clean product-photo
    edit of it, and stores the result as a new asset + ai_photo_asset_id.

    Runs as a `BackgroundTasks` job (see `create_item`), so it has no
    request-scoped DB session to reuse — opens its own. Best-effort: any
    failure (missing OPENAI_API_KEY, network/API error, storage error) is
    logged and swallowed, leaving ai_photo_asset_id null, exactly like a
    failed on-device segmentation leaves texture_asset_id null.
    """
    try:
        async with async_session_maker() as db:
            item = await db.get(WardrobeItem, item_id)
            if item is None:
                return

            photo_asset = await asset_service.get_asset(db, item.photo_asset_id)
            if photo_asset is None:
                return

            raw_object = s3_client.get_object(
                Bucket=settings.minio_bucket, Key=photo_asset.storage_key
            )
            raw_bytes = raw_object["Body"].read()

            ai_bytes = ai_image_service.generate_clean_product_photo(raw_bytes)
            if ai_bytes is None:
                return

            storage_key = f"garment_ai_photo/{item.user_id}/{uuid.uuid4()}"
            s3_client.put_object(
                Bucket=settings.minio_bucket,
                Key=storage_key,
                Body=ai_bytes,
                ContentType="image/png",
            )

            asset = Asset(
                kind="garment_ai_photo",
                storage_key=storage_key,
                content_type="image/png",
                owner_user_id=item.user_id,
            )
            db.add(asset)
            await db.commit()
            await db.refresh(asset)

            item.ai_photo_asset_id = asset.id
            await db.commit()
    except Exception:
        logger.exception("AI clean product photo pipeline failed for item %s", item_id)


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


async def set_texture(
    db: AsyncSession, user: User, item_id: uuid.UUID, texture_asset_id: uuid.UUID
) -> WardrobeItem | None:
    """Attach a processed (background-removed) texture to an existing item.

    Returns `None` if the item doesn't exist/isn't owned by `user` (caller
    maps that to 404). Raises 400 if `texture_asset_id` doesn't reference
    an asset owned by this user — same ownership check as `create_item`'s
    `photo_asset_id` check.
    """
    item = await get_item(db, user, item_id)
    if item is None:
        return None

    asset = await asset_service.get_asset(db, texture_asset_id)
    if asset is None or asset.owner_user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="texture_asset_id does not reference an asset you own.",
        )

    item.texture_asset_id = texture_asset_id
    await db.commit()
    await db.refresh(item)
    return item


async def to_read(db: AsyncSession, item: WardrobeItem) -> WardrobeItemRead:
    """Build the response schema, resolving the photo's (and, if set, the
    texture's) download URL server-side so the client doesn't need a
    second round-trip to render."""
    photo_url = await asset_service.get_download_url(db, item.photo_asset_id)

    texture_url = None
    if item.texture_asset_id is not None:
        texture_url = await asset_service.get_download_url(
            db, item.texture_asset_id
        )

    ai_photo_url = None
    if item.ai_photo_asset_id is not None:
        ai_photo_url = await asset_service.get_download_url(
            db, item.ai_photo_asset_id
        )

    return WardrobeItemRead(
        id=item.id,
        category=item.category,
        photo_asset_id=item.photo_asset_id,
        photo_url=photo_url,
        texture_asset_id=item.texture_asset_id,
        texture_url=texture_url,
        ai_photo_asset_id=item.ai_photo_asset_id,
        ai_photo_url=ai_photo_url,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )
