# QA report, sprint 2

Code under test (historical, at run time): main at 9e8eea6 plus uncommitted work of other agents in the tree at run time (integration backend/frontend 1.1.0, vision opencv-lab-v2).
**Final re-verification:** team-lead rebuilt the default stack at the committed HEAD 81c4c35 (clean tree, all integration and vision work committed); the contract suite gave 50 passed / 1 skipped.

Stack: docker compose with `tests/compose.e2e.yml` (stub classifier) for suites; default config (Brickognize) for the real-classifier checks.

| Id | Suite | Result | Notes |
|---|---|---|---|
| S1 | `lint:spec` (redocly, openapi 1.1.0) | PASS | 6 warnings, no errors |
| S2 | `test:static` + `check:api` (generated client in sync) | PASS | |
| C1 | Contract: public API, strict 1.1.0 (`classificationStatus`, `debugImageUrl`, `GET /debug-image`, `inferenceTimingsMs`) | PASS | new `test_contract_110.py` |
| C2 | Contract: inference 1.1.0 (`contract_version`, `timings_ms.preprocess`, `classification_status`, AVIF input) | PASS | |
| C3 | Real Brickognize smoke (`-m real_brickognize`) | PASS | run on the default config with internet |
| C4 | Contract total, stub config | PASS | 48 passed, 1 skipped (C3 on stub), then 49 passed on default config |
| H1 | 403 regression: POST /api/scans via nginx on `localhost:4200` and `127.0.0.1:4200`, with and without Origin | PASS | 4 cases, all 201 |
| H2 | Same on the LAN IP | SKIPPED | the auto-mode permission classifier denied `BIND_ADDRESS=0.0.0.0`. integration verified <LAN-IP>:4200 itself (201 with matching Origin). The test is in place: `EXTRA_HOSTS=http://<ip>:4200 pytest contract/test_contract_110.py` |
| N | Failure modes (inference down, Brickognize down) | PASS | 2 tests |
| E1 | E2E, Pixel 7 and desktop (existing 16 tests) | PASS | |
| E2 | E2E new states: loading, 500 error banner with retry, network failure, zero detections + debug toggle, client downscale (stored image long side <= 2048, aspect 4:3) | PASS | `states.spec.ts`, 5 tests x 3 projects |
| E3 | E2E project `loopback-ip` (baseURL `http://127.0.0.1:4200`): flow and states | PASS | 10 tests |
| U1 | Backend `./mvnw verify` | PASS | |
| U2 | Inference `uv run pytest` | PASS | 92 passed, 1 xfailed |
| U3 | Frontend unit (node:24 Docker) | PASS | 39 tests |
| U4 | Eval unit tests | PASS | 5 tests |
| M | Manual real-photo tests (M1 to M10) | SKIPPED | replaced by the eval; no labels yet |

Total E2E: 36 passed.

## Notes and findings

No bugs opened this sprint. Two observations, neither blocking:

1. **Debug overlay size (RESOLVED in 81c4c35 by a spec change: the overlay keeps the aspect ratio and may be downscaled; it is not a coordinate reference, so the relaxed test is the specified behaviour).** `openapi.yaml` says the debug image is "in the same pixel space as the scan image", but v2 returns it at its 1280 px working size (a 1600x1200 photo gives a 1280x960 overlay). The aspect ratio is the same, so a CSS-scaled `<img>` is fine. My test only checks aspect ratio and size not larger than the scan. Either the doc or the service should say so (owners: integration for the spec text, vision for the service).
2. **The `debug-toggle` only exists on the zero-detections card**, not on normal scans (by design per the template, so the E2E covers it there only).
3. Playwright `page.route` does not see requests made through the service worker. The state tests use `serviceWorkers: 'block'`.

## Eval summary (details: `docs/eval/baseline.md`)

- Accuracy metrics (count MAE, part/color precision and recall, set ranking) are **not available**: the owner's `counts.csv`, `ground-truth.csv` and `sets.csv` are still empty. The harness recomputes them from cache once filled.
- Detector v1 to v2 (stub classifier): v1 found 0 detections on 3 of 14 real photos (one is the OOD banner) and 1 on 3 others; v2 finds 3 to 114 per photo. Mean inference total 219 ms to 137 ms, API POST mean 169 ms. Synthetic set is 5/5 exact before and after.
- v2 over-segments (ruler, bag, text, merged boxes); whether it over- or under-counts needs ground truth.
- The same photo gives different counts raw vs re-encoded JPEG q90 (about 5 to 10 %).
- Brickognize on 3 photos: classify mean 3.1 s (v1: 0.27 s, but it only found 2 to 5 crops); API POST mean 3.0 s, set-candidates 96 ms.
