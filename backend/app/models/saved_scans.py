from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, model_validator

from app.models.schemas import ScanResult, SourceLanguage, StrictModel


class SaveScan(StrictModel):
    result: ScanResult
    example: bool = False

    @model_validator(mode="after")
    def check_saveable(self) -> "SaveScan":
        if self.example:
            raise ValueError("Fictional examples cannot be saved")
        if self.result.readability not in {"readable", "partial"}:
            raise ValueError("Only readable or partially readable scans can be saved")
        if self.result.created_at.utcoffset() is None:
            raise ValueError("Scan timestamp needs a time zone")
        return self


class SavedScan(BaseModel):
    result: ScanResult
    saved_at: datetime
    example: bool
    saved_medication: bool = False


class SavedScanSummary(BaseModel):
    id: UUID
    name: str
    source_language: SourceLanguage
    saved_at: datetime
    example: bool
    saved_medication: bool = False


class SavedScanPage(BaseModel):
    items: list[SavedScanSummary]
    next_before: str | None = None
