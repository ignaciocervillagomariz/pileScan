# PileScan tests

QA harness: contract validation, static checks, failure-mode checks and Playwright E2E.
Strategy and the full check list are in [test-plan.md](test-plan.md); results in [report.md](report.md) (written in Phase B).

## One-time setup
```bash
cd tests
npm run setup        # node deps, Playwright Chromium, Python venv (.venv)
npm run fixtures     # synthetic images -> fixtures/generated (git-ignored)
```
Requires Node 22+, Python 3.12+, Docker.

## Stack for tests
```bash
cp ../.env.example ../.env          # if missing; never commit .env
npm run stack:e2e                   # compose + stub part classifier (deterministic, offline)
npm run stack:down
```
First start imports the Rebrickable catalog and can take a while: `GET :8080/api/admin/catalog-import` must report `SUCCEEDED`
before ranking works (503 until then). Suites that need it wait automatically (`CATALOG_WAIT_S`, default 1800).

## Suites (one command each)
| Suite | Command | Needs stack |
| --- | --- | --- |
| OpenAPI lint | `npm run lint:spec` | no |
| Frontend generated-client static check | `npm run test:static` | no |
| Contract: spec validity, live backend vs OpenAPI, live inference vs JSON schema | `npm run test:contract` | yes |
| Failure modes (stops/restarts containers) | `npm run test:nonfunctional` | yes (e2e stack) |
| E2E capture -> review/correct -> results (mobile + desktop) | `npm run test:e2e` | yes (e2e stack) |
| All of the above, with summary | `npm run test:all` | yes |

Env overrides: `BACKEND_URL`, `INFERENCE_URL`, `FRONTEND_URL`, `CATALOG_WAIT_S`, `GEN_DIR` (static check).

Service suites are run from their own dirs: `backend/ ./mvnw verify`, `inference/ uv run pytest`, frontend unit tests and build (see their READMEs).

## Notes
- E2E selectors come only from `e2e/testids.ts`.
- Synthetic fixtures give unreliable Brickognize output, so E2E assertions are structural (>=1 detection, editing works, results render), never exact part IDs. The stub classifier makes E2E deterministic.
