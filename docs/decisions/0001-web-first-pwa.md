# ADR 0001: Web-first PWA instead of native apps

- Status: Accepted
- Date: 2026-11-02

## Context
The core interaction is "take a photo of a pile and fix the results on a phone". A portfolio
MVP must be easy to demo (a link, `docker compose up`) and cheap to iterate. Reviewers will
open it on a laptop as often as on a phone.

## Decision
Build a mobile-first **PWA** with Angular + Ionic (mobile UI components) and Capacitor Camera
(native camera on device, file input fallback on desktop). It is installable through the web
manifest and service worker.

## Alternatives
- **Native iOS/Android (Swift/Kotlin):** best camera control and on-device ML, but two codebases,
  store review, and nothing a reviewer can open in a browser.
- **React Native / Flutter:** one codebase, but still store distribution, and the browser demo
  would be second-class.
- **Desktop-only web app:** simplest, but it misses the real use case (phone above a table).

## Consequences
- One codebase serves every platform, and the demo is a URL. Capacitor keeps a native-wrapper
  path open.
- The camera is limited to what the browser gives (no manual focus or exposure). Image quality
  guidance (tips screen) carries more weight.
- On-device inference is out of scope for now; recognition happens server-side.
