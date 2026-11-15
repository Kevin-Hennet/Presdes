import warnings
from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_UPLOAD_BYTES = 12 * 1024 * 1024
MAX_PIXELS = 24_000_000
MAX_IMAGE_EDGE = 4096
FORMATS = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}


class InvalidImage(ValueError):
    pass


def prepare_image(raw: bytes, mime_type: str) -> bytes:
    """Validate and orient one image, then omit its metadata from the provider payload."""
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(raw), formats=list(FORMATS.values())) as image:
                if image.format != FORMATS[mime_type]:
                    raise InvalidImage("The file contents do not match its image type.")
                if image.width * image.height > MAX_PIXELS:
                    raise InvalidImage("The photo exceeds 24 megapixels. Use a smaller photo.")
                if getattr(image, "n_frames", 1) != 1:
                    raise InvalidImage("Upload a single still photo.")
                image.verify()
            with Image.open(BytesIO(raw)) as image:
                oriented = ImageOps.exif_transpose(image)
                oriented.thumbnail((MAX_IMAGE_EDGE, MAX_IMAGE_EDGE))
                rgba = oriented.convert("RGBA")
                jpeg = Image.new("RGB", rgba.size, "white")
                jpeg.paste(rgba, mask=rgba.getchannel("A"))
                output = BytesIO()
                jpeg.save(output, "JPEG", quality=94)
                return output.getvalue()
    except (Image.DecompressionBombWarning, Image.DecompressionBombError) as exc:
        raise InvalidImage("The photo exceeds 24 megapixels. Use a smaller photo.") from exc
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError) as exc:
        if isinstance(exc, InvalidImage):
            raise
        raise InvalidImage("This photo could not be opened. Choose another JPG, PNG, or WebP.") from exc
