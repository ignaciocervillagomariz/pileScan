---
paths:
  - "frontend/**"
---

# Frontend (Angular + Ionic PWA)

- Node: `^22.22.3 || >=24.15.0` (`engines`). If the local Node is older, prefix commands with
  `npx -y -p node@24`. The Docker build uses Node 24.
- After a container run, `node_modules` can hold Linux binaries (esbuild). Run `npm ci` before
  using it on macOS.
- All API calls go through the generated client (`src/app/core/api/generated/`). No
  hand-written URLs, raw `HttpClient`, `fetch` or `any`. `tests/static/check-frontend-client.sh`
  enforces it; the only allowlisted call is `fetch(photo.webPath)` in `photo-source.service.ts`.
- After a contract change: `npm run generate:api`, then `npm run check:api`.
- Ionic 9 standalone components import from `@ionic/angular` (no `/standalone` subpath). Don't
  add `@angular/animations`; it conflicts with Angular 22.
- Show the photo from `Scan.image.url` in the API response.
- nginx proxies `/api` same-origin, forwards `Host $http_host` and overwrites `X-Forwarded-*`.
  Don't reintroduce CORS (ADR 0008). nginx resolves `backend` per request
  (`resolver 127.0.0.11`); health is `/healthz`.
- Camera on the web: `<input type=file capture=environment>` (works without HTTPS, opens the
  camera app). Capacitor Camera only in native shells. Live camera and PWA install need a
  secure context (`docs/phone-testing.md`).
- Uploads are downscaled client-side to a 2048 px long side (EXIF-aware, JPEG q0.9,
  transparency flattened onto white to match inference).
- No Cancel button during a scan: aborting doesn't stop server inference.
- Canvas hit-testing: the smallest box under the pointer wins.
- E2E tests rely on the `data-testid` values listed in `frontend/README.md`. Tell `qa` before
  renaming or removing one.
