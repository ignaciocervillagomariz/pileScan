# Spec: home page with interactive 3D brick hero

Status (2026-11-11): phases 1–2 accepted. On 2026-11-11 the owner replaced the push design and
phase 4 with a three-tool interaction model (see "Interaction model") and approved phase 4; the open calls were settled on 2026-11-12.
It is built in three steps, each committed and shown to the owner: (1) mode dock and Push
without thresholds, (2) Glove, (3) Separator. Owner of the implementation: single frontend
session.

### Next steps
1. Done: step 1 (dock, Push with no threshold) and step 2 (Glove: carry, ghost, snap,
   stacking, drop, R/wheel, touch long-press).
2. Owner checks the Glove with real mouse, trackpad and phone.
3. Step 3: Separator.
4. Phase 5 (polish) after the owner's OK.

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
  *Replaced on 2026-11-12: the Glove carries the whole stack (see "Interaction model").*
- **Phase 1 review (2026-11-09):** surface (b), the stronger grain and vignette, is the light
  surface; the warm charcoal stays for dark mode. The camera is tilted 7° from straight down.
  Studs on white and light grey bricks get a baked contact shade (a halo on the top face),
  with exposure 0.88 and a slightly off-white White so the shading does not clip.
- **Phase 2 review (2026-11-09):** mobile Lighthouse on home is accepted at 84 (baseline 92 on
  the old capture page; desktop stays 100). The remaining blocking time is the environment-map
  bake, Rapier's first step (lazy wasm compilation) and chunk evaluation, all after first paint;
  LCP stays the headline. Devices with software WebGL get the static surface.
- **Phase 3 review (2026-11-09): "pushing doesn't work" on the owner's machine.** Root
  cause: `127.0.0.1:4200` served a frontend image built before the push commit (`e2b6e47`),
  because the stack was restored with `docker compose up` without `--build`; the verification
  had run against a separate static server, not that URL. The service worker would also have
  kept serving the cached build until a reload. Since then every build carries a stamp
  (commit + time) in the console and in the `?debug=1` overlay, and verification runs against
  the URL the owner uses.
- **Debug overlay (`?debug=1`):** build stamp, hero state and fallback reason, quality tier,
  reduced motion, fps, active tool, pointer speed (px/s) and state, input rate and coalesced
  samples per event, pusher position (also drawn in the scene), hovered or carried brick,
  element under the pointer, device pixel ratio.
- **Interaction model (2026-11-11):** three tools (Glove, Push, Separator) replace the
  speed-based push/hover split of phase 3, which is superseded. The real-input check of Push
  with the owner's mouse and trackpad still happens, after step 1.
- **Lifted-brick shadow:** the held brick leaves the shadow map and gets a blob shadow whose
  size, softness and offset scale with height.
- **Step 2 implementation notes (2026-11-12):**
  - Stack height counts layers: two bricks side by side on one base make a stack of 2.
  - A stack is one Rapier body with one collider per brick, in the bottom brick's frame.
    Joining recreates the carried colliders on the target body (Rapier can't move a collider
    between bodies).
  - A snap target must be still (barely moving), not asleep: Rapier sleeps a body only after a
    while, and a stack that was just built must accept the next brick right away.
  - Touch: a sideways drag sweeps wherever it starts (the pusher lets the brick it starts on
    pass until clear); only a hold grabs.
  - Physics unit tests run real Rapier through `@dimforge/rapier3d-compat` (same version,
    dev dependency only): the test runner can't load a separate `.wasm` file. `Physics`
    receives the Rapier module, so the app keeps `@dimforge/rapier3d`.

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
3. Interaction: three tools in a mode dock (see "Interaction model" below).
4. Replay: an icon button in the dock restarts the cascade.

## Interaction model
Decided 2026-11-11. It replaces the earlier push design (the 60 px/s dead zone and the
400 px/s hover exclusion) and the earlier grab/stack description. There are no speed thresholds
anywhere: a brick is carried because it was pressed, not because the pointer moved slowly.

### Dock
- A radio group with three tools (Glove, Push, Separator), plus Replay.
- Top-right on desktop; on phones, wherever the thumb reaches it best.
- One tool is always active, shown with `aria-pressed` and a clear visual state. Esc returns
  to the Glove.
- A one-line hint near the dock describes the active tool and fades after the first
  interaction.
- Real buttons with labels and tooltips. The dock is `role="group"` with toggle buttons,
  exactly one of them `aria-pressed="true"` (valid ARIA for toggle buttons; radios would use
  `aria-checked`).
- On phones the dock sits bottom-right of the hero; bricks keep out of the area under it, as
  they do for the card.

### 1. Glove (default on load)
- A built stack is one object: the Glove always carries the whole stack a brick belongs to,
  wherever it is pressed. Only the Separator takes stacks apart (decided 2026-11-12, replacing
  the 2026-11-08 sub-stack rule). A loose brick is a stack of one.
- Hover never moves anything. The stack under the cursor is highlighted and lifts 1–2 mm, and
  the cursor is an open glove.
- Press on a brick and drag to carry its stack (closed glove):
  - The stack moves as one. It is kinematic and in a collision group that ignores the other bricks. The walls only
    clamp its position.
  - It flies at the highest top surface under its footprint plus about one brick of
    clearance. It rights itself studs-up and tilts slightly with the movement, and its shadow
    shows where it is.
  - R or the mouse wheel rotates it 90°.
- Snapping uses stud-grid math (`snap.ts`), not physics. A carried stack snaps by its bottom
  brick's footprint. The ghost shows the nearest valid position on the topmost brick
  underneath: at least one stud overlapping, 90° steps, no overlap with other bricks, and at
  most 6 bricks in the combined stack.
- Release on a valid target: the carried stack animates down with a small bounce and joins
  that stack's compound body. Release with no valid target: it drops from carry height and
  collides normally, so it lands on the table or on whatever is under it, and never passes
  through a brick (decided 2026-11-12; a small bump on landing is fine).
- Press on the empty table and drag to sweep. A pusher exists only while the button is held,
  its strength comes from the pointer's velocity, and a soft contact ring shows on the table
  under the cursor.
- Touch: a long-press (~250 ms) on a brick grabs it; a horizontal drag starting on the table
  sweeps; vertical drags scroll the page.

### 2. Push (normal cursor)
- Any pointer movement over the scene pushes, with strength from the pointer's velocity
  (a kinematic capsule follows the pointer and real collisions do the rest). Only a
  completely still pointer is ignored. `PUSH.deadZonePxPerS` and `PUSH.hoverMaxPxPerS` are
  removed.
- This mode never grabs.
- Touch: horizontal swipes push, vertical swipes scroll.

### 3. Separator (an orange pry tool)
- The cursor becomes the tool.
- Clicking a brick in a stack splits the stack at the connection below that brick. The brick
  and everything above it pop off together as one piece, with a small upward impulse, a
  slight spin and a short pop animation.
- If the clicked brick is the bottom one, split at the connection above it instead.
- Clicking a loose brick gives a small shake as feedback and nothing else.
- Touch: tap.

### Shared rules
- Pointer speeds are in CSS px/s (they describe the hand); pusher speeds are in studs/s.
- Page scrolling keeps working when nobody is interacting (`touch-action: pan-y` until a grab
  starts). All interaction pauses while the page scrolls or the hero is off-screen.
- Ambient life, none of it with prefers-reduced-motion, all with render on demand: the
  Glove's hover lift (the earlier radius-based lift of nearby bricks is removed; Push has no
  lift), camera parallax up to 1.5° toward the pointer (walls and the card keep-out move in by the resulting
  shift), and the optional idle drop (`AMBIENT.idleDrop`, off by default).

### Visuals and accessibility
- Icons and cursors are our own original drawings: a generic white cartoon glove with no
  resemblance to any existing character, a generic orange separator, and a push icon. No
  logos.
- Cursors are 32×32 with correct hotspots.

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
- `hero/interaction.ts`: pointer state machine per tool (see "Interaction model")
- `hero/snap.ts`: pure stud-grid math
- `hero/quality.ts`: device tiers
- `hero/config.ts`: every tunable number in one place

## Phases
After each phase, stop and wait for the owner's OK. Save screenshots or a short recording to
`.hero-review/` (git-ignored), and report the file paths plus fps figures.
1. Static scene: surface options, lighting, brick models, camera. Owner chooses the surface.
2. Cascade, settling, walls, resize, quality tiers.
3. Push (mouse and touch). Superseded on 2026-11-11 by the interaction model.
4. Interaction model, in three steps with a commit and an owner check after each:
   (1) mode dock and Push with no threshold, (2) Glove: carry, rotate, snap and stacking,
   drop, sweep, (3) Separator.
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
- Unit tests cover `snap.ts`, the interaction state machine, the quality tiers and the wall
  layout, and in particular:
  - press on a brick vs. press on the table
  - carrying a brick over others moves none of them
  - a carried stack moves as one
  - the snap target is the topmost brick
  - snapping a stack respects the combined height limit
  - an invalid release drops onto the table
  - Push has no threshold
  - the separator splits at the right connection, handles the bottom brick, and only shakes
    a loose brick
- E2E tests: home renders, the CTA opens the capture flow, the reduced-motion path works, the
  no-WebGL fallback shows, and the existing E2E suite is still green.
- Lighthouse on home shows no regression in performance or accessibility (numbers recorded).
- `npm test`, `npm run build` and `npm run check:api` pass. Small Conventional Commits.
- Finally: run the code-reviewer subagent on the commit range and fix what matters. Then
  update `.claude/handoff/frontend.md` (current state only) and `docs/build-summary.md`.
