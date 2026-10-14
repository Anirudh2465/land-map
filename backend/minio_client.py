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
    import mimetypes
    guessed, _ = mimetypes.guess_type(filename)
    return guessed or fallback

def get_presigned_url(object_name: str, expires_seconds: int = 3600, download_filename: str = None) -> str:
    """Generate a presigned GET URL valid for `expires_seconds`.
    If `download_filename` is provided, forces Content-Disposition attachment with that exact filename."""
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
