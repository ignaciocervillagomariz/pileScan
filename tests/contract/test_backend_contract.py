"""Live backend responses validated against docs/api/openapi.yaml."""
import uuid

import pytest

from helpers import assert_problem, call


@pytest.fixture(scope="module")
def scan(openapi, backend_url, fixtures_dir, services_up):
    with open(fixtures_dir / "pile-small.jpg", "rb") as f:
        r = call(openapi, "POST", f"{backend_url}/api/scans", 201, files={"image": ("pile.jpg", f, "image/jpeg")})
    assert r.headers["Location"].endswith(r.json()["id"])
    return r.json()


def test_health(backend_url, services_up) -> None:
    import requests

    assert requests.get(f"{backend_url}/actuator/health", timeout=10).json()["status"] == "UP"


def test_create_scan_response_matches_spec(scan) -> None:
    assert scan["status"] in {"COMPLETED", "FAILED"}
    assert scan["summary"]["totalPieces"] == len(scan["detections"])
    grouped = sum(g["count"] for g in scan["summary"]["groups"])
    assert grouped <= scan["summary"]["totalPieces"]
    assert scan["summary"]["unidentifiedPieces"] <= scan["summary"]["totalPieces"]


def test_get_scan_and_list_detections(openapi, backend_url, scan) -> None:
    got = call(openapi, "GET", f"{backend_url}/api/scans/{scan['id']}", 200).json()
    assert got["id"] == scan["id"]
    listed = call(openapi, "GET", f"{backend_url}/api/scans/{scan['id']}/detections", 200).json()
    assert {d["id"] for d in listed} == {d["id"] for d in got["detections"]}


def test_scan_image_served_with_matching_dimensions(openapi, backend_url, scan) -> None:
    import io

    from PIL import Image

    r = call(openapi, "GET", f"{backend_url}/api/scans/{scan['id']}/image", 200)
    assert Image.open(io.BytesIO(r.content)).size == (scan["image"]["width"], scan["image"]["height"])


def test_bboxes_inside_image(scan) -> None:
    w, h = scan["image"]["width"], scan["image"]["height"]
    for d in scan["detections"]:
        b = d["bbox"]
        if b:
            assert b["x"] + b["width"] <= w + 1 and b["y"] + b["height"] <= h + 1


def test_exif_rotation_applied(openapi, backend_url, fixtures_dir, services_up) -> None:
    with open(fixtures_dir / "pile-exif-rotated.jpg", "rb") as f:
        s = call(openapi, "POST", f"{backend_url}/api/scans", 201, files={"image": ("r.jpg", f, "image/jpeg")}).json()
    assert s["image"]["height"] > s["image"]["width"], "EXIF orientation 6 must yield a portrait stored image"


@pytest.mark.parametrize("name,mime", [("pile-small.webp", "image/webp"), ("pile-medium.png", "image/png")])
def test_other_image_formats_accepted(openapi, backend_url, fixtures_dir, services_up, name, mime) -> None:
    with open(fixtures_dir / name, "rb") as f:
        call(openapi, "POST", f"{backend_url}/api/scans", 201, files={"image": (name, f, mime)})


def test_update_part_color_and_validation(openapi, backend_url, scan) -> None:
    sid = scan["id"]
    det = call(openapi, "POST", f"{backend_url}/api/scans/{sid}/detections", 201, json={"partNum": "3001", "colorId": 4}).json()
    assert det["source"] == "MANUAL" and det["part"]["partNum"] == "3001" and det["color"]["id"] == 4
    upd = call(openapi, "PATCH", f"{backend_url}/api/scans/{sid}/detections/{det['id']}", 200, json={"colorId": 1}).json()
    assert upd["corrected"] is True and upd["color"]["id"] == 1 and upd["part"]["partNum"] == "3001"
    assert_problem(call(openapi, "PATCH", f"{backend_url}/api/scans/{sid}/detections/{det['id']}", 422, json={"partNum": "NOPE-XYZ"}), 422)
    assert_problem(call(openapi, "PATCH", f"{backend_url}/api/scans/{sid}/detections/{det['id']}", 400, valid_request=False, json={}), 400)
    assert_problem(call(openapi, "POST", f"{backend_url}/api/scans/{sid}/detections", 422, json={"partNum": "3001", "colorId": 999999}), 422)


def test_delete_is_soft_and_excluded(openapi, backend_url, scan) -> None:
    sid = scan["id"]
    det = call(openapi, "POST", f"{backend_url}/api/scans/{sid}/detections", 201, json={"partNum": "3001", "colorId": 4}).json()
    before = call(openapi, "GET", f"{backend_url}/api/scans/{sid}", 200).json()["summary"]["totalPieces"]
    call(openapi, "DELETE", f"{backend_url}/api/scans/{sid}/detections/{det['id']}", 204)
    after = call(openapi, "GET", f"{backend_url}/api/scans/{sid}", 200).json()
    assert after["summary"]["totalPieces"] == before - 1
    assert det["id"] not in {d["id"] for d in after["detections"]}
    assert_problem(call(openapi, "DELETE", f"{backend_url}/api/scans/{sid}/detections/{det['id']}", 404), 404)


def test_not_found_problem_details(openapi, backend_url, services_up) -> None:
    missing = uuid.uuid4()
    for path in (f"/api/scans/{missing}", f"/api/scans/{missing}/image", f"/api/scans/{missing}/detections", f"/api/scans/{missing}/set-candidates"):
        assert_problem(call(openapi, "GET", backend_url + path, 404), 404)


def test_bad_scan_id_is_400(backend_url, services_up) -> None:
    import requests

    r = requests.get(f"{backend_url}/api/scans/not-a-uuid", timeout=10)
    assert r.status_code == 400 and r.headers["content-type"].startswith("application/problem+json")


def test_unsupported_upload_is_400(openapi, backend_url, fixtures_dir, services_up) -> None:
    for name, mime in [("not-an-image.txt", "text/plain"), ("fake.jpg", "image/jpeg")]:
        with open(fixtures_dir / name, "rb") as f:
            assert_problem(call(openapi, "POST", f"{backend_url}/api/scans", 400, files={"image": (name, f, mime)}), 400)


def test_missing_image_part_is_400(backend_url, services_up) -> None:
    import requests

    assert requests.post(f"{backend_url}/api/scans", timeout=10, files={"other": ("x", b"1")}).status_code == 400


def test_oversize_upload_is_413(openapi, backend_url, fixtures_dir, services_up) -> None:
    with open(fixtures_dir / "oversize.png", "rb") as f:
        assert_problem(call(openapi, "POST", f"{backend_url}/api/scans", 413, files={"image": ("big.png", f, "image/png")}), 413)


def test_parts_search_exact_match_first(openapi, backend_url, catalog_ready) -> None:
    parts = call(openapi, "GET", f"{backend_url}/api/parts", 200, params={"q": "3001"}).json()
    assert parts and parts[0]["partNum"] == "3001"
    assert call(openapi, "GET", f"{backend_url}/api/parts/3001", 200).json()["name"]
    assert_problem(call(openapi, "GET", f"{backend_url}/api/parts/does-not-exist-123", 404), 404)
    assert_problem(call(openapi, "GET", f"{backend_url}/api/parts", 400, valid_request=False, params={"q": ""}), 400)


def test_colors(openapi, backend_url, catalog_ready) -> None:
    colors = call(openapi, "GET", f"{backend_url}/api/colors", 200).json()
    assert any(c["id"] == 4 and c["name"] == "Red" for c in colors)
    assert [c["name"] for c in colors] == sorted(c["name"] for c in colors)


def test_catalog_import_status_and_unmapped(openapi, backend_url, catalog_ready) -> None:
    assert call(openapi, "GET", f"{backend_url}/api/admin/catalog-import", 200).json()["state"] == "SUCCEEDED"
    call(openapi, "GET", f"{backend_url}/api/admin/unmapped-part-ids", 200)


def test_set_candidates_ranking(openapi, backend_url, catalog_ready, scan) -> None:
    sid = scan["id"]
    for part, color in [("3001", 4), ("3001", 4), ("3003", 1)]:
        call(openapi, "POST", f"{backend_url}/api/scans/{sid}/detections", 201, json={"partNum": part, "colorId": color})
    res = call(openapi, "GET", f"{backend_url}/api/scans/{sid}/set-candidates", 200, params={"limit": 5}).json()
    cands = res["candidates"]
    assert 0 < len(cands) <= 5
    assert [c["rank"] for c in cands] == list(range(1, len(cands) + 1))
    scores = [c["matchPercent"] for c in cands]
    assert scores == sorted(scores, reverse=True)
    for c in cands:
        assert 0 <= c["matchedPieces"] <= res["pilePieces"]
        assert c["pileCoverage"] == pytest.approx(c["matchedPieces"] / res["pilePieces"], abs=0.01)
        assert len(c["missingParts"]) <= 50
    assert len(call(openapi, "GET", f"{backend_url}/api/scans/{sid}/set-candidates", 200, params={"limit": 1, "missingLimit": 0}).json()["candidates"]) == 1
    assert_problem(call(openapi, "GET", f"{backend_url}/api/scans/{sid}/set-candidates", 501, params={"strategy": "rarity-weighted"}), 501)


def test_ranking_reflects_corrections(openapi, backend_url, catalog_ready, services_up, fixtures_dir) -> None:
    """Deleting a detection must change pilePieces on the next ranking call."""
    with open(fixtures_dir / "blank.jpg", "rb") as f:
        sid = call(openapi, "POST", f"{backend_url}/api/scans", 201, files={"image": ("b.jpg", f, "image/jpeg")}).json()["id"]
    d = call(openapi, "POST", f"{backend_url}/api/scans/{sid}/detections", 201, json={"partNum": "3001", "colorId": 4}).json()
    assert call(openapi, "GET", f"{backend_url}/api/scans/{sid}/set-candidates", 200).json()["pilePieces"] == 1
    call(openapi, "DELETE", f"{backend_url}/api/scans/{sid}/detections/{d['id']}", 204)
    assert call(openapi, "GET", f"{backend_url}/api/scans/{sid}/set-candidates", 200).json()["pilePieces"] == 0
