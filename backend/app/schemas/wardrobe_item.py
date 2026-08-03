import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

WardrobeItemCategory = Literal[
    "top", "bottom", "dress", "outerwear", "shoes", "accessory"
]


class MlLabel(BaseModel):
    text: str
    confidence: float


class GarmentMlAnalysisCreate(BaseModel):
    """Everything the on-device classifier returned for the tagged photo.

    Never shown to the user — stored to retrain/tune the classifier and
    segmentation pipeline later. `raw_labels` is the full, unfiltered ML
    Kit output, not just the label(s) the classifier's gate acted on.
    """

    raw_labels: list[MlLabel]
    is_likely_garment: bool | None = None
    top_label: str | None = None
    top_confidence: float | None = None
    segmentation_succeeded: bool = False


class WardrobeItemCreate(BaseModel):
    category: WardrobeItemCategory
    photo_asset_id: uuid.UUID
    ml_analysis: GarmentMlAnalysisCreate | None = None


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
