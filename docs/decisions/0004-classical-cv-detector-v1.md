# ADR 0004: Classical OpenCV detector for v1

- Status: Accepted
- Date: 2026-11-02

## Context
We need piece localization on day one, with no labeled data and no training budget. The capture
screen can ask users to spread pieces on a plain, contrasting background.

## Decision
Detector v1 is classical segmentation: downscale, estimate the background color in LAB,
threshold each pixel's LAB distance from it, apply morphological open/close, extract external
contours, and filter by area. It produces boxes and masks with a heuristic confidence.

## Alternatives
- **Pretrained generic detector / SAM-style segmenter:** no training needed, but heavy on CPU,
  and either over-segments studs and logos or needs prompts.
- **Train YOLO now:** best accuracy long-term, but there is no dataset yet (see
  `training/README.md`, which plans a synthetic Blender + LDraw pipeline).
- **Brickognize multi-object endpoint:** couples detection to an external service and its limits.

## Consequences
- Fast, explainable, CPU-only, and deterministic, which makes it easy to test with synthetic
  images.
- It relies on the capture conditions. Touching pieces merge, pieces close to the background
  color (e.g. white on white) get missed, and shadows can split or grow regions. The Review
  screen (delete, add, fix) is the safety net, and the tips screen lowers the risk.
- Replaceable through ADR 0003 once a trained detector exists.
