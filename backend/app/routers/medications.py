from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone
from bson import ObjectId
from app.db import get_db
from app.models.schemas import MedicationCreate, DoseLog, InteractionRequest
from app.services.openfda import lookup_drug

router = APIRouter(prefix="/api", tags=["medminder"])

def db_or_503():
    db = get_db()
    if db is None: raise HTTPException(503, "Medication storage requires MONGODB_URI in backend/.env")
    return db

@router.get("/medications")
def list_meds():
    db = db_or_503(); items = list(db.medications.find().sort("created_at", -1))
    for x in items: x["id"] = str(x.pop("_id"))
    return {"items": items}

@router.post("/medications")
def add_med(data: MedicationCreate):
    db = db_or_503(); item = data.model_dump(); item["created_at"] = datetime.now(timezone.utc).isoformat()
    item["_id"] = db.medications.insert_one(item).inserted_id
    item["id"] = str(item.pop("_id")); return item

@router.delete("/medications/{medication_id}")
def delete_med(medication_id: str):
    db = db_or_503()
    if not ObjectId.is_valid(medication_id): raise HTTPException(400, "Invalid medication id")
    db.medications.delete_one({"_id": ObjectId(medication_id)}); db.doses.delete_many({"medication_id": medication_id})
    return {"deleted": True}

@router.post("/doses")
def log_dose(data: DoseLog):
    db = db_or_503()
    if not ObjectId.is_valid(data.medication_id): raise HTTPException(400, "Invalid medication id")
    if not db.medications.find_one({"_id": ObjectId(data.medication_id)}): raise HTTPException(404, "Medication not found")
    item = data.model_dump(); item["taken_at"] = item["taken_at"] or datetime.now(timezone.utc).isoformat(); item["created_at"] = datetime.now(timezone.utc).isoformat()
    db.doses.insert_one(item); return {"logged": True, **item}

@router.get("/adherence")
def adherence():
    db = db_or_503(); doses = list(db.doses.find().sort("taken_at", -1).limit(500))
    for x in doses: x["id"] = str(x.pop("_id"))
    total = len(doses); taken = sum(1 for x in doses if x["status"] == "taken")
    return {"items": doses, "taken": taken, "total": total, "rate": round(taken / total * 100) if total else 0}

@router.post("/interactions")
def interactions(data: InteractionRequest):
    # This deliberately returns sourced label records, not an AI-generated interaction verdict.
    return {"results": [{"medication": name, **lookup_drug(name)} for name in data.medications], "disclaimer": "This is not a drug-interaction checker. No combination safety conclusion is made. Ask a pharmacist or prescriber."}
