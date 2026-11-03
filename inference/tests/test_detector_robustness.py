"""Regression tests for the real-photo failure modes of opencv-lab-v1 (ADR 0009)."""

import io

import cv2
import numpy as np
import pytest
from PIL import Image

from pilescan_inference.detectors.opencv_lab import OOD_WARNING, OpenCvLabDetector
from pilescan_inference.detectors.params import DetectorParams
from pilescan_inference.imaging import ImageDecodeError, decode_image
from tests.conftest import BLACK, BLUE, GREEN, RED, WHITE, YELLOW
from tests.synthetic import Piece, iou, make_scene

detector = OpenCvLabDetector()
PIECES = [
    Piece(80, 90, 200, 110, RED),
    Piece(380, 120, 150, 150, BLUE),
    Piece(150, 330, 110, 110, YELLOW, shape="disc"),
]


def wood(size, base=(150, 105, 70), amplitude=14.0, seed=3):
    """Brown surface with grain stripes and fine noise, as a BGR image."""
    width, height = size
    rng = np.random.default_rng(seed)
    rows = np.sin(np.arange(height) / 6.0) + 0.6 * np.sin(np.arange(height) / 2.3)
    grain = rows[:, None] * amplitude / 1.6 + rng.normal(0, amplitude / 4, (height, width))
    grain = cv2.GaussianBlur(grain.astype(np.float32), (0, 0), 1.5)
    img = np.empty((height, width, 3), np.float32)
    img[:] = base[::-1]
    return np.clip(img + grain[..., None], 0, 255).astype(np.uint8)


def paste(background, pieces):
    """Draw the pieces of a plain scene over a custom background."""
    plain = make_scene((background.shape[1], background.shape[0]), pieces, noise=0, shadows=False)
    mask = np.zeros(background.shape[:2], np.uint8)
    for piece in pieces:
        x, y, w, h = piece.box
        mask[y : y + h, x : x + w] = 255
        if piece.shape == "disc":
            mask[y : y + h, x : x + w] = 0
            cv2.ellipse(mask, (x + w // 2, y + h // 2), (w // 2, h // 2), 0, 0, 360, 255, -1)
    out = background.copy()
    out[mask > 0] = plain[mask > 0]
    return out


def matches(detections, pieces, min_iou=0.8):
    boxes = [(d.bbox.x, d.bbox.y, d.bbox.width, d.bbox.height) for d in detections]
    return sum(1 for p in pieces if boxes and max(iou(p.box, b) for b in boxes) >= min_iou)


def test_textured_wood_background_does_not_flood():
    # v1: the threshold was clamped to 8 dE, wood grain exceeded it and the whole table merged.
    image = paste(wood((640, 520)), PIECES)
    found = detector.detect(image)
    assert matches(found, PIECES) == 3
    assert len(found) <= 5


def test_strong_gradient_lighting():
    image = make_scene((640, 520), PIECES, gradient=55)
    assert matches(detector.detect(image), PIECES) == 3


def test_vignetting_is_absorbed_by_the_background_model():
    image = make_scene((640, 520), PIECES, noise=1.5).astype(np.float32)
    yy, xx = np.mgrid[0:520, 0:640]
    radius = np.hypot((xx - 320) / 320, (yy - 260) / 260)
    image = np.clip(image * (1.0 - 0.28 * radius**2)[..., None], 0, 255).astype(np.uint8)
    assert matches(detector.detect(image), PIECES) == 3


def test_long_soft_shadows_do_not_inflate_boxes_or_merge():
    # Shadow: darker, same chroma, wider than the default synthetic one.
    image = make_scene((640, 520), PIECES, shadows=False).astype(np.float32)
    for piece in PIECES:
        shade = np.zeros((520, 640), np.uint8)
        x, y, w, h = piece.box
        cv2.rectangle(shade, (x + 25, y + 30), (x + w + 25, y + h + 30), 255, -1)
        soft = cv2.GaussianBlur(shade, (0, 0), 14).astype(np.float32) / 255.0
        image *= (1 - 0.22 * soft)[..., None]
    found = detector.detect(np.clip(image, 0, 255).astype(np.uint8))
    assert matches(found, PIECES, min_iou=0.75) == 3
    assert len(found) == 3


@pytest.mark.parametrize("size", [(225, 170), (320, 240)])
def test_small_images_are_upscaled_and_boxes_stay_in_input_pixels(size):
    scale = size[0] / 640
    pieces = [
        Piece(
            int(p.x * scale), int(p.y * scale), int(p.w * scale), int(p.h * scale), p.rgb, p.shape
        )
        for p in PIECES
    ]
    image = make_scene(size, pieces, noise=1.0, studs=False)
    found = detector.detect(image)
    assert matches(found, pieces, min_iou=0.7) == 3
    assert all(d.bbox.x + d.bbox.width <= size[0] for d in found)
    assert all(d.mask.shape == (d.bbox.height, d.bbox.width) for d in found)


def test_touching_pieces_are_split_by_watershed():
    pieces = [Piece(100, 150, 120, 120, RED, "disc"), Piece(205, 150, 120, 120, BLUE, "disc")]
    image = make_scene((520, 400), pieces, studs=False)
    assert len(detector.detect(image)) == 2
    off = OpenCvLabDetector(DetectorParams(watershed=False))
    assert len(off.detect(image)) == 1


def test_uniform_dark_banner_like_image_is_handled_without_crash():
    banner = np.zeros((270, 1470, 3), np.uint8)
    report = detector.detect_report(banner)
    assert report.detections == []


def test_ood_guard_returns_warning_when_nearly_everything_is_foreground():
    # Left half is one surface, right half another; the border model fits only a thin border.
    image = np.full((400, 600, 3), (40, 120, 200), np.uint8)
    image[:, 300:] = (200, 60, 30)
    strict = OpenCvLabDetector(DetectorParams(fg_max_fraction=0.3))
    report = strict.detect_report(image)
    assert report.detections == []
    assert report.warnings == [OOD_WARNING]
    assert report.stats["rule"] == "ood_fg_fraction"


def test_wood_is_not_out_of_distribution():
    report = detector.detect_report(paste(wood((640, 520)), PIECES))
    assert "rule" not in report.stats
    assert OOD_WARNING not in report.warnings


@pytest.mark.xfail(
    reason="known limit: light-gray piece on light background is below the noise "
    "floor (dE ~4 < THRESHOLD_MIN=6)",
    strict=True,
)
def test_low_contrast_light_gray_piece_on_light_background():
    piece = Piece(200, 150, 160, 120, (232, 232, 228))
    image = make_scene((640, 480), [piece], background=(215, 215, 210), noise=1.0, studs=False)
    assert matches(detector.detect(image), [piece]) == 1


def test_white_piece_on_light_background_still_found():
    piece = Piece(200, 150, 160, 120, WHITE)
    image = make_scene((640, 480), [piece], background=(205, 205, 200), noise=1.0, studs=False)
    assert matches(detector.detect(image), [piece]) == 1


def test_dark_and_green_pieces_on_wood():
    pieces = [Piece(100, 100, 150, 100, BLACK), Piece(350, 250, 140, 140, GREEN)]
    assert matches(detector.detect(paste(wood((640, 520)), pieces)), pieces) == 2


def test_env_overrides_parameters(monkeypatch):
    monkeypatch.setenv("DETECTOR_LONG_SIDE", "900")
    monkeypatch.setenv("DETECTOR_WATERSHED", "false")
    params = DetectorParams()
    assert params.long_side == 900
    assert params.watershed is False


# ---- decoding of the formats seen in real photos


def _encoded(image_bgr, fmt, **kwargs):
    buffer = io.BytesIO()
    Image.fromarray(cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)).save(buffer, format=fmt, **kwargs)
    return buffer.getvalue()


@pytest.mark.parametrize(
    ("fmt", "kwargs"),
    [
        ("PNG", {}),
        ("JPEG", {}),
        ("WEBP", {"quality": 90}),
        ("AVIF", {"quality": 80}),
        ("HEIF", {"quality": 80}),
    ],
)
def test_decodes_every_supported_format(fmt, kwargs):
    image = make_scene((320, 240), [Piece(60, 60, 100, 80, RED)])
    decoded = decode_image(_encoded(image, fmt, **kwargs))
    assert decoded.shape == image.shape
    assert abs(float(decoded.mean()) - float(image.mean())) < 6


def test_garbage_bytes_are_rejected():
    with pytest.raises(ImageDecodeError):
        decode_image(b"not an image")


def test_transparent_png_is_composited_on_white_not_black():
    rgba = np.zeros((240, 320, 4), np.uint8)  # fully transparent, RGB = black
    rgba[80:160, 100:220] = (201, 26, 9, 255)
    buffer = io.BytesIO()
    Image.fromarray(rgba, "RGBA").save(buffer, format="PNG")
    decoded = decode_image(buffer.getvalue())
    assert tuple(decoded[5, 5]) == (255, 255, 255)
    found = detector.detect(decoded)
    assert len(found) == 1
    assert (
        iou(
            found[0].bbox.x
            and (found[0].bbox.x, found[0].bbox.y, found[0].bbox.width, found[0].bbox.height),
            (100, 80, 120, 80),
        )
        > 0.85
    )
