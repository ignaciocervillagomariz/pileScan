# ADR 0008: Same-origin API behind nginx, no CORS

- Status: Accepted
- Date: 2026-11-03
- Refines: [ADR 0002](0002-service-split.md)

## Context
`POST /api/scans` returned **403 "Invalid CORS request"** when the app was opened at
`http://127.0.0.1:4200`, but worked at `http://localhost:4200`. Reproduced on the stack before
the change:

| Request through nginx `:4200` | Result |
| --- | --- |
| no `Origin` header | 201 |
| `Origin: http://localhost:4200` (also the preflight) | 201 / 200 |
| `Origin: http://127.0.0.1:4200` (POST and preflight) | 403, body `Invalid CORS request` |

Two causes combined:

1. The backend had a hard-coded CORS allow-list (`CORS_ALLOWED_ORIGINS=http://localhost:4200`).
2. nginx sent `Host: $host`, and `$host` has no port. Spring decides whether a request is
   cross-origin by comparing `Origin` with the request's own scheme, host and port. It saw host
   `127.0.0.1` without a port, so even true same-origin traffic looked cross-origin and fell
   back to the allow-list.

The same would hit every LAN IP (phone testing) and every HTTPS tunnel host name.

## Decision
- **The browser only ever talks to nginx, which serves the SPA and proxies `/api/`.** The API is
  same-origin by construction, so it needs **no CORS**. The CORS mapping, the
  `pilescan.cors.allowed-origins` property and `CORS_ALLOWED_ORIGINS` are removed. Without CORS
  configuration Spring MVC never evaluates `Origin`. `ng serve` uses the same-origin dev proxy
  (`proxy.conf.json`), so no dev profile with CORS is needed either.
- **nginx forwards the real request identity:** `Host $http_host` (keeps the port),
  `X-Forwarded-Host`, `X-Forwarded-Port` (taken from `Host`, since nginx listens on 80 inside
  the container), `X-Forwarded-Proto` and `X-Forwarded-For`.
- **Spring trusts them:** `server.forward-headers-strategy=framework` (`ForwardedHeaderFilter`).
  Generated URLs (`Location`) and the request scheme are right behind an HTTPS tunnel.
- **Trust boundary.** `X-Forwarded-For`, `-Host` and `-Port` are *overwritten* by nginx, never
  appended to client-supplied values. `X-Forwarded-Proto` honours an incoming value only when it
  is present, because a TLS-terminating tunnel (`tailscale serve`, `cloudflared`) sits in front
  of nginx and nginx itself only sees HTTP; otherwise nginx uses its own `$scheme`. This is safe
  only because the backend port is published on `BIND_ADDRESS` (localhost by default) and the
  deployment is a single-user/local one: **anyone who can reach the backend port directly can
  forge forwarded headers**. A real deployment must expose only nginx (or the tunnel) and not the
  backend port.
- **No Spring Security**, so there is no CSRF filter to disable. If auth is added later, CSRF is
  unnecessary for a stateless bearer-token API but must be decided explicitly then.
- **Regression tests:** `ScanFlowIT` posts a scan with `Origin` set to `http://127.0.0.1:4200`,
  `http://localhost:4200`, a LAN IP, a `*.ts.net` and a `*.trycloudflare.com` origin (with a
  `Host` that does not match) and through forwarded headers, and expects 201 every time.

## Alternatives considered
- **Widen the allow-list** (`127.0.0.1`, patterns, `*`). Rejected: it grows with every host
  (LAN IPs change, tunnel names are random), and `*` turns the unauthenticated API into one any
  web page the user visits could call.
- **Only fix the `Host` header, keep CORS.** Fixes this symptom but leaves a configuration that
  must be kept in sync with every deployment URL, for no benefit.
- **CORS in a `dev` profile.** Not needed: the dev server proxies `/api` too.
- **Let the SPA call the backend port directly.** Needs CORS, a configurable API base URL and
  an extra exposed port; rejected.

## Consequences
- The app works from any host name, IP or scheme with no configuration, including phones on the
  LAN and HTTPS tunnels ([phone-testing](../phone-testing.md)).
- Third-party web pages cannot read API responses from a browser (the default same-origin
  policy). This does not protect the API from non-browser clients: it still has **no
  authentication** (MVP scope), which is why published ports bind to localhost by default.
- Tools that call the backend directly on `:8080` (Swagger UI, curl, Playwright API tests) are
  unaffected.
- Any future second web origin that calls the API (for example a separate admin UI) must
  introduce CORS deliberately, with an explicit allow-list.
