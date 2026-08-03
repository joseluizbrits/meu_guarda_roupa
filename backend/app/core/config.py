from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings, sourced from environment variables.

    Defaults are for local development only; override via `.env` or the
    real environment in staging/production.
    """

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str = (
        "postgresql+asyncpg://postgres:postgres@localhost:5432/meu_guarda_roupa"
    )

    minio_endpoint: str = "localhost:9000"
    # Host embedded in presigned upload/download URLs — these are handed
    # directly to the mobile app / browser, which can't resolve the internal
    # Docker hostname "minio", so this must be a host the client can reach
    # (same reasoning as EXPO_PUBLIC_API_URL). Defaults to minio_endpoint's
    # value for non-Docker local dev where both are the same host.
    minio_public_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "meu-guarda-roupa"

    # JWT signing key. The default below is dev-only so local runs don't
    # crash without a `.env` — always override via env var in staging/prod.
    jwt_secret_key: str = "dev-only-insecure-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30

    # Regex of allowed browser origins for CORS. The Expo web dev server
    # runs on a local port (8081 by default, but configurable via --port),
    # so this matches any localhost/127.0.0.1 port rather than one fixed
    # value. Also allows private-network IPs (192.168.x.x, 10.x.x.x,
    # 172.16-31.x.x) on any port — testing from a phone browser over WiFi
    # loads the page via the dev machine's LAN IP, so the browser's Origin
    # header is that LAN IP, not localhost. Tighten this to an explicit
    # allowlist before shipping to prod.
    cors_origin_regex: str = (
        r"^http://(localhost|127\.0\.0\.1"
        r"|192\.168\.\d{1,3}\.\d{1,3}"
        r"|10\.\d{1,3}\.\d{1,3}\.\d{1,3}"
        r"|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}"
        r"):\d+$"
    )


settings = Settings()
