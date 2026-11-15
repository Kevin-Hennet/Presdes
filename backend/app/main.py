from fastapi import FastAPI

from app.config import settings
from app.routers import reference, scan

app = FastAPI(
    title="PresDes API",
    version="2.0.0",
    description="Analyze medication-label photos and look up individual FDA labels.",
)
app.include_router(scan.router)
app.include_router(reference.router)


@app.get("/api/health")
async def health() -> dict[str, str | bool]:
    return {
        "status": "ok",
        "openai_configured": bool(settings.openai_api_key.get_secret_value()),
        "scan_storage": "disabled",
    }
