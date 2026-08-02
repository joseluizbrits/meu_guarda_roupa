import uuid
from datetime import datetime

from pydantic import BaseModel


class AvatarUpsert(BaseModel):
    base_mesh_id: str
    morph_params: dict
    face_texture_asset_id: uuid.UUID | None = None


class AvatarRead(BaseModel):
    id: uuid.UUID
    base_mesh_id: str
    morph_params: dict
    face_texture_asset_id: uuid.UUID | None
    face_texture_url: str | None
    updated_at: datetime
