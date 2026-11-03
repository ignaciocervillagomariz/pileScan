# Inference service contract (v1.1.0)

> **1.1.0 (2026-11-03, additive):** adds per-detection `classification_status` (required) and
> `classification_error`, an optional `timings_ms.preprocess`, and AVIF/HEIC input. Consumers
> must ignore unknown fields.

Owner: team-lead. Implemented by `vision` in `/inference`, consumed by `backend`.
The machine-readable response schema is in [`inference-response.schema.json`](inference-response.schema.json)
(JSON Schema 2020-12). **The pydantic models must match it exactly.** QA validates real
responses against the schema.

The service is internal: only the backend calls it. JSON uses **snake_case**.

## Endpoints

### `GET /health`
`200 {"status": "ok", "pipeline": {"detector": "...", "part_classifier": "...", "color_estimator": "..."}}`

### `POST /v1/recognize`
Detects every piece in a photo, then classifies its part and color.

**Request:** `multipart/form-data`

| Field | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `image` | form | file (JPEG, PNG, WebP, AVIF or HEIC) | yes | ≤ 15 MB. EXIF orientation is applied before processing. |
| `debug` | query | bool | no, default `false` | When true, `debug_image` holds a base64 JPEG with boxes drawn. |
| `max_detections` | query | int 1..300 | no, default `150` | Keeps the N largest/most confident regions; adds a warning if truncated. |

**Response 200:** `RecognizeResponse`, see the schema. Abridged example:

```json
{
  "contract_version": "1.1.0",
  "image": { "width": 3024, "height": 4032 },
  "detections": [
    {
      "index": 0,
      "bbox": { "x": 812, "y": 1290, "width": 214, "height": 160 },
      "detection_score": 0.91,
      "part_candidates": [
        { "part_id": "3001", "id_system": "bricklink", "name": "Brick 2 x 4", "score": 0.87, "image_url": "https://..." },
        { "part_id": "3002", "id_system": "bricklink", "name": "Brick 2 x 3", "score": 0.06, "image_url": null },
        { "part_id": "2456", "id_system": "bricklink", "name": "Brick 2 x 6", "score": 0.03, "image_url": null }
      ],
      "color_candidates": [
        { "rebrickable_color_id": 4, "name": "Red", "score": 0.81, "delta_e": 3.2 },
        { "rebrickable_color_id": 320, "name": "Dark Red", "score": 0.12, "delta_e": 11.7 },
        { "rebrickable_color_id": 25, "name": "Orange", "score": 0.07, "delta_e": 18.4 }
      ],
      "measured_rgb": { "r": 196, "g": 32, "b": 27 },
      "classification_status": "ok",
      "classification_error": null
    }
  ],
  "pipeline": { "detector": "opencv-lab-v1", "part_classifier": "brickognize-v1", "color_estimator": "kmeans-lab-ciede2000-v1" },
  "timings_ms": { "preprocess": 35.0, "detect": 140.2, "classify": 5210.7, "color": 88.1, "total": 5460.0 },
  "warnings": [],
  "debug_image": null
}
```

**Errors:** RFC 9457-style JSON `{"type","title","status","detail"}`.
- `400` missing or undecodable image
- `413` image too large
- `422` invalid query parameters
- `503` returned **only** if the detector itself cannot run. A classifier outage is
  **not** an error. Affected detections are kept with `part_candidates: []`,
  `classification_status: "error"` and a warning, so the user can still correct them by
  hand. **A classifier failure must never remove a detection.**

## Semantics

- `bbox` is in pixels of the orientation-corrected input image, the same pixel space as the
  image the backend stores and serves to the frontend. The detector may internally resize
  (for example to a 1280 px long side), but it must scale boxes back to the input pixel space. The backend must store the
  orientation-corrected image, or apply the same EXIF transpose.
- `part_candidates`: at most 3, sorted by score descending. `id_system` says which namespace
  `part_id` belongs to. Brickognize returns BrickLink-style IDs (`"bricklink"`). The vision dev
  verifies this against https://api.brickognize.com/docs. The backend maps them to Rebrickable
  `part_num` via `part_id_mapping`.
- `classification_status`: `ok` (candidates returned), `no_match` (the classifier answered
  with no items), `error` (failed after retries; `classification_error` holds a short reason)
  or `skipped` (not attempted, e.g. crop too small).
- `color_candidates`: 1–3 entries sorted by score descending. Rebrickable color IDs, solid colors
  only for v1. `score` is a softmax-like normalization of `-delta_e` and comes with no
  calibration guarantee.
- `measured_rgb`: dominant cluster color of the piece mask, with background and specular
  highlights excluded.
- Scores are in [0,1] and are **not** calibrated probabilities. They are good enough to rank
  and to color boxes by confidence.
- Pipeline component names are versioned strings, so the backend can record which pipeline
  produced a scan.

## Swappability
Detector, part classifier and color estimator are selected by env vars
(`DETECTOR=opencv`, `PART_CLASSIFIER=brickognize`, `COLOR_ESTIMATOR=kmeans_lab`).
`PART_CLASSIFIER=stub` is a deterministic offline classifier (no network). It returns fixed
BrickLink-style candidates derived from the crop geometry and is used for E2E tests and offline
demos. Adding a YOLO
detector or a custom classifier must not change this contract.

## Versioning
Breaking changes bump `contract_version` (major) and go through the team lead.
