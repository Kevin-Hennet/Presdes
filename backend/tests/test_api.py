import asyncio
import json
import threading
from datetime import datetime
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import httpx
import pytest
from PIL import Image
from pydantic import SecretStr

from app.ai import openai_vision
from app.main import app
from app.routers import scan
from app.services import images, openfda


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        yield client


@pytest.fixture
def photo():
    output = BytesIO()
    Image.new("RGB", (20, 30), "white").save(output, "PNG")
    return output.getvalue()


@pytest.fixture
def label():
    direction = "Training label only. Do not take this product."
    return {
        "readability": "partial",
        "source_language": "en",
        "extracted_text": direction,
        "medication": {"state": "unclear", "excerpts": []},
        "directions": {"state": "found", "excerpts": [direction]},
        "warnings": {"state": "unclear", "excerpts": []},
        "printed_dates": {"state": "not_found", "excerpts": []},
        "explanations": {"simple": "For training only.", "detailed": direction},
        "uncertainties": ["The medication name is blurry."],
        "pharmacist_questions": [],
    }


@pytest.fixture
def provider(monkeypatch, label):
    monkeypatch.setattr(openai_vision.settings, "openai_api_key", SecretStr("test-key"))
    create = AsyncMock(return_value=SimpleNamespace(status="completed", output_text=json.dumps(label)))
    sdk = MagicMock()
    sdk.return_value.__aenter__.return_value.responses.create = create
    monkeypatch.setattr(openai_vision, "AsyncOpenAI", sdk)
    return create


async def analyze(client, photo, suffix="", mime="image/png"):
    return await client.post("/api/scans" + suffix, content=photo, headers={"Content-Type": mime})


pytestmark = pytest.mark.anyio


async def test_scan_contract(client, photo, label, provider):
    response = await analyze(client, photo, "?language=fr")
    assert response.status_code == 200, response.text
    assert response.headers["Cache-Control"] == "no-store"
    result = response.json()
    assert {key: result[key] for key in label} == label
    assert result["explanation_language"] == "fr"
    assert UUID(result["id"]).version == 4
    assert datetime.fromisoformat(result["created_at"]).utcoffset().total_seconds() == 0

    request = provider.await_args.kwargs
    schema = request["text"]["format"]["schema"]
    assert request["store"] is False
    assert request["text"]["format"]["strict"] is True
    assert set(schema["required"]) == set(label)
    assert schema["additionalProperties"] is False
    assert "French" in request["input"][0]["content"][0]["text"]
    assert request["input"][0]["content"][1]["image_url"].startswith("data:image/jpeg;base64,")


async def test_multipart_views_share_one_analysis_request(client, photo, provider):
    second = BytesIO()
    Image.new("RGB", (30, 20), "navy").save(second, "PNG")
    raw_views = [photo, second.getvalue()]
    response = await client.post("/api/scans?language=fr", files=[
        ("files", (f"view-{number}.png", data, "image/png")) for number, data in enumerate(raw_views)
    ])
    assert response.status_code == 200, response.text
    provider.assert_awaited_once()
    request = provider.await_args.kwargs
    content = request["input"][0]["content"]
    assert "Analyze 2 photo(s)" in content[0]["text"]
    assert "French" in content[0]["text"]
    assert [part["type"] for part in content[1:]] == ["input_image", "input_image"]
    assert content[1]["image_url"] != content[2]["image_url"]
    assert request["store"] is False


async def test_batch_validation_rejects_each_bad_photo_and_count(client, photo, provider):
    valid = ("files", ("view.png", photo, "image/png"))
    assert (await client.post("/api/scans", files=[valid] * 5)).status_code == 413
    unsupported = await client.post("/api/scans", files=[valid, ("files", ("other.gif", photo, "image/gif"))])
    assert unsupported.status_code == 415
    assert "Photo 2" in unsupported.json()["detail"]
    broken = await client.post("/api/scans", files=[valid, ("files", ("other.png", b"corrupt", "image/png"))])
    assert broken.status_code == 422
    assert "Photo 2" in broken.json()["detail"]
    assert (await client.post("/api/scans", files=[("unexpected", valid[1])])).status_code == 422
    provider.assert_not_awaited()


async def test_batch_enforces_per_photo_and_aggregate_limits(client, photo, provider, monkeypatch):
    valid = ("files", ("view.png", photo, "image/png"))
    monkeypatch.setattr(scan, "MAX_UPLOAD_BYTES", len(photo) - 1)
    size = await client.post("/api/scans", files=[valid])
    assert size.status_code == 413
    assert "Photo 1 exceeds" in size.json()["detail"]

    monkeypatch.setattr(scan, "MAX_UPLOAD_BYTES", len(photo))
    monkeypatch.setattr(scan, "MAX_BATCH_BYTES", 2 * len(photo) - 1)
    size = await client.post("/api/scans", files=[valid, valid])
    assert size.status_code == 413
    assert "total" in size.json()["detail"]
    provider.assert_not_awaited()


async def test_multipart_stream_stops_when_request_exceeds_limit(client, provider, monkeypatch):
    monkeypatch.setattr(scan, "MAX_BATCH_BYTES", 10)
    monkeypatch.setattr(scan, "MULTIPART_OVERHEAD_BYTES", 16)
    consumed = []

    async def parts():
        for index, chunk in enumerate([b"--label\r\n", b"x" * 32, b"unread"]):
            consumed.append(index)
            yield chunk

    response = await client.post(
        "/api/scans", content=parts(), headers={"Content-Type": "multipart/form-data; boundary=label"},
    )
    assert response.status_code == 413
    assert consumed == [0, 1]
    provider.assert_not_awaited()


@pytest.mark.parametrize("violation", ["list", "missing", "nested", "uncertainties", "excerpt", "state", "null_explanation"])
async def test_malformed_output_is_recoverable(client, photo, label, provider, violation):
    if violation == "list":
        label = [label]
    elif violation == "missing":
        del label["printed_dates"]
    elif violation == "nested":
        label["directions"]["excerpts"] = [None]
    elif violation == "uncertainties":
        label["uncertainties"] = "Unreadable dose"
    elif violation == "excerpt":
        label["directions"]["excerpts"] = ["Invented direction"]
    elif violation == "state":
        label["directions"]["state"] = "probably"
    else:
        label["explanations"]["simple"] = None
    provider.return_value.output_text = json.dumps(label)
    response = await analyze(client, photo)
    assert response.status_code == 502
    assert "retake" in response.json()["detail"]


@pytest.mark.parametrize("status", ["unreadable", "not_medication_label", "mismatched_labels"])
async def test_unreadable_or_unrelated(client, photo, label, provider, status):
    label.update(
        readability=status,
        source_language="und",
        extracted_text="",
        explanations=None,
        uncertainties=["The text cannot be read."] if status == "unreadable" else [],
    )
    for key in ("medication", "directions", "warnings", "printed_dates"):
        label[key] = {"state": "unclear" if status == "unreadable" else "not_found", "excerpts": []}
    provider.return_value.output_text = json.dumps(label)
    response = await analyze(client, photo)
    assert response.status_code == 200, response.text
    assert response.json()["readability"] == status
    assert response.json()["explanations"] is None


async def test_timeout_and_request_responsiveness(client, photo, provider, monkeypatch):
    waiting = asyncio.Event()

    async def slow_provider(**_):
        waiting.set()
        await asyncio.Event().wait()

    provider.side_effect = slow_provider
    monkeypatch.setattr(openai_vision, "PROVIDER_TIMEOUT_SECONDS", 0.5)
    task = asyncio.create_task(analyze(client, photo))
    await asyncio.wait_for(waiting.wait(), timeout=2)
    health = await asyncio.wait_for(client.get("/api/health"), timeout=0.2)
    assert health.status_code == 200
    assert not task.done()
    assert (await task).status_code == 504


async def test_image_decoding_does_not_block_health(client, photo, provider, monkeypatch):
    started, release = threading.Event(), threading.Event()
    prepare_image = scan.prepare_image

    def slow_image(raw, mime):
        started.set()
        release.wait(timeout=2)
        return prepare_image(raw, mime)

    monkeypatch.setattr(scan, "prepare_image", slow_image)
    task = asyncio.create_task(analyze(client, photo))
    try:
        assert await asyncio.to_thread(started.wait, 2)
        assert (await client.get("/api/health")).status_code == 200
        assert not task.done()
    finally:
        release.set()
        assert (await task).status_code == 200


async def test_missing_key_and_removed_public_storage(client, photo, monkeypatch):
    monkeypatch.setattr(openai_vision.settings, "openai_api_key", SecretStr(""))
    monkeypatch.setattr(openai_vision.settings, "mongodb_uri", SecretStr(""))
    monkeypatch.setenv("MONGODB_URI", "mongodb://example.invalid")
    health = await client.get("/api/health")
    assert health.json() == {"status": "ok", "openai_configured": False, "scan_storage": "disabled"}
    assert (await analyze(client, photo)).status_code == 503

    for method, path in [
        ("GET", "/api/scans?limit=0"),
        ("GET", "/api/scans?limit=-5"),
        ("DELETE", "/api/scans/old-id"),
        ("GET", "/api/medications"),
        ("POST", "/api/medications"),
        ("DELETE", "/api/medications/old-id"),
        ("POST", "/api/doses"),
        ("GET", "/api/adherence"),
        ("POST", "/api/interactions"),
    ]:
        assert (await client.request(method, path)).status_code in {404, 405}


@pytest.mark.parametrize("query", ["?language=unknown", "?reading_level=wrong", "?document_type=bill"])
async def test_scan_rejects_invalid_options(client, photo, provider, query):
    assert (await analyze(client, photo, query)).status_code == 422
    provider.assert_not_awaited()


async def test_rejects_invalid_input_and_enforces_body_limit(client, photo, provider, monkeypatch):
    assert (await analyze(client, photo, mime="image/gif")).status_code == 415
    assert (await analyze(client, photo, mime="image/jpeg")).status_code == 422
    assert (await analyze(client, b"this is not an image")).status_code == 422
    assert (await analyze(client, b"")).status_code == 422
    monkeypatch.setattr(images, "MAX_PIXELS", 500)
    assert (await analyze(client, photo)).status_code == 422
    monkeypatch.setattr(scan, "MAX_UPLOAD_BYTES", 10)
    reads = []

    async def oversized_chunks():
        for index in range(5):
            reads.append(index)
            yield b"123456"

    response = await analyze(client, oversized_chunks())
    assert response.status_code == 413
    assert reads == [0, 1]
    provider.assert_not_awaited()


async def test_provider_error_does_not_return_sensitive_details(client, photo, provider):
    from openai import APIConnectionError

    provider.side_effect = APIConnectionError(message="sensitive diagnostic", request=httpx.Request("POST", "https://example.invalid"))
    response = await analyze(client, photo)
    assert response.status_code == 503
    assert "sensitive diagnostic" not in response.text


async def test_fda_individual_record_and_failure_states(client, monkeypatch):
    record_id = "10afb12c-295a-4820-9b21-116230bae821"
    upstream = AsyncMock(return_value=httpx.Response(
        200,
        json={"results": [{"id": record_id, "openfda": {
            "brand_name": ["Pine Sample"], "manufacturer_name": ["Fictional Maker"],
        }}]},
        request=httpx.Request("GET", openfda.LABEL_API),
    ))
    sdk = MagicMock()
    sdk.return_value.__aenter__.return_value.get = upstream
    monkeypatch.setattr(openfda.httpx, "AsyncClient", sdk)

    result = await client.get("/api/labels", params={"name": "Pine Sample"})
    assert result.status_code == 200
    match, = result.json()["matches"]
    assert match["manufacturer"] == "Fictional Maker"
    assert f"search=id%3A{record_id}" in match["source_url"]
    assert '.exact:"Pine Sample"' in upstream.await_args.kwargs["params"]["search"]

    upstream.return_value = httpx.Response(404, json={"error": {"code": "NOT_FOUND"}})
    assert (await client.get("/api/labels?name=Pine")).json() == {"matches": []}

    upstream.return_value = httpx.Response(503, request=httpx.Request("GET", openfda.LABEL_API))
    assert (await client.get("/api/labels?name=Pine")).status_code == 502
    assert (await client.get("/api/labels", params={"name": 'Pine" OR *'})).status_code == 422
