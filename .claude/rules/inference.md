---
paths:
  - "inference/**"
  - "training/**"
---

# Inference (FastAPI vision pipeline)

- `/training` is **reserved for the owner**. Don't edit it.
- Pydantic contract models use `extra="forbid"` and must match
  `docs/api/inference-response.schema.json`. The schema-drift test reads `../docs/api/` (it is
  skipped inside the Docker build context).
- The pipeline is three `Protocol`s selected by env: `Detector`, `PartClassifier`,
  `ColorEstimator`. A new model is a new registry entry, not a contract change.
- A classifier failure never removes a detection: empty `part_candidates` plus
  `classification_status`.
- Brickognize returns BrickLink-style IDs (`id_system: "bricklink"`), sometimes print variants
  such as `3069px68`. An empty `items` list is valid. Keep concurrency limited, back off, and
  cache by crop hash. Don't run large Brickognize evals before part labels exist.
- Detector `opencv-lab-v2` (ADR 0009): normalizes to a 1280 px long side; every parameter is
  a `DETECTOR_*` env var (README table). Defaults are provisional, tuned on web photos.
- Tune with labelled photos and the eval, never by eye. Before changing detector behavior,
  freeze a "before" image (sprint 2 used `pilescan-inference:v1`) so the eval can compare.
- Known limits: over-segmentation (rulers, bags, printed text, shadows), touching pieces
  merged into one box, white or light grey on light backgrounds missed. The last one is a
  strict xfail: don't delete it, make it pass.
- Colors: a pruned 56-color palette (no -1, 9999, Modulex, HO, or colors on fewer than 1000
  parts). Refresh with `scripts/refresh_palette.py`. CIEDE2000 is our own implementation,
  tested against the Sharma pairs. `delta_e` is always emitted.
- HEIC is read with pillow-heif; transparency is flattened onto white.
- Raw vs re-encoded JPEG changes counts by 5–10%; the API path (re-encoded) is what users get.
