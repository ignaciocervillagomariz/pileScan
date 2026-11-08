---
paths:
  - "docs/api/**"
---

# API contracts

- Change contracts only through `/change-contract` (team-lead). Every change bumps
  `info.version` (additive = minor, breaking = major) and is announced to frontend, backend,
  vision and qa.
- OpenAPI 3.0.3: `nullable: true` next to `allOf` or `$ref` does **not** allow `null`. Use
  dedicated `Nullable*` schemas (BUG-1, sprint 1).
- A nullable enum must also list `null` inside `enum`.
- Keep URLs in responses relative (`Location`, image and debug URLs). That is what makes the
  API work behind nginx, a LAN IP or a tunnel without knowing the host (ADR 0008).
- Documented non-200s that clients rely on: `503` from set-candidates until the first catalog
  import succeeds, `501` for `strategy=rarity-weighted` (reserved for the owner).
- Lint: `cd tests && npm run lint:spec`. The inference schema
  `docs/api/inference-response.schema.json` must stay in sync with the pydantic models; the
  inference schema-drift test checks it.
