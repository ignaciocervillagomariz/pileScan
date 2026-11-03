# PileScan architecture

## Overview

```
 ┌──────────── phone / browser ────────────┐
 │ frontend (Angular + Ionic PWA) :4200    │  nginx serves the static build
 │   generated API client (openapi.yaml)   │  and proxies /api/* → backend:8080
 └───────────────┬─────────────────────────┘
                 │ HTTPS/JSON (camelCase)
 ┌───────────────▼─────────────────────────┐        ┌───────────────────────────┐
 │ backend (Spring Boot) :8080             │  HTTP  │ inference (FastAPI) :8000 │
 │  scans · detections · corrections       ├───────►│  Detector  → crops        │
 │  part-id mapping (+ Rebrickable API)    │ multi- │  PartClassifier (Brickog.)│
 │  set ranking (SetRankingStrategy)       │ part   │  ColorEstimator (LAB/k-m) │
 │  catalog import (Rebrickable CSVs)      │        └────────────┬──────────────┘
 │  Swagger UI /swagger-ui.html            │                     │ HTTPS
 └───────────────┬─────────────────────────┘                     ▼
                 │ JDBC                               api.brickognize.com (free)
 ┌───────────────▼─────────┐
 │ PostgreSQL 17           │  catalog (colors, parts, sets, inventories…)
 │                         │  scans, detections, part_id_mapping
 └─────────────────────────┘
```

## Request flow
1. **Capture** (frontend): the user takes a photo (Capacitor Camera, or a file input on desktop).
   The frontend calls `createScan` with multipart `image`.
2. **Backend** `POST /api/scans`: validates the image, applies EXIF orientation, stores it on a
   volume (`SCAN_STORAGE_DIR`), and calls `POST {INFERENCE_URL}/v1/recognize`.
3. **Inference**: the detector (classical OpenCV, `opencv-lab-v2`: normalize to 1280 px, flat-field background in LAB, shadow suppression, adaptive threshold; see ADR 0009) finds piece regions. For each crop, the
   part classifier (Brickognize, limited concurrency, cached by crop hash) returns top-3 parts.
   The color estimator (k-means in LAB on the mask, CIEDE2000 to the Rebrickable palette)
   returns top-3 colors. The response follows `docs/api/inference-response.schema.json`.
4. **Backend** maps each `part_id` to a Rebrickable `part_num`. An identical ID that exists in
   the catalog maps directly. Otherwise the backend asks the Rebrickable API
   (`/api/v3/lego/parts/?bricklink_id=…`) and caches the answer in `part_id_mapping`. Failures
   are tracked as unmapped. The backend persists the detections and returns the `Scan` with a
   grouped summary.
5. **Review** (frontend): boxes drawn on a canvas and colored by `confidence`. The user fixes
   part or color (`PATCH`), deletes false positives (`DELETE`, a soft delete) and adds missed
   pieces (`POST …/detections`).
6. **Results**: `GET /api/scans/{id}/set-candidates` runs the selected `SetRankingStrategy`
   on the current active detections and returns the top 5 with match %, coverage metrics and
   missing parts.

## Same-origin API (sprint 2)
The browser only ever talks to nginx (port 4200). nginx serves the SPA and proxies `/api/` to
the backend. It forwards `Host` (with the port) and overwrites `X-Forwarded-*`, and Spring
trusts the forwarded headers (`server.forward-headers-strategy=framework`). There is no CORS
configuration. Any host or scheme in front of nginx (localhost, 127.0.0.1, a LAN IP, a
Tailscale or Cloudflare HTTPS tunnel) works without config changes. See ADR 0008.

The backend calls inference with `debug=true`. It stores the overlay (served at
`GET /api/scans/{id}/debug-image`), the per-stage timings, and a per-detection
`classificationStatus`. A classifier failure never removes a detection (contract 1.1.0).

## Services and ownership
| Service | Dir | Port | Owner |
| --- | --- | --- | --- |
| frontend | `/frontend` | 4200 | frontend |
| backend | `/backend` | 8080 | backend |
| inference | `/inference` | 8000 | vision |
| postgres | (image) | 5432 (internal) | backend (schema via Flyway) |

## Key design points
- **Contracts first.** `docs/api/openapi.yaml` (public) and `docs/api/inference-contract.md`
  (internal) are the source of truth. The frontend client is generated from the spec. QA
  validates live responses against both.
- **Swappable vision pipeline.** `Detector`, `PartClassifier` and `ColorEstimator` are
  interfaces chosen by env config. A later YOLO detector or custom classifier is a config
  change, not a contract change.
- **Shape and color are separate.** Brickognize-style classifiers identify the *mould*. Color
  is measured independently, which keeps each model simpler and lets either one be replaced
  on its own.
- **Ranking strategy interface.** `SetRankingStrategy` has a `CoverageRankingStrategy`
  baseline: an SQL prefilter on candidate sets, then overlap scoring of part+color quantities.
  `RarityWeightedRankingStrategy` (TF-IDF-style) is a documented stub reserved for the
  human owner.
- **Catalog.** Rebrickable CSV downloads (colors, parts, part_categories, themes, sets,
  inventories, inventory_parts) are imported idempotently (upserts). Only the latest
  inventory version per set is used, and spare parts are ignored.
- **Graceful degradation.** A Brickognize outage yields detections with no part candidates
  plus a warning, never a failed scan. An inference outage yields a FAILED scan the user can
  still fill in manually.

## Ranking (coverage baseline)
Let the pile be the multiset P over (part_num, color_id) and a set's inventory be S
(latest version, non-spare). Then `matched = Σ min(P[k], S[k])`,
`pileCoverage = matched / |P|` ("pile pieces found in set") and
`setCompleteness = matched / |S|`. The SQL prefilter keeps sets that share at least one
(part, color) with the pile, ordered by matched quantity, limited to N (e.g. 200). Then Java
scores them. The backend dev picks the combined score (e.g. F1 of the two metrics) and
documents it in an ADR note.

## Configuration (env)
See `.env.example`. Notable variables: `REBRICKABLE_API_KEY` (backend, optional, used for ID
mapping), `BRICKOGNIZE_URL` (inference), `INFERENCE_URL` (backend), and `DB_*`.

## Non-goals (MVP)
No auth or accounts, no training, no generative builds, no 3D scanning.
