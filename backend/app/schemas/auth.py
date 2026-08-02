from pydantic import BaseModel, EmailStr

from app.schemas.user import UserRead


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


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
