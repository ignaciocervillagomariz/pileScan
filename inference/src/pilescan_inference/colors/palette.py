"""Rebrickable solid-color palette, loaded from the committed data file.

Regenerate with `uv run python scripts/refresh_palette.py`. Transparent colors and the
pseudo-colors -1 (Unknown) and 9999 (No Color) are excluded at generation time.
"""

import json
from dataclasses import dataclass
from functools import lru_cache
from importlib import resources

import cv2
import numpy as np


@dataclass(frozen=True, slots=True)
class Palette:
    ids: np.ndarray  # (n,) int
    names: tuple[str, ...]
    rgb: np.ndarray  # (n, 3) uint8
    lab: np.ndarray  # (n, 3) float64, CIELAB D65


def rgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    """Convert (n, 3) sRGB uint8 values to CIELAB (float64)."""
    pixels = np.asarray(rgb, dtype=np.float32).reshape(-1, 1, 3) / 255.0
    return cv2.cvtColor(pixels, cv2.COLOR_RGB2LAB).reshape(-1, 3).astype(np.float64)


@lru_cache(maxsize=1)
def load_palette() -> Palette:
    data_file = resources.files("pilescan_inference.colors") / "data" / "rebrickable_colors.json"
    entries = json.loads(data_file.read_text(encoding="utf-8"))
    rgb = np.array(
        [[int(e["rgb"][i : i + 2], 16) for i in (0, 2, 4)] for e in entries], dtype=np.uint8
    )
    return Palette(
        ids=np.array([e["id"] for e in entries], dtype=np.int64),
        names=tuple(e["name"] for e in entries),
        rgb=rgb,
        lab=rgb_to_lab(rgb),
    )
