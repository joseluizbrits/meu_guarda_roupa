import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.asset import AssetRead, AssetUploadRequest, AssetUploadResponse
from app.services import asset_service

router = APIRouter(prefix="/assets", tags=["assets"])


@router.post(
    "/upload-url", response_model=AssetUploadResponse, status_code=status.HTTP_201_CREATED
)
async def create_upload_url(
    body: AssetUploadRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AssetUploadResponse:
    asset, upload_url, expires_in = await asset_service.create_upload_url(
        db, current_user, body.kind, body.content_type
    )
    return AssetUploadResponse(
        asset_id=asset.id, upload_url=upload_url, expires_in=expires_in
    )


@router.get("/{asset_id}", response_model=AssetRead)
async def read_asset(
    asset_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AssetRead:
    asset = await asset_service.get_asset(db, asset_id)
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found.")
    if asset.owner_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your asset.")

    download_url = await asset_service.get_download_url(db, asset_id)
    return AssetRead(
        id=asset.id,
        kind=asset.kind,
        content_type=asset.content_type,
        download_url=download_url,
    )
