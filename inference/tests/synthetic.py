"""Synthetic brick-like scenes shared by the tests and the fixture generator."""

from dataclasses import dataclass

import cv2
import numpy as np


@dataclass(frozen=True)
class Piece:
    x: int
    y: int
    w: int
    h: int
    rgb: tuple[int, int, int]
    shape: str = "rect"  # "rect" (brick-like with studs) or "disc"

    @property
    def box(self) -> tuple[int, int, int, int]:
        return (self.x, self.y, self.w, self.h)


def make_scene(
    size: tuple[int, int],
    pieces: list[Piece],
    background: tuple[int, int, int] = (215, 215, 210),
    noise: float = 2.0,
    gradient: float = 0.0,
    shadows: bool = True,
    studs: bool = True,
    seed: int = 0,
) -> np.ndarray:
    """Return a BGR uint8 image of (width, height) `size`; colors are given as RGB."""
    width, height = size
    rng = np.random.default_rng(seed)
    canvas = np.empty((height, width, 3), np.float32)
    canvas[:] = background[::-1]
    if gradient:
        ramp = np.linspace(-gradient, gradient, width, dtype=np.float32)
        canvas += ramp[None, :, None]
    image = np.clip(canvas, 0, 255).astype(np.uint8)

    for piece in pieces:
        bgr = piece.rgb[::-1]
        if shadows:
            shade = np.zeros(image.shape[:2], np.uint8)
            _draw(shade, piece, 255, dx=4, dy=5)
            soft = cv2.GaussianBlur(shade, (0, 0), 4).astype(np.float32) / 255.0
            image = (image * (1 - 0.18 * soft[..., None])).astype(np.uint8)
        _draw(image, piece, bgr)
        if studs and piece.shape == "rect" and min(piece.w, piece.h) >= 40:
            _draw_studs(image, piece, bgr)
    if noise:
        image = np.clip(image + rng.normal(0, noise, image.shape), 0, 255).astype(np.uint8)
    return image


def _draw(image: np.ndarray, piece: Piece, color, dx: int = 0, dy: int = 0) -> None:
    x, y = piece.x + dx, piece.y + dy
    if piece.shape == "disc":
        center = (x + piece.w // 2, y + piece.h // 2)
        cv2.ellipse(image, center, (piece.w // 2, piece.h // 2), 0, 0, 360, color, -1, cv2.LINE_AA)
    else:
        cv2.rectangle(image, (x, y), (x + piece.w - 1, y + piece.h - 1), color, -1)


def _draw_studs(image: np.ndarray, piece: Piece, bgr) -> None:
    lighter = tuple(int(min(255, c * 1.15 + 6)) for c in bgr)
    radius = max(4, min(piece.w, piece.h) // 8)
    cols, rows = max(1, piece.w // (radius * 4)), max(1, piece.h // (radius * 4))
    for i in range(cols):
        for j in range(rows):
            cx = piece.x + int((i + 0.5) * piece.w / cols)
            cy = piece.y + int((j + 0.5) * piece.h / rows)
            cv2.circle(image, (cx, cy), radius, lighter, -1, cv2.LINE_AA)


def iou(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> float:
    ax1, ay1, bx1, by1 = a[0], a[1], b[0], b[1]
    ix = max(0, min(a[0] + a[2], b[0] + b[2]) - max(ax1, bx1))
    iy = max(0, min(a[1] + a[3], b[1] + b[3]) - max(ay1, by1))
    inter = ix * iy
    union = a[2] * a[3] + b[2] * b[3] - inter
    return inter / union


def encode(image: np.ndarray, ext: str = ".jpg") -> bytes:
    ok, buf = cv2.imencode(ext, image)
    assert ok
    return buf.tobytes()
