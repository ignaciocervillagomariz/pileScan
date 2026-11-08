# Spec: home page with interactive 3D brick hero

Status: plan approved 2026-11-08. Owner of the implementation: single frontend session.

## Decisions (2026-11-08)
- **Physics: keep Rapier.** Fast pushes against thin plates (0.4 units) need CCD, stacking
  needs a stable solver, and determinism helps tests. Size mitigations:
  - Report the gzip and brotli transfer size of the hero chunk; if it exceeds ~1 MB
    compressed, tell the owner before going on.
  - Load it only after first paint; the static fallback is visible meanwhile.
  - Skip the 3D scene (keep the static fallback) when `navigator.connection.saveData` is on,
    `effectiveType` is 2g/3g, or the device is on the lowest quality tier.
  - The service worker caches the chunk after the first visit.
  - Prefer `@dimforge/rapier3d` with a separate `.wasm` file over `-compat` (base64 overhead)
    if the Angular build supports it without hacks; otherwise keep `-compat`.
- **Routes:** `/` is home, `/scan` is capture, `/scan/:id` and `/scan/:id/results` are
  unchanged, `**` redirects to `/`. Review-page links to "new scan" point to `/scan`.
- **Manifest:** `"id": "/"` (app identity independent of `start_url`) and
  `"start_url": "/scan"` (installed users want to scan). `/scan` must work offline through the
  service worker's navigation fallback. E2E tests are updated for the new routes.
- **Picking up a stacked brick** takes it and everything above it, as a sub-stack.
- **Phase 1 review (2026-11-09):** surface (b), the stronger grain and vignette, is the light
  surface; the warm charcoal stays for dark mode. The camera is tilted 7° from straight down.
  Studs on white and light grey bricks get a baked contact shade (a halo on the top face),
  with exposure 0.88 and a slightly off-white White so the shading does not clip.
- **Lifted-brick shadow:** the held brick leaves the shadow map and gets a blob shadow whose
  size, softness and offset scale with height.

## Goal
A new home page whose hero is an interactive 3D scene: toy bricks rain down onto a surface,
bounce and settle, seen from above. Visitors can push them around with the pointer, pick one
up and stack it on another. It is the first thing a recruiter sees, so it must feel polished,
fast and playful, and lead to a "Scan your pile" call to action.

## Tech direction (verify current versions and APIs in the official docs)
- Three.js for rendering and @dimforge/rapier3d-compat for physics (WASM, deterministic,
  supports continuous collision detection and compound bodies). Use plain Three.js inside an
  Angular standalone component, and keep all scene and physics code in framework-free
  TypeScript modules.
- Lazy-load the hero chunk (three + rapier) after first paint. The headline is the LCP
  element, and the initial bundle must not grow.
- Procedural brick geometry with real proportions: 8 mm stud pitch, 9.6 mm brick height,
  3.2 mm plate height, studs 4.8 mm wide and ~1.7 mm tall, slightly rounded edges.
  - Shapes: bricks 1x1, 1x2, 1x4, 2x2, 2x4; plates 1x2, 2x2, 2x4; tiles 1x2, 2x2.
  - One instanced mesh per shape.
  - Plain studs: never any logo or text on them.
- Physics colliders are cuboids (studs are ignored for collisions). Use 1 world unit = 1 stud
  pitch, and tune gravity for feel (a fall across the viewport takes about 1 s), not for
  physical accuracy.
- Plastic look:
  - physical material with clearcoat
  - a small palette of common brick colors (red, blue, yellow, white, black, light and dark
    bluish grey, green, orange, tan)
  - soft shadows and a generated environment map (no external HDR files)

## The experience
1. Intro: about 35 bricks (about 15 on phones) fall in a staggered cascade over ~2.5 s, from
   above the view and with random rotations. They bounce (low restitution), tumble and settle.
   Invisible walls at the viewport edges keep them in view and update on resize.
2. Settled view: top-down. The camera points straight down with a narrow perspective FOV
   (~30°) so height reads as depth. Show a 5–10° tilt as an alternative.
3. Push: moving the pointer FAST pushes bricks. A kinematic collider follows the pointer and
   real collisions do the rest, so bricks slide, spin and can flip. Moving SLOWLY never
   pushes.
4. Grab:
   - Hovering a brick slowly highlights it (subtle outline, `cursor: grab`).
   - Pressing on a brick picks it up. It becomes kinematic, rises toward the camera with an
     ease-out, and rights itself studs-up. Its shadow grows softer and shifts, to sell the
     height.
   - While dragged, it follows the pointer with a slight lag and tilts in the direction of
     movement. R or the mouse wheel rotates it 90°.
5. Stack:
   - While dragging over an upright, settled brick, compute the nearest valid position on its
     stud grid: at least one stud overlapping, rotation in 90° steps, no overlap with other
     bricks. Show a translucent ghost there.
   - Release on a valid spot: the brick snaps down with a small bounce and joins the same
     rigid body (compound body, detached again when picked up).
   - Release elsewhere: it drops and physics takes over.
   - Maximum stack height: 6.
6. Replay: a small icon button restarts the cascade.

Touch: there is no hover. A swipe pushes and a long-press (~300 ms) on a brick grabs it. Page
scrolling must keep working when nobody is interacting (touch-action: pan-y until a grab
starts).

## Surface
Decided (2026-11-08): **solid matte light warm grey** with very subtle grain and a soft
vignette. A plain surface echoes the app's photo tip and keeps the focus on the bricks.
- Phase 1 renders three variants for fine-tuning: (a) the spec surface, (b) the same with
  stronger grain and vignette, (c) a deep warm charcoal for dark mode.
- Capture each at desktop and phone width, in light and dark mode. Every screenshot includes
  white and light bluish grey bricks so contrast against the surface can be judged.

## Page
- Headline, a one-line subhead, and a primary CTA "Scan your pile" that opens the existing
  capture flow.
- The text sits on a card with its own background. An invisible keep-out collider around the
  card stops bricks from piling up under the text.
- Check the current routes. If capture lives at `/`, propose where home and capture should
  live and how the existing E2E tests change. Existing flows must keep working.
- No LEGO name or logo anywhere. Keep the footer credits and the disclaimer.

## Quality bars
- 60 fps on a laptop and at least 30 fps on a mid-range phone. Cap the device pixel ratio at
  2, and use quality tiers (fewer bricks, lighter shadows on low-end devices).
- Fixed 60 Hz physics step. When every body sleeps and nobody interacts, stop rendering
  (render on demand). Pause physics and rendering when the hero is off-screen or the tab is
  hidden.
- prefers-reduced-motion: no cascade, bricks start settled, interactions stay gentle.
- No WebGL, or the chunk fails to load: show a static image or CSS fallback, never a blank
  area.
- The canvas is decorative (aria-hidden). All real content and the CTA must be accessible
  without it.

## Suggested architecture
`frontend/src/app/home/`
- `home.page.ts`: hosts the canvas, handles the lifecycle and the lazy import
- `hero/scene.ts`: renderer, camera, lights, surface
- `hero/bricks.ts`: catalog, geometry, materials, palette
- `hero/physics.ts`: Rapier world, bodies, walls, sleeping
- `hero/interaction.ts`: pointer state machine (idle → push → hover → dragging → snapping)
- `hero/snap.ts`: pure stud-grid math
- `hero/quality.ts`: device tiers
- `hero/config.ts`: every tunable number in one place

## Phases
After each phase, stop and wait for the owner's OK. Save screenshots or a short recording to
`.hero-review/` (git-ignored), and report the file paths plus fps figures.
1. Static scene: surface options, lighting, brick models, camera. Owner chooses the surface.
2. Cascade, settling, walls, resize, quality tiers.
3. Push (mouse and touch).
4. Grab, lift, drag, rotate, snap and stacking.
5. Polish: reduced motion, fallback, performance, accessibility, tests, and a 10–15 s
   recording for the README.

Stretch, only if approved after phase 5: once the bricks settle, a scan line sweeps across
and draws detection boxes with labels ("2×4 · Red") over them, as a preview of what the app
does.

## Plan first
Before writing any code, send a plan with library choices and versions, a bundle-size
estimate, a routing proposal, the interaction state machine, the test approach and the main
risks. Wait for approval.

## Done when
- Unit tests cover `snap.ts`, the push-vs-grab pointer classifier, the quality tiers and the
  wall layout.
- E2E tests: home renders, the CTA opens the capture flow, the reduced-motion path works, the
  no-WebGL fallback shows, and the existing E2E suite is still green.
- Lighthouse on home shows no regression in performance or accessibility (numbers recorded).
- `npm test`, `npm run build` and `npm run check:api` pass. Small Conventional Commits.
- Finally: run the code-reviewer subagent on the commit range and fix what matters. Then
  update `.claude/handoff/frontend.md` (current state only) and `docs/build-summary.md`.
