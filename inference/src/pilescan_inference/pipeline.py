"""Orchestrates detect -> crop -> classify (concurrent) -> color into a RecognizeResponse."""

import asyncio
import logging
import time

import numpy as np

from pilescan_inference.domain import (
    ClassifierError,
    ColorEstimator,
    ColorResult,
    Crop,
    Detector,
    DetectorError,
    PartClassifier,
    RawDetection,
)
from pilescan_inference.imaging import decode_image, encode_crop, render_debug_image
from pilescan_inference.schemas import (
    CONTRACT_VERSION,
    Detection,
    ImageSize,
    PartCandidate,
    PipelineInfo,
    RecognizeResponse,
    Timings,
)

logger = logging.getLogger(__name__)


class Pipeline:
    def __init__(
        self, detector: Detector, classifier: PartClassifier, colors: ColorEstimator
    ) -> None:
        self.detector = detector
        self.classifier = classifier
        self.colors = colors

    @property
    def info(self) -> PipelineInfo:
        return PipelineInfo(
            detector=self.detector.name,
            part_classifier=self.classifier.name,
            color_estimator=self.colors.name,
        )

    async def aclose(self) -> None:
        await self.classifier.aclose()

    async def recognize(
        self, data: bytes, *, debug: bool, max_detections: int
    ) -> RecognizeResponse:
        started = time.perf_counter()
        image = await asyncio.to_thread(decode_image, data)
        height, width = image.shape[:2]
        warnings: list[str] = []

        t0 = time.perf_counter()
        try:
            raw = await asyncio.to_thread(self.detector.detect, image)
        except DetectorError:
            raise
        except Exception as exc:  # a detector bug must surface as 503, not a crash
            raise DetectorError(f"detector failed: {exc}") from exc
        detect_ms = _ms(t0)

        if len(raw) > max_detections:
            raw = sorted(raw, key=lambda d: d.score * d.bbox.width * d.bbox.height, reverse=True)
            raw = raw[:max_detections]
            warnings.append(f"detections truncated to max_detections={max_detections}")
        raw.sort(key=lambda d: (d.bbox.y, d.bbox.x))
        if not raw:
            warnings.append("no pieces detected")

        crops = [Crop(jpeg=encode_crop(image, d.bbox), bbox=d.bbox) for d in raw]

        t0 = time.perf_counter()
        results = await asyncio.gather(
            *(self.classifier.classify(crop) for crop in crops), return_exceptions=True
        )
        classify_ms = _ms(t0)
        parts: list[list[PartCandidate]] = []
        failed = 0
        for result in results:
            if isinstance(result, BaseException):
                if not isinstance(result, ClassifierError):
                    logger.exception("unexpected classifier failure", exc_info=result)
                failed += 1
                parts.append([])
            else:
                parts.append(result[:3])
        if failed:
            warnings.append(f"part classifier unavailable for {failed} of {len(crops)} crops")

        t0 = time.perf_counter()
        colors = await asyncio.to_thread(self._estimate_colors, image, raw)
        color_ms = _ms(t0)

        detections = [
            Detection(
                index=i,
                bbox=d.bbox,
                detection_score=d.score,
                part_candidates=parts[i],
                color_candidates=colors[i].candidates,
                measured_rgb=colors[i].measured_rgb,
            )
            for i, d in enumerate(raw)
        ]
        debug_image = render_debug_image(image, [d.bbox for d in raw]) if debug else None
        return RecognizeResponse(
            contract_version=CONTRACT_VERSION,
            image=ImageSize(width=width, height=height),
            detections=detections,
            pipeline=self.info,
            timings_ms=Timings(
                detect=detect_ms, classify=classify_ms, color=color_ms, total=_ms(started)
            ),
            warnings=warnings,
            debug_image=debug_image,
        )

    def _estimate_colors(self, image: np.ndarray, raw: list[RawDetection]) -> list[ColorResult]:
        results = []
        for d in raw:
            b = d.bbox
            crop = image[b.y : b.y + b.height, b.x : b.x + b.width]
            results.append(self.colors.estimate(crop, d.mask))
        return results


def _ms(since: float) -> float:
    return round((time.perf_counter() - since) * 1000, 1)
