import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

WardrobeItemCategory = Literal[
    "top", "bottom", "dress", "outerwear", "shoes", "accessory"
]


class WardrobeItemCreate(BaseModel):
    category: WardrobeItemCategory
    photo_asset_id: uuid.UUID


class WardrobeItemUpdate(BaseModel):
    category: WardrobeItemCategory


class WardrobeItemSetTexture(BaseModel):
    texture_asset_id: uuid.UUID


class WardrobeItemRead(BaseModel):
    id: uuid.UUID
    category: str
    photo_asset_id: uuid.UUID
    photo_url: str
    texture_asset_id: uuid.UUID | None
    texture_url: str | None
    created_at: datetime
    updated_at: datetime
