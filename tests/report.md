# PileScan QA report

Date: 2026-11-02. Stack: `docker compose -f docker-compose.yml -f tests/compose.e2e.yml up --build -d --wait`
(stub part classifier, real Rebrickable catalog). Commit under test: main at the time of the run.

## Summary
| Result | Count |
| --- | --- |
| PASS | 14 check groups (see table), 0 failures open |
| FAIL | 0 open (1 found and fixed during the run: BUG-1) |
| SKIPPED | 2 (real Brickognize smoke; manual real-photo tests) |

## Checks
| ID | Check | Command | Result | Notes |
| --- | --- | --- | --- | --- |
| S1 | OpenAPI lint | `npm run lint:spec` | PASS | 6 warnings (`operation-4xx-response`), no errors |
| S2 | Spec validity, unique operationIds, no `nullable`+`allOf` | `pytest contract/test_spec.py` | PASS | the nullable check failed before spec commit 03b3468 (BUG-1) |
| S4 | Frontend: no hand-written `/api/` URLs, no HttpClient/fetch/XHR/axios, no `any` outside generated client | `npm run test:static` | PASS | Allowlist: `fetch(photo.webPath)` in `photo-source.service.ts`, it fetches the camera plugin's local blob/file URL to build a Blob, not an API call. Any other fetch fails the check |
| S5 | Generated client in sync with openapi.yaml | `cd frontend && npm run check:api` (run by S4) | PASS | |
| U1 | Backend unit + IT | `cd backend && ./mvnw verify` | PASS | 52 tests (31 unit, 21 Testcontainers IT) |
| U2 | Inference tests + lint | `cd inference && uv run pytest && uv run ruff check .` | PASS | 71 tests |
| U3 | Frontend unit tests | `npm test` | PASS | 34 tests. Run in `node:24` Docker image because the local Node 22.16 is below Angular's minimum (22.22.3); not a project bug |
| U4 | Frontend production build | `docker compose build frontend` (multi-stage) | PASS | built as part of the compose build |
| D1 | Compose up, all services healthy | `npm run stack:e2e` | PASS | |
| D2 | Health endpoints | curl | PASS | :8080/actuator/health 200, :8000/health 200, :4200 200, swagger-ui.html 302 to UI, :4200/api/colors 200 (nginx proxy works, D4) |
| D3 | Catalog import | `GET /api/admin/catalog-import` | PASS | SUCCEEDED in about 17 s (28,561 sets, 1.57 M inventory_parts) |
| D5 | Scan persists across backend restart | `docker compose restart backend`, then GET scan | PASS | 200 |
| C1 | Live backend vs openapi.yaml (strict, requests and responses) | `npm run test:contract` | PASS | 20 tests: scans (jpeg/png/webp), EXIF, image dims, bbox bounds, add/update/delete, soft delete, 400/404/413/422/501 as problem+json, parts, colors, catalog status, ranking order/limits/math, ranking reflects corrections |
| C2 | Live inference vs JSON schema | same | PASS | 13 tests (1 skipped, C3) incl. manifest piece counts (within +-1), EXIF, max_detections warning, debug image, 400/413/422 |
| C3 | Real Brickognize smoke | `pytest -m real_brickognize` | SKIPPED | stack ran the stub classifier. Run with `PART_CLASSIFIER=brickognize` and internet |
| N1-N2 | Oversize -> 413, non-image/corrupt -> 400 (API and UI error) | contract + e2e | PASS | |
| N3 | Inference down -> FAILED scan with errorMessage, manual add works | `npm run test:nonfunctional` | PASS | |
| N4 | Brickognize down -> COMPLETED, empty partCandidates, warning | `npm run test:nonfunctional` | PASS | |
| N7 | PWA: manifest and `ngsw.json` served | curl | PASS | install prompt and offline shell are manual (M6) |
| E1 | E2E: capture -> preview -> upload -> review, footer disclaimer | `npm run test:e2e` | PASS | mobile (Pixel 7) and desktop |
| E2 | E2E: edit part + color, delete, add, then results (<=5 cards, `%`, missing parts toggle) | same | PASS | mobile + desktop |
| E3 | E2E: canvas tap opens editor for that detection (`data-selected-detection`), delete and edit persist in backend | same | PASS | |
| E4 | E2E: multi-piece group expands, `data-highlighted-detections` set, row opens dialog | same | PASS | |
| E5 | E2E: all pieces deleted -> ranking link `aria-disabled`; `/results` route shows empty state | same | PASS | |
| E6 | E2E: invalid image shows error; reload keeps scan | same | PASS | |

E2E total: 16 tests (8 per project), all passed. Contract: 35 passed, 1 skipped. Failure modes: 2 passed.

## Bugs
| ID | Owner | Status | Description |
| --- | --- | --- | --- |
| BUG-1 | team-lead | FIXED, verified | openapi.yaml combined `nullable: true` with `allOf: [$ref]` (Detection.bbox/part/color, PieceGroup.part/color, DetectionCreate.bbox). Strict OAS 3.0 validators reject the `null` the backend correctly returns. Fixed in 03b3468; strict validation now passes |

No open bugs.

## Observations (not bugs)
- The "find sets" link is an `<a>` with `aria-disabled` and no href when no piece is identified, so the empty results state is only reachable by URL.
- Backend stores WebP without applying EXIF rotation (documented by backend; WebP rarely carries EXIF).
- Ionic keeps the previous page in the DOM, so footer test ids appear twice during transitions. Tests use `.last()`.
- With the stub classifier and no `REBRICKABLE_API_KEY`, only stub IDs present in the catalog become identified pieces. ID mapping through the Rebrickable API is untested.

## Manual tests for the human (real photos)
See `tests/test-plan.md` section 7 (M1-M10): real piece counts vs detections, lighting and color accuracy, touching pieces, large piles (80+), phone portrait/landscape EXIF on iOS Safari and Android Chrome, PWA install and permission denial, transparent/tiny/dark pieces, touch usability of the correction flow, ranking plausibility with a known set, real Brickognize accuracy and rate limits (also run C3, and the Rebrickable ID-mapping path with a real `REBRICKABLE_API_KEY`).

## Reproduce
`cd tests && npm run setup && npm run fixtures && npm run stack:e2e && npm run test:all && npm run test:nonfunctional`
