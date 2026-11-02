# PileScan — project rules

At the start of a session, read .claude/handoff/README.md if it exists.

PileScan (working title) is a mobile-first PWA. The user photographs loose toy bricks spread on
a table. The app detects and counts every piece (part + color), lets the user correct mistakes,
and ranks the official sets the pieces most likely come from, with match % and missing parts.
It is a **portfolio project**: code quality, clear architecture and documented decisions matter
more than feature count.

## Stack (versions checked on 2026-11-02; re-check official docs before relying on any API)

| Area | Stack |
| --- | --- |
| frontend | Angular 22 (standalone components, signals), Ionic 9, Capacitor 8 Camera, PWA (service worker), TypeScript strict. API client generated from `docs/api/openapi.yaml`. |
| backend | Java 21, Spring Boot 4.1.x, Spring Data JPA, Flyway, PostgreSQL 17, Maven wrapper, springdoc-openapi (Swagger UI), Testcontainers. |
| inference | Python 3.12+, FastAPI, uv, pydantic v2, OpenCV (headless), numpy, httpx. CPU only. |
| training | README only (the human owner builds it). |
| tests | Playwright (E2E), contract checks, QA report. |
| infra | `docker compose up`: postgres, backend :8080, inference :8000, frontend :4200. |

## Folder ownership (strict: only edit your own directory)

| Path | Owner |
| --- | --- |
| `/frontend` | frontend |
| `/backend` | backend |
| `/inference`, `/training` | vision |
| `/tests` | qa |
| `/docs`, `/fixtures`, `CLAUDE.md`, `README.md`, `docker-compose.yml`, `.env.example`, `.gitignore` | team-lead |

- **Contracts live in `docs/api/`** and are owned by the team lead. If you need a contract
  change, message `team-lead` with the proposed change and the reason. Do not work around the
  contract. The lead updates `docs/api/` and notifies everyone.
- Need something in `docker-compose.yml` (env var, port, volume)? Message `team-lead`.
- Fixture images: QA and vision may propose files for `fixtures/images/`. Send the path and
  the team lead adds it, or generate them under your own directory.

## Contracts
- Public API: `docs/api/openapi.yaml` (camelCase JSON, RFC 9457 problem details for errors).
- Inference API: `docs/api/inference-contract.md` + `docs/api/inference-response.schema.json`
  (snake_case JSON).
- Architecture: `docs/architecture.md`.

## Ground rules
1. Only edit your own directory (see table above).
2. Check library versions and external APIs against **official docs**, not memory.
3. **No secrets in git.** Read secrets from env (`REBRICKABLE_API_KEY` etc.). Only
   `.env.example` is committed, never `.env`.
4. **Small commits** with Conventional Commits:
   `feat(backend): add coverage ranking strategy`, `fix(inference): ...`, `test(qa): ...`,
   `docs: ...`, `chore: ...`, `build: ...`. Scopes: `frontend`, `backend`, `inference`,
   `training`, `tests`, `docs`, `infra`. Commit only files in your own directory
   (`git add <your-dir>`, never `git add -A`).
5. **MVP scope only.** No auth or user accounts (anonymous scans by UUID), no model training,
   no generative builds, no 3D scanning.
6. **Reserved for the human owner. Do not implement:** `RarityWeightedRankingStrategy` (stub +
   docs only) and the training pipeline (`/training/README.md` only).
7. Do not use the LEGO name or logo in the product UI. Credit Rebrickable and Brickognize and
   show a trademark disclaimer.
8. Be respectful of free external services (Brickognize, Rebrickable): limit concurrency, use
   backoff, cache results.

## Coding conventions
- **General:** small focused modules, clear names, no dead code, no commented-out code. Comment
  the *why*, not the *what*. Every service exposes a health endpoint and reads all config from
  env vars with sane defaults.
- **Java:** package `com.pilescan`, organized by feature (`scan`, `catalog`, `ranking`,
  `inference`, `partmapping`, `importer`). Constructor injection, records for DTOs, no Lombok.
  Controllers stay thin, logic lives in services. Use Flyway for all schema changes (never
  `ddl-auto=update`).
- **Python:** `ruff` + type hints everywhere, pydantic v2 models, `Protocol`-based interfaces,
  `pytest`. Async I/O with httpx.
- **TypeScript:** strict mode, standalone components, signals, no `any`. Calls go through the
  generated API client only. Never hand-write endpoint URLs.
- **Tests:** every service has a test suite runnable with one command, documented in its
  README.

## Team (agent team "pilescan")
`team-lead` (integration, contracts, docs), `frontend`, `backend`, `vision`, `qa`.
Workflow: send your plan to `team-lead` and wait for approval before writing code. Report
completion to `qa` (with files and run steps) and to `team-lead`.
