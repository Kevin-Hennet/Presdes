from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from datetime import datetime, timezone
from bson import ObjectId

from app.ai.gemini import analyze_image, AIUnavailable
from app.services.ocr import word_boxes
from app.services.bill_checker import check_bill
from app.db import get_db
from app.config import settings

router = APIRouter(prefix="/api/scans", tags=["scans"])


@router.post("")
async def create_scan(
    file: UploadFile = File(...),
    document_type: str = Form("auto"),
    reading_level: str = Form("simple"),
    language: str = Form("English")
):
    allowed = {"image/jpeg", "image/png", "image/webp"}

    if file.content_type not in allowed:
        raise HTTPException(415, "Upload a JPG, PNG, or WEBP image.")

    raw = await file.read()
    print("SCAN DEBUG: Image received, size:", len(raw))

    if len(raw) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(
            413,
            f"Image exceeds {settings.max_upload_mb} MB."
        )

    try:
        print("SCAN DEBUG: Starting Gemini analysis")

        result = analyze_image(
            raw,
            file.content_type,
            document_type,
            reading_level,
            language
        )

        print("SCAN DEBUG: Gemini analysis finished")

    except AIUnavailable as e:
        raise HTTPException(503, str(e))

    except Exception as e:
        print("SCAN DEBUG: Analysis error:", repr(e))
        raise HTTPException(
            502,
            f"Document analysis failed: {str(e)}"
        )

    result["word_boxes"] = word_boxes(raw)

    if result.get("document_type") == "bill":
        result["bill_checks"] = check_bill(
            result.get("extracted_text", "")
        )

    result["created_at"] = datetime.now(timezone.utc).isoformat()

    result["disclaimer"] = (
        "LabelLens explains visible text. "
        "It does not provide medical or legal advice. "
        "Confirm decisions with a qualified professional."
    )

    db = get_db()

    if db is not None:
        saved = {
            k: v for k, v in result.items()
            if k != "word_boxes"
        }

        inserted = db.scans.insert_one(saved)
        result["id"] = str(inserted.inserted_id)
    else:
        result["id"] = (
            "local-" +
            str(int(datetime.now().timestamp() * 1000))
        )

    return result


@router.get("")
def history(limit: int = 30):
    db = get_db()

    if db is None:
        return {
            "items": [],
            "storage": "MongoDB is not configured"
        }

    items = list(
        db.scans.find(
            {},
            {
                "_id": 1,
                "document_title": 1,
                "document_type": 1,
                "summary": 1,
                "created_at": 1
            }
        ).sort("created_at", -1).limit(min(limit, 100))
    )

    for item in items:
        item["id"] = str(item.pop("_id"))

    return {
        "items": items,
        "storage": "MongoDB Atlas"
    }


@router.delete("/{scan_id}")
def delete_scan(scan_id: str):
    db = get_db()

    if db is None:
        raise HTTPException(503, "MongoDB is not configured")

    if not ObjectId.is_valid(scan_id):
        raise HTTPException(400, "Invalid scan id")

    db.scans.delete_one({"_id": ObjectId(scan_id)})

    return {"deleted": True}
