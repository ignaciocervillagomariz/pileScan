import numpy as np
import pytest

from pilescan_inference.detectors.opencv_lab import OpenCvLabDetector
from pilescan_inference.domain import DetectorError
from tests.conftest import BLACK, BLUE, GREEN, RED, WHITE, YELLOW
from tests.synthetic import Piece, iou, make_scene

detector = OpenCvLabDetector()


def boxes(detections):
    return [(d.bbox.x, d.bbox.y, d.bbox.width, d.bbox.height) for d in detections]


def assert_matches(detections, pieces, min_iou=0.85):
    assert len(detections) == len(pieces)
    for piece in pieces:
        best = max(iou(piece.box, b) for b in boxes(detections))
        assert best >= min_iou, f"no detection matches {piece} (best IoU {best:.2f})"


def test_finds_every_piece_on_light_background(scene, three_pieces):
    assert_matches(detector.detect(scene), three_pieces)


def test_finds_every_piece_on_dark_background(three_pieces):
    image = make_scene((640, 520), three_pieces, background=(35, 38, 40))
    assert_matches(detector.detect(image), three_pieces)


def test_handles_lighting_gradient(three_pieces):
    image = make_scene((640, 520), three_pieces, gradient=30)
    assert_matches(detector.detect(image), three_pieces)


def test_white_and_black_pieces_on_mid_gray():
    pieces = [Piece(100, 100, 140, 100, WHITE), Piece(350, 200, 140, 100, BLACK)]
    image = make_scene((640, 480), pieces, background=(140, 140, 140))
    assert_matches(detector.detect(image), pieces)


def test_bbox_is_in_original_pixels_for_large_images():
    pieces = [Piece(400, 600, 800, 500, GREEN), Piece(1800, 1200, 600, 600, RED, shape="disc")]
    image = make_scene((3000, 2000), pieces, noise=1.5)
    assert_matches(detector.detect(image), pieces)


def test_mask_shape_matches_bbox_and_covers_piece(scene):
    for detection in detector.detect(scene):
        assert detection.mask.shape == (detection.bbox.height, detection.bbox.width)
        assert detection.mask.mean() > 0.6


def test_piece_touching_image_edge_is_detected_with_lower_score():
    inner = Piece(250, 200, 140, 140, BLUE)
    edge = Piece(0, 200, 120, 140, BLUE)
    image = make_scene((640, 520), [inner, edge])
    by_x = sorted(detector.detect(image), key=lambda d: d.bbox.x)
    assert len(by_x) == 2
    assert by_x[0].bbox.x == 0
    assert by_x[0].score < by_x[1].score


def test_tiny_noise_specks_are_ignored(three_pieces):
    image = make_scene((640, 520), three_pieces, noise=3.0)
    rng = np.random.default_rng(1)
    for _ in range(40):
        x, y = rng.integers(10, 600), rng.integers(10, 480)
        image[y : y + 2, x : x + 2] = (40, 40, 40)
    assert len(detector.detect(image)) == len(three_pieces)


@pytest.mark.parametrize("background", [(215, 215, 210), (30, 30, 30)])
def test_empty_table_yields_no_detections(background):
    image = make_scene((640, 480), [], background=background, noise=3.0)
    assert detector.detect(image) == []


def test_scores_are_unit_interval(scene):
    assert all(0 <= d.score <= 1 for d in detector.detect(scene))


def test_many_small_pieces():
    pieces = [
        Piece(40 + col * 90, 40 + row * 90, 56, 56, color, shape="disc" if col % 2 else "rect")
        for row in range(4)
        for col, color in enumerate([RED, BLUE, YELLOW, GREEN, RED, BLUE])
    ]
    image = make_scene((600, 400), pieces, studs=False)
    assert len(detector.detect(image)) == len(pieces)


def test_rejects_non_bgr_input():
    with pytest.raises(DetectorError):
        detector.detect(np.zeros((10, 10), np.uint8))
