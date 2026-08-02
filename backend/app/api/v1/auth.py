from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db
from app.schemas.auth import LoginRequest, RefreshRequest, TokenPairResponse, TokenResponse
from app.schemas.user import UserCreate, UserRead
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(user_in: UserCreate, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    user = await auth_service.register(db, user_in)
    tokens = auth_service.issue_tokens(user)
    return TokenResponse(
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        user=UserRead.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
async def login(credentials: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    user = await auth_service.authenticate(db, credentials.email, credentials.password)
    tokens = auth_service.issue_tokens(user)
    return TokenResponse(
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        user=UserRead.model_validate(user),
    )


@router.post("/refresh", response_model=TokenPairResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)) -> TokenPairResponse:
    return await auth_service.refresh(db, body.refresh_token)
