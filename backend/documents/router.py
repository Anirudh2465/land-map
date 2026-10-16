from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from uuid import UUID
from pydantic import BaseModel
import re
from typing import Optional

from database import get_db
from models import Document, DocumentExtract
from minio_client import get_presigned_url, delete_file, download_file, is_supabase_mode, get_content_type
from auth.dependencies import require_admin

router = APIRouter(prefix="/documents", tags=["documents"])


class PresignedUrlOut(BaseModel):
    url: str
    doc_type: str
    filename: Optional[str] = None
    expires_in_seconds: int = 3600


@router.get("/{doc_id}/file")
def stream_document_file(
    doc_id: UUID,
    download: bool = False,
    db: Session = Depends(get_db)
):
    """Directly stream document file bytes from storage. Works seamlessly in local offline mode."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    raw_filename = doc.storage_key.split("/")[-1]
    clean_filename = re.sub(r"^[A-Za-z0-9_]+?_\d+_", "", raw_filename)
    ct = get_content_type(clean_filename)

    try:
        data = download_file(doc.storage_key)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file from storage: {e}")

    disposition = "attachment" if download else "inline"
    headers = {
        "Content-Disposition": f'{disposition}; filename="{clean_filename}"'
    }
    return Response(content=data, media_type=ct, headers=headers)


@router.get("/{doc_id}/url", response_model=PresignedUrlOut)
def get_document_url(
    doc_id: UUID,
    download: bool = False,
    db: Session = Depends(get_db)
):
    """Get a download/preview URL for a document.
    In Cloud mode (Supabase): returns presigned URL with attachment header.
    In Local mode (MinIO): returns relative streaming URL (/api/documents/{id}/file)."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    raw_filename = doc.storage_key.split("/")[-1]
    clean_filename = re.sub(r"^[A-Za-z0-9_]+?_\d+_", "", raw_filename)

    if is_supabase_mode():
        dl_name = clean_filename if download else None
        url = get_presigned_url(doc.storage_key, expires_seconds=3600, download_filename=dl_name)
    else:
        # In local offline mode, route through the FastAPI streaming endpoint
        url = f"/api/documents/{doc_id}/file?download={'true' if download else 'false'}"

    return PresignedUrlOut(url=url, doc_type=doc.doc_type, filename=clean_filename)


@router.delete("/{doc_id}", status_code=204)
def delete_document(
    doc_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    """Delete a document from both the database and Supabase Storage. Admin only."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # 1. Delete physical file from Supabase Storage
    if doc.storage_key:
        delete_file(doc.storage_key)

    # 2. Delete child extracts and database record
    db.query(DocumentExtract).filter(DocumentExtract.document_id == doc_id).delete(synchronize_session=False)
    db.query(Document).filter(Document.id == doc_id).delete(synchronize_session=False)
    db.commit()
