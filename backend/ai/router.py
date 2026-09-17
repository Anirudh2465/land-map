from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from uuid import UUID
from pydantic import BaseModel

from database import get_db
from models import Document, DocumentExtract, Plot, AISummary
from ai.ocr_service import perform_ocr_on_document
from ai.translation_service import translate_text
from ai.summary_service import generate_plot_summary

router = APIRouter(prefix="/ai", tags=["ai"])

class ExtractOut(BaseModel):
    id: UUID
    extracted_text: str | None
    detected_language: str | None
    translated_text: str | None
    translated_to: str | None
    ocr_confidence: float | None

class SummaryOut(BaseModel):
    summary_text: str

@router.post("/ocr/{doc_id}", response_model=ExtractOut)
def trigger_ocr(doc_id: UUID, db: Session = Depends(get_db)):
    """Runs OCR on a document and caches the result."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    # Check if we already have an extract
    extract = db.query(DocumentExtract).filter(DocumentExtract.document_id == doc_id).first()
    if extract and extract.extracted_text:
        return extract
        
    # Run OCR
    try:
        result = perform_ocr_on_document(doc.storage_key)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")
        
    if not extract:
        extract = DocumentExtract(document_id=doc.id)
        db.add(extract)
        
    extract.extracted_text = result["extracted_text"]
    extract.detected_language = result["detected_language"]
    extract.ocr_confidence = result["ocr_confidence"]
    
    db.commit()
    db.refresh(extract)
    return extract

@router.post("/translate/{doc_id}", response_model=ExtractOut)
def translate_document(doc_id: UUID, to: str = Query(..., description="Target language code (e.g. 'en', 'ta')"), db: Session = Depends(get_db)):
    """Translates a document's extracted text."""
    extract = db.query(DocumentExtract).filter(DocumentExtract.document_id == doc_id).first()
    if not extract or not extract.extracted_text:
        raise HTTPException(status_code=400, detail="Document must be OCR'd before translation")
        
    # If already translated to this language, return cached
    if extract.translated_to == to and extract.translated_text:
        return extract
        
    result = translate_text(extract.extracted_text, target_lang=to)
    
    extract.translated_text = result["translated_text"]
    extract.translated_to = to
    
    db.commit()
    db.refresh(extract)
    return extract

@router.get("/summary/{plot_id}", response_model=SummaryOut)
def get_plot_summary(plot_id: UUID, force_refresh: bool = False, db: Session = Depends(get_db)):
    """Generates an AI summary for the plot based on its documents."""
    plot = db.query(Plot).filter(Plot.id == plot_id).first()
    if not plot:
        raise HTTPException(status_code=404, detail="Plot not found")
        
    summary_record = db.query(AISummary).filter(AISummary.plot_id == plot_id).first()
    
    # If we have a cached summary and aren't forcing a refresh, return it
    if summary_record and summary_record.summary_text and not force_refresh:
        return SummaryOut(summary_text=summary_record.summary_text)
        
    # Collect texts
    docs_texts = []
    for doc in plot.documents:
        extract = db.query(DocumentExtract).filter(DocumentExtract.document_id == doc.id).first()
        if extract and extract.extracted_text:
            text_to_use = extract.translated_text if extract.translated_text else extract.extracted_text
            docs_texts.append({
                "doc_type": doc.doc_type,
                "text": text_to_use
            })
            
    if not docs_texts:
        raise HTTPException(status_code=400, detail="No extracted text found for this plot's documents. Run OCR first.")
        
    summary_text = generate_plot_summary(plot.property_name or f"Plot {plot.plot_number}", docs_texts)
    
    if not summary_record:
        summary_record = AISummary(plot_id=plot.id)
        db.add(summary_record)
        
    summary_record.summary_text = summary_text
    
    db.commit()
    return SummaryOut(summary_text=summary_text)
