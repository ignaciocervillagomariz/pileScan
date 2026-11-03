"""Image decoding, cropping and debug rendering helpers (OpenCV/Pillow boundary)."""

import base64
import io

import cv2
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

from pilescan_inference.schemas import BBox

CROP_PADDING = 0.15
CROP_MAX_SIDE = 512
DEBUG_MAX_SIDE = 1280


try:  # HEIC/HEIF (iPhone) support is optional: without the wheel those uploads give a 400.
    from pillow_heif import register_heif_opener

    register_heif_opener()
except ImportError:  # pragma: no cover
    pass


class ImageDecodeError(ValueError):
    """The uploaded bytes are not a decodable image."""


def decode_image(data: bytes) -> np.ndarray:
    """Decode JPEG/PNG/WebP/AVIF/HEIC to RGB->BGR uint8 with the EXIF orientation applied."""
    try:
        with Image.open(io.BytesIO(data)) as img:
            img = ImageOps.exif_transpose(img)
            rgb = np.asarray(_flatten_alpha(img))
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise ImageDecodeError("the uploaded file is not a decodable image") from exc
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)


ALPHA_BACKGROUND = (255, 255, 255)


def _flatten_alpha(img: Image.Image) -> Image.Image:
    """RGB image; transparent pixels are composited onto white (ALPHA_BACKGROUND).

    White matches the frontend's client-side flatten, and a plain light surface is the
    capture-screen recommendation. Naive conversion would turn transparency into black.
    """
    if img.mode in ("RGBA", "LA", "PA") or "transparency" in img.info:
        rgba = img.convert("RGBA")
        base = Image.new("RGBA", rgba.size, (*ALPHA_BACKGROUND, 255))
        return Image.alpha_composite(base, rgba).convert("RGB")
    return img.convert("RGB")


def padded_crop_bounds(bbox: BBox, image_w: int, image_h: int) -> tuple[int, int, int, int]:
    """Return (x0, y0, x1, y1) of the bbox grown by CROP_PADDING and clamped to the image."""
    pad_x = round(bbox.width * CROP_PADDING)
    pad_y = round(bbox.height * CROP_PADDING)
    return (
        max(0, bbox.x - pad_x),
        max(0, bbox.y - pad_y),
        min(image_w, bbox.x + bbox.width + pad_x),
        min(image_h, bbox.y + bbox.height + pad_y),
    )


def encode_crop(image_bgr: np.ndarray, bbox: BBox) -> bytes:
    """JPEG-encode the padded crop, capped to CROP_MAX_SIDE so uploads and cache keys stay small."""
    height, width = image_bgr.shape[:2]
    x0, y0, x1, y1 = padded_crop_bounds(bbox, width, height)
    crop = image_bgr[y0:y1, x0:x1]
    longest = max(crop.shape[:2])
    if longest > CROP_MAX_SIDE:
        scale = CROP_MAX_SIDE / longest
        crop = cv2.resize(crop, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", crop, [cv2.IMWRITE_JPEG_QUALITY, 90])
    if not ok:
        raise ImageDecodeError("could not encode crop")
    return buf.tobytes()


def render_debug_image(image_bgr: np.ndarray, boxes: list[BBox]) -> str:
    """Base64 JPEG of the image with numbered boxes, downscaled to DEBUG_MAX_SIDE."""
    canvas = image_bgr.copy()
    thickness = max(2, round(max(canvas.shape[:2]) / 500))
    font_scale = thickness / 2
    for index, box in enumerate(boxes):
        top_left = (box.x, box.y)
        cv2.rectangle(
            canvas, top_left, (box.x + box.width, box.y + box.height), (0, 200, 0), thickness
        )
        cv2.putText(
            canvas,
            str(index),
            (box.x, max(box.y - thickness * 2, 12)),
            cv2.FONT_HERSHEY_SIMPLEX,
            font_scale,
            (0, 0, 255),
            thickness,
            cv2.LINE_AA,
        )
    longest = max(canvas.shape[:2])
    if longest > DEBUG_MAX_SIDE:
        scale = DEBUG_MAX_SIDE / longest
        canvas = cv2.resize(canvas, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", canvas, [cv2.IMWRITE_JPEG_QUALITY, 80])
    if not ok:
        raise ImageDecodeError("could not encode debug image")
    return base64.b64encode(buf.tobytes()).decode("ascii")
