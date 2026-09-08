import asyncio
import logging
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.storage import s3_client
from app.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.wardrobe_item import (
    DetectionResult,
    WardrobeItemCreate,
    WardrobeItemDetectRequest,
    WardrobeItemRead,
    WardrobeItemSetTexture,
    WardrobeItemUpdate,
    WardrobeItemVirtualize,
)
from app.services import asset_service, wardrobe_service
from app.services.detection_service import AiKeyMissingError, detect_garments

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/wardrobe-items", tags=["wardrobe"])


@router.post(
    "", response_model=WardrobeItemRead, status_code=status.HTTP_201_CREATED
)
async def create_wardrobe_item(
    data: WardrobeItemCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WardrobeItemRead:
    item = await wardrobe_service.create_item(db, current_user, data, background_tasks)
    return await wardrobe_service.to_read(db, item)


@router.get("", response_model=list[WardrobeItemRead])
async def list_wardrobe_items(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[WardrobeItemRead]:
    items = await wardrobe_service.list_items(db, current_user)
    return [await wardrobe_service.to_read(db, item) for item in items]


@router.post("/detect", response_model=DetectionResult)
async def detect_wardrobe_items(
    data: WardrobeItemDetectRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DetectionResult:
    asset = await asset_service.get_asset(db, data.photo_asset_id)
    if asset is None or asset.owner_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Photo asset not found.",
        )

    def _fetch_and_detect() -> list:
        response = s3_client.get_object(
            Bucket=settings.minio_bucket, Key=asset.storage_key
        )
        image_bytes = response["Body"].read()
        return detect_garments(image_bytes)

    try:
        pieces = await asyncio.to_thread(_fetch_and_detect)
    except AiKeyMissingError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        )
    except Exception:
        logger.exception("Garment detection failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Garment detection failed — try again later.",
        )

    return DetectionResult(pieces=pieces)


@router.get("/{item_id}", response_model=WardrobeItemRead)
async def read_wardrobe_item(
    item_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WardrobeItemRead:
    item = await wardrobe_service.get_item(db, current_user, item_id)
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Wardrobe item not found."
        )
    return await wardrobe_service.to_read(db, item)


@router.patch("/{item_id}", response_model=WardrobeItemRead)
async def update_wardrobe_item(
    item_id: uuid.UUID,
    data: WardrobeItemUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WardrobeItemRead:
    item = await wardrobe_service.update_item(db, current_user, item_id, data)
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Wardrobe item not found."
        )
    return await wardrobe_service.to_read(db, item)


@router.put("/{item_id}/texture", response_model=WardrobeItemRead)
async def set_wardrobe_item_texture(
    item_id: uuid.UUID,
    data: WardrobeItemSetTexture,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WardrobeItemRead:
    item = await wardrobe_service.set_texture(
        db, current_user, item_id, data.texture_asset_id
    )
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Wardrobe item not found."
        )
    return await wardrobe_service.to_read(db, item)


@router.post("/{item_id}/virtualize", response_model=WardrobeItemRead)
async def virtualize_wardrobe_item(
    item_id: uuid.UUID,
    data: WardrobeItemVirtualize,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WardrobeItemRead:
    item = await wardrobe_service.virtualize_item(
        db, current_user, item_id, data.mask_asset_id
    )
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Wardrobe item not found."
        )
    return await wardrobe_service.to_read(db, item)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_wardrobe_item(
    item_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    deleted = await wardrobe_service.delete_item(db, current_user, item_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Wardrobe item not found."
        )
