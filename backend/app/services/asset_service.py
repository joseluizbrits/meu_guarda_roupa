"""Generic blob-reference (`Asset`) creation and presigned URL issuance."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.storage import s3_client
from app.models.asset import Asset
from app.models.user import User

_PRESIGNED_URL_EXPIRES_IN = 15 * 60  # 15 minutes


async def create_upload_url(
    db: AsyncSession, user: User, kind: str, content_type: str
) -> tuple[Asset, str, int]:
    """Create an `Asset` row and a presigned PUT URL for its bytes.

    MVP simplification: there is no separate "confirm upload" step — the
    `Asset` row is created immediately and the client is trusted to PUT
    the bytes to the returned URL right after.
    """
    storage_key = f"{kind}/{user.id}/{uuid.uuid4()}"

    asset = Asset(
        kind=kind,
        storage_key=storage_key,
        content_type=content_type,
        owner_user_id=user.id,
    )
    db.add(asset)
    await db.commit()
    await db.refresh(asset)

    upload_url = s3_client.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.minio_bucket,
            "Key": storage_key,
            "ContentType": content_type,
        },
        ExpiresIn=_PRESIGNED_URL_EXPIRES_IN,
    )

    return asset, upload_url, _PRESIGNED_URL_EXPIRES_IN


async def get_asset(db: AsyncSession, asset_id: uuid.UUID) -> Asset | None:
    result = await db.execute(select(Asset).where(Asset.id == asset_id))
    return result.scalar_one_or_none()


async def get_download_url(db: AsyncSession, asset_id: uuid.UUID) -> str | None:
    """Presigned GET URL for an existing asset, or `None` if it doesn't exist."""
    asset = await get_asset(db, asset_id)
    if asset is None:
        return None

    return s3_client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.minio_bucket, "Key": asset.storage_key},
        ExpiresIn=_PRESIGNED_URL_EXPIRES_IN,
    )
