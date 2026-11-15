import asyncio
import json
from datetime import datetime, timezone
from uuid import UUID

from pymongo import ASCENDING, DESCENDING, AsyncMongoClient, IndexModel, ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.config import settings
from app.models.saved_scans import SavedScan, SavedScanPage, SavedScanSummary, SaveScan
from app.models.schemas import ScanResult

COLLECTION = "presdes_private_saved_scans_v1"
ORDER = [("saved_at", DESCENDING), ("scan_id", DESCENDING)]


class SavedScanStore:
    def __init__(self) -> None:
        self.client = AsyncMongoClient(
            settings.mongodb_uri.get_secret_value(),
            tz_aware=True,
            timeoutMS=5000,
            serverSelectionTimeoutMS=3000,
            connectTimeoutMS=3000,
            appname="PresDes",
        )
        self.collection = self.client[settings.mongodb_database][COLLECTION]
        self._indexes_ready = False
        self._index_lock = asyncio.Lock()

    async def close(self) -> None:
        await self.client.close()

    async def ensure_indexes(self) -> None:
        async with self._index_lock:
            if self._indexes_ready:
                return
            await self.collection.create_indexes([
                IndexModel([("owner", ASCENDING), ("scan_id", ASCENDING)], unique=True),
                IndexModel([("owner", ASCENDING), *ORDER]),
            ])
            self._indexes_ready = True

    @staticmethod
    def detail(record: dict) -> SavedScan:
        return SavedScan(
            result=ScanResult.model_validate_json(json.dumps(record["result"])),
            saved_at=record["saved_at"],
            example=record["example"],
        )

    async def save(self, owner: str, data: SaveScan) -> SavedScan:
        key = {"owner": owner, "scan_id": str(data.result.id)}
        document = {
            **key,
            "saved_at": datetime.now(timezone.utc),
            "example": data.example,
            "result": data.result.model_dump(mode="json"),
        }
        try:
            record = await self.collection.find_one_and_update(
                key, {"$setOnInsert": document}, upsert=True, return_document=ReturnDocument.AFTER,
            )
        except DuplicateKeyError:
            record = await self.collection.find_one(key)
            if record is None:
                raise
        return self.detail(record)

    async def get(self, owner: str, scan_id: UUID) -> SavedScan | None:
        record = await self.collection.find_one({"owner": owner, "scan_id": str(scan_id)})
        return self.detail(record) if record is not None else None

    async def delete(self, owner: str, scan_id: UUID) -> bool:
        deleted = await self.collection.delete_one({"owner": owner, "scan_id": str(scan_id)})
        return deleted.deleted_count == 1

    async def list(self, owner: str, limit: int, before: tuple[datetime, UUID] | None) -> SavedScanPage:
        query: dict = {"owner": owner}
        if before:
            saved_at, scan_id = before
            query["$or"] = [
                {"saved_at": {"$lt": saved_at}},
                {"saved_at": saved_at, "scan_id": {"$lt": str(scan_id)}},
            ]
        records = await self.collection.find(query, {
            "_id": 0, "scan_id": 1, "saved_at": 1, "example": 1,
            "result.medication.excerpts": 1, "result.source_language": 1,
        }).sort(ORDER).limit(limit + 1).to_list()
        items = [
            SavedScanSummary(
                id=record["scan_id"],
                name=" ".join(record["result"]["medication"]["excerpts"]) or "Medication label",
                source_language=record["result"]["source_language"],
                saved_at=record["saved_at"],
                example=record["example"],
            )
            for record in records[:limit]
        ]
        cursor = f"{items[-1].saved_at.isoformat()}|{items[-1].id}" if len(records) > limit else None
        return SavedScanPage(items=items, next_before=cursor)
