import asyncio
from types import SimpleNamespace
from uuid import uuid4

import httpx
import pytest
from pydantic import SecretStr
from pymongo.errors import ServerSelectionTimeoutError

from app.config import settings
from app.main import app
from app.models.schemas import LabelAnalysis
from app.routers import scan
from app.services.saved_scans import SavedScanStore

PATH = "/api/saved-scans"
ORIGIN = "http://test"
MUTATION = {"Origin": ORIGIN, "X-PresDes-Request": "1"}
pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def scan_text():
    fragment = "Training label only. Do not take this product."
    return {
        "id": str(uuid4()),
        "created_at": "2026-11-14T12:00:00Z",
        "explanation_language": "en",
        "readability": "readable",
        "source_language": "en",
        "extracted_text": "Pine Sample 5 mg\n" + fragment,
        "medication": {"state": "found", "excerpts": ["Pine Sample 5 mg"]},
        "directions": {"state": "found", "excerpts": [fragment]},
        "warnings": {"state": "not_found", "excerpts": []},
        "printed_dates": {"state": "not_found", "excerpts": []},
        "explanations": {"simple": "For training only.", "detailed": fragment},
        "uncertainties": [],
        "pharmacist_questions": [],
    }


class MemoryCursor:
    def __init__(self, records):
        self.records = records

    def sort(self, order):
        self.records.sort(key=lambda record: tuple(record[field] for field, _ in order), reverse=True)
        return self

    def limit(self, limit):
        self.records = self.records[:limit]
        return self

    async def to_list(self):
        return self.records


class MemoryCollection:
    def __init__(self):
        self.records = []
        self.indexes = []
        self.unavailable = False

    def check(self):
        if self.unavailable:
            raise ServerSelectionTimeoutError("diagnostic with connection details")

    def matches(self, record, query):
        for field, value in query.items():
            if field == "$or":
                if not any(self.matches(record, branch) for branch in value):
                    return False
            elif isinstance(value, dict):
                if not record[field] < value["$lt"]:
                    return False
            elif record[field] != value:
                return False
        return True

    async def create_indexes(self, indexes):
        self.check()
        self.indexes = [index.document for index in indexes]

    async def find_one(self, query):
        self.check()
        return next((record for record in self.records if self.matches(record, query)), None)

    async def find_one_and_update(self, query, change, *, upsert, return_document):
        self.check()
        assert upsert and return_document
        record = await self.find_one(query)
        if record is not None:
            return record
        record = change["$setOnInsert"]
        self.records.append(record)
        return record

    async def delete_one(self, query):
        record = await self.find_one(query)
        if record is None:
            return SimpleNamespace(deleted_count=0)
        self.records.remove(record)
        return SimpleNamespace(deleted_count=1)

    def find(self, query, projection):
        self.check()
        assert projection["result.medication.excerpts"] == 1
        return MemoryCursor([record for record in self.records if self.matches(record, query)])


@pytest.fixture
async def api(monkeypatch):
    monkeypatch.setattr(settings, "mongodb_uri", SecretStr("mongodb://mock.example"))
    monkeypatch.setattr(settings, "mongodb_session_secret", SecretStr("test-secret-" * 4))
    store = SavedScanStore.__new__(SavedScanStore)
    store.collection = MemoryCollection()
    store._indexes_ready = False
    store._index_lock = asyncio.Lock()
    monkeypatch.setattr(app.state, "saved_scans_store", store, raising=False)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url=ORIGIN) as first:
        async with httpx.AsyncClient(transport=transport, base_url=ORIGIN) as second:
            yield first, second, store.collection


async def establish(client, origin=ORIGIN):
    return await client.post(PATH + "/session", headers={**MUTATION, "Origin": origin})


async def save(client, result, **kwargs):
    return await client.post(PATH, headers=MUTATION, json={"result": result, **kwargs})


async def test_explicit_save_reopen_delete_and_isolation(api, scan_text):
    first, second, collection = api
    url = PATH + "/" + scan_text["id"]
    assert (await first.get(PATH)).json() == {"items": [], "next_before": None}
    assert (await first.get(url)).status_code == 404
    assert (await save(first, scan_text)).status_code == 401
    assert collection.records == []

    cookie = await establish(first)
    assert cookie.status_code == 204
    assert cookie.headers["cache-control"] == "no-store"
    assert "HttpOnly" in cookie.headers["set-cookie"]
    assert "SameSite=strict" in cookie.headers["set-cookie"]
    assert (await establish(first)).headers.get("set-cookie") is None

    first_save = await save(first, scan_text, example=True)
    assert first_save.status_code == 200, first_save.text
    assert first_save.headers["cache-control"] == "no-store"
    assert (await save(first, scan_text, example=False)).json() == first_save.json()
    assert len(collection.records) == 1
    assert collection.indexes[0]["unique"]
    assert list(collection.indexes[1]["key"]) == ["owner", "saved_at", "scan_id"]
    assert first.cookies["presdes_history"] not in str(collection.records)

    items = (await first.get(PATH)).json()["items"]
    assert items[0]["name"] == "Pine Sample 5 mg"
    assert items[0]["example"] is True
    assert "extracted_text" not in str(items)
    assert (await first.get(url)).json() == first_save.json()

    await establish(second)
    assert (await second.get(PATH)).json()["items"] == []
    assert (await second.get(url)).status_code == 404
    assert (await second.delete(url, headers=MUTATION)).status_code == 404
    fake_cookie = first.cookies["presdes_history"][:-1] + ("a" if first.cookies["presdes_history"][-1] != "a" else "b")
    assert (await second.get(url, headers={"Cookie": f"presdes_history={fake_cookie}"})).status_code == 404

    second_save = await save(second, scan_text, example=False)
    assert second_save.json()["example"] is False
    assert (await first.get(url)).json()["example"] is True
    assert (await first.delete(url, headers=MUTATION)).status_code == 204
    assert (await first.get(url)).status_code == 404
    assert (await second.get(url)).status_code == 200


async def test_cookie_csrf_and_https(api, scan_text):
    first, _, collection = api
    assert (await establish(first, "https://another.example")).status_code == 403
    assert (await first.post(PATH + "/session", headers={"Origin": ORIGIN})).status_code == 403
    await establish(first)
    assert (await first.post(PATH, json={"result": scan_text})).status_code == 403
    assert collection.records == []
    await save(first, scan_text)
    url = PATH + "/" + scan_text["id"]
    assert (await first.delete(url, headers={**MUTATION, "Origin": "https://another.example"})).status_code == 403
    assert (await first.get(url)).status_code == 200

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="https://test",
    ) as secure:
        response = await establish(secure, "https://test")
        assert response.headers["set-cookie"].startswith("__Host-presdes_history=")
        assert "; Secure" in response.headers["set-cookie"]


async def test_pagination_and_validation(api, scan_text):
    first, _, _ = api
    await establish(first)
    for scan_id in [str(uuid4()) for _ in range(3)]:
        assert (await save(first, {**scan_text, "id": scan_id})).status_code == 200
    seen = set()
    params = {"limit": 1}
    for _ in range(3):
        page = (await first.get(PATH, params=params)).json()
        identifier = page["items"][0]["id"]
        assert identifier not in seen
        seen.add(identifier)
        if page["next_before"]:
            params["before"] = page["next_before"]
    assert page["next_before"] is None
    for params in [{"limit": 0}, {"limit": 51}, {"before": "invalid"}, {"before": f"2026-11-14|{uuid4()}"}]:
        assert (await first.get(PATH, params=params)).status_code == 422
    assert (await first.get(PATH + "/invalid")).status_code == 422
    assert (await save(first, {**scan_text, "id": "invalid"})).status_code == 422
    assert (await save(first, {**scan_text, "photo": "<image>"})).status_code == 422
    assert (await save(first, scan_text, owner="fake-owner")).status_code == 422
    assert (await first.post(PATH, headers={
        **MUTATION, "Content-Type": "application/json",
    }, content=b" " * (128 * 1024 + 1))).status_code == 413


async def test_storage_outage_does_not_block_analysis(api, scan_text, monkeypatch):
    first, _, collection = api
    await establish(first)
    collection.unavailable = True
    assert (await first.get(PATH)).status_code == 503

    async def analyze_image(_photo, _language):
        return LabelAnalysis.model_validate({
            key: value for key, value in scan_text.items()
            if key not in {"id", "created_at", "explanation_language"}
        })

    monkeypatch.setattr(scan, "analyze_image", analyze_image)
    monkeypatch.setattr(scan, "prepare_image", lambda raw, _mime: raw)
    analysis = await first.post("/api/scans", headers={"Content-Type": "image/png"}, content=b"fixture")
    assert analysis.status_code == 200
    assert analysis.json()["extracted_text"] == scan_text["extracted_text"]
    failure = await save(first, analysis.json())
    assert failure.status_code == 503
    assert "diagnostic" not in failure.text
    assert (await first.get("/api/health")).json()["status"] == "ok"
    collection.unavailable = False
    assert (await save(first, analysis.json())).status_code == 200


async def test_missing_mongo_configuration(api, monkeypatch):
    first, _, _ = api
    monkeypatch.setattr(settings, "mongodb_uri", SecretStr(""))
    assert (await first.get(PATH)).status_code == 503
    assert "not configured" in (await establish(first)).json()["detail"]
    assert (await first.get("/api/health")).json()["scan_storage"] == "disabled"
