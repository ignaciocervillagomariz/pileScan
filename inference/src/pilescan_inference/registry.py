"""Maps env-config names to component factories.

Adding a component (e.g. a YOLO detector) means implementing the Protocol from `domain.py`
and adding one entry to the matching table below. No other module changes.
"""

from collections.abc import Callable

from pilescan_inference.classifiers.brickognize import BrickognizeClassifier
from pilescan_inference.classifiers.cache import DiskCache
from pilescan_inference.classifiers.stub import StubClassifier
from pilescan_inference.colors.kmeans_lab import KMeansLabColorEstimator
from pilescan_inference.config import Settings
from pilescan_inference.detectors.opencv_lab import OpenCvLabDetector
from pilescan_inference.domain import ColorEstimator, Detector, PartClassifier


def _brickognize(settings: Settings) -> PartClassifier:
    return BrickognizeClassifier(
        client=BrickognizeClassifier.build_client(
            settings.brickognize_url, settings.brickognize_timeout_s
        ),
        cache=DiskCache(settings.cache_dir, "brickognize-v1"),
        max_concurrency=settings.brickognize_max_concurrency,
        max_retries=settings.brickognize_max_retries,
    )


DETECTORS: dict[str, Callable[[Settings], Detector]] = {
    "opencv": lambda _settings: OpenCvLabDetector(),
}
PART_CLASSIFIERS: dict[str, Callable[[Settings], PartClassifier]] = {
    "brickognize": _brickognize,
    "stub": lambda _settings: StubClassifier(),
}
COLOR_ESTIMATORS: dict[str, Callable[[Settings], ColorEstimator]] = {
    "kmeans_lab": lambda _settings: KMeansLabColorEstimator(),
}


def _select[T](table: dict[str, Callable[[Settings], T]], key: str, kind: str, s: Settings) -> T:
    try:
        factory = table[key.lower()]
    except KeyError:
        raise ValueError(f"unknown {kind} '{key}', expected one of {sorted(table)}") from None
    return factory(s)


def build_components(settings: Settings) -> tuple[Detector, PartClassifier, ColorEstimator]:
    return (
        _select(DETECTORS, settings.detector, "DETECTOR", settings),
        _select(PART_CLASSIFIERS, settings.part_classifier, "PART_CLASSIFIER", settings),
        _select(COLOR_ESTIMATORS, settings.color_estimator, "COLOR_ESTIMATOR", settings),
    )
