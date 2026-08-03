from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1 import router as api_v1_router
from app.core.config import settings
from app.core.storage import ensure_bucket_exists

_CSRF_PROTECTED_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    ensure_bucket_exists()
    yield


app = FastAPI(title="Meu Guarda-roupa API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def csrf_protection(request: Request, call_next):
    """Double-submit CSRF check for cookie-authenticated requests.

    Only applies when an `access_token` cookie is present — that's the
    web client (see `auth_service.issue_tokens`/the auth routes, which set
    it alongside a JS-readable `csrf_token` cookie). Native clients send a
    Bearer header instead and never carry this cookie, so they're
    unaffected: a custom header can't be forged cross-site the way an
    ambient cookie can, so header-only auth doesn't need this check.
    """
    if request.method in _CSRF_PROTECTED_METHODS and "access_token" in request.cookies:
        csrf_cookie = request.cookies.get("csrf_token")
        csrf_header = request.headers.get("x-csrf-token")
        if not csrf_cookie or not csrf_header or csrf_cookie != csrf_header:
            return JSONResponse(status_code=403, content={"detail": "CSRF token missing or invalid."})
    return await call_next(request)


app.include_router(api_v1_router, prefix="/api/v1")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
