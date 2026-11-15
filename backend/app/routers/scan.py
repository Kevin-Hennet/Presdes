from datetime import datetime, timezone
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.concurrency import run_in_threadpool

from app.ai.openai_vision import AnalysisError, analyze_image
from app.models.schemas import ScanOptions, ScanResult
from app.services.images import FORMATS, MAX_UPLOAD_BYTES, InvalidImage, prepare_image

router = APIRouter(prefix="/api/scans", tags=["scans"])


@router.post("", response_model=ScanResult)
async def create_scan(
    request: Request,
    response: Response,
    options: Annotated[ScanOptions, Query()],
) -> ScanResult:
    """Analyze raw bytes from a single JPG, PNG, or WebP medication-label photo."""
    mime_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if mime_type not in FORMATS:
        raise HTTPException(415, "Upload a JPG, PNG, or WebP photo.")

    raw = bytearray()
    async for chunk in request.stream():
        if len(raw) + len(chunk) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, "The photo exceeds 12 MB. Choose a smaller photo.")
        raw.extend(chunk)

    try:
        image = await run_in_threadpool(prepare_image, bytes(raw), mime_type)
        result = await analyze_image(image, options.language)
    except InvalidImage as exc:
        raise HTTPException(422, str(exc)) from exc
    except AnalysisError as exc:
        raise HTTPException(exc.status_code, exc.detail) from exc

    response.headers["Cache-Control"] = "no-store"
    return ScanResult(
        id=uuid4(),
        created_at=datetime.now(timezone.utc),
        explanation_language=options.language,
        **result.model_dump(),
    )
