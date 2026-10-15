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

def delete_file(object_name: str) -> None:
    """Delete a single file from Supabase Storage."""
    if not object_name:
        return
    client = get_supabase_client()
    try:
        client.storage.from_(settings.SUPABASE_STORAGE_BUCKET).remove([object_name])
    except Exception as e:
        print(f"Warning: Failed to delete {object_name} from Supabase storage: {e}")

def delete_files(object_names: list[str]) -> None:
    """Delete multiple files from Supabase Storage."""
    valid_names = [o for o in object_names if o]
    if not valid_names:
        return
    client = get_supabase_client()
    try:
        client.storage.from_(settings.SUPABASE_STORAGE_BUCKET).remove(valid_names)
    except Exception as e:
        print(f"Warning: Failed to delete files from Supabase storage: {e}")

def delete_plot_storage(plot_id: str, extra_keys: list[str] = None) -> None:
    """Delete all files associated with a plot from Supabase Storage (KML and documents folder)."""
    client = get_supabase_client()
    bucket = settings.SUPABASE_STORAGE_BUCKET
    keys_to_delete = set()
    
    if extra_keys:
        for k in extra_keys:
            if k:
                keys_to_delete.add(k)

    keys_to_delete.add(f"kml/{plot_id}.kml")

    # List any files under documents/{plot_id}/
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

