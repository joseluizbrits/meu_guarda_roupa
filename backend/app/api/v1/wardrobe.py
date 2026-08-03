import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.wardrobe_item import (
    WardrobeItemCreate,
    WardrobeItemRead,
    WardrobeItemUpdate,
)
from app.services import wardrobe_service

router = APIRouter(prefix="/wardrobe-items", tags=["wardrobe"])


@router.post(
    "", response_model=WardrobeItemRead, status_code=status.HTTP_201_CREATED
)
async def create_wardrobe_item(
    data: WardrobeItemCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WardrobeItemRead:
    item = await wardrobe_service.create_item(db, current_user, data)
    return await wardrobe_service.to_read(db, item)


@router.get("", response_model=list[WardrobeItemRead])
async def list_wardrobe_items(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[WardrobeItemRead]:
    items = await wardrobe_service.list_items(db, current_user)
    return [await wardrobe_service.to_read(db, item) for item in items]


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
