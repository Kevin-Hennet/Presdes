"""Regenerate the non-patient photo used by the demo and photo upload tests."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

destination = Path(__file__).resolve().parents[2] / "frontend/public/fictional-label.png"
image = Image.new("RGB", (1100, 640), "#fffefd")
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((26, 26, 1074, 614), radius=25, outline="#102a43", width=4)
draw.rounded_rectangle((26, 26, 1074, 124), radius=23, fill="#eaf8f7")
draw.text((64, 57), "FICTIONAL LABEL · PRESDES DEMO", fill="#075f61", font=ImageFont.load_default(size=29))
draw.text((64, 163), "Pine Sample 5 mg", fill="#102a43", font=ImageFont.load_default(size=58))
draw.line((64, 264, 1036, 264), fill="#9eb2bc", width=3)
for offset, text in enumerate((
    "Training label only. Do not take this product.",
    "Keep this demonstration container out of reach of children.",
    "Discard after NOV 30 2027.",
)):
    draw.text((64, 313 + offset * 85), text, fill="#102a43", font=ImageFont.load_default(size=31))
image.save(destination, optimize=True)
