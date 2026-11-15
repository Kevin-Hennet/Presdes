from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.concurrency import run_in_threadpool
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartException, MultiPartParser

from app.ai.openai_vision import AnalysisError, analyze_image
from app.config import settings
from app.models.saved_scans import SaveScan
from app.models.schemas import ScanOptions, ScanResult
from app.routers.saved_scans import MAX_SAVE_BYTES, storage
from app.saved_scan_session import require_same_origin, session_owner
from app.services.images import FORMATS, MAX_UPLOAD_BYTES, InvalidImage, prepare_image

router = APIRouter(prefix="/api/scans", tags=["scans"])

MAX_PHOTOS = 4
MAX_BATCH_BYTES = 24 * 1024 * 1024
MULTIPART_OVERHEAD_BYTES = 64 * 1024


def media_type(header: str | None) -> str:
    return (header or "").split(";", 1)[0].strip().lower()


async def bounded_body(request: Request, limit: int, message: str) -> AsyncIterator[bytes]:
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > limit:
            raise HTTPException(413, message)
        yield chunk


async def validate_image(raw: bytes, mime: str, subject: str) -> bytes:
    if mime not in FORMATS:
        raise HTTPException(415, f"{subject} must be JPG, PNG, WebP, still GIF, HEIC, or HEIF.")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"{subject} exceeds 12 MB. Choose a smaller photo.")
    try:
        return await run_in_threadpool(prepare_image, raw, mime)
    except InvalidImage as exc:
        raise HTTPException(422, f"{subject}. {exc}") from exc


async def read_photos(request: Request) -> list[bytes]:
    mime = media_type(request.headers.get("content-type"))
    if mime != "multipart/form-data":
        if mime not in FORMATS:
            raise HTTPException(415, "Upload a JPG, PNG, WebP, still GIF, HEIC, or HEIF photo.")
        raw = bytearray()
        async for chunk in bounded_body(request, MAX_UPLOAD_BYTES, "The photo exceeds 12 MB. Choose a smaller photo."):
            raw.extend(chunk)
        return [await validate_image(bytes(raw), mime, "The photo")]

    batch_error = "The photos exceed 24 MB total. Remove a photo or choose smaller files."
    body = bounded_body(request, MAX_BATCH_BYTES + MULTIPART_OVERHEAD_BYTES, batch_error)
    parser = MultiPartParser(request.headers, body, max_files=MAX_PHOTOS, max_fields=0)
    try:
        form = await parser.parse()
    except MultiPartException as exc:
        if "Too many files" in exc.message:
            raise HTTPException(413, "Choose up to four photos of the same label.") from exc
        raise HTTPException(422, "Upload photos in multipart fields named files.") from exc
    try:
        uploads = form.multi_items()
        if not uploads or any(name != "files" or not isinstance(file, UploadFile) for name, file in uploads):
            raise HTTPException(422, "Upload one to four photos in multipart fields named files.")
        images = []
        total = 0
        for number, (_, file) in enumerate(uploads, 1):
            raw = await file.read(MAX_UPLOAD_BYTES + 1)
            total += len(raw)
            if total > MAX_BATCH_BYTES:
                raise HTTPException(413, batch_error)
            images.append(await validate_image(raw, media_type(file.content_type), f"Photo {number}"))
        return images
    finally:
        await form.close()


@router.post("/preview")
async def preview_photo(request: Request) -> Response:
    """Create a browser-readable preview in memory without invoking AI or storing it."""
    mime = media_type(request.headers.get("content-type"))
    if mime not in {"image/heic", "image/heif"}:
        raise HTTPException(415, "Preview conversion accepts HEIC or HEIF photos.")
    raw = bytearray()
    async for chunk in bounded_body(request, MAX_UPLOAD_BYTES, "The photo exceeds 12 MB. Choose a smaller photo."):
        raw.extend(chunk)
    jpeg = await validate_image(bytes(raw), mime, "The photo")
    return Response(jpeg, media_type="image/jpeg", headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})


@router.post("", response_model=ScanResult)
async def create_scan(
    request: Request,
    response: Response,
    options: Annotated[ScanOptions, Query()],
) -> ScanResult:
    """Analyze one raw image or up to four multipart views of one medication label."""
    save_to_history = "x-presdes-request" in request.headers
    if save_to_history:
        require_same_origin(request)
    images = await read_photos(request)
    try:
        result = await analyze_image(images, options.language)
    except AnalysisError as exc:
        raise HTTPException(exc.status_code, exc.detail) from exc

    response.headers["Cache-Control"] = "no-store"
    analysis = ScanResult(
        id=uuid4(),
        created_at=datetime.now(timezone.utc),
        explanation_language=options.language,
        **result.model_dump(),
    )
    if save_to_history and analysis.readability in {"readable", "partial"}:
        response.headers["X-PresDes-History"] = "failed"
        owner = session_owner(request) if settings.mongo_configured else None
        if owner is not None:
            data = SaveScan(result=analysis)
            if len(data.model_dump_json().encode()) <= MAX_SAVE_BYTES:
                try:
                    async with storage(request) as store:
                        saved = await store.save(owner, data)
                    if saved is not None:
                        response.headers["X-PresDes-History"] = "saved"
                except HTTPException:
                    # A storage failure must not discard usable analysis.
                    pass
    return analysis
