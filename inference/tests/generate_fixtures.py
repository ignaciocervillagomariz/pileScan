"""Generate synthetic pile photos for E2E tests: `uv run python -m tests.generate_fixtures`.

Writes images plus manifest.json (expected piece count and per-piece Rebrickable color id)
into tests/fixtures/. Pieces never overlap, so the expected count is exact.
"""

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from tests.synthetic import Piece, make_scene

OUT = Path(__file__).parent / "fixtures"
# Exact Rebrickable colors: (rebrickable_color_id, name, rgb)
COLORS = [
    (4, "Red", (0xC9, 0x1A, 0x09)),
    (1, "Blue", (0x00, 0x55, 0xBF)),
    (14, "Yellow", (0xF2, 0xCD, 0x37)),
    (2, "Green", (0x23, 0x78, 0x41)),
    (25, "Orange", (0xFE, 0x8A, 0x18)),
    (0, "Black", (0x05, 0x13, 0x1D)),
    (15, "White", (0xFF, 0xFF, 0xFF)),
]
SIZES = [(120, 70), (70, 70), (140, 70), (210, 70), (100, 100)]


def layout(count: int, size: tuple[int, int], seed: int) -> list[tuple[Piece, int]]:
    """Place pieces on a jittered grid so they never touch."""
    rng = np.random.default_rng(seed)
    width, height = size
    cols = int(np.ceil(np.sqrt(count * width / height)))
    rows = int(np.ceil(count / cols))
    cell_w, cell_h = width / cols, height / rows
    cells = rng.permutation(cols * rows)[:count]
    placed = []
    for cell in cells:
        pw, ph = SIZES[rng.integers(len(SIZES))]
        scale = min(1.5, 0.7 * cell_w / pw, 0.7 * cell_h / ph)
        pw, ph = int(pw * scale), int(ph * scale)
        cx = (cell % cols + 0.5) * cell_w + rng.uniform(-0.1, 0.1) * cell_w
        cy = (cell // cols + 0.5) * cell_h + rng.uniform(-0.1, 0.1) * cell_h
        color_index = int(rng.integers(len(COLORS)))
        shape = "disc" if rng.random() < 0.2 else "rect"
        piece = Piece(int(cx - pw / 2), int(cy - ph / 2), pw, ph, COLORS[color_index][2], shape)
        placed.append((piece, color_index))
    return placed


def write(name, image, manifest, placed, exif_orientation=None):
    path = OUT / name
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    exif = Image.Exif()
    if exif_orientation:
        exif[0x0112] = exif_orientation
    Image.fromarray(rgb).save(path, quality=92, exif=exif)
    manifest[name] = {
        "width": image.shape[1],
        "height": image.shape[0],
        "piece_count": len(placed),
        "colors": [{"id": COLORS[i][0], "name": COLORS[i][1]} for _, i in placed],
        "note": "stored sideways, EXIF orientation 6" if exif_orientation else "",
    }


def main() -> None:
    OUT.mkdir(exist_ok=True)
    manifest: dict[str, dict] = {}
    specs = [
        ("pile_light_5.jpg", (1200, 900), 5, 1, dict(background=(214, 214, 208)), None),
        ("pile_dark_8.jpg", (1200, 900), 8, 2, dict(background=(40, 42, 45)), None),
        ("pile_gradient_12.jpg", (1600, 1200), 12, 3, dict(gradient=28), None),
        ("pile_single_1.jpg", (900, 900), 1, 4, dict(background=(200, 190, 175)), None),
    ]
    for name, size, count, seed, kwargs, orientation in specs:
        placed = layout(count, size, seed)
        image = make_scene(size, [p for p, _ in placed], seed=seed, **kwargs)
        write(name, image, manifest, placed, orientation)

    # A portrait photo as phones store it: landscape pixels plus EXIF orientation 6.
    placed = layout(6, (900, 1200), 5)
    upright = make_scene((900, 1200), [p for p, _ in placed], seed=5)
    stored = cv2.rotate(upright, cv2.ROTATE_90_COUNTERCLOCKWISE)
    write("pile_exif_rotated_6.jpg", stored, manifest, placed, exif_orientation=6)
    manifest["pile_exif_rotated_6.jpg"]["displayed_width"] = 900
    manifest["pile_exif_rotated_6.jpg"]["displayed_height"] = 1200

    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"wrote {len(manifest)} images to {OUT}")


if __name__ == "__main__":
    main()
