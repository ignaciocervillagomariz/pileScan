"""Offline deterministic classifier (`stub-v1`) for E2E tests and demos without network.

Candidates depend only on the crop's aspect ratio, so the same photo always yields the same
output. All IDs are BrickLink part numbers that also exist unchanged in Rebrickable.
"""

from pilescan_inference.domain import Crop
from pilescan_inference.schemas import PartCandidate

_PARTS = {
    "3001": "Brick 2 x 4",
    "3003": "Brick 2 x 2",
    "3004": "Brick 1 x 2",
    "3020": "Plate 2 x 4",
    "3023": "Plate 1 x 2",
}
_SCORES = (0.6, 0.25, 0.15)
# (max aspect ratio, ranked part ids); the first rule whose bound exceeds the aspect wins.
_RULES: tuple[tuple[float, tuple[str, ...]], ...] = (
    (1.25, ("3003", "3023", "3004")),
    (1.75, ("3004", "3023", "3003")),
    (float("inf"), ("3001", "3020", "3004")),
)


class StubClassifier:
    name = "stub-v1"

    async def classify(self, crop: Crop) -> list[PartCandidate]:
        long_side = max(crop.bbox.width, crop.bbox.height)
        aspect = long_side / min(crop.bbox.width, crop.bbox.height)
        part_ids = next(ids for bound, ids in _RULES if aspect < bound)
        return [
            PartCandidate(part_id=pid, id_system="bricklink", name=_PARTS[pid], score=score)
            for pid, score in zip(part_ids, _SCORES, strict=True)
        ]

    async def aclose(self) -> None:
        return None
