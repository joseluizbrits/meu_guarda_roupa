from datetime import datetime

from pydantic import BaseModel, ConfigDict


class MeasurementsUpsert(BaseModel):
    height_cm: float
    chest_cm: float
    waist_cm: float
    hip_cm: float
    shoulder_cm: float
    inseam_cm: float


class MeasurementsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    height_cm: float
    chest_cm: float
    waist_cm: float
    hip_cm: float
    shoulder_cm: float
    inseam_cm: float
    updated_at: datetime
