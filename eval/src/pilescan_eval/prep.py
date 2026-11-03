"""Client-side preprocessing that mimics what the frontend does before POST /api/scans."""
from __future__ import annotations

import io
from pathlib import Path

from PIL import Image, ImageOps

LONG_SIDE = 2048
JPEG_QUALITY = 90


def load_oriented(path: Path) -> Image.Image:
    img = Image.open(path)
    img.load()
    img = ImageOps.exif_transpose(img)
    if img.mode in ("RGBA", "LA", "P"):
        rgba = img.convert("RGBA")
        bg = Image.new("RGB", rgba.size, (255, 255, 255))
        bg.paste(rgba, mask=rgba.split()[3])
        return bg
    return img.convert("RGB")


def prep_jpeg(path: Path) -> tuple[bytes, tuple[int, int], tuple[int, int]]:
    """Return (jpeg bytes, original oriented size, sent size)."""
    img = load_oriented(path)
    orig = img.size
    if max(orig) > LONG_SIDE:
        img.thumbnail((LONG_SIDE, LONG_SIDE), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=JPEG_QUALITY)
    return buf.getvalue(), orig, img.size
