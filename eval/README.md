# PileScan eval

Runs every real photo (`fixtures/real/`, git-ignored) and the synthetic fixtures
(`fixtures/images/`, exact counts in `manifest.json`) through:

- (a) the inference service directly: `POST /v1/recognize` with the raw file and `debug=true`
  (if the raw file is rejected, it is retried with the re-encoded JPEG and flagged `j`);
- (b) the public API like the frontend does: decode, EXIF-orient, downscale to a 2048 px long
  side (never upscale), JPEG q90, `POST /api/scans`, then `GET /set-candidates?limit=20`.

Raw responses and debug images go to `eval/out/<label>/` (git-ignored). Metrics are recomputed
from those files, so editing the ground-truth CSVs needs no re-run.

## Usage

```bash
cd eval
uv sync
# 1. collect raw outputs (needs services running; sequential)
uv run pilescan-eval run --label after-bkg \
    --inference-url http://localhost:8000 --api-url http://localhost:4200 \
    --sha $(git rev-parse --short HEAD) --note "PART_CLASSIFIER=brickognize"
# 2. metrics from cache (no network), one or more labels side by side
uv run pilescan-eval report before-bkg after-bkg --out ../docs/eval/tables.md
# 3. annotated thumbnails with boxes (<=480 px, docs/eval/img/ is git-ignored)
uv run pilescan-eval annotate after-bkg images-6.jpeg
uv run pytest tests
```

`--inference-url` or `--api-url` can be omitted to skip that half. The classifier in use is
read from `/health` and printed in every report; label stub and Brickognize runs separately
(e.g. `before-stub`, `before-bkg`). Part-level metrics need the API path (part IDs are mapped
BrickLink to Rebrickable by the backend), and are only meaningful with the real classifier.

## Metrics

- Count error: `|detections - total_pieces|` per image from `counts.csv`: MAE, signed bias, %
  exact, % within ±1. Reported for inference and the API. OOD and unlabelled images are excluded.
- Part / color / part+color precision and recall, on photos with rows in `ground-truth.csv`:
  multiset match = sum over keys of `min(predicted, true)`; precision = match / detections,
  recall = match / true pieces; micro-averaged over labelled photos. Top-1 per detection.
  Detections with no mapped part are predictions that match nothing.
- Part recall top-3: first the top-1 match; then each unmatched detection may consume a
  remaining true quantity with any of its 3 candidates (greedy).
- Set ranking: rank of `sets.csv` set in the candidates (top 20). top-1, top-5, MRR.
- Latency: inference `timings_ms` per stage, HTTP wall time, API POST and set-candidates:
  mean, with p50/p90 only when n >= 5.

Synthetic fixtures are reported separately as a sanity check.
