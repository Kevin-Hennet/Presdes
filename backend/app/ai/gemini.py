import base64
import json
import re

from openai import OpenAI

from app.config import settings
from app.ai.prompts import SYSTEM_PROMPT, analysis_prompt


class AIUnavailable(Exception):
    pass


def analyze_image(
    image_bytes: bytes,
    mime_type: str,
    document_type: str,
    level: str,
    language: str
):
    if not settings.openai_api_key:
        raise AIUnavailable(
            "OpenAI API key is not configured. "
            "Add OPENAI_API_KEY to backend/.env."
        )

    client = OpenAI(
        api_key=settings.openai_api_key,
        timeout=90.0
    )

    encoded_image = base64.b64encode(image_bytes).decode("utf-8")
    image_data = f"data:{mime_type};base64,{encoded_image}"

    prompt = analysis_prompt(
        document_type, level, language
    )

    response = client.responses.create(
        model=settings.openai_model,
        instructions=SYSTEM_PROMPT,
        input=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": prompt
                    },
                    {
                        "type": "input_image",
                        "image_url": image_data,
                        "detail": "high"
                    }
                ]
            }
        ]
    )

    raw = response.output_text or "{}"

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", raw, re.S)
        if not match:
            raise ValueError(
                "The AI returned an unreadable response. "
                "Please retake the photo."
            )
        data = json.loads(match.group())

    for key in [
        "key_fields",
        "three_things",
        "red_flags",
        "questions_to_ask",
        "uncertainties"
    ]:
        if not isinstance(data.get(key), list):
            data[key] = []

    return data
