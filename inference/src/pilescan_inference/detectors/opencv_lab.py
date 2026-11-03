"""Classical, training-free detector for pieces on a plain or textured surface (`opencv-lab-v2`).

Pipeline (all parameters in `params.DetectorParams`, see inference/README.md):
normalize size -> CIELAB -> smooth background model fitted by normalized convolution on the
pixels that look like background (seeded from the image border; absorbs lighting gradients and
vignetting) -> distance to that model with lightness down-weighted and a chroma-based shadow
test -> adaptive threshold -> morphology -> external contours -> relative-area filter, with
distance-transform watershed for oversized blobs -> boxes and masks in original pixels.

Why v2: v1 used a fixed 8 dE threshold and a large closing kernel, so on textured or shadowed
backgrounds the foreground flooded and merged into one blob that the area filter then dropped
(docs/decisions/0009-detector-preprocessing.md).
"""

from __future__ import annotations

import cv2
import numpy as np

from pilescan_inference.detectors.params import DetectorParams
from pilescan_inference.domain import DetectionReport, DetectorError, RawDetection
from pilescan_inference.schemas import BBox

OOD_WARNING = "background not uniform: no pieces detected"
EMPTY_WARNING = "no pieces detected"
CONTRAST_REFERENCE = 40.0
BORDER_TOUCH_PENALTY = 0.8


class OpenCvLabDetector:
    name = "opencv-lab-v2"

    def __init__(self, params: DetectorParams | None = None) -> None:
        self.params = params or DetectorParams()

    def detect(self, image_bgr: np.ndarray) -> list[RawDetection]:
        return self.detect_report(image_bgr).detections

    def detect_report(
        self, image_bgr: np.ndarray, capture: dict[str, np.ndarray] | None = None
    ) -> DetectionReport:
        """Detect and also return warnings and statistics. `capture` receives debug images."""
        if image_bgr.ndim != 3 or image_bgr.shape[2] != 3 or image_bgr.size == 0:
            raise DetectorError("expected a non-empty 3-channel BGR image")
        try:
            return self._detect(image_bgr, capture)
        except cv2.error as exc:
            raise DetectorError(f"OpenCV failure: {exc}") from exc

    # ------------------------------------------------------------------ stages

    def _detect(self, image_bgr: np.ndarray, capture: dict | None) -> DetectionReport:
        p = self.params
        full_h, full_w = image_bgr.shape[:2]
        long_side = max(full_h, full_w)
        target = float(np.clip(long_side, p.min_long_side, p.long_side))
        scale = target / long_side
        if scale < 1.0:
            small = cv2.resize(image_bgr, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        elif scale > 1.0:
            small = cv2.resize(image_bgr, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        else:
            small = image_bgr
        work_h, work_w = small.shape[:2]
        side = max(work_h, work_w)
        small = cv2.GaussianBlur(small, (0, 0), max(1.0, side / 800))
        lab = cv2.cvtColor(small.astype(np.float32) / 255.0, cv2.COLOR_BGR2LAB)
        if p.clahe:
            lab = _clahe_lightness(lab)

        distance, noise = self._distance_map(lab)
        threshold = self._threshold(distance, noise)
        raw_mask = (distance > threshold).astype(np.uint8)
        mask = self._morphology(raw_mask, side)
        fg_fraction = float(mask.mean())

        stats: dict[str, float | int | str] = {
            "work_size": f"{work_w}x{work_h}",
            "scale": round(scale, 3),
            "noise": round(noise, 2),
            "threshold": round(threshold, 2),
            "fg_fraction": round(fg_fraction, 3),
        }
        if capture is not None:
            capture.update(
                small=small,
                distance=distance,
                raw_mask=raw_mask * 255,
                mask=mask * 255,
            )

        if fg_fraction > p.fg_max_fraction:
            stats["rule"] = "ood_fg_fraction"
            return DetectionReport([], [OOD_WARNING], stats)

        image_area = work_h * work_w
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        stats["contours"] = len(contours)
        detections: list[RawDetection] = []
        kept_areas: list[float] = []
        max_area = p.max_area_fraction * image_area
        min_area = p.min_area_fraction * image_area
        split = 0
        for contour in contours:
            area = cv2.contourArea(contour)
            if area < min_area:
                continue
            parts = [contour]
            if p.seed_split and area > 4 * min_area:
                seeds = _seed_split(contour, distance, threshold, min_area, p, side)
                if seeds:
                    split += 1
                    parts = seeds
            hull_area = cv2.contourArea(cv2.convexHull(contour))
            low_solidity = hull_area > 0 and area / hull_area < p.watershed_solidity
            if len(parts) == 1 and p.watershed and (area > max_area or low_solidity):
                parts = _watershed_split(contour, mask, p.watershed_peak_fraction) or parts
                split += len(parts) > 1
            for part in parts:
                part_area = cv2.contourArea(part)
                if not min_area <= part_area <= max_area:
                    continue
                detection = _build_detection(
                    part, part_area, distance, (work_w, work_h), (full_w, full_h), scale, p
                )
                if detection is not None:
                    detections.append(detection)
                    kept_areas.append(part_area / image_area)
        stats["blobs_split"] = split
        stats["kept_after_filters"] = len(detections)
        # Fragmentation indicator: a tiny median relative to the largest pieces suggests
        # over-segmentation (see ADR 0009).
        stats["median_area_fraction"] = (
            round(float(np.median(kept_areas)), 5) if kept_areas else 0.0
        )
        if capture is not None:
            capture["contours"] = np.array(len(contours))
        warnings = [] if detections else [EMPTY_WARNING]
        return DetectionReport(detections, warnings, stats)

    def _distance_map(self, lab: np.ndarray) -> tuple[np.ndarray, float]:
        """Distance of each pixel to a smooth background model, and the background noise level."""
        p = self.params
        h, w = lab.shape[:2]
        side = max(h, w)
        # Work on a coarse grid for the model: it is smooth by construction.
        coarse_scale = min(1.0, 160 / side)
        coarse = cv2.resize(
            lab, None, fx=coarse_scale, fy=coarse_scale, interpolation=cv2.INTER_AREA
        )
        ch, cw = coarse.shape[:2]
        ring = _border_ring(ch, cw, p.border_fraction)
        seed = np.median(coarse[ring], axis=0)
        sigma = max(1.0, p.bg_sigma_fraction * max(ch, cw))

        weights = ring.astype(np.float32)
        model = np.tile(seed, (ch, cw, 1)).astype(np.float32)
        # Pixels may join the background model only if they are within a few noise levels of it,
        # so low-contrast pieces (white on light gray) are not absorbed into the model.
        ring_dist, _ = _distance(coarse, model, p)
        ring_vals = ring_dist[ring]
        ring_noise = float(1.4826 * np.median(np.abs(ring_vals - np.median(ring_vals))))
        limit = float(
            np.clip(p.noise_k * max(ring_noise, np.median(ring_vals)), p.bg_limit_min, p.bg_limit)
        )
        for _ in range(p.bg_iterations):
            dist_c, _ = _distance(coarse, model, p)
            # Background = pixels close to the current model (first round: border ring only).
            weights = ((dist_c < limit) & (ring if _ == 0 else True)).astype(np.float32)
            if weights.sum() < 0.05 * weights.size:
                break
            num = cv2.GaussianBlur(coarse * weights[..., None], (0, 0), sigma)
            den = cv2.GaussianBlur(weights, (0, 0), sigma)[..., None]
            fitted = num / np.maximum(den, 1e-3)
            confident = den > 0.05
            # Where the local fit has no support, extend from the nearest supported areas with a
            # much wider kernel, so the model can grow inwards under vignetting.
            wide_num = cv2.GaussianBlur(coarse * weights[..., None], (0, 0), sigma * 5)
            wide_den = cv2.GaussianBlur(weights, (0, 0), sigma * 5)[..., None]
            wide = wide_num / np.maximum(wide_den, 1e-6)
            model = np.where(confident, fitted, wide).astype(np.float32)

        dist_c, _ = _distance(coarse, model, p)
        bg_pixels = dist_c[weights > 0]
        noise = (
            float(1.4826 * np.median(np.abs(bg_pixels - np.median(bg_pixels))))
            if bg_pixels.size
            else 0.0
        )
        noise = max(noise, float(np.median(bg_pixels)) if bg_pixels.size else 0.0)

        full_model = cv2.resize(model, (w, h), interpolation=cv2.INTER_LINEAR)
        distance, _ = _distance(lab, full_model, p)
        return distance, noise

    def _threshold(self, distance: np.ndarray, noise: float) -> float:
        p = self.params
        scaled = np.clip(distance * 4.0, 0, 255).astype(np.uint8)
        otsu, _ = cv2.threshold(scaled, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        floor = max(p.threshold_min, p.noise_k * noise)
        return float(np.clip(otsu / 4.0 * 0.5, floor, max(floor, p.threshold_max)))

    def _morphology(self, mask: np.ndarray, side: int) -> np.ndarray:
        p = self.params
        if p.open_fraction > 0:
            mask = cv2.morphologyEx(
                mask, cv2.MORPH_OPEN, _ellipse(max(3, round(side * p.open_fraction)))
            )
        if p.close_fraction > 0:
            mask = cv2.morphologyEx(
                mask, cv2.MORPH_CLOSE, _ellipse(max(3, round(side * p.close_fraction)))
            )
        return mask


# ---------------------------------------------------------------------- helpers


def _distance(lab: np.ndarray, model: np.ndarray, p: DetectorParams) -> tuple[np.ndarray, None]:
    """Weighted dE to `model`; darker-but-same-chroma pixels (shadows) lose their L component."""
    diff = lab - model
    d_l = diff[..., 0]
    chroma = np.hypot(diff[..., 1], diff[..., 2])
    weight = np.where(d_l < 0, p.l_weight_darker, p.l_weight_lighter)
    shadow = (d_l < 0) & (d_l > -p.shadow_l_max) & (chroma < p.shadow_chroma_max)
    d_l_eff = np.where(shadow, 0.0, d_l * weight)
    return np.sqrt(d_l_eff**2 + chroma**2), None


def _clahe_lightness(lab: np.ndarray) -> np.ndarray:
    lightness = np.clip(lab[..., 0] * 2.55, 0, 255).astype(np.uint8)
    equalized = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(lightness)
    out = lab.copy()
    out[..., 0] = equalized.astype(np.float32) / 2.55
    return out


def _ellipse(size: int) -> np.ndarray:
    size |= 1  # odd kernels keep the structuring element centered
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (size, size))


def _border_ring(height: int, width: int, fraction: float) -> np.ndarray:
    strip = max(2, round(min(height, width) * fraction))
    ring = np.ones((height, width), dtype=bool)
    ring[strip:-strip, strip:-strip] = False
    return ring


def _seed_split(
    contour: np.ndarray,
    distance: np.ndarray,
    threshold: float,
    min_area: float,
    p: DetectorParams,
    side: int,
) -> list[np.ndarray] | None:
    """Split a blob into pieces using high-contrast cores as markers (hysteresis idea).

    Shadows and contact zones between pieces have a lower distance to the background than the
    pieces themselves, so thresholding higher separates the pieces; the lower-threshold blob
    then provides the extent. None if fewer than two cores are found.
    """
    x, y, w, h = cv2.boundingRect(contour)
    pad = 2
    region = np.zeros((h + 2 * pad, w + 2 * pad), dtype=np.uint8)
    cv2.drawContours(region, [contour], -1, 255, cv2.FILLED, offset=(-x + pad, -y + pad))
    local = np.zeros(region.shape, dtype=np.float32)
    local[pad : pad + h, pad : pad + w] = distance[y : y + h, x : x + w]
    core = ((local > p.seed_factor * threshold) & (region > 0)).astype(np.uint8)
    erode = _ellipse(max(3, round(side * p.seed_erode_fraction)))
    core = cv2.erode(core, erode)
    count, markers = cv2.connectedComponents(core)
    if count <= 2:
        return None
    sizes = np.bincount(markers.ravel())[1:]
    keep = [i + 1 for i, a in enumerate(sizes) if a >= max(4.0, min_area * 0.05)]
    if len(keep) < 2:
        return None
    relabeled = np.zeros_like(markers, dtype=np.int32)
    for new, old in enumerate(keep, start=2):
        relabeled[markers == old] = new
    relabeled[(region > 0) & (relabeled == 0)] = 0
    relabeled[region == 0] = 1  # background label
    shade = np.clip(255 - local * 6, 0, 255).astype(np.uint8)
    ws = cv2.watershed(cv2.cvtColor(shade, cv2.COLOR_GRAY2BGR), relabeled)
    parts: list[np.ndarray] = []
    for label in range(2, len(keep) + 2):
        piece = ((ws == label) & (region > 0)).astype(np.uint8)
        found, _ = cv2.findContours(piece, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        parts.extend(c + np.array([[[x - pad, y - pad]]], dtype=c.dtype) for c in found)
    return parts if len(parts) >= 2 else None


def _watershed_split(
    contour: np.ndarray, mask: np.ndarray, peak_fraction: float
) -> list[np.ndarray] | None:
    """Split one blob with a distance-transform watershed. None if it does not split."""
    x, y, w, h = cv2.boundingRect(contour)
    pad = 2
    region = np.zeros((h + 2 * pad, w + 2 * pad), dtype=np.uint8)
    cv2.drawContours(region, [contour], -1, 255, cv2.FILLED, offset=(-x + pad, -y + pad))
    dist = cv2.distanceTransform(region, cv2.DIST_L2, 5)
    peaks = (dist > peak_fraction * dist.max()).astype(np.uint8)
    peaks = cv2.erode(peaks, None)
    count, markers = cv2.connectedComponents(peaks)
    if count <= 2:
        return None
    markers = markers.astype(np.int32) + 1
    markers[region == 0] = 0
    unknown = (region > 0) & (peaks == 0)
    markers[unknown] = 0
    ws = cv2.watershed(cv2.cvtColor(region, cv2.COLOR_GRAY2BGR), markers)
    parts = []
    for label in range(2, count + 1):
        piece = ((ws == label) & (region > 0)).astype(np.uint8)
        found, _ = cv2.findContours(piece, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        parts.extend(c + np.array([[[x - pad, y - pad]]], dtype=c.dtype) for c in found)
    return parts or None


def _build_detection(
    contour: np.ndarray,
    area: float,
    distance: np.ndarray,
    work_size: tuple[int, int],
    full_size: tuple[int, int],
    scale: float,
    p: DetectorParams,
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
    if solidity < p.min_solidity:
        return None
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
