import base64
import json
from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator

from pilescan_inference.classifiers.stub import StubClassifier
from pilescan_inference.colors.kmeans_lab import KMeansLabColorEstimator
from pilescan_inference.config import Settings
from pilescan_inference.detectors.opencv_lab import OpenCvLabDetector
from pilescan_inference.domain import ClassifierError, Crop
from pilescan_inference.main import create_app
from pilescan_inference.pipeline import Pipeline
from tests.synthetic import encode

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "docs/api/inference-response.schema.json"
needs_schema = pytest.mark.skipif(not SCHEMA_PATH.exists(), reason="run from the monorepo")


class FlakyClassifier(StubClassifier):
    """Fails for every other crop, like a partially unavailable upstream."""

    name = "flaky-test"

    def __init__(self) -> None:
        self.calls = 0

    async def classify(self, crop: Crop):
        self.calls += 1
        if self.calls % 2 == 0:
            raise ClassifierError("upstream down")
        return await super().classify(crop)


def make_client(classifier=None, settings=None):
    pipeline = Pipeline(
        OpenCvLabDetector(), classifier or StubClassifier(), KMeansLabColorEstimator()
    )
    return TestClient(create_app(settings or Settings(), pipeline))


def post(client, data, **params):
    return client.post("/v1/recognize", params=params, files={"image": ("scan.jpg", data)})


def test_health_reports_pipeline():
    with make_client() as client:
        body = client.get("/health").json()
    assert body == {
        "status": "ok",
        "pipeline": {
            "detector": "opencv-lab-v1",
            "part_classifier": "stub-v1",
            "color_estimator": "kmeans-lab-ciede2000-v1",
        },
    }


@needs_schema
def test_recognize_response_validates_against_json_schema(scene):
    schema = json.loads(SCHEMA_PATH.read_text())
    with make_client() as client:
        response = post(client, encode(scene), debug="true")
    assert response.status_code == 200
    body = response.json()
    Draft202012Validator(schema).validate(body)
    assert len(body["detections"]) == 3
    assert [d["index"] for d in body["detections"]] == [0, 1, 2]
    assert body["image"] == {"width": 640, "height": 520}
    assert body["detections"][0]["color_candidates"][0]["name"] == "Red"
    jpeg = base64.b64decode(body["debug_image"])
    assert cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR).shape[:2] == (520, 640)


def test_debug_image_is_null_by_default(scene):
    with make_client() as client:
        assert post(client, encode(scene)).json()["debug_image"] is None


def test_classifier_failures_become_empty_candidates_and_a_warning(scene):
    with make_client(FlakyClassifier()) as client:
        body = post(client, encode(scene)).json()
    assert [bool(d["part_candidates"]) for d in body["detections"]] == [True, False, True]
    assert body["warnings"] == ["part classifier unavailable for 1 of 3 crops"]
    assert all(d["color_candidates"] for d in body["detections"])


def test_max_detections_truncates_with_warning(scene):
    with make_client() as client:
        body = post(client, encode(scene), max_detections=2).json()
    assert len(body["detections"]) == 2
    assert any("truncated" in w for w in body["warnings"])


def test_empty_table_returns_no_detections_and_a_warning():
    from tests.synthetic import make_scene

    with make_client() as client:
        body = post(client, encode(make_scene((320, 240), []))).json()
    assert body["detections"] == []
    assert "no pieces detected" in body["warnings"]


def test_exif_orientation_is_applied_before_detection(tmp_path, scene):
    from PIL import Image

    path = tmp_path / "rotated.jpg"
    exif = Image.Exif()
    exif[0x0112] = 6  # stored sideways, displayed rotated 90 degrees clockwise
    Image.fromarray(cv2.cvtColor(scene, cv2.COLOR_BGR2RGB)).save(path, exif=exif)
    with make_client() as client:
        body = post(client, path.read_bytes()).json()
    assert body["image"] == {"width": 520, "height": 640}


@pytest.mark.parametrize(
    ("kwargs", "status"),
    [
        ({"files": {"image": ("x.jpg", b"not an image")}}, 400),
        ({"files": {}}, 400),
        ({"files": {"image": ("x.jpg", b"x")}, "params": {"max_detections": 0}}, 422),
        ({"files": {"image": ("x.jpg", b"x")}, "params": {"debug": "maybe"}}, 422),
    ],
)
def test_error_responses_are_problem_details(kwargs, status):
    with make_client() as client:
        if not kwargs["files"]:
            kwargs = {**kwargs, "data": {"unrelated": "1"}}
        response = client.post("/v1/recognize", **kwargs)
    assert response.status_code == status
    assert response.headers["content-type"].startswith("application/problem+json")
    assert {"type", "title", "status", "detail"} <= response.json().keys()


def test_oversized_image_is_rejected_with_413(scene):
    with make_client(settings=Settings(max_image_bytes=1000)) as client:
        assert post(client, encode(scene)).status_code == 413


def test_detector_failure_is_503(scene):
    class Broken:
        name = "broken"

        def detect(self, image):
            raise RuntimeError("boom")

    pipeline = Pipeline(Broken(), StubClassifier(), KMeansLabColorEstimator())
    with TestClient(create_app(Settings(), pipeline)) as client:
        assert post(client, encode(scene)).status_code == 503
