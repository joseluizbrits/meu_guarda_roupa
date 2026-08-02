import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Avatar(Base):
    """A user's avatar configuration (one record per user).

    `base_mesh_id` and `morph_params` are opaque to the backend — the
    mobile client owns their meaning/format, we just store and return them.
    """

    __tablename__ = "avatars"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), unique=True, nullable=False
    )

    base_mesh_id: Mapped[str] = mapped_column(String(255), nullable=False)
    morph_params: Mapped[dict] = mapped_column(JSONB, nullable=False)
    face_texture_asset_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("assets.id"), nullable=True
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
