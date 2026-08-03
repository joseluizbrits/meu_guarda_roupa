import uuid
from typing import Literal

from pydantic import BaseModel


class AssetUploadRequest(BaseModel):
    kind: Literal["face_texture", "garment_photo", "garment_texture", "garment_ai_photo"]
    content_type: str


class AssetUploadResponse(BaseModel):
    asset_id: uuid.UUID
    upload_url: str
    expires_in: int


class AssetRead(BaseModel):
    id: uuid.UUID
    kind: str
    content_type: str
    download_url: str
