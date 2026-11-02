"""End-to-end check of the committed synthetic photos through the full (stubbed) pipeline."""

import json
from pathlib import Path

import pytest

from tests.test_api import make_client, post

FIXTURES = Path(__file__).parent / "fixtures"
MANIFEST = json.loads((FIXTURES / "manifest.json").read_text())


@pytest.mark.parametrize("name", sorted(MANIFEST))
def test_fixture_piece_count_and_colors(name):
    expected = MANIFEST[name]
    with make_client() as client:
        body = post(client, (FIXTURES / name).read_bytes()).json()

    assert len(body["detections"]) == expected["piece_count"], name
    found = sorted(d["color_candidates"][0]["rebrickable_color_id"] for d in body["detections"])
    assert found == sorted(c["id"] for c in expected["colors"]), name
    width = expected.get("displayed_width", expected["width"])
    height = expected.get("displayed_height", expected["height"])
    assert body["image"] == {"width": width, "height": height}
