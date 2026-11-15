import asyncio
from urllib.parse import urlencode
from uuid import UUID

import httpx

from app.models.schemas import LabelMatch

LABEL_API = "https://api.fda.gov/drug/label.json"


class ReferenceUnavailable(Exception):
    pass


def first_text(values: object) -> str | None:
    if isinstance(values, list) and values and isinstance(values[0], str):
        return values[0].strip() or None
    return None


async def lookup_drug(name: str) -> list[LabelMatch]:
    # Quote characters are rejected by the route before inserting the term into the search query.
    search = f'openfda.brand_name.exact:"{name}" OR openfda.generic_name.exact:"{name}"'
    try:
        async with asyncio.timeout(8):
            async with httpx.AsyncClient() as client:
                response = await client.get(LABEL_API, params={"search": search, "limit": 5})
        if response.status_code == 404 and response.json().get("error", {}).get("code") == "NOT_FOUND":
            return []
        response.raise_for_status()
        results = response.json()["results"]
        if not isinstance(results, list):
            raise ValueError("Invalid reference results")
        matches = []
        for record in results:
            product = record.get("openfda", {})
            label = first_text(product.get("brand_name")) or first_text(product.get("generic_name")) or name
            # The version-specific record ID links directly to the returned record.
            record_id = str(UUID(record["id"]))
            matches.append(LabelMatch(
                name=label,
                manufacturer=first_text(product.get("manufacturer_name")),
                source_url=f"{LABEL_API}?{urlencode({'search': f'id:{record_id}', 'limit': 1})}",
            ))
        return matches
    except (TimeoutError, httpx.HTTPError, KeyError, ValueError, AttributeError, TypeError) as exc:
        raise ReferenceUnavailable from exc
