import asyncio
import base64

from openai import APIError, APITimeoutError, AsyncOpenAI
from pydantic import ValidationError

from app.ai.prompts import SYSTEM_PROMPT, analysis_prompt
from app.config import settings
from app.models.schemas import LabelAnalysis, Language

PROVIDER_TIMEOUT_SECONDS = 60


class AnalysisError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


async def analyze_image(image: bytes, language: Language) -> LabelAnalysis:
    api_key = settings.openai_api_key.get_secret_value()
    if not api_key:
        raise AnalysisError(503, "Live analysis is unavailable. Try the fictional example or contact the site operator.")

    encoded = base64.b64encode(image).decode("ascii")
    try:
        async with asyncio.timeout(PROVIDER_TIMEOUT_SECONDS):
            async with AsyncOpenAI(api_key=api_key, timeout=PROVIDER_TIMEOUT_SECONDS, max_retries=0) as client:
                response = await client.responses.create(
                    model=settings.openai_model,
                    instructions=SYSTEM_PROMPT,
                    input=[{
                        "role": "user",
                        "content": [
                            {"type": "input_text", "text": analysis_prompt(language)},
                            {"type": "input_image", "image_url": f"data:image/jpeg;base64,{encoded}", "detail": "high"},
                        ],
                    }],
                    text={"format": {
                        "type": "json_schema",
                        "name": "medication_label",
                        "schema": LabelAnalysis.model_json_schema(),
                        "strict": True,
                    }},
                    store=False,
                    max_output_tokens=10000,
                )
        if response.status != "completed":
            raise AnalysisError(502, "Analysis did not finish. Try again with a clear photo of one label.")
        return LabelAnalysis.model_validate_json(response.output_text)
    except (TimeoutError, APITimeoutError) as exc:
        raise AnalysisError(504, "Analysis took too long. Try again.") from exc
    except ValidationError as exc:
        raise AnalysisError(502, "The analysis response could not be read. Try again or retake the photo.") from exc
    except APIError as exc:
        # Provider errors can contain request data. Keep the client response generic.
        raise AnalysisError(503, "Live analysis is temporarily unavailable. Try again later or open the fictional example.") from exc
