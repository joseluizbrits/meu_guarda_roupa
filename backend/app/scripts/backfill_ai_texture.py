"""One-off backfill: generate the transparent avatar texture
(`ai_texture_asset_id`) for every wardrobe item that already has an AI
product photo but was created before the keying step existed.

Run inside the api container:
    python -m app.scripts.backfill_ai_texture

Idempotent (skips items that already have ai_texture_asset_id); safe to
re-run. Pure callback work, no OpenAI spend — it only keyes the existing
white background to transparent.
"""

import asyncio
import logging
import uuid

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.storage import s3_client
from app.db.base import async_session_maker
from app.models.asset import Asset
from app.models.wardrobe_item import WardrobeItem
from app.services import ai_image_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def _backfill_one(db: AsyncSession, item: WardrobeItem) -> bool:
    try:
        photo_asset = await db.get(Asset, item.ai_photo_asset_id)
        if photo_asset is None:
            logger.warning("item %s: ai_photo asset missing, skipping", item.id)
            return False

        obj = s3_client.get_object(
            Bucket=settings.minio_bucket, Key=photo_asset.storage_key
        )
        ai_bytes = obj["Body"].read()

        texture_bytes = ai_image_service.make_transparent_texture(ai_bytes)
        storage_key = f"garment_ai_texture/{item.user_id}/{uuid.uuid4()}"
        s3_client.put_object(
            Bucket=settings.minio_bucket,
            Key=storage_key,
            Body=texture_bytes,
            ContentType="image/png",
        )
        asset = Asset(
            kind="garment_ai_texture",
            storage_key=storage_key,
            content_type="image/png",
            owner_user_id=item.user_id,
        )
        db.add(asset)
        await db.commit()
        await db.refresh(asset)

        item.ai_texture_asset_id = asset.id
        await db.commit()
        return True
    except Exception:
        logger.exception("backfill failed for item %s", item.id)
        return False


async def main() -> None:
    async with async_session_maker() as db:
        result = await db.execute(
            select(WardrobeItem).where(
                and_(
                    WardrobeItem.ai_photo_asset_id.is_not(None),
                    WardrobeItem.ai_texture_asset_id.is_(None),
                )
            )
        )
        items = list(result.scalars().all())
    logger.info("found %d items to backfill", len(items))

    done = 0
    for item in items:
        async with async_session_maker() as db:
            if await _backfill_one(db, item):
                done += 1
    logger.info("backfill complete: %d/%d OK", done, len(items))


if __name__ == "__main__":
    asyncio.run(main())