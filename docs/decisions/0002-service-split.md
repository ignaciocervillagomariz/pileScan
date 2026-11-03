# ADR 0002: Three services (frontend, Java backend, Python inference)

- Status: Accepted; the browser-to-API path refined by [ADR 0008](0008-same-origin-api-behind-nginx.md) (same origin through nginx, no CORS)
- Date: 2026-11-02

## Context
The system mixes three concerns with different ecosystems: UI, transactional domain logic plus
a relational catalog (≈1M inventory rows, ranking queries), and computer vision (OpenCV, later
PyTorch/YOLO).

## Decision
Split into **frontend** (Angular PWA behind nginx), **backend** (Spring Boot + PostgreSQL: scans,
corrections, catalog, part ID mapping, set ranking) and **inference** (FastAPI: detection,
classification, color). Only the backend talks to inference, through a versioned internal
contract (`docs/api/inference-contract.md` + JSON Schema). The public API is specified in
`docs/api/openapi.yaml`, and the frontend client is generated from it.

## Alternatives
- **Single Python service** (FastAPI for everything): fewer moving parts, but it mixes the
  CPU-heavy ML runtime with the transactional API and loses the strong typing and tooling of the
  Java data layer.
- **Single Java service calling OpenCV through JNI/JavaCV:** cuts the Python ML ecosystem off
  from the roadmap (YOLO, PyTorch).
- **Frontend calls inference directly:** leaks the ML contract to the client, and corrections
  and mapping would then live in two places.

## Consequences
- Each service uses the best ecosystem for its job, and each scales and deploys independently
  (the GPU later goes to inference only).
- More integration surface. This is mitigated by contract-first specs, schema validation in QA,
  and one `docker compose up`.
- Synchronous scan creation couples request latency to inference latency. That is acceptable
  for the MVP; the path forward is an async job + polling (`ScanStatus.PROCESSING` already
  exists).
