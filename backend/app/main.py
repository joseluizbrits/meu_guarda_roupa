import json
import os
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api import updates as updates_api
from app.api.v1 import router as api_v1_router
from app.core.config import settings
from app.core.storage import ensure_bucket_exists

_CSRF_PROTECTED_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# Directory that holds distributable build artifacts (e.g. the Android APK).
# Mounted as a host bind volume (see infra/docker-compose.yml) so builds can
# drop files in on the host and they appear here immediately.
DOWNLOADS_DIR = "/app/downloads"

# Written by scripts/build-apk.sh next to the APK; the single source of truth
# for what the latest build actually is (name has the version, manifest has
# versionCode + metadata).
MANIFEST_PATH = os.path.join(DOWNLOADS_DIR, "manifest.json")


def _load_manifest() -> dict | None:
    try:
        with open(MANIFEST_PATH) as fh:
            return json.load(fh)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def _latest_apk() -> str | None:
    """Newest .apk in the downloads dir, by manifest if available else mtime."""
    manifest = _load_manifest()
    if manifest and manifest.get("filename"):
        candidate = os.path.join(DOWNLOADS_DIR, manifest["filename"])
        if os.path.isfile(candidate):
            return manifest["filename"]
    apks = [
        f
        for f in os.listdir(DOWNLOADS_DIR)
        if f.endswith(".apk") and os.path.isfile(os.path.join(DOWNLOADS_DIR, f))
    ]
    if not apks:
        return None
    return max(apks, key=lambda f: os.path.getmtime(os.path.join(DOWNLOADS_DIR, f)))


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


# Updates manifest route MUST be defined BEFORE StaticFiles mount
# to avoid route precedence issues (FastAPI matches routes in order)
app.include_router(updates_api.router)

app.include_router(api_v1_router, prefix="/api/v1")

# Serve update assets from /app/updates at /api/updates/files/<runtime>/<updateId>/<file>
# StaticFiles handles range requests, HEAD, streaming for large files
app.mount(
    "/api/updates/files",
    StaticFiles(directory="/app/updates"),
    name="updates-files",
)


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


@app.get("/downloads/latest.apk")
async def download_latest_apk() -> FileResponse:
    """Serve o APK mais recente (mesma versão do manifest, se existir)."""
    filename = _latest_apk()
    if not filename:
        raise HTTPException(status_code=404, detail="Nenhum APK publicado ainda.")
    return FileResponse(os.path.join(DOWNLOADS_DIR, filename), filename=filename)


@app.get("/api/v1/app/latest")
async def app_latest(request: Request) -> JSONResponse:
    """Metadata da versão mais recente do app + URL de download."""
    filename = _latest_apk()
    manifest = _load_manifest()
    if not filename:
        raise HTTPException(status_code=404, detail="Nenhum APK publicado ainda.")

    path = os.path.join(DOWNLOADS_DIR, filename)
    version = manifest.get("version") if manifest else None
    if not version:
        # fallback: "meu-guarda-roupa-1.2.3.apk" -> "1.2.3"
        version = filename.removesuffix(".apk").split("-")[-1]

    download_url = str(request.url_for("download_file", filename=filename))
    # request.url_for uses uvicorn's view of the scheme/host, which is
    # plain http/container-hostname because uvicorn doesn't trust proxy
    # headers from non-loopback peers. Traefik always sends these headers,
    # so build the public origin from them ourselves.
    scheme = request.headers.get("x-forwarded-proto", "https")
    host = request.headers.get("x-forwarded-host", settings.app_host)
    base = f"{scheme}://{host}"
    return JSONResponse(
        {
            "version": version,
            "version_code": (manifest or {}).get("versionCode"),
            "filename": filename,
            "size_bytes": os.path.getsize(path),
            "updated_at": (manifest or {}).get("updatedAt"),
            "download_url": f"{base}/downloads/{filename}",
            "latest_url": f"{base}/downloads/latest.apk",
        }
    )


@app.get("/downloads/{filename}")
async def download_file(filename: str) -> FileResponse:
    return FileResponse(os.path.join(DOWNLOADS_DIR, filename), filename=filename)
