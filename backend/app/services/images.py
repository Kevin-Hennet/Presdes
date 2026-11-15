import warnings
from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener

register_heif_opener(thumbnails=False, depth_images=False, aux_images=False)

MAX_UPLOAD_BYTES = 12 * 1024 * 1024
MAX_PIXELS = 50_000_000
MAX_IMAGE_EDGE = 4096
FORMATS = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP", "image/gif": "GIF", "image/heic": "HEIF", "image/heif": "HEIF"}


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
                    raise InvalidImage("The photo exceeds 50 megapixels. Use a smaller photo.")
                # HEIF containers may include extra images; the plugin opens the primary still.
                if image.format != "HEIF" and getattr(image, "n_frames", 1) != 1:
                    raise InvalidImage("Animated images are not supported. Save the frame showing the complete label as a still image and upload that instead.")
                image.verify()
            with Image.open(BytesIO(raw)) as image:
                # Resize before transposing so the orientation copy is limited to the output dimensions.
                image.thumbnail((MAX_IMAGE_EDGE, MAX_IMAGE_EDGE))
                ImageOps.exif_transpose(image, in_place=True)
                if "A" in image.getbands() or "transparency" in image.info:
                    rgba = image if image.mode == "RGBA" else image.convert("RGBA")
                    jpeg = Image.new("RGB", rgba.size, "white")
                    jpeg.paste(rgba, mask=rgba.getchannel("A"))
                else:
                    jpeg = image if image.mode == "RGB" else image.convert("RGB")
                # Pillow can carry JPEG comments forward even without explicit save options.
                jpeg.info.clear()
                output = BytesIO()
                jpeg.save(output, "JPEG", quality=94)
                return output.getvalue()
    except (Image.DecompressionBombWarning, Image.DecompressionBombError) as exc:
        raise InvalidImage("The photo exceeds 50 megapixels. Use a smaller photo.") from exc
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, EOFError, RuntimeError) as exc:
        if isinstance(exc, InvalidImage):
            raise
        raise InvalidImage("This photo could not be opened. Choose another JPG, PNG, WebP, still GIF, HEIC, or HEIF.") from exc
