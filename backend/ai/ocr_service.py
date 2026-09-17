import os
import tempfile
import pytesseract
from pdf2image import convert_from_path
from PIL import Image
from minio_client import minio_client
from config import settings

def perform_ocr_on_document(storage_key: str) -> dict:
    """
    Downloads a PDF from MinIO, converts to images, and runs Tesseract OCR.
    Returns extracted text and simple metrics.
    """
    # 1. Download file to a temporary location
    try:
        response = minio_client.get_object(settings.MINIO_BUCKET, storage_key)
        pdf_bytes = response.read()
    finally:
        response.close()
        response.release_conn()

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as temp_pdf:
        temp_pdf.write(pdf_bytes)
        temp_pdf_path = temp_pdf.name

    try:
        # 2. Convert PDF pages to images
        # poppler must be installed on the system (which we added to Dockerfile)
        images = convert_from_path(temp_pdf_path, dpi=200)
        
        extracted_text = ""
        # 3. Run Tesseract on each page
        for page_num, image in enumerate(images):
            # Using default English; can specify lang='tam+eng' if tesseract-ocr-tam is installed
            text = pytesseract.image_to_string(image)
            extracted_text += f"\n--- Page {page_num + 1} ---\n{text}"
            
        return {
            "extracted_text": extracted_text.strip(),
            "detected_language": "en", # Simplified for MVP
            "ocr_confidence": 95.0 # Tesseract confidence requires parsing TSV, simplified here
        }
    finally:
        # Clean up temp file
        if os.path.exists(temp_pdf_path):
            os.remove(temp_pdf_path)
