"""Live inference responses validated against docs/api/inference-response.schema.json."""
import pytest
import requests


def recognize(inference_url: str, path, params=None, mime="image/jpeg") -> requests.Response:
    with open(path, "rb") as f:
        return requests.post(f"{inference_url}/v1/recognize", params=params, files={"image": (path.name, f, mime)}, timeout=180)


def test_health(inference_url, services_up) -> None:
    body = requests.get(f"{inference_url}/health", timeout=10).json()
    assert body["status"] == "ok" and set(body["pipeline"]) == {"detector", "part_classifier", "color_estimator"}


@pytest.mark.parametrize("name,mime", [("pile-small.jpg", "image/jpeg"), ("pile-medium.png", "image/png"), ("pile-small.webp", "image/webp"), ("blank.jpg", "image/jpeg")])
def test_response_matches_schema(inference_url, inference_validator, fixtures_dir, services_up, name, mime) -> None:
    r = recognize(inference_url, fixtures_dir / name, mime=mime)
    assert r.status_code == 200, r.text
    errors = sorted(inference_validator.iter_errors(r.json()), key=lambda e: list(e.path))
    assert not errors, "\n".join(f"{list(e.path)}: {e.message}" for e in errors)


def test_semantics(inference_url, fixtures_dir, services_up) -> None:
    body = recognize(inference_url, fixtures_dir / "pile-small.jpg").json()
    assert len(body["detections"]) >= 1, "synthetic pile of 6 bricks must yield at least one detection"
    w, h = body["image"]["width"], body["image"]["height"]
    assert [d["index"] for d in body["detections"]] == list(range(len(body["detections"])))
    for d in body["detections"]:
        b = d["bbox"]
        assert b["x"] >= 0 and b["y"] >= 0 and b["x"] + b["width"] <= w and b["y"] + b["height"] <= h
        for key in ("part_candidates", "color_candidates"):
            scores = [c["score"] for c in d[key]]
            assert scores == sorted(scores, reverse=True) and len(scores) <= 3
        assert d["color_candidates"], "at least one color candidate"


def test_blank_image_has_no_detections(inference_url, fixtures_dir, services_up) -> None:
    assert recognize(inference_url, fixtures_dir / "blank.jpg").json()["detections"] == []


def test_exif_orientation_applied(inference_url, fixtures_dir, services_up) -> None:
    body = recognize(inference_url, fixtures_dir / "pile-exif-rotated.jpg").json()
    assert body["image"]["height"] > body["image"]["width"]


def test_max_detections_truncates_with_warning(inference_url, inference_validator, fixtures_dir, services_up) -> None:
    body = recognize(inference_url, fixtures_dir / "pile-medium.png", params={"max_detections": 2}, mime="image/png").json()
    assert len(body["detections"]) <= 2
    assert body["warnings"], "truncation must add a warning"


def test_debug_image(inference_url, fixtures_dir, services_up) -> None:
    assert recognize(inference_url, fixtures_dir / "pile-small.jpg", params={"debug": "true"}).json()["debug_image"]
    assert recognize(inference_url, fixtures_dir / "pile-small.jpg").json()["debug_image"] is None


def test_error_codes(inference_url, fixtures_dir, services_up) -> None:
    assert recognize(inference_url, fixtures_dir / "fake.jpg").status_code == 400
    assert requests.post(f"{inference_url}/v1/recognize", timeout=10).status_code in (400, 422)
    assert recognize(inference_url, fixtures_dir / "pile-small.jpg", params={"max_detections": 0}).status_code == 422
    assert recognize(inference_url, fixtures_dir / "oversize.png", mime="image/png").status_code == 413
    assert recognize(inference_url, fixtures_dir / "fake.jpg").headers["content-type"].startswith("application/")


@pytest.mark.real_brickognize
def test_real_brickognize_smoke(inference_url, inference_validator, fixtures_dir, services_up) -> None:
    """Only meaningful when the stack runs with PART_CLASSIFIER=brickognize and internet access."""
    health = requests.get(f"{inference_url}/health", timeout=10).json()
    if "brickognize" not in health["pipeline"]["part_classifier"]:
        pytest.skip("stack runs the stub classifier")
    try:
        requests.get("https://api.brickognize.com", timeout=8)
    except requests.RequestException:
        pytest.skip("Brickognize unreachable")
    body = recognize(inference_url, fixtures_dir / "pile-small.jpg").json()
    assert not list(inference_validator.iter_errors(body))
