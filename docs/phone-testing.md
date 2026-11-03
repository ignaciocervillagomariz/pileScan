# Testing PileScan on a phone

Photographing a real pile needs the app on a phone. This page covers the two ways to reach the
local stack from one. The stack must be running first (`cp .env.example .env && docker compose
up --build`).

The browser only talks to nginx on port 4200, which also proxies `/api/`, so no other port needs
to be reachable ([ADR 0008](decisions/0008-same-origin-api-behind-nginx.md)).

## Option A: plain HTTP on your LAN (quickest)

Phone and computer must be on the same trusted Wi-Fi.

1. In `.env` set `BIND_ADDRESS=0.0.0.0`, then `docker compose up -d`. By default ports bind to
   `127.0.0.1` only.
2. Find the computer's LAN IP (macOS: `ipconfig getifaddr en0`).
3. Open `http://<LAN IP>:4200` on the phone.

**Risk: the API has no authentication.** With `0.0.0.0`, everyone on that network can upload
photos, read scans and call the admin endpoints (published ports include the backend `:8080` and
inference `:8000`). Use it only on a network you trust, never on public or shared Wi-Fi, and set
`BIND_ADDRESS` back to `127.0.0.1` afterwards.

`capture` itself does not need a secure context, but MDN marks it as limited availability: browsers
that ignore it show the normal file picker (camera or gallery), which still works.

What works over plain HTTP: choosing or taking a photo (the app uses
`<input type="file" accept="image/*" capture="environment">`, which hands over to the phone's
camera app and needs no browser camera API), the scan, review, and results.

What does not: anything that needs a *secure context*. The service worker (installing the PWA,
offline cache) does not register, and a live in-page camera preview (`getUserMedia`) would be
blocked. MDN: ["Secure contexts"](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts)
says a page is a secure context when served over `https`, from `localhost`/`127.0.0.0/8`, or
from a `file` URL, and lists the restricted features; `getUserMedia()` is documented as only
available in secure contexts
([MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)). A LAN IP
over `http` is not a secure context, `localhost` on the phone itself would be but is not
reachable from outside. That is why HTTPS (below) is needed for anything beyond the file input.

## Option B: HTTPS with `tailscale serve` (preferred, private)

Gives a real certificate and an `https://<machine>.<tailnet>.ts.net` URL reachable **only by
devices in your tailnet**. Keep `BIND_ADDRESS=127.0.0.1`, no LAN exposure is needed because
Tailscale proxies from the same machine.

Prerequisites: Tailscale on the computer and on the phone, signed in to the same tailnet;
MagicDNS and HTTPS certificates enabled for the tailnet in the admin console
([Tailscale: HTTPS certificates](https://tailscale.com/kb/1153/enabling-https)).

```bash
tailscale serve --bg 4200     # proxy https://<machine>.<tailnet>.ts.net -> localhost:4200
tailscale serve status        # shows the URL
tailscale serve reset         # stop serving when done
```

Without `--bg` the command runs in the foreground and stops with Ctrl+C. Open the printed URL on
the phone. `tailscale serve` is HTTPS on port 443 by default and forwards plain HTTP to the
target; the backend sees `X-Forwarded-Proto: https` through nginx, so generated URLs are
correct. Syntax: [`tailscale serve` reference](https://tailscale.com/kb/1242/tailscale-serve).
**Not verified (no tailnet available when this was written):** whether `tailscale serve` sets
`X-Forwarded-Proto`; the Tailscale docs do not state it. The API only returns relative URLs
(`Location: /api/scans/{id}`), so a missing header is harmless; simulating the header with curl
gives the same 201 and relative `Location`. Check `docker compose logs frontend` if in doubt.
Do not use `tailscale funnel`: that publishes to the public internet.

## Option C: HTTPS with a cloudflared quick tunnel (public, last resort)

```bash
cloudflared tunnel --url http://localhost:4200
```

It prints a random `https://<words>.trycloudflare.com` URL. **Anyone who has the URL can use
your app, and the API has no authentication**: they can upload photos, read every scan and call
the admin endpoints. Quick tunnels are documented as being for testing and development
([Cloudflare docs](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)).
Do not share the URL, do not leave it running, stop it with Ctrl+C when done. `--allowed-mail
you@example.com` (same page) asks visitors for an emailed one-time PIN first, which is worth
using; it needs an interactive browser session, so it does not suit scripted clients. Prefer Option B.

## Checklist before a photo session
- [ ] `docker compose ps`: all services healthy; the catalog import has finished
  (`curl -s localhost:8080/api/admin/catalog-import`).
- [ ] The URL opens on the phone. If the page loads but uploads fail, read the red banner: it
  names the cause (cannot reach server, photo too large, server error).
- [ ] Photos: plain contrasting background, pieces spread out, shot from above, even light. The
  app resizes the long side to 2048 px before uploading, so a 12 MP photo is fine.
- [ ] Zero pieces found? Open "Show debug view" on the review screen to see what the detector
  looked at.
- [ ] Afterwards: `BIND_ADDRESS=127.0.0.1`, `tailscale serve reset`, stop any `cloudflared`.
