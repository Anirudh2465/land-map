"""
Storage client helper supporting dual modes:
1. Supabase Storage (when SUPABASE_URL is set, for cloud deployment)
2. MinIO S3 (when SUPABASE_URL is empty, for 100% offline local Docker)
"""
import io
import mimetypes
from config import settings


def is_supabase_mode() -> bool:
    """Check if Supabase credentials are configured."""
    return bool(settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY)


def get_supabase_client():
    """Create Supabase client."""
    from supabase import create_client
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)


def get_minio_client():
    """Create MinIO S3 client."""
    from minio import Minio
    secure = settings.MINIO_SECURE if isinstance(settings.MINIO_SECURE, bool) else (str(settings.MINIO_SECURE).lower() == "true")
    return Minio(
        settings.MINIO_ENDPOINT,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        secure=secure,
    )


def get_content_type(filename: str, fallback: str = "application/octet-stream") -> str:
    """Derive accurate MIME type for spatial and archive files to prevent browser guessing bugs."""
    lower = filename.lower()
    if lower.endswith(".zip"):
        return "application/zip"
    if lower.endswith(".rar"):
        return "application/vnd.rar"
    if lower.endswith(".7z"):
        return "application/x-7z-compressed"
    if lower.endswith(".tar.gz") or lower.endswith(".tgz"):
        return "application/gzip"
    if lower.endswith(".tar"):
        return "application/x-tar"
    if lower.endswith(".kml"):
        return "application/vnd.google-earth.kml+xml"
    if lower.endswith(".kmz"):
        return "application/vnd.google-earth.kmz"
    if lower.endswith(".pdf"):
        return "application/pdf"
    guessed, _ = mimetypes.guess_type(filename)
    return guessed or fallback


def upload_file(object_name: str, data: bytes, content_type: str = "application/octet-stream") -> str:
    """Upload bytes to storage (Supabase or MinIO) and return the object key."""
    if is_supabase_mode():
        client = get_supabase_client()
        client.storage.from_(settings.SUPABASE_STORAGE_BUCKET).upload(
            path=object_name,
            file=data,
            file_options={"content-type": content_type, "upsert": "true"}
        )
    else:
        client = get_minio_client()
        bucket = settings.MINIO_BUCKET
        if not client.bucket_exists(bucket):
            client.make_bucket(bucket)
        client.put_object(
            bucket_name=bucket,
            object_name=object_name,
            data=io.BytesIO(data),
            length=len(data),
            content_type=content_type,
        )
    return object_name


def download_file(object_name: str) -> bytes:
    """Download bytes from storage (Supabase or MinIO)."""
    if is_supabase_mode():
        client = get_supabase_client()
        return client.storage.from_(settings.SUPABASE_STORAGE_BUCKET).download(object_name)
    else:
        client = get_minio_client()
        response = client.get_object(settings.MINIO_BUCKET, object_name)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()


def get_presigned_url(object_name: str, expires_seconds: int = 3600, download_filename: str = None) -> str:
    """Generate a presigned GET URL valid for expires_seconds."""
    if is_supabase_mode():
        client = get_supabase_client()
        options = {"download": download_filename} if download_filename else None
        res = client.storage.from_(settings.SUPABASE_STORAGE_BUCKET).create_signed_url(
            path=object_name,
            expires_in=expires_seconds,
            options=options
        )
        if isinstance(res, dict):
            return res.get("signedURL", res.get("signedUrl", ""))
        return str(res)
    else:
        from datetime import timedelta
        client = get_minio_client()
        extra_headers = {}
        if download_filename:
            extra_headers["response-content-disposition"] = f'attachment; filename="{download_filename}"'
        return client.presigned_get_object(
            bucket_name=settings.MINIO_BUCKET,
            object_name=object_name,
            expires=timedelta(seconds=expires_seconds),
            response_headers=extra_headers if extra_headers else None
        )


def delete_file(object_name: str) -> None:
    """Delete a single file from storage."""
    if not object_name:
        return
    if is_supabase_mode():
        client = get_supabase_client()
        try:
            client.storage.from_(settings.SUPABASE_STORAGE_BUCKET).remove([object_name])
        except Exception as e:
            print(f"Warning: Failed to delete {object_name} from Supabase storage: {e}")
    else:
        client = get_minio_client()
        try:
            client.remove_object(settings.MINIO_BUCKET, object_name)
        except Exception as e:
            print(f"Warning: Failed to delete {object_name} from MinIO storage: {e}")


def delete_files(object_names: list[str]) -> None:
    """Delete multiple files from storage."""
    valid_names = [o for o in object_names if o]
    if not valid_names:
        return
    if is_supabase_mode():
        client = get_supabase_client()
        try:
            client.storage.from_(settings.SUPABASE_STORAGE_BUCKET).remove(valid_names)
        except Exception as e:
            print(f"Warning: Failed to delete files from Supabase storage: {e}")
    else:
        from minio.deleteobjects import DeleteObject
        client = get_minio_client()
        try:
            delete_list = [DeleteObject(o) for o in valid_names]
            for err in client.remove_objects(settings.MINIO_BUCKET, delete_list):
                print(f"Error deleting object {err.name}: {err.message}")
        except Exception as e:
            print(f"Warning: Failed to delete files from MinIO storage: {e}")


def delete_plot_storage(plot_id: str, extra_keys: list[str] = None) -> None:
    """Delete all files associated with a plot from storage (KML and documents folder)."""
    keys_to_delete = set()
    if extra_keys:
        for k in extra_keys:
            if k:
                keys_to_delete.add(k)
    keys_to_delete.add(f"kml/{plot_id}.kml")

    if is_supabase_mode():
        client = get_supabase_client()
        bucket = settings.SUPABASE_STORAGE_BUCKET
        try:
            folder_items = client.storage.from_(bucket).list(f"documents/{plot_id}")
            if folder_items and isinstance(folder_items, list):
                for item in folder_items:
                    name = item.get("name")
                    if name:
                        keys_to_delete.add(f"documents/{plot_id}/{name}")
        except Exception as e:
            print(f"Warning: Failed to list documents/{plot_id} in Supabase storage: {e}")

        if keys_to_delete:
            try:
                client.storage.from_(bucket).remove(list(keys_to_delete))
            except Exception as e:
                print(f"Warning: Failed to remove plot files from Supabase storage: {e}")
    else:
        client = get_minio_client()
        bucket = settings.MINIO_BUCKET
        try:
            objects = client.list_objects(bucket, prefix=f"documents/{plot_id}/", recursive=True)
            for obj in objects:
                keys_to_delete.add(obj.object_name)
        except Exception as e:
            print(f"Warning: Failed to list documents/{plot_id} in MinIO storage: {e}")

        if keys_to_delete:
            delete_files(list(keys_to_delete))

