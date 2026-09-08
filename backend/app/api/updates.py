import json
import base64
import hashlib
import mimetypes
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Request, Header, HTTPException, status
from fastapi.responses import Response

router = APIRouter(prefix="/api/updates", tags=["updates"])

UPDATES_DIR = "/app/updates"

# Per-asset content hash cache: {absolute path: (mtime_ns, base64url_sha256, md5_hex)}.
# `expo export` bundles are immutable per dir, so the only way to invalidate is
# mtime — recompute whenever the file changes on disk.
_asset_cache: dict[str, tuple[int, str, str]] = {}


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


def _read_metadata(update_dir: Path) -> tuple[dict, bytes]:
    """Read metadata.json from update directory. Returns (json, raw bytes)."""
    metadata_path = update_dir / "metadata.json"
    raw = metadata_path.read_bytes()
    return json.loads(raw), raw


def _sha256_hash_to_uuid(hexed: str) -> str:
    """Convert first 32 hex chars of a sha256 digest into a UUID string."""
    return (
        f"{hexed[0:8]}-{hexed[8:12]}-{hexed[12:16]}-{hexed[16:20]}-{hexed[20:32]}"
    )


def _update_id(metadata_bytes: bytes) -> str:
    """Update id per Expo Updates protocol: sha256(metadata.json) as UUID."""
    return _sha256_hash_to_uuid(hashlib.sha256(metadata_bytes).hexdigest())


def _asset_hashes(abs_path: Path) -> tuple[str, str]:
    """Returns (base64url_sha256, md5_hex) for an asset file, cached by mtime."""
    stat = abs_path.stat()
    cached = _asset_cache.get(str(abs_path))
    if cached and cached[0] == stat.st_mtime_ns:
        return cached[1], cached[2]

    content = abs_path.read_bytes()
    digest = hashlib.sha256(content).digest()
    base64url = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    md5_hex = hashlib.md5(content).hexdigest()
    _asset_cache[str(abs_path)] = (stat.st_mtime_ns, base64url, md5_hex)
    return base64url, md5_hex


def _content_type_for_ext(ext: str) -> str:
    if not ext:
        return "application/octet-stream"
    guessed = mimetypes.guess_type(f"x.{ext}")[0]
    return guessed or "application/octet-stream"


def _build_manifest_response(
    request: Request,
    runtime_version: str,
    update_dir: Path,
    metadata_bytes: bytes,
) -> dict:
    """Build a manifest JSON matching the Expo Updates v1 (self-hosted) format.

    Spec/canonical shape ported from expo/custom-expo-updates-server
    (pages/api/manifest.ts + common/helpers.ts): id = sha256(metadata.json)
    formatted as UUID, launchAsset/assets read from `fileMetadata.android`,
    hash = base64url sha256, key = md5 hex, launchAsset contentType is
    always application/javascript.
    """
    metadata = json.loads(metadata_bytes)
    android = metadata.get("fileMetadata", {}).get("android", {})
    bundle = android.get("bundle")
    asset_paths = android.get("assets", [])  # [{"path": ..., "ext": ...}]

    base_url = _get_base_url(request)
    # URL paths use the on-disk directory name; `id` uses the content hash.
    dir_name = update_dir.name

    def asset_url(rel_path: str) -> str:
        # StaticFiles is mounted at /api/updates/files with directory
        # UPDATES_DIR, whose layout is <runtime>/<updateDir>/<files>.
        return f"{base_url}/api/updates/files/{runtime_version}/{dir_name}/{rel_path}"

    manifest = {
        "id": _update_id(metadata_bytes),
        "createdAt": _created_at(update_dir / "metadata.json"),
        "runtimeVersion": runtime_version,
        "assets": [],
        "launchAsset": {},
        "metadata": {},
        "extra": {"expoClient": {}},
    }

    if bundle:
        launch_hash, launch_key = _asset_hashes(update_dir / bundle)
        manifest["launchAsset"] = {
            "hash": launch_hash,
            "key": launch_key,
            "fileExtension": ".bundle",
            "contentType": "application/javascript",
            "url": asset_url(bundle),
        }

    for item in asset_paths:
        rel_path = item.get("path")
        ext = item.get("ext", "")
        if not rel_path:
            continue
        asset_hash, asset_key = _asset_hashes(update_dir / rel_path)
        manifest["assets"].append(
            {
                "hash": asset_hash,
                "key": asset_key,
                "fileExtension": f".{ext}" if ext else "",
                "contentType": _content_type_for_ext(ext),
                "url": asset_url(rel_path),
            }
        )

    return manifest


def _created_at(metadata_path: Path) -> str:
    """ISO8601 timestamp for the update, from metadata.json's mtime."""
    import datetime

    mtime_ns = metadata_path.stat().st_mtime_ns
    return datetime.datetime.fromtimestamp(mtime_ns / 1e9, datetime.timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%S.%fZ"
    )


def _build_multipart_response(
    manifest_json: str,
    boundary: str,
    include_manifest: bool = True,
    directive: Optional[dict] = None,
    include_extensions: bool = False,
) -> bytes:
    """Build a multipart/mixed response body manually.

    Protocol v1 responses carry `manifest` + `extensions` parts (or just a
    `directive` part for no-update); v0 carries only the manifest part.
    """
    parts = []

    if include_manifest:
        parts.append(
            f'--{boundary}\r\n'
            f'Content-Disposition: form-data; name="manifest"\r\n'
            f'Content-Type: application/json\r\n'
            f'\r\n'
            f'{manifest_json}\r\n'
        )

    if include_extensions:
        parts.append(
            f'--{boundary}\r\n'
            f'Content-Disposition: form-data; name="extensions"\r\n'
            f'Content-Type: application/json\r\n'
            f'\r\n'
            '{"assetRequestHeaders":{}}\r\n'
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
    Expo Updates manifest endpoint (protocol v1).

    Required headers:
    - expo-platform: must be "android"
    - expo-runtime-version: runtime version string

    Optional header:
    - expo-current-update-id: current update UUID (lowercase) for no-update directive

    Returns multipart/mixed with manifest + extensions (or noUpdateAvailable
    directive when the client is already current).
    """
    platform, runtime_version = _validate_headers(expo_platform, expo_runtime_version)

    update_dir = _resolve_latest_update(runtime_version)
    if not update_dir:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No updates found for runtime version '{runtime_version}'",
        )

    metadata, metadata_bytes = _read_metadata(update_dir)
    update_id = _update_id(metadata_bytes)
    base_url = _get_base_url(request)
    boundary = uuid.uuid4().hex

    current_id = (expo_current_update_id or "").strip().lower()
    if current_id and current_id == update_id:
        # Client already running this exact update.
        include_manifest = False
        include_extensions = False
        directive = {"type": "noUpdateAvailable"}
        manifest_json = ""
    else:
        manifest = _build_manifest_response(request, runtime_version, update_dir, metadata_bytes)
        manifest_json = json.dumps(manifest, separators=(",", ":"))
        include_manifest = True
        include_extensions = True
        directive = None

    body = _build_multipart_response(
        manifest_json=manifest_json,
        boundary=boundary,
        include_manifest=include_manifest,
        directive=directive,
        include_extensions=include_extensions,
    )

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