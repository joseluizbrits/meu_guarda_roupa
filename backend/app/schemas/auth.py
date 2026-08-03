from pydantic import BaseModel, EmailStr

from app.schemas.user import UserRead


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    # `None` on web — the refresh token lives in an httpOnly cookie there,
    # never touched by JS; native sends it explicitly (from
    # `expo-secure-store`). See `auth_service.refresh`.
    refresh_token: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserRead


class TokenPairResponse(BaseModel):
    """Access/refresh pair without the `user` payload — used by `/refresh`."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
