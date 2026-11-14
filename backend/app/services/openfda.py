import requests

BASE = "https://api.fda.gov/drug/label.json"
def lookup_drug(name: str):
    if not name.strip(): return {"matches": [], "source": "openFDA"}
    term = name.strip().replace('"', '')
    try:
        response = requests.get(BASE, params={"search": f'openfda.brand_name:"{term}" OR openfda.generic_name:"{term}"', "limit": 3}, timeout=8)
        if response.status_code != 200:
            return {"matches": [], "source": "openFDA", "notice": "No matching label record was returned."}
        results = []
        for item in response.json().get("results", []):
            fda = item.get("openfda", {})
            results.append({"brand_name": fda.get("brand_name", []), "generic_name": fda.get("generic_name", []), "warnings": item.get("warnings", [])[:1], "drug_interactions": item.get("drug_interactions", [])[:1], "source_url": "https://open.fda.gov/apis/drug/label/"})
        return {"matches": results, "source": "openFDA", "notice": "Label database information is not a personalized interaction check. Ask a pharmacist about combinations."}
    except requests.RequestException:
        return {"matches": [], "source": "openFDA", "notice": "The FDA label service is temporarily unavailable."}
