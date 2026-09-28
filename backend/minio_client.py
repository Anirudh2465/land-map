"""
Supabase Storage client helper.
"""
from supabase import create_client, Client
from config import settings

def get_supabase_client() -> Client:
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

def upload_file(object_name: str, data: bytes, content_type: str = "application/octet-stream") -> str:
    """Upload bytes to Supabase Storage and return the object key."""
    client = get_supabase_client()
    client.storage.from_(settings.SUPABASE_STORAGE_BUCKET).upload(
        path=object_name,
        file=data,
        file_options={"content-type": content_type, "upsert": "true"}
    )
    return object_name

def download_file(object_name: str) -> bytes:
    """Download bytes from Supabase Storage."""
    client = get_supabase_client()
    return client.storage.from_(settings.SUPABASE_STORAGE_BUCKET).download(object_name)

def get_presigned_url(object_name: str, expires_seconds: int = 3600) -> str:
    """Generate a presigned GET URL valid for `expires_seconds`."""
    client = get_supabase_client()
    res = client.storage.from_(settings.SUPABASE_STORAGE_BUCKET).create_signed_url(
        path=object_name,
        expires_in=expires_seconds
    )
    if isinstance(res, dict):
        return res.get("signedURL", res.get("signedUrl", ""))
    return str(res)
