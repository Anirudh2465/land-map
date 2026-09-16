from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
from pydantic import BaseModel

from database import get_db
from models import Document
from minio_client import get_presigned_url

router = APIRouter(prefix="/documents", tags=["documents"])


class PresignedUrlOut(BaseModel):
    url: str
    doc_type: str
    expires_in_seconds: int = 3600


@router.get("/{doc_id}/url", response_model=PresignedUrlOut)
def get_document_url(doc_id: UUID, db: Session = Depends(get_db)):
    """Get a presigned download/preview URL for a document. Valid for 1 hour."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    url = get_presigned_url(doc.storage_key, expires_seconds=3600)
    return PresignedUrlOut(url=url, doc_type=doc.doc_type)
