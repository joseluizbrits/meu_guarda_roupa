import os
import json
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Request, Header, HTTPException, status
from fastapi.responses import Response

router = APIRouter(prefix="/api/updates", tags=["updates"])

UPDATES_DIR = "/app/updates"


def _get_base_url(request: Request) -> str:
    """Build public base URL from proxy headers or settings."""
    from app.core.config import settings

    scheme = request.headers.get("x-forwarded-proto", "https")
    host = request.headers.get("x-forwarded-host", settings.app_host)
    return f"{scheme}://{host}"


def _validate_headers(
    expo_platform: Optional[str] = Header(None, alias="expo-platform"),
    expo_runtime_version: Optional[str] = Header(None, alias="expo-runtime-version"),
) -> tuple[str, str]:
    """Validate required headers. Returns (platform, runtime_version)."""
    if not expo_platform or expo_platform.lower() != "android":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="expo-platform header must be 'android'",
        )
    if not expo_runtime_version:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="expo-runtime-version header is required",
        )
    return expo_platform.lower(), expo_runtime_version


def _resolve_latest_update(runtime_version: str) -> Optional[Path]:
    """Resolve the symlink `latest` for given runtime. Returns update directory or None."""
    latest_link = Path(UPDATES_DIR) / runtime_version / "latest"
    if not latest_link.exists() or not latest_link.is_symlink():
        return None
    target = latest_link.resolve()
    if not target.exists() or not target.is_dir():
        return None
    return target


def _read_metadata(update_dir: Path) -> dict:
    """Read metadata.json from update directory."""
    metadata_path = update_dir / "metadata.json"
    with open(metadata_path) as f:
        return json.load(f)


def _build_manifest_response(
    request: Request,
    runtime_version: str,
    update_id: str,
    metadata: dict,
    base_url: str,
) -> dict:
    """Build the manifest JSON matching Expo Updates v1 format."""
    launch_asset = metadata.get("launchAsset", {})
    assets = metadata.get("assets", [])

    # Build absolute URLs for assets
    def make_asset_url(asset_path: str) -> str:
        return f"{base_url}/api/updates/files/{runtime_version}/{update_id}/{asset_path}"

    # Build launch asset with absolute URL
    launch_asset_url = make_asset_url(launch_asset.get("url", "")) if launch_asset.get("url") else ""

    manifest = {
        "id": update_id,
        "createdAt": metadata.get("createdAt"),
        "runtimeVersion": runtime_version,
        "launchAsset": {
            "url": launch_asset_url,
            "size": launch_asset.get("size"),
            "hash": launch_asset.get("hash"),
            "key": launch_asset.get("key"),
            "contentType": launch_asset.get("contentType"),
        },
        "assets": [
            {
                "url": make_asset_url(a.get("url", "")),
                "size": a.get("size"),
                "hash": a.get("hash"),
                "key": a.get("key"),
                "contentType": a.get("contentType"),
            }
            for a in assets
        ],
    }
    return manifest


def _build_multipart_response(
    manifest_json: str,
    boundary: str,
    include_manifest: bool = True,
    directive: Optional[dict] = None,
) -> bytes:
    """Build multipart/mixed response body manually."""
    parts = []

    if include_manifest:
        parts.append(
            f'--{boundary}\r\n'
            f'Content-Disposition: form-data; name="manifest"\r\n'
            f'Content-Type: application/json\r\n'
            f'\r\n'
            f'{manifest_json}\r\n'
        )

    if directive is not None:
        parts.append(
            f'--{boundary}\r\n'
            f'Content-Disposition: form-data; name="directive"\r\n'
            f'Content-Type: application/json\r\n'
            f'\r\n'
            f'{json.dumps(directive)}\r\n'
        )

    # Final boundary
    parts.append(f'--{boundary}--\r\n')
    return "".join(parts).encode("utf-8")


@router.get("/manifest")
async def get_manifest(
    request: Request,
    expo_platform: Optional[str] = Header(None, alias="expo-platform"),
    expo_runtime_version: Optional[str] = Header(None, alias="expo-runtime-version"),
    expo_current_update_id: Optional[str] = Header(None, alias="expo-current-update-id"),
) -> Response:
    """
    Expo Updates v1 manifest endpoint.

    Required headers:
    - expo-platform: must be "android"
    - expo-runtime-version: runtime version string

    Optional header:
    - expo-current-update-id: current update UUID (lowercase) for no-update directive

    Returns multipart/mixed with manifest or noUpdateAvailable directive.
    """
    # Validate headers
    platform, runtime_version = _validate_headers(expo_platform, expo_runtime_version)

    # Resolve latest update for this runtime
    update_dir = _resolve_latest_update(runtime_version)
    if not update_dir:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No updates found for runtime version '{runtime_version}'",
        )

    update_id = update_dir.name.lower()  # UUID in lowercase
    metadata = _read_metadata(update_dir)

    # Check for no-update directive
    current_id = (expo_current_update_id or "").strip().lower()
    base_url = _get_base_url(request)
    boundary = uuid.uuid4().hex

    if current_id and current_id == update_id:
        # No update available
        body = _build_multipart_response(
            manifest_json="",  # not used
            boundary=boundary,
            include_manifest=False,
            directive={"type": "noUpdateAvailable"},
        )
    else:
        # Build manifest
        manifest = _build_manifest_response(request, runtime_version, update_id, metadata, base_url)
        manifest_json = json.dumps(manifest, separators=(",", ":"))
        body = _build_multipart_response(
            manifest_json=manifest_json,
            boundary=boundary,
            include_manifest=True,
            directive=None,
        )

    # Build response with required headers
    content_type = f"multipart/mixed; boundary={boundary}"
    headers = {
        "expo-protocol-version": "1",
        "expo-sfv-version": "0",
        "cache-control": "private, max-age=0",
    }

    return Response(
        content=body,
        media_type=content_type,
        headers=headers,
    )