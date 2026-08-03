from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db
from app.schemas.auth import LoginRequest, RefreshRequest, TokenPairResponse, TokenResponse
from app.schemas.user import UserCreate, UserRead
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(user_in: UserCreate, response: Response, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    user = await auth_service.register(db, user_in)
    tokens = auth_service.issue_tokens(user)
    auth_service.set_auth_cookies(response, tokens)
    return TokenResponse(
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        user=UserRead.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
async def login(credentials: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    user = await auth_service.authenticate(db, credentials.email, credentials.password)
    tokens = auth_service.issue_tokens(user)
    auth_service.set_auth_cookies(response, tokens)
    return TokenResponse(
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        user=UserRead.model_validate(user),
    )


@router.post("/refresh", response_model=TokenPairResponse)
async def refresh(
    body: RefreshRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)
) -> TokenPairResponse:
    # Native sends the refresh token in the body; web's lives in an
    # httpOnly cookie instead (never touched by JS) — see tokenStorage.ts.
    refresh_token = body.refresh_token or request.cookies.get("refresh_token")
    tokens = await auth_service.refresh(db, refresh_token)
    auth_service.set_auth_cookies(response, tokens)
    return TokenPairResponse(access_token=tokens.access_token, refresh_token=tokens.refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response) -> None:
    """Clears the web client's auth cookies. Native has nothing to clear
    server-side (`expo-secure-store` is local-only) — this only matters
    for web, but is harmless to call from either platform."""
    auth_service.clear_auth_cookies(response)
