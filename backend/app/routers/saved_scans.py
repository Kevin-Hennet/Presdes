import asyncio
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Annotated, AsyncIterator
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request, Response
from pydantic import ValidationError
from pymongo.errors import PyMongoError

from app.config import settings
from app.models.saved_scans import SavedScan, SavedScanPage, SaveScan
from app.saved_scan_session import PRIVATE_HEADERS, establish_session, require_same_origin, session_owner
from app.services.saved_scans import SavedScanStore

router = APIRouter(prefix="/api/saved-scans", tags=["saved scans"])
MAX_SAVE_BYTES = 128 * 1024


def error(code: int, detail: str) -> HTTPException:
    return HTTPException(code, detail, headers=PRIVATE_HEADERS)


def require_configuration() -> None:
    if not settings.mongo_configured:
        raise error(503, "MongoDB storage is not configured. You can still keep text in this browser.")


@asynccontextmanager
async def storage(request: Request) -> AsyncIterator[SavedScanStore]:
    try:
        async with asyncio.timeout(8):
            store = getattr(request.app.state, "saved_scans_store", None)
            if store is None:
                store = SavedScanStore()
                request.app.state.saved_scans_store = store
            await store.ensure_indexes()
            yield store
    except (PyMongoError, TimeoutError, ValueError) as exc:
        raise error(503, "MongoDB storage is unavailable. Try again later.") from exc


def pagination_cursor(value: str | None) -> tuple[datetime, UUID] | None:
    if value is None:
        return None
    try:
        time, scan_id = value.split("|", 1)
        date = datetime.fromisoformat(time)
        if date.utcoffset() is None:
            raise ValueError("Time zone required")
        return date, UUID(scan_id)
    except ValueError as exc:
        raise error(422, "The saved-scan page cursor is invalid.") from exc


@router.post("/session", status_code=204)
async def start_session(request: Request) -> Response:
    require_same_origin(request)
    require_configuration()
    response = Response(status_code=204, headers=PRIVATE_HEADERS)
    establish_session(request, response)
    return response


@router.get("")
async def list_saved_scans(
    request: Request,
    response: Response,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    before: Annotated[str | None, Query(max_length=100)] = None,
) -> SavedScanPage:
    require_configuration()
    cursor = pagination_cursor(before)
    response.headers.update(PRIVATE_HEADERS)
    owner = session_owner(request)
    if owner is None:
        return SavedScanPage(items=[])
    async with storage(request) as store:
        return await store.list(owner, limit, cursor)


@router.post("")
async def save_scan(request: Request, response: Response) -> SavedScan:
    require_same_origin(request)
    require_configuration()
    owner = session_owner(request)
    if owner is None:
        raise error(401, "Start a saved-scan browser session and try again.")
    if request.headers.get("content-type", "").split(";", 1)[0].lower() != "application/json":
        raise error(415, "Send a label result as JSON.")
    raw = bytearray()
    async for chunk in request.stream():
        if len(raw) + len(chunk) > MAX_SAVE_BYTES:
            raise error(413, "This scan contains too much text to save to MongoDB.")
        raw.extend(chunk)
    try:
        data = SaveScan.model_validate_json(raw)
    except ValidationError as exc:
        raise error(422, "Only readable label results with valid scan details can be saved.") from exc
    response.headers.update(PRIVATE_HEADERS)
    async with storage(request) as store:
        return await store.save(owner, data)


@router.get("/{scan_id}")
async def get_saved_scan(scan_id: UUID, request: Request, response: Response) -> SavedScan:
    require_configuration()
    owner = session_owner(request)
    if owner is not None:
        async with storage(request) as store:
            record = await store.get(owner, scan_id)
        if record is not None:
            response.headers.update(PRIVATE_HEADERS)
            return record
    raise error(404, "Saved scan not found.")


@router.delete("/{scan_id}", status_code=204)
async def delete_saved_scan(scan_id: UUID, request: Request) -> Response:
    require_same_origin(request)
    require_configuration()
    owner = session_owner(request)
    if owner is not None:
        async with storage(request) as store:
            if await store.delete(owner, scan_id):
                return Response(status_code=204, headers=PRIVATE_HEADERS)
    raise error(404, "Saved scan not found.")
