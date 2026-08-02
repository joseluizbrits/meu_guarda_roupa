"""Upsert/read of a user's body measurements (one record per user)."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.measurements import BodyMeasurements
from app.models.user import User
from app.schemas.measurements import MeasurementsUpsert


async def get_measurements(db: AsyncSession, user: User) -> BodyMeasurements | None:
    result = await db.execute(
        select(BodyMeasurements).where(BodyMeasurements.user_id == user.id)
    )
    return result.scalar_one_or_none()


async def upsert_measurements(
    db: AsyncSession, user: User, data: MeasurementsUpsert
) -> BodyMeasurements:
    measurements = await get_measurements(db, user)

    if measurements is None:
        measurements = BodyMeasurements(user_id=user.id, **data.model_dump())
        db.add(measurements)
    else:
        for field, value in data.model_dump().items():
            setattr(measurements, field, value)

    await db.commit()
    await db.refresh(measurements)
    return measurements
