# Build summary

What was built for the PileScan MVP, how it was built, and how to run it. Date: 2026-11-02.

## How it was built
An agent team, with a lead and four teammates working in parallel, each owning one directory:

| Role | Owns | Delivered |
| --- | --- | --- |
| team-lead | `/docs`, `/fixtures`, root files | Monorepo, `CLAUDE.md`, API contracts, architecture, compose, ADRs, integration, this summary |
| frontend | `/frontend` | Angular 22 + Ionic 9 PWA with a generated API client |
| backend | `/backend` | Spring Boot 4.1 API, catalog import, part-ID mapping, set ranking |
| vision | `/inference`, `/training` | FastAPI vision pipeline, plus the training plan (README only) |
| qa | `/tests` | Test plan, contract/E2E/failure-mode suites, [QA report](../tests/report.md) |

Process: contracts were written first (`docs/api/`). Every teammate's plan was reviewed and
approved by the lead before any code was written. Contract changes went only through the
lead. Commits are small Conventional Commits scoped to the owner's directory.

## What was built

### Frontend (`/frontend`)
- **Capture:** take a photo (phone camera via file input with `capture`; Capacitor Camera in
  native shells) or upload one, with tips for good photos.
- **Review:** the photo with boxes drawn on a canvas, colored by confidence. A list grouped by
  part+color with counts and thumbnails. Tapping a box (or a row) opens an editor to fix the
  part (autocomplete + top-3 candidates) or the color (palette + top-3 swatches), or to delete
  the piece. Missed pieces can be added, optionally with a drawn box. The total count is shown.
- **Results:** the top 5 sets with image, name, year, match %, "pile pieces found in set",
  "set completeness" and an expandable missing-parts list.
- Typed client generated from `openapi.yaml` (`ng-openapi-gen`), with a drift check
  (`npm run check:api`). Installable PWA. Footer credits Rebrickable and Brickognize and shows
  a trademark disclaimer. No LEGO name or logo appears in the UI.

### Backend (`/backend`)
- All endpoints in `docs/api/openapi.yaml`, with Swagger UI at `/swagger-ui.html` and RFC 9457
  errors.
- **Catalog import:** Rebrickable CSVs streamed with PostgreSQL `COPY` and upserted in one
  transaction. It is idempotent, revalidated by ETag, and takes about 17 s for 1.57M inventory
  lines. Only the latest inventory version per set is used, and spare parts are ignored.
- **Part-ID mapping:** identical IDs map directly. Otherwise the backend asks the Rebrickable
  API (when `REBRICKABLE_API_KEY` is set) and caches the answer in `part_id_mapping`. Unmapped
  IDs are tracked at `/api/admin/unmapped-part-ids`.
- **Ranking:** a `SetRankingStrategy` interface. `CoverageRankingStrategy` prefilters the
  shortlist in SQL by Dice/F1, then scores it. `RarityWeightedRankingStrategy` is a documented
  stub that returns 501 and is **reserved for the owner**.
- **Persistence:** JPA for the scan aggregate and mapping cache; JDBC and `COPY` for the
  catalog and ranking.

### Inference (`/inference`)
- A pipeline of swappable interfaces selected by env: `Detector` (OpenCV LAB background
  segmentation), `PartClassifier` (Brickognize adapter with limited concurrency, backoff and a
  crop-hash disk cache; or `stub` for offline/E2E use) and `ColorEstimator` (k-means in LAB
  plus CIEDE2000 matching against Rebrickable solid colors).
- `debug=true` returns an annotated image. Pydantic models are tested against the JSON Schema
  of the contract.

### Training (`/training`)
README only: the planned Blender + LDraw synthetic-data pipeline, followed by fine-tuning on
real photos. **Reserved for the owner.**

## Key decisions
See [docs/decisions/](decisions/):
- 0001: web-first PWA
- 0002: three-service split
- 0003: swappable vision pipeline
- 0004: classical CV detector for v1
- 0005: separate shape and color
- 0006: ranking strategy interface
- 0007: F1 score, catalog import and JPA/JDBC split

Notable trade-offs made during the build:
- Synchronous `POST /api/scans`, because it is simpler for the MVP; `PROCESSING` status
  exists for a later async version.
- `set-candidates` returns 503 until the first catalog import has finished.
- A pruned 56-color palette, to avoid near-duplicate matches. Rare colors map to their nearest
  common neighbour and are fixed in Review.
- Raw `inventory_parts` rows are folded into `set_part_quantities`. Minifig parts are not
  counted in set totals.

## Verification
[tests/report.md](../tests/report.md): every check group passes, with no open bugs. That
covers 52 backend tests, 71 inference tests, 34 frontend unit tests, 35 contract tests (strict
against the OpenAPI spec and JSON Schema), 2 failure-mode tests, 16 E2E tests (mobile and
desktop) and the compose health checks. One contract bug (`nullable` + `allOf`) was found by
QA and fixed.

The lead ran a final check on the **default** compose with the real Brickognize classifier:
- All 4 services were healthy, and the three URLs answered 200.
- The catalog import SUCCEEDED.
- A scan of `fixtures/images/pile_light_5.jpg` found all 5 pieces and estimated their colors,
  and ranking returned sets.
- `strategy=rarity-weighted` returned 501.

## Known limitations
- The classical detector merges touching pieces and misses pieces close to the background
  color, such as white on white.
- Brickognize classifies synthetic shapes poorly (empty or implausible candidates). Accuracy
  must be judged with **real photos** (manual tests M1–M10 in `tests/test-plan.md` §7).
- Rebrickable API ID mapping is tested only against a mock, because no API key was available.
- WebP uploads are stored without applying EXIF rotation.
- The "find sets" action is disabled when no piece is identified. This is intentional,
  because ranking needs at least one identified part+color.
- Local frontend development needs Node ≥ 22.22.3. Docker builds use Node 24.

## How to run
```bash
cp .env.example .env            # optional: REBRICKABLE_API_KEY
docker compose up --build
```
- App: http://localhost:4200
- API and Swagger UI: http://localhost:8080/swagger-ui.html
- Inference: http://localhost:8000/health

For an offline, deterministic run: `PART_CLASSIFIER=stub` in `.env`. Tests: see
[tests/README.md](../tests/README.md) (`npm run test:all` after `npm run stack:e2e`).

## Next steps for the owner
1. Implement `RarityWeightedRankingStrategy` (see its Javadoc and ADR 0006).
2. Build the synthetic training pipeline (`training/README.md`), then add a YOLO `Detector`
   and a custom `PartClassifier` as config options.
3. Run the manual real-photo tests and add real photos to `fixtures/images/`.
