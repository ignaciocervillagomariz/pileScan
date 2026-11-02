import pytest

from pilescan_inference.schemas import BBox
from tests.synthetic import Piece, make_scene

RED = (201, 26, 9)
BLUE = (0, 85, 191)
YELLOW = (242, 205, 55)
GREEN = (35, 120, 65)
WHITE = (244, 244, 244)
BLACK = (5, 19, 29)


@pytest.fixture
def three_pieces() -> list[Piece]:
    return [
        Piece(80, 90, 200, 110, RED),
        Piece(380, 120, 150, 150, BLUE),
        Piece(150, 330, 110, 110, YELLOW, shape="disc"),
    ]


@pytest.fixture
def scene(three_pieces):
    return make_scene((640, 520), three_pieces)


def bbox(x: int = 0, y: int = 0, w: int = 10, h: int = 10) -> BBox:
    return BBox(x=x, y=y, width=w, height=h)
