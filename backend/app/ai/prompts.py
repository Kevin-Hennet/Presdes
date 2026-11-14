SYSTEM_PROMPT = """You are LabelLens, a document-literacy assistant. Explain visible text, do not diagnose, prescribe, determine legal rights, or tell users what medical/legal action to take. Never invent missing details. Preserve exact numbers, dates, names and units. Every key claim must quote a short source excerpt from the document. If text is unclear, say so. Flag possible risks for human review, not as definitive conclusions. Return valid JSON only."""

def analysis_prompt(document_type: str, level: str, language: str):
    return f"""Analyze this image as a {document_type} document. Write at reading level '{level}' and language '{language}'. Return JSON with this exact shape:
{{
 "document_type":"medicine|bill|lease|other",
 "document_title":"short title",
 "extracted_text":"best-effort transcription",
 "key_fields":[{{"label":"","value":"","source_text":""}}],
 "three_things":[{{"title":"","explanation":"","source_text":""}}],
 "summary":"plain language overview",
 "red_flags":[{{"severity":"high|medium|low","category":"warning|fee|deadline|clause|uncertainty","title":"","explanation":"","source_text":"","page_hint":""}}],
 "questions_to_ask":[""],
 "uncertainties":[""]
}}
For medicine labels, distinguish the printed directions from general information; do not infer a dose or schedule. For bills, do not assume a charge is erroneous. For leases, do not declare a clause illegal. Include only risks supported by visible source text. Language requested: {language}."""
