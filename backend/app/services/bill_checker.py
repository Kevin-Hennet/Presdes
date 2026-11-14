import re
from decimal import Decimal, InvalidOperation

def check_bill(text: str):
    """Conservative arithmetic checks: flags possible inconsistencies for review."""
    lines = [x.strip() for x in (text or "").splitlines() if x.strip()]
    amounts = []
    for line in lines:
        found = re.findall(r"(?:\$\s?)(\d{1,7}(?:,\d{3})*(?:\.\d{2})?)", line)
        for amount in found:
            try: amounts.append((line, Decimal(amount.replace(",", ""))))
            except InvalidOperation: pass
    seen, duplicates = {}, []
    for line, amount in amounts:
        key = re.sub(r"\s+", " ", re.sub(r"\$\s?[\d,]+(?:\.\d{2})?", "<amount>", line.lower()))
        if key in seen and amount == seen[key][1]: duplicates.append({"line": line, "possible_duplicate_of": seen[key][0], "amount": str(amount)})
        else: seen[key] = (line, amount)
    total_lines = [(line, amount) for line, amount in amounts if re.search(r"\b(total|amount due|balance due)\b", line, re.I)]
    subtotal_lines = [(line, amount) for line, amount in amounts if re.search(r"\b(subtotal)\b", line, re.I)]
    return {"possible_duplicates": duplicates, "totals_found": [{"line": l, "amount": str(a)} for l,a in total_lines], "subtotals_found": [{"line": l, "amount": str(a)} for l,a in subtotal_lines], "note": "Automated arithmetic screening only. Similar line items and totals are not proof of a billing error."}
