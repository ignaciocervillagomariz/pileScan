"""Generate synthetic fixture images under tests/fixtures/generated (git-ignored).

Brick-like colored rectangles with studs on a plain light background. Synthetic images give
unreliable Brickognize results, so tests assert structure, never exact part IDs.
"""
import io
import random
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "fixtures" / "generated"
COLORS = [(196, 32, 27), (13, 105, 171), (245, 205, 47), (40, 127, 70), (255, 255, 255), (27, 42, 52)]
BG = (232, 232, 228)


def brick(d: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, color: tuple[int, int, int]) -> None:
    d.rectangle([x, y, x + w, y + h], fill=color, outline=tuple(max(c - 50, 0) for c in color), width=3)
    r = min(w, h) // 8
    for sx in range(x + r * 2, x + w - r, r * 3):
        for sy in range(y + r * 2, y + h - r, r * 3):
            d.ellipse([sx - r, sy - r, sx + r, sy + r], fill=tuple(min(c + 25, 255) for c in color))


def pile(n: int, size: tuple[int, int], seed: int) -> Image.Image:
    rng = random.Random(seed)
    img = Image.new("RGB", size, BG)
    d = ImageDraw.Draw(img)
    placed: list[tuple[int, int, int, int]] = []
    tries = 0
    while len(placed) < n and tries < 2000:
        tries += 1
        w, h = rng.choice([(160, 80), (120, 80), (80, 80), (160, 120), (240, 80)])
        x, y = rng.randint(40, size[0] - w - 40), rng.randint(40, size[1] - h - 40)
        if any(x < px + pw + 30 and px < x + w + 30 and y < py + ph + 30 and py < y + h + 30 for px, py, pw, ph in placed):
            continue
        placed.append((x, y, w, h))
        brick(d, x, y, w, h, rng.choice(COLORS[:4]))
    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    pile(6, (1600, 1200), 1).save(OUT / "pile-small.jpg", quality=92)
    pile(25, (2400, 1800), 2).save(OUT / "pile-medium.png")
    pile(6, (1600, 1200), 3).save(OUT / "pile-small.webp", quality=90)
    Image.new("RGB", (1200, 900), BG).save(OUT / "blank.jpg")
    (OUT / "not-an-image.txt").write_text("this is not an image\n")
    (OUT / "fake.jpg").write_bytes(b"not really a jpeg")
    # EXIF orientation 6 (rotate 90 CW when displayed): stored pixels are landscape, displayed portrait.
    exif = Image.Exif()
    exif[0x0112] = 6
    pile(6, (1600, 1000), 4).save(OUT / "pile-exif-rotated.jpg", quality=92, exif=exif)
    # >15 MB: incompressible noise PNG
    noise = Image.frombytes("RGB", (3000, 2000), random.Random(5).randbytes(3000 * 2000 * 3))
    buf = io.BytesIO()
    noise.save(buf, "PNG", compress_level=0)
    (OUT / "oversize.png").write_bytes(buf.getvalue())
    for p in sorted(OUT.iterdir()):
        print(f"{p.name}: {p.stat().st_size // 1024} KiB")


if __name__ == "__main__":
    main()
