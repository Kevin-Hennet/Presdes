from pymongo import MongoClient
from app.config import settings
import certifi

_client = None
_db = None

def get_db():
    global _client, _db
    if not settings.mongodb_uri:
        return None
    if _db is None:
        _client = MongoClient(
        settings.mongodb_uri,
        serverSelectionTimeoutMS=25000,
        tlsCAFile=certifi.where()
        )
        _db = _client[settings.mongodb_db]
        _db.scans.create_index("created_at")
        _db.medications.create_index("created_at")
        _db.doses.create_index([("medication_id", 1), ("taken_at", -1)])
    return _db
