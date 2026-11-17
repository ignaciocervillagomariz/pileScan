"""Strict checks for contract 1.1.0: public API (openapi.yaml) and inference service."""
import io
import os

import pytest
import requests
from PIL import Image

from helpers import assert_problem, call

CLS = {"ok", "no_match", "error", "skipped"}
API_CLS = {"OK", "NO_MATCH", "ERROR", "SKIPPED"}


@pytest.fixture(scope="module")
def scan(openapi, backend_url, fixtures_dir, services_up):
    with open(fixtures_dir / "pile-small.jpg", "rb") as f:
        return call(openapi, "POST", f"{backend_url}/api/scans", 201, files={"image": ("pile.jpg", f, "image/jpeg")}).json()


def _same_framing(overlay, image) -> None:
    """The overlay may be downscaled (v2 draws at the 1280 px working size) but must keep the aspect ratio."""
    assert overlay[0] <= image[0] and overlay[1] <= image[1] or overlay == image
    assert abs(overlay[0] / overlay[1] - image[0] / image[1]) < 0.01, f"{overlay} vs {image}"


# ---------------------------------------------------------------- public API 1.1.0

def test_scan_has_1_1_fields(scan) -> None:
    assert "debugImageUrl" in scan and "inferenceTimingsMs" in scan
    t = scan["inferenceTimingsMs"]
    if scan["status"] == "COMPLETED":
        assert t and {"detect", "classify", "color", "total"} <= set(t)
        assert all(isinstance(v, (int, float)) and v >= 0 for v in t.values())


def test_detections_have_classification_status(scan) -> None:
    for d in scan["detections"]:
        assert "classificationStatus" in d
        if d["source"] == "MANUAL":
            assert d["classificationStatus"] is None
        else:
            assert d["classificationStatus"] in API_CLS
            if d["classificationStatus"] == "OK":
                assert d["partCandidates"], "OK implies at least one candidate"


def test_debug_image_endpoint(openapi, backend_url, scan) -> None:
    url = scan["debugImageUrl"]
    if scan["status"] == "COMPLETED":
        assert url == f"/api/scans/{scan['id']}/debug-image"
    if url is None:
        pytest.skip("no debug image for this scan")
    r = call(openapi, "GET", backend_url + url, 200)
    assert r.headers["content-type"].startswith("image/jpeg")
    img = Image.open(io.BytesIO(r.content))
    _same_framing(img.size, (scan["image"]["width"], scan["image"]["height"]))


def test_debug_image_404_for_unknown_scan(openapi, backend_url, services_up) -> None:
    import uuid

    assert_problem(call(openapi, "GET", f"{backend_url}/api/scans/{uuid.uuid4()}/debug-image", 404), 404)


def test_blank_photo_is_zero_detections_not_failure(openapi, backend_url, fixtures_dir, services_up) -> None:
    with open(fixtures_dir / "blank.jpg", "rb") as f:
        s = call(openapi, "POST", f"{backend_url}/api/scans", 201, files={"image": ("b.jpg", f, "image/jpeg")}).json()
    assert s["status"] == "COMPLETED" and s["detections"] == []
    if s["debugImageUrl"]:
        call(openapi, "GET", backend_url + s["debugImageUrl"], 200)


# ---------------------------------------------------------------- 403 regression (via nginx)

def _hosts():
    hosts = ["http://localhost:4200", "http://127.0.0.1:4200"]
    extra = os.environ.get("EXTRA_HOSTS", "")  # e.g. http://192.0.2.20:4200 (needs BIND_ADDRESS=0.0.0.0)
    return hosts + [h for h in extra.split(",") if h]


@pytest.mark.parametrize("host", _hosts())
@pytest.mark.parametrize("origin", ["same", "none"])
def test_post_scan_not_403_on_every_host(host, origin, fixtures_dir, services_up) -> None:
    headers = {} if origin == "none" else {"Origin": host}
    try:
        requests.get(host + "/", timeout=5)
    except requests.RequestException:
        pytest.skip(f"{host} unreachable")
    with open(fixtures_dir / "pile-small.jpg", "rb") as f:
        r = requests.post(f"{host}/api/scans", files={"image": ("p.jpg", f, "image/jpeg")}, headers=headers, timeout=180)
    assert r.status_code == 201, f"{host} origin={origin}: {r.status_code} {r.text[:200]}"


# ---------------------------------------------------------------- inference 1.1.0

def _recognize(inference_url, name, data, mime, params=None):
    return requests.post(f"{inference_url}/v1/recognize", params=params, files={"image": (name, data, mime)}, timeout=180)


@pytest.fixture(scope="module")
def inf_body(inference_url, fixtures_dir, inference_up):
    return _recognize(inference_url, "p.jpg", (fixtures_dir / "pile-small.jpg").read_bytes(), "image/jpeg", {"debug": "true"}).json()


def test_inference_version_and_timings(inf_body) -> None:
    assert inf_body["contract_version"] == "1.1.0"
    t = inf_body["timings_ms"]
    assert isinstance(t["preprocess"], (int, float)) and t["preprocess"] >= 0
    assert t["total"] >= t["detect"]


def test_inference_classification_status(inf_body) -> None:
    for d in inf_body["detections"]:
        assert d["classification_status"] in CLS
        if d["classification_status"] == "ok":
            assert d["part_candidates"]
        if d["classification_status"] in ("no_match", "error", "skipped"):
            assert d["part_candidates"] == [], "non-ok status keeps the detection with no part candidates"
        if d["classification_status"] == "error":
            assert d["classification_error"]
        else:
            assert d["classification_error"] is None


def test_inference_debug_image_is_jpeg_of_input_size(inf_body) -> None:
    import base64

    img = Image.open(io.BytesIO(base64.b64decode(inf_body["debug_image"])))
    assert img.format == "JPEG"
    _same_framing(img.size, (inf_body["image"]["width"], inf_body["image"]["height"]))


def test_inference_accepts_avif(inference_url, fixtures_dir, inference_up) -> None:
    buf = io.BytesIO()
    Image.open(fixtures_dir / "pile-small.jpg").save(buf, "AVIF")
    r = _recognize(inference_url, "p.avif", buf.getvalue(), "image/avif")
    assert r.status_code == 200, r.text[:300]
    assert r.json()["contract_version"] == "1.1.0"
