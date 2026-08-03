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

    Only applies when an `access_token` cookie is present AND there's no
    `Authorization` header — that's the web client (see
    `auth_service.issue_tokens`/the auth routes, which set the cookie
    alongside a JS-readable `csrf_token` cookie). The header check matters
    in practice, not just in theory: native clients authenticate with a
    Bearer header and set `credentials: 'omit'` (see `client.ts`), but a
    mobile OS's own HTTP stack can still persist a `Set-Cookie` from a
    login/refresh response regardless of that JS-level setting — without
    this check, a native request that happens to carry a stray
    access_token cookie would get blocked for a CSRF header it was never
    designed to send. A forged cross-site request can't set a custom
    Authorization header the way it can rely on an ambient cookie, so any
    header-authenticated request is exempt either way.
    """
    has_bearer_header = request.headers.get("authorization", "").lower().startswith("bearer ")
    if (
        request.method in _CSRF_PROTECTED_METHODS
        and "access_token" in request.cookies
        and not has_bearer_header
    ):
        csrf_cookie = request.cookies.get("csrf_token")
        csrf_header = request.headers.get("x-csrf-token")
        if not csrf_cookie or not csrf_header or csrf_cookie != csrf_header:
            return JSONResponse(status_code=403, content={"detail": "CSRF token missing or invalid."})
    return await call_next(request)


app.include_router(api_v1_router, prefix="/api/v1")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
