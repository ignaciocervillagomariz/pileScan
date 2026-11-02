"""Classical, training-free detector for pieces spread on a plain background (`opencv-lab-v1`).

Steps: downscale -> estimate the background as a plane fitted in CIELAB on the image border
-> per-pixel distance to that background -> threshold -> morphology -> external contours ->
relative-area filter -> boxes and masks mapped back to original pixels.
"""

import cv2
import numpy as np

from pilescan_inference.domain import DetectorError, RawDetection
from pilescan_inference.schemas import BBox

WORK_MAX_SIDE = 800
BORDER_FRACTION = 0.03
MIN_AREA_FRACTION = 0.0002
MAX_AREA_FRACTION = 0.25
# Lightness is down-weighted so soft shadows (mostly an L change) do not become pieces.
L_WEIGHT = 0.7
MIN_THRESHOLD = 10.0
MAX_THRESHOLD = 25.0
CONTRAST_REFERENCE = 40.0
BORDER_TOUCH_PENALTY = 0.8


class OpenCvLabDetector:
    name = "opencv-lab-v1"

    def detect(self, image_bgr: np.ndarray) -> list[RawDetection]:
        if image_bgr.ndim != 3 or image_bgr.shape[2] != 3 or image_bgr.size == 0:
            raise DetectorError("expected a non-empty 3-channel BGR image")
        try:
            return self._detect(image_bgr)
        except cv2.error as exc:
            raise DetectorError(f"OpenCV failure: {exc}") from exc

    def _detect(self, image_bgr: np.ndarray) -> list[RawDetection]:
        full_h, full_w = image_bgr.shape[:2]
        scale = min(1.0, WORK_MAX_SIDE / max(full_h, full_w))
        small = (
            cv2.resize(image_bgr, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
            if scale < 1.0
            else image_bgr
        )
        small = cv2.GaussianBlur(small, (0, 0), 1.2)
        lab = cv2.cvtColor(small.astype(np.float32) / 255.0, cv2.COLOR_BGR2LAB)
        distance = _distance_to_background(lab)

        threshold = _choose_threshold(distance)
        mask = (distance > threshold).astype(np.uint8)
        work_h, work_w = mask.shape
        side = max(work_h, work_w)
        open_k = _ellipse(max(3, round(side / 400)))
        close_k = _ellipse(max(3, round(side / 100)))
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, open_k)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, close_k)

        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        image_area = work_h * work_w
        detections: list[RawDetection] = []
        for contour in contours:
            area = cv2.contourArea(contour)
            if not MIN_AREA_FRACTION * image_area <= area <= MAX_AREA_FRACTION * image_area:
                continue
            detection = _build_detection(
                contour, area, distance, (work_w, work_h), (full_w, full_h), scale
            )
            if detection is not None:
                detections.append(detection)
        return detections


def _ellipse(size: int) -> np.ndarray:
    size |= 1  # odd kernels keep the structuring element centered
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (size, size))


def _border_mask(height: int, width: int) -> np.ndarray:
    strip = max(4, round(min(height, width) * BORDER_FRACTION))
    border = np.ones((height, width), dtype=bool)
    border[strip:-strip, strip:-strip] = False
    return border


def _distance_to_background(lab: np.ndarray) -> np.ndarray:
    """Weighted Lab distance to a per-channel plane fitted on the border pixels.

    A plane (not a constant) absorbs the lighting gradient typical of phone photos. Border
    pixels that belong to pieces are rejected as outliers over a few refit rounds.
    """
    height, width = lab.shape[:2]
    ys, xs = np.nonzero(_border_mask(height, width))
    design = np.column_stack([np.ones(xs.size), xs / width, ys / height]).astype(np.float32)
    samples = lab[ys, xs]
    keep = np.ones(xs.size, dtype=bool)
    coeffs = np.zeros((3, 3), dtype=np.float32)
    for _ in range(3):
        coeffs, *_ = np.linalg.lstsq(design[keep], samples[keep], rcond=None)
        residual = np.linalg.norm((samples - design @ coeffs) * [L_WEIGHT, 1, 1], axis=1)
        limit = max(4.0, 3.0 * 1.4826 * float(np.median(residual[keep])))
        new_keep = residual < limit
        if new_keep.sum() < 0.3 * xs.size or np.array_equal(new_keep, keep):
            break
        keep = new_keep

    gy, gx = np.mgrid[0:height, 0:width].astype(np.float32)
    background = coeffs[0] + gx[..., None] / width * coeffs[1] + gy[..., None] / height * coeffs[2]
    diff = lab - background
    diff[..., 0] *= L_WEIGHT
    return np.sqrt((diff**2).sum(axis=2))


def _choose_threshold(distance: np.ndarray) -> float:
    """Otsu on the distance map, clamped so a blank photo yields nothing and dim pieces survive."""
    scaled = np.clip(distance * 4.0, 0, 255).astype(np.uint8)
    otsu, _ = cv2.threshold(scaled, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return float(np.clip(otsu / 4.0 * 0.5, MIN_THRESHOLD, MAX_THRESHOLD))


def _build_detection(
    contour: np.ndarray,
    area: float,
    distance: np.ndarray,
    work_size: tuple[int, int],
    full_size: tuple[int, int],
    scale: float,
) -> RawDetection | None:
    work_w, work_h = work_size
    full_w, full_h = full_size
    x, y, w, h = cv2.boundingRect(contour)

    region = np.zeros((h, w), dtype=np.uint8)
    cv2.drawContours(region, [contour], -1, 255, thickness=cv2.FILLED, offset=(-x, -y))
    inside = region > 0
    contrast = float(
        np.clip(distance[y : y + h, x : x + w][inside].mean() / CONTRAST_REFERENCE, 0, 1)
    )
    hull_area = cv2.contourArea(cv2.convexHull(contour))
    solidity = float(np.clip(area / hull_area, 0, 1)) if hull_area > 0 else 0.0
    score = 0.6 * contrast + 0.4 * solidity
    if x <= 0 or y <= 0 or x + w >= work_w or y + h >= work_h:
        score *= BORDER_TOUCH_PENALTY

    x0 = int(np.floor(x / scale))
    y0 = int(np.floor(y / scale))
    x1 = min(full_w, int(np.ceil((x + w) / scale)))
    y1 = min(full_h, int(np.ceil((y + h) / scale)))
    if x1 <= x0 or y1 <= y0:
        return None
    full_mask = cv2.resize(region, (x1 - x0, y1 - y0), interpolation=cv2.INTER_NEAREST) > 0
    return RawDetection(
        bbox=BBox(x=x0, y=y0, width=x1 - x0, height=y1 - y0),
        score=round(float(np.clip(score, 0, 1)), 4),
        mask=full_mask,
    )
