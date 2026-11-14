from PIL import Image
from io import BytesIO
import pytesseract
from pytesseract import Output

def word_boxes(image_bytes: bytes):
    """Optional local OCR coordinates. Returns [] when Tesseract is not installed."""
    try:
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
        data = pytesseract.image_to_data(image, output_type=Output.DICT)
        words = []
        for i, word in enumerate(data["text"]):
            word = word.strip()
            if word and int(data["conf"][i]) > 25:
                words.append({"text": word, "x": data["left"][i], "y": data["top"][i], "width": data["width"][i], "height": data["height"][i], "confidence": int(data["conf"][i])})
        return words
    except Exception:
        return []
