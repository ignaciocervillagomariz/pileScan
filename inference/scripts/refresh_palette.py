"""Regenerate the solid-color palette from the Rebrickable colors.csv.gz download.

Usage: uv run python scripts/refresh_palette.py

Rebrickable pseudo-colors (-1 "[Unknown]", 9999 "[No Color/Any Color]"), Modulex/HO colors,
rarely used colors and all transparent colors are dropped: a photographed opaque piece
cannot be one of them.
"""

import csv
import gzip
import io
import json
from pathlib import Path

import httpx

URL = "https://cdn.rebrickable.com/media/downloads/colors.csv.gz"
OUT = (
    Path(__file__).resolve().parents[1]
    / "src/pilescan_inference/colors/data/rebrickable_colors.json"
)
EXCLUDED_IDS = {-1, 9999}
# Modulex and HO-scale colors are not found on regular bricks but sit close to common colors
# (e.g. "Modulex White"), so they would steal matches from the real ones.
EXCLUDED_NAME_PREFIXES = ("Modulex ", "HO ")
# Colors used on fewer parts are one-off or toy-line specific (Duplo, Fabuland, glitter
# variants) and only create near-duplicate matches for the common colors.
MIN_PARTS = 1000


def main() -> None:
    response = httpx.get(
        URL, headers={"User-Agent": "PileScan palette refresh"}, timeout=30, follow_redirects=True
    )
    response.raise_for_status()
    text = gzip.decompress(response.content).decode("utf-8")
    palette = [
        {"id": int(row["id"]), "name": row["name"], "rgb": row["rgb"].upper()}
        for row in csv.DictReader(io.StringIO(text))
        if row["is_trans"] == "False"
        and int(row["id"]) not in EXCLUDED_IDS
        and not row["name"].startswith(EXCLUDED_NAME_PREFIXES)
        and int(row["num_parts"]) >= MIN_PARTS
    ]
    palette.sort(key=lambda color: color["id"])
    OUT.write_text(json.dumps(palette, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {len(palette)} colors to {OUT}")


if __name__ == "__main__":
    main()
