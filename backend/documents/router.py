from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
from pydantic import BaseModel

from database import get_db
from models import Document
from minio_client import get_presigned_url
from auth.dependencies import require_admin

router = APIRouter(prefix="/documents", tags=["documents"])


import re
from typing import Optional

class PresignedUrlOut(BaseModel):
    url: str
    doc_type: str
    filename: Optional[str] = None
    expires_in_seconds: int = 3600


@router.get("/{doc_id}/url", response_model=PresignedUrlOut)
def get_document_url(
    doc_id: UUID,
    download: bool = False,
    db: Session = Depends(get_db)
):
    """Get a presigned download/preview URL for a document. Valid for 1 hour.
    If download is True, configures Content-Disposition attachment with the clean original filename."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    raw_filename = doc.storage_key.split("/")[-1]
    clean_filename = re.sub(r"^[A-Za-z0-9_]+?_\d+_", "", raw_filename)

    dl_name = clean_filename if download else None
    url = get_presigned_url(doc.storage_key, expires_seconds=3600, download_filename=dl_name)
    return PresignedUrlOut(url=url, doc_type=doc.doc_type, filename=clean_filename)


@router.delete("/{doc_id}", status_code=204)
def delete_document(
    doc_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    """Delete a document. Admin only."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    db.delete(doc)
    db.commit()
