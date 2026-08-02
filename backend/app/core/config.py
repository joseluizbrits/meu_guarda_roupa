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
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"

    # JWT signing key. The default below is dev-only so local runs don't
    # crash without a `.env` — always override via env var in staging/prod.
    jwt_secret_key: str = "dev-only-insecure-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30

    # Regex of allowed browser origins for CORS. The Expo web dev server
    # runs on a local port (8081 by default, but configurable via --port),
    # so this matches any localhost/127.0.0.1 port rather than one fixed
    # value. Tighten this to an explicit allowlist before shipping to prod.
    cors_origin_regex: str = r"^http://(localhost|127\.0\.0\.1):\d+$"


settings = Settings()
