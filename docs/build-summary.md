# Build summary

What was built for the PileScan MVP, how it was built, and how to run it. Date: 2026-11-02.

## Home hero (single session, 2026-11-08 to 2026-11-16)
An interactive 3D home page, built by one frontend session on `feat/home-hero` without a team.
Spec and every decision: [docs/specs/home-hero.md](specs/home-hero.md).

- **What:** about 35 bricks (about 15 on phones) cascade onto a table. three r187 renders them
  and Rapier 0.21 runs the physics, in a chunk loaded after first paint. Three tools sit in a
  dock: the Glove carries, rotates (wheel and R), snaps and stacks bricks; Push sweeps them;
  the Separator pops stacks apart. Esc returns to the Glove, and replay drops the bricks again.
- **Routes:** `/` is home and `/scan` is capture. The manifest's `start_url` is `/scan`.
- **Robustness:** quality tiers, render on demand, and a pause when off-screen or hidden. A static
  surface replaces the scene without hardware WebGL2, on slow or metered connections and on
  low tiers. With reduced motion the bricks appear already settled. The scene is released when
  the page is left, and when its start fails.
- **Debuggability:** a build stamp in the console, and a `?debug=1` overlay with state, tier,
  fps, tool, pointer, hover, carry and element under the pointer.
- **Verification:** 177 frontend unit tests (real Rapier through the `-compat` build), hero E2E
  in GPU projects (17 pass, 5 skip by design) and a green full E2E suite (53). Lighthouse on
  home: mobile 85, desktop 99, accessibility 100. A code-reviewer pass found no blockers and
  one major, now fixed.
- **Lesson:** the owner once saw an old build because `docker compose up` ran without
  `--build`. Every check now starts from the build stamp on the URL the owner uses.
- **Open:** Rapier's wasm is 1.17 MB gzip. Minor review findings are in the frontend handoff.

## Sprint 2 (2026-11-03): real photos and a baseline

Goal: make the app work end to end on real photos and measure a baseline, with no visual
redesign. Team: `integration` (backend + frontend), `vision` (inference) and `qa` (tests +
eval). Plans were approved before any code was written, and contracts went through the lead.

**Fixed**
- **403 on `POST /api/scans` from `http://127.0.0.1:4200`.** Diagnosed with evidence first:
  through nginx, no `Origin` → 201, `Origin: localhost:4200` → 201,
  `Origin: 127.0.0.1:4200` → 403 "Invalid CORS request", and the backend logs nothing.
  Cause: nginx forwarded `Host $host`, which drops the port, so Spring treated a same-origin
  request as cross-origin and fell back to a hard-coded allow-list. Fix: nginx forwards
  `Host $http_host` and overwrites `X-Forwarded-*`, Spring trusts the forwarded headers, and
  all CORS config and `CORS_ALLOWED_ORIGINS` are removed. Verified as 201 on localhost,
  127.0.0.1, the LAN IP and a simulated Tailscale host. Regression ITs and an E2E project at
  `127.0.0.1` were added. See [ADR 0008](decisions/0008-same-origin-api-behind-nginx.md).
- **Zero detections on real photos.** The root cause came from intermediate masks: the
  threshold was always clamped at 8 ΔE, so textured or shadowed backgrounds flooded the mask
  (36–79% "foreground"), and a large closing kernel fused the pile into one blob that the
  max-area filter then dropped. Decoding was ruled out (Pillow 13 reads AVIF and WebP). The
  new `opencv-lab-v2` normalizes to a 1280 px long side (upscaling thumbnails to at least
  640 px), models the background with a flat field in LAB, suppresses shadows, uses an
  adaptive threshold with a noise floor and small morphology, and splits oversized blobs
  instead of dropping them. All parameters are set by env vars. See
  [ADR 0009](decisions/0009-detector-preprocessing.md).

**Added**
- Inference contract 1.1.0 adds per-detection `classification_status` (a classifier failure
  never removes a detection), `timings_ms.preprocess`, HEIC/AVIF input, alpha flattened onto
  white, and JSON stage logs (including `median_area_fraction` to spot fragmentation).
- Public API 1.1.0 adds `Detection.classificationStatus`, `Scan.debugImageUrl` with
  `GET /api/scans/{id}/debug-image`, and `Scan.inferenceTimingsMs`.
- Frontend:
  - clear error messages
  - a staged loading state with elapsed time (no Cancel, because the server would finish
    anyway)
  - a zero-detections state with tips and a debug-overlay toggle
  - a warning when classification failed for some pieces
  - client-side downscale to 2048 px (EXIF-aware, alpha on white)
- [docs/phone-testing.md](phone-testing.md) covers LAN, `tailscale serve` and Cloudflare quick
  tunnels, and why the camera needs a secure context.
- An `/eval` harness and [docs/eval/baseline.md](eval/baseline.md). Ground-truth templates are
  in `fixtures/real/` (the photos are git-ignored).

**Baseline (detector comparison only; accuracy needs the owner's labels)**

| | v1 (before) | v2 (after) |
| --- | --- | --- |
| real photos with 0 detections | 3 of 14 (1 is the OOD banner) | 0 |
| detections per pile photo | 0–10 | 3–114 |
| inference total, mean (stub) | 219 ms | 137 ms |
| synthetic sanity set | 5/5 exact | 5/5 exact |
| Brickognize classify, mean (3 photos) | – | 3.1 s per photo |

v2 finds pieces where v1 found nothing, but it **over-segments**: rulers, bags, printed text
and shadows show up as detections, and some boxes merge several pieces. Count MAE, part and
color precision/recall, and set top-1/top-5 are empty until `fixtures/real/counts.csv` (and
optionally `ground-truth.csv` and `sets.csv`) are filled. Then run
`cd eval && uv run pilescan-eval report before-stub after-stub` with no re-run.

**Verification:** [tests/report-sprint2.md](../tests/report-sprint2.md). Every suite passes:
- contract 49–50 (strict 1.1.0)
- E2E 36/36, including the new states and the `127.0.0.1` project
- backend `./mvnw verify`
- inference 92 (+1 xfail)
- frontend 39 and eval 5

The lead re-ran the contract suite at the committed HEAD on the default config: 50 passed,
1 skipped. The LAN host was verified by integration. QA's LAN run was skipped because the
permission classifier correctly blocked `BIND_ADDRESS=0.0.0.0`.

**Still open**
- Real phone photos and labels: the 14 eval photos are third-party web images, and no
  accuracy numbers exist yet.
- Over-segmentation (false positives on non-brick objects). Low-contrast pieces (white or
  light grey on light backgrounds) are still missed, recorded as a strict xfail.
- With Brickognize, dense piles take several seconds (about 80 crops), which argues for an
  async scan flow.
- Not verified: a browser click-through on a physical phone, and a real Tailscale or
  Cloudflare tunnel (none were started). Whether `tailscale serve` sets `X-Forwarded-Proto`
  is unknown; it's harmless because the API returns relative URLs.

## Sprint 1 (2026-11-02): how it was built
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
- 0008: same-origin API behind nginx, no CORS (sprint 2)
- 0009: detector preprocessing, `opencv-lab-v2` (sprint 2)

Notable trade-offs made during the build:
- Synchronous `POST /api/scans`, because it is simpler for the MVP; `PROCESSING` status
  exists for a later async version.
- `set-candidates` returns 503 until the first catalog import has finished.
- A pruned 56-color palette, to avoid near-duplicate matches. Rare colors map to their nearest
  common neighbour and are fixed in Review.
- Raw `inventory_parts` rows are folded into `set_part_quantities`. Minifig parts are not
  counted in set totals.

## Verification
[tests/report.md](../tests/report.md): every check group passes, with **0 open bugs**. That
covers 53 backend tests, 71 inference tests, 34 frontend unit tests, 35 contract tests (strict
against the OpenAPI spec and JSON Schema), 16 E2E tests (mobile and desktop), the compose
health checks and the failure-mode suite (10/10 consecutive runs). Skipped: the
real-Brickognize smoke test (the E2E stack uses the stub) and the manual real-photo tests.

Bugs found and fixed during integration:
- **BUG-1 (contract):** `nullable` next to `allOf` is invalid under OAS 3.0.3, so strict
  validators rejected `null` boxes and parts. Fixed with dedicated `Nullable*` schemas.
- **BUG-2 (backend):** the first scans after the inference container restarted failed for
  about 10 s. Root cause: the JVM **negative DNS cache**. While inference was stopped, Docker
  DNS answered NXDOMAIN, and JDK 21's `java.security` caches that for 10 s, overriding the
  `-Dsun.net.inetaddr.negative.ttl` flag. Fixed by setting the security property
  `networkaddress.cache.negative.ttl=0` at startup, plus a single 1 s retry on transport
  errors. A first fix that only retried did not help, and QA caught it.
- **Exposure (infra):** published ports were bound to all interfaces. The inference service is
  internal and the API has no auth, so ports now bind to `127.0.0.1` by default
  (`BIND_ADDRESS` opts in to LAN access). QA had reported requests from an external IP in the
  inference logs. That was not reproduced, because the logs had rotated.

The lead ran a final check on the **default** compose with the real Brickognize classifier:
- All 4 services were healthy, with ports on 127.0.0.1, and the three URLs answered 200.
- The catalog import SUCCEEDED.
- Scans of `pile_light_5.jpg` (5 pieces) and `pile_dark_8.jpg` (8 pieces) found every piece.
- Ranking returned sets with both metrics, and `strategy=rarity-weighted` returned 501.

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
- With Brickognize unreachable, a scan takes 9–13 s because of per-crop retries before giving up.

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
3. Fill `fixtures/real/counts.csv` (and optionally `ground-truth.csv` and `sets.csv`), then
   run `cd eval && uv run pilescan-eval report before-stub after-stub` to get the first
   accuracy numbers (no re-run needed).
4. Take 10–20 real **phone** photos (plain and textured backgrounds), add them with labels,
   and re-run the eval. The current photos are web images.
5. Try the app on a phone over `tailscale serve` (docs/phone-testing.md).
