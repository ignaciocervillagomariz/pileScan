# PileScan

> Working title. Photograph a pile of loose toy bricks and find out which official sets they
> came from.

PileScan is a mobile-first web app (installable PWA). You spread your pieces on a table and
take a photo. The app then:

1. **detects and counts** every piece and identifies its **part** and **color**,
2. lets you **review and correct** the result (fix part or color, delete false positives, add
   missed pieces),
3. **ranks the official sets** the pieces most likely come from, with match %, coverage
   metrics and the list of missing parts.

It is a portfolio project, built with a focus on clean architecture, explicit contracts and
documented decisions rather than feature count.

## Screenshots

| Capture | Review | Results |
| --- | --- | --- |
| _screenshot placeholder_ | _screenshot placeholder_ | _screenshot placeholder_ |

## Architecture

```
frontend (Angular + Ionic PWA, :4200) ──/api──► backend (Spring Boot, :8080) ──► inference (FastAPI, :8000)
                                                      │                              │
                                                 PostgreSQL                  Brickognize API
                                          (Rebrickable catalog, scans)       (part recognition)
```

| Service | Stack | Responsibility |
| --- | --- | --- |
| `frontend/` | Angular, Ionic, Capacitor Camera, PWA | Capture, review/correct, results. API client generated from OpenAPI. |
| `backend/` | Java 21, Spring Boot, JPA, Flyway, PostgreSQL | Scans, corrections, Rebrickable catalog import, part-ID mapping, set ranking. |
| `inference/` | Python 3.12, FastAPI, OpenCV, uv | Swappable pipeline: detector → part classifier → color estimator. |
| `training/` | (planned) | Synthetic-data pipeline for our own detector/classifier. |
| `tests/` | Playwright, pytest | Contract, service and end-to-end tests, plus the QA report. |

More detail:
- [docs/architecture.md](docs/architecture.md): system overview and request flow
- [docs/api/openapi.yaml](docs/api/openapi.yaml): public API (Swagger UI at http://localhost:8080/swagger-ui.html)
- [docs/api/inference-contract.md](docs/api/inference-contract.md): internal inference contract + JSON Schema
- [docs/decisions/](docs/decisions/): architecture decision records
- [docs/build-summary.md](docs/build-summary.md): what was built and how
- [tests/report.md](tests/report.md): QA report

## Quick start

Requirements: Docker (with Compose v2).

```bash
cp .env.example .env          # optional: add REBRICKABLE_API_KEY for better part-ID mapping
docker compose up --build
```

| URL | What |
| --- | --- |
| http://localhost:4200 | the app |
| http://localhost:8080/swagger-ui.html | API docs (Swagger UI) |
| http://localhost:8000/health | inference service health |

On first start the backend downloads and imports the Rebrickable catalog CSVs. This takes a few
minutes, and set ranking returns `503` until it finishes. Check progress at
`GET http://localhost:8080/api/admin/catalog-import`.

**Offline / deterministic mode:** set `PART_CLASSIFIER=stub` in `.env` to skip the Brickognize
API (fixed, geometry-based part guesses). The end-to-end tests use this mode.

**Configuration:** every setting has a default. The common ones are in `.env.example`. Optional
tuning variables:

| Variable | Service | Default | Purpose |
| --- | --- | --- | --- |
| `INFERENCE_TIMEOUT_SECONDS` | backend | 120 | Read timeout for `POST /v1/recognize` |
| `REBRICKABLE_API_URL` | backend | https://rebrickable.com | Rebrickable API base (part-ID mapping) |
| `REBRICKABLE_MIN_INTERVAL_MS` | backend | 1100 | Minimum spacing between Rebrickable API calls |
| `CATALOG_CACHE_DIR` | backend | /data/catalog | Cache for the downloaded CSVs (ETag revalidation) |
| `CATALOG_MAX_AGE_DAYS` | backend | 30 | Re-import on startup when the catalog is older than this |
| `BRICKOGNIZE_MAX_RETRIES` / `BRICKOGNIZE_TIMEOUT_S` | inference | see inference README | Retry/backoff tuning |
| `MAX_IMAGE_BYTES` | inference | 15 MB | Upload limit |
| `BIND_ADDRESS` | compose | 127.0.0.1 | Host interface for published ports. Use `0.0.0.0` only to test from a phone on a trusted LAN (the API has no auth) |

`CATALOG_BASE_URL` also accepts a `file:` URL that points at small CSVs, for a fast startup (see
`backend/README.md`).

**Photo tips:** use a plain background that contrasts with the pieces, keep pieces from
touching or overlapping, shoot straight down, and use even light.

## Development

Each service has its own README with local run and test commands:
[frontend](frontend/README.md) · [backend](backend/README.md) · [inference](inference/README.md) · [tests](tests/README.md).

Conventions (folder ownership, Conventional Commits, contract-first workflow) are in
[CLAUDE.md](CLAUDE.md).

## Roadmap

1. **Own detector trained on synthetic data.** Blender + LDraw renders with domain
   randomization, fine-tuned on real photos (see [training/README.md](training/README.md)).
   Plugs into the `Detector` / `PartClassifier` interfaces as a config change.
2. **Rarity-weighted ranking.** TF-IDF-style weighting where rare part+color combinations
   count more (`RarityWeightedRankingStrategy`, currently a documented stub).
3. **Inventory-constrained generation of new builds.** Suggest models you can build with
   exactly the pieces you own.
4. **3D-scan-to-bricks creator.** Turn a 3D scan of an object into a buildable brick model.

Explicitly out of MVP scope: accounts/auth, model training, generative builds, 3D scanning.

## Credits and disclaimer

- Catalog data: [Rebrickable](https://rebrickable.com/), used under the terms of their
  downloads and API.
- Part recognition: [Brickognize](https://brickognize.com/).

LEGO® is a trademark of the LEGO Group, which does not sponsor, authorize or endorse this
project. PileScan is an independent, non-commercial portfolio project.
