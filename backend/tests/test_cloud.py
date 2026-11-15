import asyncio

import httpx
import pytest
from pydantic import SecretStr
from starlette.datastructures import Headers
from starlette.responses import Response

from app.cloud import DemoAccess, create_app
from app.config import settings

AUTH = ("presdes", "test-demo-password")
ORIGIN = "https://demo.example"
pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def demo_credentials(monkeypatch):
    monkeypatch.setenv("PRESDES_DEMO_USERNAME", AUTH[0])
    monkeypatch.setenv("PRESDES_DEMO_PASSWORD", AUTH[1])


@pytest.mark.parametrize("variable", ["PRESDES_DEMO_USERNAME", "PRESDES_DEMO_PASSWORD"])
def test_demo_requires_credentials(demo_credentials, monkeypatch, variable):
    monkeypatch.delenv(variable)
    with pytest.raises(RuntimeError, match=variable):
        create_app()


async def test_demo_only_exposes_exact_health_check(demo_credentials):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app()), base_url=ORIGIN) as client:
        health = await client.get("/healthz")
        assert health.status_code == 200
        assert health.json() == {"status": "ok"}
        assert health.headers["cache-control"] == "no-store"
        head = await client.head("http://demo.example/healthz")
        assert head.status_code == 200
        assert head.content == b""

        for method, path in [
            ("GET", "/"), ("GET", "/assets/example.js"), ("GET", "/docs"),
            ("GET", "/api/health"), ("POST", "/api/scans"),
            ("GET", "/healthz/"), ("POST", "/healthz"),
        ]:
            response = await client.request(method, path)
            assert response.status_code == 401, (method, path)
            assert response.headers["www-authenticate"].startswith("Basic ")
            assert response.headers["cache-control"] == "no-store"

        invalid = await client.get("/api/health", auth=(AUTH[0], "wrong"))
        assert invalid.status_code == 401
        authorized = await client.get("/api/health", auth=AUTH)
        assert authorized.status_code == 200
        assert authorized.headers["cache-control"] == "no-store"


async def test_demo_keeps_assets_private_and_removes_auth_header():
    async def asset(scope, receive, send):
        assert "authorization" not in Headers(scope=scope)
        await Response(content=b"asset", headers={"Cache-Control": "public, max-age=86400, immutable"})(
            scope, receive, send,
        )

    transport = httpx.ASGITransport(app=DemoAccess(asset, *AUTH))
    async with httpx.AsyncClient(transport=transport, base_url=ORIGIN) as client:
        response = await client.get("/assets/example.js", auth=AUTH)
        assert response.content == b"asset"
        assert response.headers["cache-control"] == "private, max-age=86400, immutable"

        headers = [("authorization", response.request.headers["authorization"]), ("authorization", "Basic a")]
        assert (await client.get("/assets/example.js", headers=headers)).status_code == 401


async def test_render_proxy_preserves_secure_same_origin_history(demo_credentials, monkeypatch):
    monkeypatch.setenv("RENDER", "true")
    monkeypatch.setattr(settings, "mongodb_uri", SecretStr("mongodb://127.0.0.1:1"))
    monkeypatch.setattr(settings, "mongodb_session_secret", SecretStr("session-test-secret-" * 3))
    headers = {"X-Forwarded-Proto": "https", "Origin": ORIGIN, "X-PresDes-Request": "1"}
    transport = httpx.ASGITransport(app=create_app())
    async with httpx.AsyncClient(transport=transport, base_url="http://demo.example", auth=AUTH) as client:
        path = "/api/saved-scans/session"
        session = await client.post(path, headers=headers)
        assert session.status_code == 204
        cookie = session.headers["set-cookie"]
        assert cookie.startswith("__Host-")
        assert "Secure" in cookie and "HttpOnly" in cookie
        assert session.headers["cache-control"] == "no-store"

        cross_origin = await client.post(path, headers={**headers, "Origin": "https://other.example"})
        assert cross_origin.status_code == 403
        for forwarded in ["http", "https,http"]:
            insecure = await client.post(path, headers={**headers, "X-Forwarded-Proto": forwarded})
            assert insecure.status_code == 400
            assert "www-authenticate" not in insecure.headers

    monkeypatch.delenv("RENDER")
    transport = httpx.ASGITransport(app=create_app())
    async with httpx.AsyncClient(transport=transport, base_url="http://demo.example", auth=AUTH) as client:
        assert (await client.post(path, headers=headers)).status_code == 400


async def test_demo_limits_concurrent_photo_processing():
    entered = asyncio.Event()
    release = asyncio.Event()

    async def scan(scope, receive, send):
        entered.set()
        await asyncio.wait_for(release.wait(), timeout=5)
        await Response(status_code=204)(scope, receive, send)

    transport = httpx.ASGITransport(app=DemoAccess(scan, *AUTH))
    async with httpx.AsyncClient(transport=transport, base_url=ORIGIN, auth=AUTH) as client:
        first = asyncio.create_task(client.post("/api/scans"))
        try:
            await asyncio.wait_for(entered.wait(), timeout=5)
            busy = await client.post("/api/scans/preview")
            assert busy.status_code == 503
            assert busy.headers["retry-after"] == "3"
            assert (await client.get("/healthz")).status_code == 200
        finally:
            release.set()
            assert (await first).status_code == 204
        assert (await client.post("/api/scans/preview")).status_code == 204
