# PileScan inference service

FastAPI service that takes a photo of loose bricks on a plain surface and returns, per piece, a
bounding box, top-3 part candidates and top-3 color candidates. Contract:
[`docs/api/inference-contract.md`](../docs/api/inference-contract.md) and
[`docs/api/inference-response.schema.json`](../docs/api/inference-response.schema.json).
Only the backend calls it. CPU only.

## Run

```bash
cd inference
uv sync                      # Python 3.12+, installs dev tools too
uv run pytest                # full suite, no network
uv run ruff check . && uv run ruff format --check .
uv run uvicorn pilescan_inference.main:app_factory --factory --port 8000
PART_CLASSIFIER=stub uv run uvicorn ...   # offline, deterministic part guesses
```

Docker (also used by `docker compose up`): `docker build -t pilescan-inference ./inference`.
The image is `python:3.12-slim`, installs with `uv sync --frozen --no-dev`, runs as a non-root
user and listens on 8000.

```bash
curl -F image=@tests/fixtures/pile_light_5.jpg "localhost:8000/v1/recognize?debug=true"
```

### Configuration (environment)

| Variable | Default | Meaning |
| --- | --- | --- |
| `DETECTOR` | `opencv` | `opencv` |
| `PART_CLASSIFIER` | `brickognize` | `brickognize` or `stub` |
| `COLOR_ESTIMATOR` | `kmeans_lab` | `kmeans_lab` |
| `BRICKOGNIZE_URL` | `https://api.brickognize.com` | Brickognize base URL |
| `BRICKOGNIZE_MAX_CONCURRENCY` | `2` | parallel requests to Brickognize |
| `BRICKOGNIZE_MAX_RETRIES` | `3` | retries on 429/5xx/timeouts |
| `BRICKOGNIZE_TIMEOUT_S` | `30` | per-request read timeout |
| `CACHE_DIR` | `./.cache` | on-disk cache (compose mounts a volume at `/data/cache`) |
| `MAX_IMAGE_BYTES` | `15728640` | upload limit (413 above) |

An unknown component name stops startup with a clear error.

## Architecture

```
upload -> decode + EXIF transpose -> Detector -> RawDetection(bbox, mask, score)
       -> padded JPEG crop per piece -> PartClassifier (async, concurrent) -> top-3 parts
       -> bbox crop + mask            -> ColorEstimator                    -> top-3 colors
       -> RecognizeResponse (+ optional debug image)
```

```
src/pilescan_inference/
  main.py        FastAPI app factory, endpoints, RFC 9457 error mapping
  pipeline.py    orchestration, timings, warnings, max_detections
  domain.py      Detector / PartClassifier / ColorEstimator Protocols + value types
  registry.py    env name -> factory tables
  schemas.py     pydantic models == the JSON schema (extra="forbid")
  imaging.py     decode, crop, debug rendering
  detectors/     opencv_lab.py
  classifiers/   brickognize.py, stub.py, cache.py
  colors/        kmeans_lab.py, ciede2000.py, palette.py, data/rebrickable_colors.json
scripts/refresh_palette.py
tests/           synthetic scenes, fixtures/ (committed sample photos + manifest.json)
```

### Swapping a component

1. Implement the Protocol from `domain.py` (give it a versioned `name`, which is reported in
   `pipeline` and `/health`).
2. Add one entry to the matching table in `registry.py`.
3. Select it with the env var. The contract does not change.

A YOLO detector returns the same `RawDetection` (bbox in original pixels, score, boolean mask
of bbox size; a box-filled mask is acceptable if the model has no segmentation head). A custom
part classifier implements `classify(crop) -> list[PartCandidate]` and raises `ClassifierError`
on failure. See [`../training/README.md`](../training/README.md).

## Components

### Detector `opencv-lab-v2` (no training)
1. Decode (JPEG, PNG, WebP, AVIF via Pillow; HEIC via `pillow-heif` when installed), EXIF
   orientation, RGB. Transparent pixels (RGBA/LA/palette PNG) are composited onto white, the
   same as the frontend's client-side flatten, never onto black. Boxes are in this pixel space, which the backend stores.
2. Normalize size: process at `DETECTOR_LONG_SIDE` (downscale) but upscale tiny images to at
   least `DETECTOR_MIN_LONG_SIDE`; boxes and masks are scaled back to the input pixels.
3. Convert to CIELAB. Background model: a smooth per-channel field grown from the border ring by
   normalized convolution over the pixels that stay close to the current model. It absorbs
   gradients, vignetting and soft texture, and pieces are never absorbed (they exceed the
   limit). Optional CLAHE on L.
4. Distance to the model, lightness down-weighted when darker (0.35) and up-weighted when
   lighter (0.8). Shadow test: darker, same chroma (chroma distance < 6, L drop < 30) counts as
   background.
5. Threshold: Otsu halved, clamped to `[max(THRESHOLD_MIN, NOISE_K * background noise),
   THRESHOLD_MAX]`. The noise term adapts the threshold to wood, carpet and paper.
6. Morphology (open then small close), external contours, area filter relative to the image.
7. Merged blobs are split: first by high-contrast cores (seeds, `SEED_FACTOR` x threshold) with
   a watershed, then by distance-transform watershed for blobs that are oversized or non convex.
8. Out-of-distribution guard: foreground above `FG_MAX_FRACTION` returns no detections and the
   warning `background not uniform: no pieces detected`.
9. `detection_score = 0.6 * contrast + 0.4 * solidity`, times 0.8 if the region touches the
   image border.

Known limits: white or light-gray pieces on a light background (low contrast), touching pieces
that are not separable by color or shape (they stay merged), assembled models (one detection),
and light studs on white pieces fragmenting the mask. Defaults are provisional (tuned on ~13 web
photos plus synthetic scenes, see `docs/decisions/0009-detector-preprocessing.md`).

All parameters are environment variables with the `DETECTOR_` prefix (`detectors/params.py`):

| Variable | Default | Meaning |
|---|---|---|
| `DETECTOR_LONG_SIDE` | 1280 | Max long side used for processing |
| `DETECTOR_MIN_LONG_SIDE` | 640 | Smaller images are upscaled to this long side |
| `DETECTOR_BORDER_FRACTION` | 0.04 | Border ring width that seeds the background model |
| `DETECTOR_BG_SIGMA_FRACTION` | 0.06 | Smoothness of the background model (fraction of the side) |
| `DETECTOR_BG_ITERATIONS` | 8 | Growth iterations of the model |
| `DETECTOR_BG_LIMIT_MIN` / `DETECTOR_BG_LIMIT` | 5 / 15 | dE range for joining the model, `clip(noise_k * ring noise)` |
| `DETECTOR_CLAHE` | false | CLAHE on L before the distance |
| `DETECTOR_L_WEIGHT_DARKER` / `DETECTOR_L_WEIGHT_LIGHTER` | 0.35 / 0.8 | Lightness weight in the distance |
| `DETECTOR_SHADOW_CHROMA_MAX` | 6.0 | Chroma dE under which a darker pixel is shadow |
| `DETECTOR_SHADOW_L_MAX` | 30.0 | Max L drop treated as shadow |
| `DETECTOR_THRESHOLD_MIN` / `DETECTOR_THRESHOLD_MAX` | 6 / 9 | Threshold clamp (dE) |
| `DETECTOR_NOISE_K` | 4.0 | Threshold floor = k x background noise |
| `DETECTOR_OPEN_FRACTION` / `DETECTOR_CLOSE_FRACTION` | 1/400 / 1/300 | Morphology kernels (fraction of the long side) |
| `DETECTOR_MIN_AREA_FRACTION` / `DETECTOR_MAX_AREA_FRACTION` | 0.00015 / 0.35 | Contour area limits (fraction of image area) |
| `DETECTOR_MIN_SOLIDITY` | 0.35 | Discard very ragged regions |
| `DETECTOR_SEED_SPLIT`, `DETECTOR_SEED_FACTOR`, `DETECTOR_SEED_ERODE_FRACTION` | true, 2.5, 1/250 | Split by high-contrast cores |
| `DETECTOR_WATERSHED`, `DETECTOR_WATERSHED_SOLIDITY`, `DETECTOR_WATERSHED_PEAK_FRACTION` | true, 0.95, 0.6 | Distance-transform split of oversized or non-convex blobs |
| `DETECTOR_FG_MAX_FRACTION` | 0.8 | Out-of-distribution guard |

Logs: one JSON line per stage on logger `pilescan_inference.pipeline` (`preprocess`, `detect`
with the detector statistics, `classify` with ok/no_match/error counts, `color`, `done`), with
timings and counts, never image data.

### Color estimator `kmeans-lab-ciede2000-v1`
Works on the mask pixels only: erode the mask (blended edge pixels), drop specular highlights
(far brighter than the piece's median lightness and nearly colorless, so white pieces are
safe), k-means (k=3, fixed seed) in Lab, take the largest cluster as `measured_rgb`, then rank
the palette by CIEDE2000 (own implementation, tested against the 34 Sharma reference pairs).
`score` is a softmax over `-delta_e` of the top 3 with temperature 4. It ranks, it is not a
calibrated probability.

The palette is `colors/data/rebrickable_colors.json`, generated from Rebrickable's
`colors.csv.gz` by `scripts/refresh_palette.py`. It keeps solid colors only and drops
`-1 [Unknown]`, `9999 [No Color]`, Modulex and HO colors, and colors used on fewer than 1000
parts (one-off or toy-line colors that only create near-duplicate matches). Result: 56 colors.
A piece in a pruned rare color is therefore mapped to its nearest common color, and the user
corrects it in the Review screen.

### Part classifier `brickognize-v1`
What was verified on 2026-11-02 against `https://api.brickognize.com/openapi.json` (v1.0.0) and
one real call:

- `POST /predict/parts/`, multipart field `query_image` (a file; the field may repeat for
  multiple views of one item, we send one crop). Only "legacy" prediction endpoints exist,
  plus `GET /health/`. The docs state no rate limit, so the adapter is deliberately gentle.
- Response: `{listing_id, bounding_box, items: [{id, name, img_url, external_sites, category,
  type, score}]}`. `score` is 0..1. `id` is a BrickLink-style part number, so
  `id_system = "bricklink"` and `img_url` becomes `image_url`. The real call returned
  `3069px68` (a printed tile) for a red rectangle, so IDs can include print/pattern suffixes
  that the backend may not find in Rebrickable (the backend tracks those as unmapped).
- The service may return fewer than 3 items, or none. That gives `part_candidates: []` with no
  warning, since it is a valid answer rather than a failure.

Behavior: one padded JPEG crop (15% padding, max 512 px side) per piece; concurrency limited by
a semaphore (`BRICKOGNIZE_MAX_CONCURRENCY`); retries on 429, 5xx, timeouts and transport errors
with exponential backoff and full jitter (cap 20 s), honoring `Retry-After` (cap 30 s);
descriptive `User-Agent`; results cached on disk by sha256 of the crop bytes (successes only,
write-then-rename, an unwritable cache degrades to misses). A failure for a crop yields
`part_candidates: []` and one aggregated warning, never a failed request.

### Part classifier `stub-v1` (offline)
`PART_CLASSIFIER=stub`. Deterministic: the crop's aspect ratio picks 3 fixed BrickLink ids that
exist unchanged in Rebrickable (3001, 3003, 3004, 3020, 3023). For E2E tests and offline demos.

## Sample photos
`tests/fixtures/*.jpg` are synthetic piles generated by `uv run python -m tests.generate_fixtures`
(`manifest.json` lists the expected piece count and Rebrickable color id per image, and
`pile_exif_rotated_6.jpg` is stored sideways with EXIF orientation 6 to exercise the transpose).

## Latency (laptop CPU, M-series, 1200x900 JPEG)
Detect 40-100 ms, color about 3 ms per piece, classify dominated by Brickognize (about 0.4 s for
3 uncached crops with concurrency 2, so expect roughly 0.2 s per uncached piece, up to ~30 s
for 150 pieces). Cached crops cost under a millisecond.

## Known limitations
- Touching or overlapping pieces merge into one detection (no instance splitting in v1). Pieces
  should be spread out.
- Needs a plain, fairly uniform background. Patterned tables, strong shadows and glare reduce
  quality. Soft shadows can slightly inflate boxes.
- A piece whose color is close to the background (white on white) is missed.
- Color is estimated from photographed pixels, so lighting changes the result. Finishes
  (pearl, metallic) and transparent colors are not distinguished or supported in v1.
- Part recognition quality is whatever Brickognize returns for a crop. Pieces seen from the
  side or partly hidden are often wrong, which the backend/UI let users correct.
- Scores are heuristic and not calibrated.
