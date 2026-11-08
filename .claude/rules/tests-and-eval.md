---
paths:
  - "tests/**"
  - "eval/**"
  - "fixtures/**"
  - "docs/eval/**"
---

# Tests and eval

- E2E runs on the stub classifier (`tests/compose.e2e.yml`) for determinism. Assert robust
  facts (at least one detection, flows work, cards render), never exact part IDs.
- Wait for `GET /api/admin/catalog-import` to report `SUCCEEDED` before ranking assertions.
- Ionic keeps the previous page in the DOM, so test ids can appear twice: use `.last()`.
- Playwright `page.route` misses service-worker requests: keep `serviceWorkers: 'block'`.
- The failure-mode tests recreate the inference container. Announce it and don't run them while
  another agent uses the stack.
- Eval metrics are recomputed from `eval/out/<label>/`, so editing the ground-truth CSVs needs
  no re-run. Label runs `<before|after>-<stub|bkg>` (or a descriptive name). Part metrics only
  make sense through the API path with the real classifier.
- `fixtures/real/` photos are third-party images: git-ignored, never commit them.
  `docs/eval/img/` stays ignored until image rights are confirmed. Never invent labels.
- LAN checks need the human's OK (see team-workflow). Keep fixture images small.
