from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.avatar import AvatarRead, AvatarUpsert
from app.schemas.measurements import MeasurementsRead, MeasurementsUpsert
from app.schemas.user import UserRead, UserUpdate
from app.services import avatar_service, measurements_service, user_service

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserRead)
async def read_current_user(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.patch("/me", response_model=UserRead)
async def update_current_user(
    user_in: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    return await user_service.update_user(db, current_user, user_in)


@router.put("/me/measurements", response_model=MeasurementsRead)
async def upsert_measurements(
    data: MeasurementsUpsert,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MeasurementsRead:
    return await measurements_service.upsert_measurements(db, current_user, data)


@router.get("/me/measurements", response_model=MeasurementsRead)
async def read_measurements(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MeasurementsRead:
    measurements = await measurements_service.get_measurements(db, current_user)
    if measurements is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No measurements set for this user yet.",
        )
    return measurements


@router.put("/me/avatar", response_model=AvatarRead)
async def upsert_avatar(
    data: AvatarUpsert,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AvatarRead:
    avatar = await avatar_service.upsert_avatar(db, current_user, data)
    return await avatar_service.to_read(db, avatar)


@router.get("/me/avatar", response_model=AvatarRead)
async def read_avatar(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AvatarRead:
    avatar = await avatar_service.get_avatar(db, current_user)
    if avatar is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No avatar configured for this user yet.",
        )
    return await avatar_service.to_read(db, avatar)
