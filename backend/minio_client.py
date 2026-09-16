"""
Shared MinIO client helper.
"""
from minio import Minio
from minio.error import S3Error
from config import settings
import io


def get_minio_client() -> Minio:
    return Minio(
        settings.MINIO_ENDPOINT,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        secure=settings.MINIO_SECURE,
    )


def upload_file(object_name: str, data: bytes, content_type: str = "application/octet-stream") -> str:
    """Upload bytes to MinIO and return the object key."""
    client = get_minio_client()
    client.put_object(
        settings.MINIO_BUCKET,
        object_name,
        io.BytesIO(data),
        length=len(data),
        content_type=content_type,
    )
    return object_name


def get_presigned_url(object_name: str, expires_seconds: int = 3600) -> str:
    """Generate a presigned GET URL valid for `expires_seconds`."""
    from datetime import timedelta
    client = get_minio_client()
    url = client.presigned_get_object(
        settings.MINIO_BUCKET,
        object_name,
        expires=timedelta(seconds=expires_seconds),
    )
    return url
