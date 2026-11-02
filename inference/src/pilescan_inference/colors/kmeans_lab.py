"""Dominant piece color via k-means in CIELAB, matched to Rebrickable with CIEDE2000."""

import cv2
import numpy as np

from pilescan_inference.colors.ciede2000 import ciede2000
from pilescan_inference.colors.palette import Palette, load_palette
from pilescan_inference.domain import ColorResult
from pilescan_inference.schemas import RGB, ColorCandidate

MAX_SIDE = 128
MAX_SAMPLES = 4000
MIN_PIXELS = 30
CLUSTERS = 3
TOP_K = 3
# Temperature of the softmax over -delta_e: ~4 delta E halves the weight of a runner-up.
SOFTMAX_TEMPERATURE = 4.0
# A pixel is a specular highlight if it is far brighter than the piece's median lightness
# and nearly colorless. The relative test keeps genuinely white pieces intact.
HIGHLIGHT_L_MARGIN = 20.0
HIGHLIGHT_MAX_CHROMA = 15.0


class KMeansLabColorEstimator:
    name = "kmeans-lab-ciede2000-v1"

    def __init__(self, palette: Palette | None = None) -> None:
        self._palette = palette or load_palette()

    def estimate(self, crop_bgr: np.ndarray, mask: np.ndarray) -> ColorResult:
        lab_pixels = self._piece_pixels(crop_bgr, mask)
        center = self._dominant_lab(lab_pixels)
        rgb = _lab_to_rgb(center)
        return ColorResult(measured_rgb=rgb, candidates=self._match(center))

    def _piece_pixels(self, crop_bgr: np.ndarray, mask: np.ndarray) -> np.ndarray:
        longest = max(mask.shape)
        if longest > MAX_SIDE:
            scale = MAX_SIDE / longest
            size = (max(1, round(mask.shape[1] * scale)), max(1, round(mask.shape[0] * scale)))
            crop_bgr = cv2.resize(crop_bgr, size, interpolation=cv2.INTER_AREA)
            mask = cv2.resize(mask.astype(np.uint8), size, interpolation=cv2.INTER_NEAREST) > 0

        # Erode so blended edge pixels (background mixed in) do not skew the clusters.
        eroded = cv2.erode(mask.astype(np.uint8), np.ones((3, 3), np.uint8), iterations=2) > 0
        selected = eroded if eroded.sum() >= MIN_PIXELS else mask
        lab = cv2.cvtColor(crop_bgr.astype(np.float32) / 255.0, cv2.COLOR_BGR2LAB)
        pixels = lab[selected]
        if pixels.shape[0] == 0:
            return lab.reshape(-1, 3)

        chroma = np.hypot(pixels[:, 1], pixels[:, 2])
        highlight = (pixels[:, 0] > np.median(pixels[:, 0]) + HIGHLIGHT_L_MARGIN) & (
            chroma < HIGHLIGHT_MAX_CHROMA
        )
        kept = pixels[~highlight]
        return kept if kept.shape[0] >= MIN_PIXELS else pixels

    @staticmethod
    def _dominant_lab(pixels: np.ndarray) -> np.ndarray:
        if pixels.shape[0] > MAX_SAMPLES:
            step = pixels.shape[0] / MAX_SAMPLES
            pixels = pixels[(np.arange(MAX_SAMPLES) * step).astype(int)]
        k = min(CLUSTERS, pixels.shape[0])
        if k < 2:
            return pixels.mean(axis=0).astype(np.float64)
        cv2.setRNGSeed(0)
        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 0.5)
        _, labels, centers = cv2.kmeans(
            np.ascontiguousarray(pixels, dtype=np.float32),
            k,
            None,
            criteria,
            3,
            cv2.KMEANS_PP_CENTERS,
        )
        counts = np.bincount(labels.ravel(), minlength=k)
        return centers[int(np.argmax(counts))].astype(np.float64)

    def _match(self, center_lab: np.ndarray) -> list[ColorCandidate]:
        delta = ciede2000(center_lab[None, :], self._palette.lab)
        order = np.argsort(delta)[:TOP_K]
        top = delta[order]
        weights = np.exp(-(top - top.min()) / SOFTMAX_TEMPERATURE)
        scores = weights / weights.sum()
        return [
            ColorCandidate(
                rebrickable_color_id=int(self._palette.ids[i]),
                name=self._palette.names[i],
                score=round(float(s), 4),
                delta_e=round(float(d), 2),
            )
            for i, d, s in zip(order, top, scores, strict=True)
        ]


def _lab_to_rgb(lab: np.ndarray) -> RGB:
    bgr = cv2.cvtColor(lab.reshape(1, 1, 3).astype(np.float32), cv2.COLOR_LAB2BGR)
    b, g, r = (round(float(np.clip(v, 0, 1)) * 255) for v in bgr.reshape(3))
    return RGB(r=r, g=g, b=b)
