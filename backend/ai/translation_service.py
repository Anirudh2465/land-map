from deep_translator import GoogleTranslator

def translate_text(text: str, target_lang: str = "en") -> dict:
    """
    Translates text to the target language using deep-translator.
    """
    if not text:
        return {"translated_text": "", "detected_language": ""}
        
    try:
        # deep-translator handles limits better, but we still chunk to be safe
        chunk = text[:4999] 
        translator = GoogleTranslator(source='auto', target=target_lang)
        result_text = translator.translate(chunk)
        
        return {
            "translated_text": result_text,
            "detected_language": "auto" # deep_translator doesn't easily expose detected source lang without extra calls
        }
    except Exception as e:
        print(f"Translation error: {e}")
        return {
            "translated_text": f"Error during translation: {str(e)}",
            "detected_language": "unknown"
        }
