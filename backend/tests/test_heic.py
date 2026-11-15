import base64
from io import BytesIO

import pytest
from PIL import Image

from app.services import images
from test_api import anyio_backend, client, label, provider

pytestmark = pytest.mark.anyio


@pytest.fixture
def heic():
    # An unrelated first image catches accidentally selecting frame zero instead of primary.
    secondary = Image.new("RGB", (20, 20), "black")
    primary = Image.new("RGB", (80, 120), "white")
    primary.paste("red", (0, 0, 80, 40))
    primary.getexif()[274] = 6
    primary.getexif()[315] = "private camera metadata"
    output = BytesIO()
    secondary.save(output, "HEIF", save_all=True, append_images=[primary], primary_index=1, quality=100)
    return output.getvalue()


def check_preview(raw):
    with Image.open(BytesIO(raw)) as decoded:
        assert decoded.format == "JPEG"
        assert decoded.size == (120, 80)  # The primary image, rotated exactly once.
        assert decoded.getexif().get(315) is None
        assert not decoded.getexif()
        assert decoded.getpixel((100, 40))[0] > 240
        assert decoded.getpixel((100, 40))[1] < 30  # Red band moved to the right.
        assert min(decoded.getpixel((20, 40))) > 240


@pytest.mark.parametrize("mime", ["image/heic", "image/heif"])
async def test_preview_primary_orientation_metadata_and_no_ai(client, heic, provider, mime):
    response = await client.post("/api/scans/preview", content=heic, headers={"Content-Type": mime})
    assert response.status_code == 200, response.text[:100]
    assert response.headers["Cache-Control"] == "no-store"
    assert response.headers["Content-Type"] == "image/jpeg"
    check_preview(response.content)
    provider.assert_not_awaited()


@pytest.mark.parametrize("multipart", [False, True])
async def test_heic_analysis_uses_same_primary_as_preview(client, heic, provider, multipart):
    if multipart:
        response = await client.post("/api/scans", files=[("files", ("label.heic", heic, "image/heic"))] * 2)
    else:
        response = await client.post("/api/scans", content=heic, headers={"Content-Type": "image/heic"})
    assert response.status_code == 200, response.text
    content = provider.await_args.kwargs["input"][0]["content"]
    assert len(content) == (3 if multipart else 2)
    for image in content[1:]:
        check_preview(base64.b64decode(image["image_url"].split(",", 1)[1]))


async def test_heic_corrupt_mislabeled_and_oversized_rejected(client, heic, provider, monkeypatch):
    for path in ["/api/scans/preview", "/api/scans"]:
        corrupt = await client.post(path, content=b"invalid HEIC", headers={"Content-Type": "image/heic"})
        assert corrupt.status_code == 422
    png = BytesIO()
    Image.new("RGB", (20, 20)).save(png, "PNG")
    response = await client.post("/api/scans/preview", content=png.getvalue(), headers={"Content-Type": "image/heic"})
    assert response.status_code == 422
    assert "do not match" in response.json()["detail"]
    monkeypatch.setattr(images, "MAX_PIXELS", 100)
    assert (await client.post("/api/scans/preview", content=heic, headers={"Content-Type": "image/heic"})).status_code == 422
    provider.assert_not_awaited()


async def test_preview_stream_has_upload_limit(client, provider, monkeypatch):
    from app.routers import scan
    monkeypatch.setattr(scan, "MAX_UPLOAD_BYTES", 10)
    consumed = []
    async def chunks():
        for index in range(4):
            consumed.append(index)
            yield b"123456"
    response = await client.post("/api/scans/preview", content=chunks(), headers={"Content-Type": "image/heic"})
    assert response.status_code == 413
    assert consumed == [0, 1]
    provider.assert_not_awaited()
