import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class GarmentMlAnalysis(Base):
    """ML signal captured for a wardrobe item's photo at tagging time.

    Not shown to the user — kept to retrain/tune the on-device classifier
    and segmentation pipeline later without needing to re-run inference
    against the raw photo from scratch. `ondelete="CASCADE"` so deleting a
    wardrobe item (e.g. an account/data-deletion request) never leaves this
    behind.
    """

    __tablename__ = "garment_ml_analyses"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    wardrobe_item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("wardrobe_items.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    raw_labels: Mapped[list] = mapped_column(JSONB, nullable=False)
    is_likely_garment: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    top_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    top_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    segmentation_succeeded: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
