from google import genai
from config import settings

def generate_plot_summary(plot_name: str, docs_texts: list[dict]) -> str:
    """
    Generates an AI summary of the plot's documents using Gemini.
    """
    if not settings.GEMINI_API_KEY:
        return "Error: GEMINI_API_KEY is not configured on the server."
        
    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    
    # Construct prompt
    prompt = f"Analyze the following land documents for the plot named '{plot_name}'.\n\n"
    
    for doc in docs_texts:
        prompt += f"--- {doc['doc_type']} Document ---\n"
        prompt += f"{doc['text'][:3000]}\n\n" # Limit text to fit context window safely
        
    prompt += """
Please provide a clear, structured summary with the following sections. Do not use markdown headers, just use bolding for keys.

**1. Land Overview:** (Combine owner, area, and location details)
**2. Document Consistency:** (Are the details in the FMB, Patta, and Deed consistent? Highlight any mismatches in area or names)
**3. Key Clauses/Dates:** (Important transfer dates, encumbrances, or notable legal clauses)
**4. Flags/Risks:** (Highlight anything missing or unusual)

Keep it concise and professional.
    """
    
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
        )
        return response.text
    except Exception as e:
        print(f"Gemini API error: {e}")
        return f"Failed to generate summary: {str(e)}"
