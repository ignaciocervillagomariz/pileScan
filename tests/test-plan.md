# PileScan test plan

Layers, from cheapest to most integrated. IDs are referenced from report.md.

## 1. Static and contract (no stack needed)
| ID | Check | Command |
| --- | --- | --- |
| S1 | OpenAPI lint (Redocly) | `npm run lint:spec` |
| S2 | OpenAPI validity + unique operationIds (openapi-spec-validator) | `pytest contract/test_spec.py` |
| S3 | Inference JSON schema itself is a valid Draft 2020-12 schema | fixture `inference_validator` |
| S4 | Frontend: no hand-written `/api/` URLs, no raw HttpClient/fetch/axios, no `any` outside the generated client | `npm run test:static` |
| S5 | Frontend generated client has no drift vs openapi.yaml | `npm run check:api` (frontend), run by S4 |

## 2. Service suites (owned by each team)
| ID | Check | Command |
| --- | --- | --- |
| U1 | Backend unit + integration (Testcontainers) | `cd backend && ./mvnw verify` |
| U2 | Inference tests + ruff | `cd inference && uv run pytest` (and `uv run ruff check .`) |
| U3 | Frontend unit tests | `cd frontend && npm test` (headless) |
| U4 | Frontend production build | `cd frontend && npm run build` |

## 3. Live contract (stack up)
Backend (every response validated against openapi.yaml with openapi-core, requests and responses):
createScan (jpeg/png/webp, Location header), getScan, listDetections, getScanImage (dimensions match `image.width/height`),
EXIF orientation applied, bbox inside image, addDetection / updateDetection (partial update, `corrected=true`), deleteDetection
(soft delete, excluded from scan and ranking, second delete 404), 404 / 400 / 413 / 422 / 501 as RFC 9457 `application/problem+json`,
searchParts (exact match first), getPart, listColors (sorted), catalog-import status, unmapped-part-ids,
getSetCandidates (rank order, descending `matchPercent`, limit, missingLimit, coverage math, reflects corrections, 503 while importing).
Inference: `/health`; `/v1/recognize` validated against the JSON schema for jpeg/png/webp/blank; semantics (bbox in image,
sorted candidates, <=3, index sequence); EXIF; `max_detections` truncation warning; `debug` image; 400/413/422 error codes.
Files: `contract/test_backend_contract.py`, `contract/test_inference_contract.py`.

## 4. Docker compose health
| ID | Check |
| --- | --- |
| D1 | `docker compose up --build -d --wait` succeeds, all services healthy |
| D2 | http://localhost:8080/actuator/health UP; http://localhost:8000/health ok; http://localhost:4200 serves the app; http://localhost:8080/swagger-ui.html loads |
| D3 | Catalog import reaches SUCCEEDED (record duration) |
| D4 | Frontend nginx proxies `/api/*` to the backend (same-origin request from :4200 works) |
| D5 | Persistence: scan survives `docker compose restart backend` |

## 5. Non-functional / failure modes
| ID | Check | Where |
| --- | --- | --- |
| N1 | Upload > 15 MB -> 413 problem+json; frontend shows an error | contract + e2e |
| N2 | Non-image / corrupt image -> 400 problem+json, no scan created | contract + e2e |
| N3 | Inference down -> scan FAILED with `errorMessage`, manual add still works | `npm run test:nonfunctional` |
| N4 | Brickognize down -> COMPLETED, detections with empty `partCandidates`, warning present | `npm run test:nonfunctional` |
| N5 | Large pile (25 bricks, 2400x1800) completes within a sane time (record seconds) | contract (pile-medium) |
| N6 | Ranking while catalog importing -> 503 problem+json (first start only, manual observation) | manual/D3 |
| N7 | Frontend loads over plain HTTP on mobile viewport, service worker registered, manifest valid (installable) | e2e/manual |

## 6. End-to-end (Playwright, mobile Pixel 7 + desktop Chrome; stub classifier stack)
Flow: open app -> pick file -> analyzing state -> review shows canvas + detection list -> edit part (search 3001, exact match) ->
edit color (Red) -> delete a piece -> add a missed piece -> totals update -> see results -> up to 5 set cards with `%` and missing parts ->
empty state when no pieces -> invalid file shows error -> reload keeps the scan. Selectors: `e2e/testids.ts`.
One best-effort smoke with real Brickognize (`-m real_brickognize`), SKIPPED when unreachable.

## 7. Manual tests (human, real photos)
1. 10-20 mixed pieces on a plain table, daylight: detection count vs real count; note misses and false positives.
2. Same pile, warm indoor light and with shadows: color accuracy (red vs dark red, tan vs white).
3. Pieces touching or overlapping: do merged regions get split or flagged?
4. Large pile (80+ pieces): time to result, UX during the wait, detection cap warning.
5. Phone camera portrait vs landscape: boxes align with pieces (EXIF), on iOS Safari and Android Chrome.
6. Install as PWA, offline launch shell, camera permission denied path.
7. Transparent and printed pieces, tiny pieces (1x1 round plate), dark pieces on dark table.
8. Correction flow on a touch screen: tap targets, part search usability.
9. Results plausibility: build a known set partially, check it ranks in the top 5.
10. Real Brickognize accuracy and rate-limit behaviour (many scans in a row).
