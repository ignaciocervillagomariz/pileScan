import pytest

from pilescan_inference.classifiers.brickognize import BrickognizeClassifier
from pilescan_inference.classifiers.stub import StubClassifier
from pilescan_inference.config import Settings
from pilescan_inference.registry import build_components


async def test_defaults_build_the_documented_pipeline(tmp_path):
    detector, classifier, colors = build_components(Settings(cache_dir=tmp_path))
    assert isinstance(classifier, BrickognizeClassifier)
    assert (detector.name, classifier.name, colors.name) == (
        "opencv-lab-v2",
        "brickognize-v1",
        "kmeans-lab-ciede2000-v1",
    )
    await classifier.aclose()


def test_part_classifier_is_selected_by_config():
    _, classifier, _ = build_components(Settings(part_classifier="stub"))
    assert isinstance(classifier, StubClassifier)


def test_unknown_component_names_fail_fast():
    with pytest.raises(ValueError, match="PART_CLASSIFIER"):
        build_components(Settings(part_classifier="nope"))


def test_settings_read_environment(monkeypatch):
    monkeypatch.setenv("PART_CLASSIFIER", "stub")
    monkeypatch.setenv("BRICKOGNIZE_MAX_CONCURRENCY", "5")
    settings = Settings()
    assert settings.part_classifier == "stub"
    assert settings.brickognize_max_concurrency == 5
