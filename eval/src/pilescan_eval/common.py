from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]  # repo root
REAL_DIR = ROOT / "fixtures" / "real"
SYNTH_DIR = ROOT / "fixtures" / "images"
OUT_DIR = ROOT / "eval" / "out"
IMG_EXT = {".jpg", ".jpeg", ".png", ".webp", ".avif", ".heic"}


def safe_name(name: str) -> str:
    s = re.sub(r"[^A-Za-z0-9._-]", "_", name).lstrip("-.")
    return s or "img"


def list_images(d: Path) -> list[Path]:
    return sorted(p for p in d.iterdir() if p.suffix.lower() in IMG_EXT)
