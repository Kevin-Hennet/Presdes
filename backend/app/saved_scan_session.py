import hashlib
import hmac
import re
import secrets
import time

from fastapi import HTTPException, Request, Response

from app.config import settings

SESSION_AGE = 365 * 24 * 60 * 60
PRIVATE_HEADERS = {"Cache-Control": "no-store"}


def require_same_origin(request: Request) -> None:
    origin = f"{request.url.scheme}://{request.url.netloc}"
    if request.headers.get("origin") != origin or request.headers.get("x-presdes-request") != "1":
        raise HTTPException(403, "Use PresDes on its own site to change saved scans.", headers=PRIVATE_HEADERS)


def cookie_name(request: Request) -> str:
    return "__Host-presdes_history" if request.url.scheme == "https" else "presdes_history"


def sign(value: str) -> str:
    secret = settings.mongodb_session_secret.get_secret_value()
    return hmac.new(secret.encode(), value.encode(), "sha256").hexdigest()


def session_owner(request: Request) -> str | None:
    cookie = request.cookies.get(cookie_name(request), "")
    structure = re.fullmatch(r"([A-Za-z0-9_-]{43})\.([0-9]{1,12})\.([a-f0-9]{64})", cookie)
    if not structure:
        return None
    nonce, issued, signature = structure.groups()
    age = int(time.time()) - int(issued)
    if not 0 <= age <= SESSION_AGE or not hmac.compare_digest(signature, sign(f"{nonce}.{issued}")):
        return None
    return hashlib.sha256(nonce.encode()).hexdigest()


def establish_session(request: Request, response: Response) -> None:
    if session_owner(request) is not None:
        return
    value = f"{secrets.token_urlsafe(32)}.{int(time.time())}"
    response.set_cookie(
        cookie_name(request),
        f"{value}.{sign(value)}",
        max_age=SESSION_AGE,
        httponly=True,
        secure=request.url.scheme == "https",
        samesite="strict",
        path="/",
    )
