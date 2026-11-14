from pydantic import BaseModel, Field
from typing import Literal, Optional

class DoseLog(BaseModel):
    medication_id: str
    taken_at: Optional[str] = None
    status: Literal["taken", "skipped"] = "taken"

class MedicationCreate(BaseModel):
    name: str
    strength: str = ""
    instructions: str = ""
    times: list[str] = Field(default_factory=list)
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class InteractionRequest(BaseModel):
    medications: list[str]
