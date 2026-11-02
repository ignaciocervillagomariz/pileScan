import cv2
import numpy as np
import pytest

from pilescan_inference.colors.kmeans_lab import KMeansLabColorEstimator
from pilescan_inference.colors.palette import load_palette

estimator = KMeansLabColorEstimator()


def solid(rgb, size=(80, 100)):
    crop = np.empty((*size, 3), np.uint8)
    crop[:] = rgb[::-1]
    return crop, np.ones(size, bool)


def test_palette_excludes_transparent_and_pseudo_colors():
    palette = load_palette()
    assert -1 not in palette.ids and 9999 not in palette.ids
    assert "Trans-Clear" not in palette.names
    assert len(palette.ids) > 40


@pytest.mark.parametrize(
    ("rgb", "color_id", "name"),
    [
        ((0xC9, 0x1A, 0x09), 4, "Red"),
        ((0x05, 0x13, 0x1D), 0, "Black"),
        ((0x00, 0x55, 0xBF), 1, "Blue"),
        ((0xF2, 0xCD, 0x37), 14, "Yellow"),
        ((0xFF, 0xFF, 0xFF), 15, "White"),
        ((0x23, 0x78, 0x41), 2, "Green"),
    ],
)
def test_pure_palette_colors_map_to_themselves(rgb, color_id, name):
    result = estimator.estimate(*solid(rgb))
    top = result.candidates[0]
    assert (top.rebrickable_color_id, top.name) == (color_id, name)
    assert top.delta_e < 1.5
    assert abs(result.measured_rgb.r - rgb[0]) <= 2


def test_candidates_are_sorted_normalized_and_at_most_three():
    candidates = estimator.estimate(*solid((200, 40, 40))).candidates
    assert 1 <= len(candidates) <= 3
    assert [c.score for c in candidates] == sorted((c.score for c in candidates), reverse=True)
    assert sum(c.score for c in candidates) == pytest.approx(1.0, abs=0.01)
    assert candidates[0].delta_e <= candidates[-1].delta_e


def test_ignores_pixels_outside_the_mask():
    crop, mask = solid((0x00, 0x55, 0xBF))
    crop[:, :30] = (255, 255, 255)  # white background strip, outside the mask
    mask[:, :30] = False
    assert estimator.estimate(crop, mask).candidates[0].name == "Blue"


def test_specular_highlights_do_not_change_the_color():
    crop, mask = solid((0xC9, 0x1A, 0x09), size=(120, 120))
    cv2.circle(crop, (40, 40), 18, (250, 250, 250), -1)
    cv2.circle(crop, (85, 80), 10, (240, 240, 240), -1)
    assert estimator.estimate(crop, mask).candidates[0].name == "Red"


def test_white_piece_is_not_mistaken_for_a_highlight():
    result = estimator.estimate(*solid((0xF4, 0xF4, 0xF4)))
    assert "White" in result.candidates[0].name or "Light Bluish Gray" in result.candidates[0].name


def test_eroded_edge_blending_is_ignored():
    crop, mask = solid((0xC9, 0x1A, 0x09), size=(100, 100))
    crop[:3, :] = (180, 180, 180)
    crop[-3:, :] = (180, 180, 180)
    assert estimator.estimate(crop, mask).candidates[0].name == "Red"


def test_tiny_or_empty_mask_still_returns_a_candidate():
    crop, _ = solid((0x00, 0x55, 0xBF), size=(6, 6))
    result = estimator.estimate(crop, np.zeros((6, 6), bool))
    assert result.candidates
