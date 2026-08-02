"""S3-compatible (MinIO) object storage client and bucket bootstrap."""

import boto3
from botocore.client import Config as BotoConfig
from botocore.exceptions import ClientError

from app.core.config import settings

s3_client = boto3.client(
    "s3",
    endpoint_url=f"http://{settings.minio_endpoint}",
    aws_access_key_id=settings.minio_access_key,
    aws_secret_access_key=settings.minio_secret_key,
    region_name="us-east-1",
    config=BotoConfig(signature_version="s3v4"),
)

# Separate client used ONLY for generate_presigned_url calls. Presigned URLs
# embed the client's endpoint_url as the request host — s3_client's
# internal-Docker-hostname endpoint would produce URLs the mobile app/browser
# can't resolve, so signing goes through this client instead, pointed at a
# host the client device can actually reach.
_s3_public_client = boto3.client(
    "s3",
    endpoint_url=f"http://{settings.minio_public_endpoint}",
    aws_access_key_id=settings.minio_access_key,
    aws_secret_access_key=settings.minio_secret_key,
    region_name="us-east-1",
    config=BotoConfig(signature_version="s3v4"),
)


def generate_presigned_url(client_method: str, params: dict, expires_in: int) -> str:
    return _s3_public_client.generate_presigned_url(
        client_method, Params=params, ExpiresIn=expires_in
    )


def ensure_bucket_exists() -> None:
    """Create the app's bucket if it doesn't already exist.

    Check-then-create rather than a bare `create_bucket()` call, so we
    don't raise on every restart once the bucket has been created once.

    CORS for presigned-URL browser access (e.g. `expo start --web`) is
    configured server-wide via the MINIO_API_CORS_ALLOW_ORIGIN env var on
    the MinIO container itself — this MinIO version's S3 API doesn't
    implement PutBucketCors (`NotImplemented`), so it can't be set here.
    """
    try:
        s3_client.head_bucket(Bucket=settings.minio_bucket)
    except ClientError:
        s3_client.create_bucket(Bucket=settings.minio_bucket)
