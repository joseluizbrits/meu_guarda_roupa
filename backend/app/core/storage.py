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


def ensure_bucket_exists() -> None:
    """Create the app's bucket if it doesn't already exist.

    Check-then-create rather than a bare `create_bucket()` call, so we
    don't raise on every restart once the bucket has been created once.
    """
    try:
        s3_client.head_bucket(Bucket=settings.minio_bucket)
    except ClientError:
        s3_client.create_bucket(Bucket=settings.minio_bucket)
