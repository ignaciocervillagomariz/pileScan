"""Component interfaces and the small value types they exchange.

Detector, PartClassifier and ColorEstimator are the swap points of the vision pipeline
(docs/decisions/0003). A new implementation only has to satisfy the matching Protocol and be
registered in `registry.py`.
"""

from dataclasses import dataclass
from typing import Protocol

import numpy as np

from pilescan_inference.schemas import RGB, BBox, ColorCandidate, PartCandidate


class DetectorError(Exception):
    """The detector could not process the image."""


class ClassifierError(Exception):
    """The part classifier could not produce a result for one crop."""


@dataclass(frozen=True, slots=True)
class RawDetection:
    """One piece region in original-image pixels.

    `mask` is a boolean array of shape (bbox.height, bbox.width), True on piece pixels.
    """

    bbox: BBox
    score: float
    mask: np.ndarray


@dataclass(frozen=True, slots=True)
class DetectionReport:
    """Detector output plus a user-visible warning list and numbers for logs/debug."""

    detections: list[RawDetection]
    warnings: list[str]
    stats: dict[str, float | int | str]


@dataclass(frozen=True, slots=True)
class Crop:
    """JPEG-encoded padded crop of one detection, as sent to the part classifier."""

    jpeg: bytes
    bbox: BBox


@dataclass(frozen=True, slots=True)
class ColorResult:
    measured_rgb: RGB
    candidates: list[ColorCandidate]


class Detector(Protocol):
    name: str

    def detect(self, image_bgr: np.ndarray) -> list[RawDetection]:
        """Find piece regions in an orientation-corrected BGR image."""
        ...


class PartClassifier(Protocol):
    name: str

    async def classify(self, crop: Crop) -> list[PartCandidate]:
        """Return up to 3 candidates, best first. Raise ClassifierError on failure."""
        ...

    async def aclose(self) -> None: ...


class ColorEstimator(Protocol):
    name: str

    def estimate(self, crop_bgr: np.ndarray, mask: np.ndarray) -> ColorResult:
        """Estimate the piece color from the crop pixels selected by `mask`."""
        ...
