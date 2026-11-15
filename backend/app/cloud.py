import asyncio
from base64 import b64encode
from hmac import compare_digest
from os import environ

from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.main import app as presdes

PRIVATE = {"Cache-Control": "no-store"}
SCAN_PATHS = {"/api/scans", "/api/scans/preview"}


class DemoAccess:
    def __init__(self, app: ASGIApp, username: str, password: str, *, render: bool = False) -> None:
        if (not username.strip() or not password.strip() or ":" in username
                or any(ord(char) < 32 or ord(char) == 127 for char in username + password)):
            raise RuntimeError("Configure valid PRESDES_DEMO_USERNAME and PRESDES_DEMO_PASSWORD settings.")
        self.app = app
        self.token = b64encode(f"{username}:{password}".encode("utf-8"))
        self.render = render
        self.scan_slot = asyncio.Semaphore(1)

    def authenticated(self, headers: Headers) -> bool:
        supplied = headers.getlist("authorization")
        if len(supplied) != 1:
            return False
        parts = supplied[0].encode("latin-1").split()
        return len(parts) == 2 and parts[0].lower() == b"basic" and compare_digest(self.token, parts[1])

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "lifespan":
            await self.app(scope, receive, send)
            return
        if scope["type"] == "websocket":
            await send({"type": "websocket.close", "code": 1008})
            return
        if scope["type"] != "http":
            return

        if scope["path"] == "/healthz" and scope["method"] in {"GET", "HEAD"}:
            response = (JSONResponse({"status": "ok"}, headers=PRIVATE) if scope["method"] == "GET"
                        else Response(headers=PRIVATE))
            await response(scope, receive, send)
            return

        headers = Headers(scope=scope)
        # Render Free sends public HTTPS through its edge and cannot receive private network traffic.
        # Use the forwarded scheme there. Forwarded client IPs and hosts are unnecessary.
        secure = scope["scheme"] == "https" or (
            self.render and headers.getlist("x-forwarded-proto") == ["https"]
        )
        if not secure:
            await JSONResponse({"detail": "Use HTTPS to open PresDes."}, 400, headers=PRIVATE)(scope, receive, send)
            return
        if not self.authenticated(headers):
            challenge = {**PRIVATE, "WWW-Authenticate": 'Basic realm="PresDes demo", charset="UTF-8"'}
            await JSONResponse({"detail": "Demo sign-in required."}, 401, headers=challenge)(scope, receive, send)
            return

        scope = {**scope, "scheme": "https", "headers": [
            (name, value) for name, value in scope["headers"] if name.lower() != b"authorization"
        ]}

        async def send_private(message: Message) -> None:
            if message["type"] == "http.response.start":
                response_headers = MutableHeaders(scope=message)
                cache = response_headers.get("cache-control")
                if not cache:
                    response_headers["Cache-Control"] = "no-store"
                elif "no-store" not in cache.lower():
                    directives = [item.strip() for item in cache.split(",") if item.strip().lower() != "public"]
                    response_headers["Cache-Control"] = ", ".join(["private", *directives])
            await send(message)

        if scope["method"] != "POST" or scope["path"] not in SCAN_PATHS:
            await self.app(scope, receive, send_private)
        elif self.scan_slot.locked():
            await JSONResponse(
                {"detail": "PresDes is processing another photo request. Try again shortly."},
                503,
                headers={**PRIVATE, "Retry-After": "3"},
            )(scope, receive, send)
        else:
            async with self.scan_slot:
                await self.app(scope, receive, send_private)


def create_app() -> ASGIApp:
    return DemoAccess(
        presdes,
        environ.get("PRESDES_DEMO_USERNAME", ""),
        environ.get("PRESDES_DEMO_PASSWORD", ""),
        render=environ.get("RENDER") == "true",
    )
