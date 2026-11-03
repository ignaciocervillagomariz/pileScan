"""Annotated thumbnails: detection boxes drawn on the oriented photo, max 480 px."""
from __future__ import annotations

import json
from pathlib import Path

from PIL import ImageDraw

from .common import OUT_DIR, REAL_DIR, ROOT, safe_name
from .prep import load_oriented

MAX = 480


def annotate(label: str, images: list[str], out_dir: str | None, suffix: str | None) -> None:
    dest = Path(out_dir) if out_dir else ROOT / "docs" / "eval" / "img"
    dest.mkdir(parents=True, exist_ok=True)
    for name in images:
        img = load_oriented(REAL_DIR / name)
        d = OUT_DIR / label / "real" / safe_name(name)
        dets = []
        for fn in ("inference.json", "inference_jpeg.json"):
            if (d / fn).exists():
                dets = json.loads((d / fn).read_text())["detections"]
                break
        scale = min(1.0, MAX / max(img.size))
        small = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))))
        dr = ImageDraw.Draw(small)
        for det in dets:
            b = det["bbox"]
            box = [b["x"] * scale, b["y"] * scale, (b["x"] + b["width"]) * scale, (b["y"] + b["height"]) * scale]
            dr.rectangle(box, outline=(255, 0, 0), width=2)
        out = dest / f"{safe_name(name)}.{suffix or label}.jpg"
        small.save(out, quality=85)
        print(out)
