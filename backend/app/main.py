import os
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse

from app.api.v1 import router as api_v1_router
from app.core.config import settings
from app.core.storage import ensure_bucket_exists

_CSRF_PROTECTED_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# Directory that holds distributable build artifacts (e.g. the Android APK).
# Mounted as a host bind volume (see infra/docker-compose.yml) so builds can
# drop files in on the host and they appear here immediately.
DOWNLOADS_DIR = "/app/downloads"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    ensure_bucket_exists()
    os.makedirs(DOWNLOADS_DIR, exist_ok=True)
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


# Downloadable build artifacts. A simple hand-rolled handler (instead of
# StaticFiles) so we get both a browsable index and per-file serving without
# the documented mount-vs-route precedence surprises.
@app.get("/downloads")
@app.get("/downloads/")
async def downloads_index() -> HTMLResponse:
    files = sorted(
        (f for f in os.listdir(DOWNLOADS_DIR) if os.path.isfile(os.path.join(DOWNLOADS_DIR, f))),
        reverse=True,
    )
    rows = "".join(
        f'<li><a href="/downloads/{f}">{f}</a> '
        f"({os.path.getsize(os.path.join(DOWNLOADS_DIR, f)) // (1024 * 1024)} MB)</li>"
        for f in files
    )
    html = f"""<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Downloads — Meu Guarda-roupa</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{{font-family:system-ui,sans-serif;max-width:640px;margin:2rem auto;padding:0 1rem}}
h1{{font-size:1.4rem}}ul{{line-height:1.9;padding-left:1.2rem}}</style></head>
<body><h1>Downloads — Meu Guarda-roupa</h1><ul>{rows or "<li>Nenhuma versão disponível.</li>"}</ul></body></html>"""
    return HTMLResponse(html)


@app.get("/downloads/{filename}")
async def download_file(filename: str) -> FileResponse:
    return FileResponse(os.path.join(DOWNLOADS_DIR, filename), filename=filename)
