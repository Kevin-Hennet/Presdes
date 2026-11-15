from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from app.models.schemas import ReferenceResults
from app.services.openfda import ReferenceUnavailable, lookup_drug

router = APIRouter(prefix="/api/labels", tags=["label reference"])


@router.get("", response_model=ReferenceResults)
async def label_reference(name: Annotated[str, Query(min_length=2, max_length=80)]) -> ReferenceResults:
    name = " ".join(name.split())
    if len(name) < 2 or not all(ch.isalnum() or ch in " .-'/()+" for ch in name):
        raise HTTPException(422, "Enter a brand or generic medication name.")
    try:
        return ReferenceResults(matches=await lookup_drug(name))
    except ReferenceUnavailable as exc:
        raise HTTPException(502, "The FDA label service is unavailable. Try again later.") from exc
