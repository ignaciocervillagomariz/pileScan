# Sprint 3: Visual consistency pass

Status: approved

## Goal
Capture, Review and Results look like the same product as the new home page: same palette,
typography, spacing, components and states, in light and dark mode. This is a restyle, not a
redesign.

## Why now
The home is far ahead visually, and the demo video goes home → photo → boxes → results. The
Review screen's layout waits for real accuracy numbers, so its structure doesn't change now.

## Base
Start from main with the home hero merged. If feat/home-hero isn't merged yet, the lead stops
and asks me.

## Scope
- **In:**
  - Design tokens taken from the home: colors (light and dark), type scale, spacing, radii,
    shadows, motion durations. One source of truth, mapped onto Ionic's theme variables.
  - Shared components: header and navigation, buttons, cards, list rows, banners, footer,
    and the loading, empty and error states.
  - Capture, Review (canvas box colors, editor sheet, grouped list) and Results (set cards,
    match %, missing parts).
  - Consistent transitions, all respecting prefers-reduced-motion.
- **Out:** layout or flow changes, new features, any change to the home hero (it's frozen),
  backend, inference and API changes, new runtime dependencies.
- **Reserved for the owner:** RarityWeightedRankingStrategy, /training.

## Team
| Name | Agent type | Model | Directories |
| --- | --- | --- | --- |
| frontend | frontend-dev | sonnet | /frontend |
| qa | qa | sonnet | /tests |

Only two teammates on purpose: one folder, shared styles. Parallelism means building vs.
verifying, not several agents styling the same app. The lead runs the code-reviewer subagent
at the end.

## Lead prep
Add `.design-review/` to .gitignore and commit it before spawning the team.

## Contract changes
None.

## Tasks

### frontend
1. Plan: read qa's "before" screenshots and list every inconsistency with the home. Propose
   the token set and where it lives. Use the frontend-design skill if available. Wait for my
   approval.
2. Tokens and the Ionic theme mapping. The hero may read the same tokens, but its behaviour
   must not change.
   **Done when:** there are no hard-coded colors outside the tokens file (the hero's brick
   palette in hero/config.ts is the exception).
3. Shared components and the loading, empty and error states.
4. Capture.
5. Review, same layout:
   - Box colors come from the tokens, and confidence is never shown by color alone (e.g. a
     dashed outline for low confidence).
   - The canvas reads the tokens at runtime (getComputedStyle), so dark mode works.
6. Results.
After each of steps 3–6: message qa "<screen> complete". All data-testid values stay the same.

### qa
1. Start immediately: a reusable Playwright script (`npm run screens` in /tests) that
   captures every screen and state in light and dark mode at 390 px and 1440 px, using the
   stub classifier. States:
   - Capture
   - the upload/loading stage
   - Review with detections
   - zero detections
   - the classification warning
   - each error banner
   - Results, and Results empty
   Save them to `.design-review/before/`, then tell frontend.
2. For each "<screen> complete":
   - Capture the "after" screenshots, plus a side-by-side before/after image per state.
   - Run E2E.
   - Run an axe accessibility check (@axe-core/playwright as a dev dependency in /tests):
     no serious or critical violations, AA contrast, visible focus, touch targets ≥ 44 px.
   - Send bugs to frontend and re-verify the fixes.
3. Add a static check: no color literals (hex, rgb, hsl) in frontend/src outside the tokens
   file, with the hero brick palette excepted.
4. Run Lighthouse on Capture, Review and Results: no regression vs. before. Write
   tests/report-sprint3.md.

## Definition of done
- [ ] All screens use the tokens, and the static check passes.
- [ ] E2E is green, axe shows no serious or critical issues, and Lighthouse doesn't regress.
- [ ] There's a before/after gallery in `.design-review/`.
- [ ] README screenshots are replaced with real ones made by `npm run screens` (lead).
- [ ] docs/build-summary.md has a sprint 3 section, and the handoff is closed with
      /close-sprint 3.

## Risks
- Ionic components use shadow DOM: style them through CSS variables and ::part, never by
  piercing internals.
- Canvas colors are drawn in JS and can miss dark mode if they don't read the tokens.
- Scope creep into a redesign of Review. Note ideas in the report instead.
