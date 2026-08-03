import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WardrobeItem(Base):
    """A garment photographed and stored in a user's digital wardrobe.

    A user has many wardrobe items (unlike measurements/avatar, which are
    one-per-user), so `user_id` is a plain indexed FK rather than unique.
    """

    __tablename__ = "wardrobe_items"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), index=True, nullable=False
    )
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    photo_asset_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("assets.id"), nullable=False
    )
    texture_asset_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("assets.id"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
