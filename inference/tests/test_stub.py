import pytest

from pilescan_inference.classifiers.stub import StubClassifier
from pilescan_inference.domain import Crop
from tests.conftest import bbox


@pytest.mark.parametrize(
    ("w", "h", "first"),
    [(100, 100, "3003"), (150, 100, "3004"), (100, 150, "3004"), (200, 100, "3001")],
)
async def test_candidates_depend_on_aspect_ratio(w, h, first):
    result = await StubClassifier().classify(Crop(jpeg=b"", bbox=bbox(w=w, h=h)))
    assert result[0].part_id == first
    assert len(result) == 3
    assert all(c.id_system == "bricklink" for c in result)
    assert [c.score for c in result] == sorted((c.score for c in result), reverse=True)


async def test_is_deterministic():
    crop = Crop(jpeg=b"", bbox=bbox(w=120, h=70))
    stub = StubClassifier()
    assert await stub.classify(crop) == await stub.classify(crop)
