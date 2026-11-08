---
name: change-contract
description: Change a PileScan API contract (public OpenAPI or inference schema) safely - review the request, edit, version, lint, commit and notify every affected teammate. Use whenever a teammate asks for a contract change.
argument-hint: "[what to change and why]"
---

# Change a contract

Only `team-lead` edits `docs/api/`. Request: $ARGUMENTS

1. **Decide.** Is the change needed, or can the caller adapt? Check the ADRs it touches
   (`docs/decisions/`). Prefer additive changes; a breaking change needs the human's OK.
2. **Edit** the source of truth:
   - Public API: `docs/api/openapi.yaml` (camelCase, RFC 9457 errors).
   - Inference: `docs/api/inference-contract.md` **and**
     `docs/api/inference-response.schema.json` (snake_case). Keep both in sync.
   Follow `.claude/rules/api-contracts.md` (nullable schemas, relative URLs).
3. **Version:** bump `info.version` / the contract version. Additive = minor, breaking = major.
4. **Validate:** `cd tests && npm run lint:spec`, and parse the JSON Schema
   (`python3 -m json.tool docs/api/inference-response.schema.json > /dev/null`).
5. **Commit:** `docs(api): <change> (vX.Y.Z)` with explicit paths.
6. **Notify** each affected teammate with the commit hash and what they must do:
   - frontend: `npm run generate:api && npm run check:api`, then adapt.
   - backend: DTOs, controllers, migrations if needed.
   - vision: pydantic models (the schema-drift test must pass).
   - qa: contract tests.
7. **ADR** if the change alters the architecture or a past decision.
