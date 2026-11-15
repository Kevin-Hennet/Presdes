from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routers import reference, saved_scans, scan


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        yield
    finally:
        if store := getattr(app.state, "saved_scans_store", None):
            await store.close()

app = FastAPI(
    title="PresDes API",
    version="2.0.0",
    description="Analyze medication-label photos and look up individual FDA labels.",
    lifespan=lifespan,
)
app.include_router(scan.router)
app.include_router(reference.router)
app.include_router(saved_scans.router)


@app.get("/api/health")
async def health() -> dict[str, str | bool]:
    return {
        "status": "ok",
        "openai_configured": bool(settings.openai_api_key.get_secret_value()),
        "scan_storage": "mongodb_configured" if settings.mongo_configured else "disabled",
    }


class FrontendFiles(StaticFiles):
    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        asset_path = path.replace("\\", "/").lstrip("/")
        response.headers["Cache-Control"] = (
            "public, max-age=31536000, immutable" if asset_path.startswith("assets/") else "no-cache"
        )
        return response


frontend = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if (frontend / "index.html").is_file():
    app.mount("/", FrontendFiles(directory=frontend, html=True), name="frontend")
