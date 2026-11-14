from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routers import scan, medications

app = FastAPI(title="LabelLens API", version="1.0.0", description="Document literacy and medication tracking API")
app.add_middleware(CORSMiddleware, allow_origins=[x.strip() for x in settings.cors_origins.split(",")], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(scan.router); app.include_router(medications.router)

@app.get("/api/health")
def health():
    return {"status": "ok", "gemini_configured": bool(settings.gemini_api_key), "mongodb_configured": bool(settings.mongodb_uri)}

@app.get("/")
def root(): return {"name": "LabelLens API", "docs": "/docs"}
