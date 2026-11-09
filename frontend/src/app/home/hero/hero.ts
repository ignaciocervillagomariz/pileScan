/**
 * Entry point of the lazily loaded hero chunk. Wires scene, physics and pointer input to the
 * host element and runs the loop: fixed 60 Hz physics, render on demand (also for the ambient
 * easing), paused when off-screen or hidden.
 */
import { liftAt, parallaxAngles, parallaxMargin, approach, settled } from './ambient';
import { footprintRadius, gravityFor, planCascade, Spawn } from './cascade';
import { ADAPTIVE, AMBIENT, CASCADE, DEBUG, PHYSICS, PUSH, WALLS } from './config';
import { FrameStats } from './frame-stats';
import {
  CameraFit,
  clampInto,
  contains,
  GroundRect,
  inflate,
  PixelRect,
  pixelRectToGround,
  playArea,
  pushOut,
  rayToPlane,
  wallLayout,
} from './layout';
import { yieldToMain } from './perf';
import { Physics, PUSHER_Y } from './physics';
import { attachPointerInput, PointerReport, PointerStats } from './pointer-input';
import { hoverCandidate, nextExclusions } from './push-rules';
import { QualityTier, TIERS } from './quality';
import { HeroScene, Theme } from './scene';

export type HeroActivity = 'moving' | 'resting';

/** What the ?debug=1 overlay shows about the scene. */
export interface HeroDebugInfo {
  readonly fps: number;
  readonly p95Ms: number;
  readonly tier: string;
  readonly bricks: number;
  readonly redrops: number;
  readonly pointerState: string;
  readonly speedPxPerS: number;
  readonly input: PointerStats;
  readonly pusher: { readonly x: number; readonly z: number } | null;
  readonly hovered: { readonly id: number; readonly x: number; readonly z: number } | null;
  readonly excluded: number;
}

export interface HeroOptions {
  readonly tier: QualityTier;
  readonly debug: boolean;
  /** prefers-reduced-motion: gentle pushes, no parallax, lift or idle drops. */
  readonly reducedMotion: boolean;
  /** Called when the bricks start moving or come to rest (state attribute, tests). */
  readonly onActivity?: (activity: HeroActivity) => void;
  /** ?debug=1 only: called at most every DEBUG.refreshMs. */
  readonly onDebug?: (info: HeroDebugInfo) => void;
}

export interface HeroElements {
  /** The hero section: its size is the scene's viewport. */
  readonly host: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  /** The text card: bricks keep out of the area under it. */
  readonly card: HTMLElement;
}

export interface HeroHandle {
  /** Clears the table and drops a new cascade. */
  replay(): void;
  dispose(): void;
}

function relativeRect(el: HTMLElement, host: HTMLElement): PixelRect {
  const a = el.getBoundingClientRect();
  const b = host.getBoundingClientRect();
  return { left: a.left - b.left, top: a.top - b.top, width: a.width, height: a.height };
}

/**
 * Builds the scene step by step (yielding between steps so no long task blocks the page) and
 * starts the cascade once shaders are compiled.
 */
export async function createHero(els: HeroElements, options: HeroOptions): Promise<HeroHandle> {
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const theme = (): Theme => (darkQuery.matches ? 'dark' : 'light');
  const ambient = !options.reducedMotion;
  const idleDrop = ambient && AMBIENT.idleDrop.enabled;
  let tier = options.tier;
  await yieldToMain();
  const scene = new HeroScene(els.canvas, { tier, theme: theme() });
  await scene.prepare(yieldToMain);
  await yieldToMain();
  const physics = new Physics(1, options.reducedMotion ? PUSH.reducedMotionMaxSpeed : PUSH.maxSpeed);
  const stats = new FrameStats();

  let fit: CameraFit | null = null;
  let area: GroundRect | null = null;
  let keepOut: GroundRect | null = null;
  let plan: Spawn[] = [];
  /** Bricks from the plan that may drop now; idle drops raise it one at a time. */
  let released = 0;
  let nextSpawn = 0;
  let round = 0;
  let simTime = 0;
  let accumulator = 0;
  let lastTick = 0;
  let frame = 0;
  let visible = document.visibilityState === 'visible';
  let onScreen = true;
  let activity: HeroActivity | null = null;
  /** False until shaders are compiled: the loop must not trigger a blocking compile. */
  let ready = false;
  let degraded = false;
  let redrops = 0;
  let lastDebugAt = 0;

  let pointer: PointerReport | null = null;
  let hovered: number | null = null;
  let excluded = new Set<number>();
  /** Where the cursor is on the brick plane, for the ambient lift; null when away. */
  let liftCenter: { x: number; z: number } | null = null;
  const lifts = new Map<number, number>();
  let lastInteractionAt = performance.now();
  let lastIdleDropAt = 0;

  const setActivity = (next: HeroActivity) => {
    if (next === activity) return;
    activity = next;
    options.onActivity?.(next);
  };

  /** Nearest point inside the play area and clear of the card's keep-out block. */
  const safeSpot = (x: number, z: number): { x: number; z: number } => {
    if (!area) return { x, z };
    let spot = clampInto(area, x, z, 1);
    if (keepOut) {
      const blocked = inflate(keepOut, WALLS.cardMargin);
      if (contains(blocked, spot.x, spot.z)) {
        const out = pushOut(inflate(blocked, 1), spot.x, spot.z);
        spot = clampInto(area, out.x, out.z, 1);
      }
    }
    return spot;
  };

  /**
   * Safety net: a brick outside the walls or under the floor can never come to rest, which
   * would keep the loop running forever. Drop it again inside the play area.
   */
  const isEscaped = (p: { x: number; y: number; z: number }) =>
    p.y < -0.5 || (area !== null && !contains(inflate(area, 0.5), p.x, p.z));
  const redrop = (id: number, p: { x: number; y: number; z: number }) => {
    if (!fit) return;
    if (options.debug) console.debug('hero: redrop', { id, at: p, simTime, area });
    const spot = safeSpot(p.x, p.z);
    physics.redrop(id, { x: spot.x, y: fit.height * CASCADE.spawnHeightShare * 0.5, z: spot.z });
    redrops++;
  };

  const spawn = (id: number) => {
    const s = plan[id];
    // The area may have shrunk since the plan was made (resize during the cascade).
    const p = area ? clampInto(area, s.position.x, s.position.z, 1) : s.position;
    physics.addBrick(id, { ...s, position: { ...s.position, x: p.x, z: p.z } });
  };

  const spawnDue = () => {
    while (nextSpawn < released && plan[nextSpawn].atSeconds <= simTime) spawn(nextSpawn++);
  };

  /** Steps down one tier mid-cascade if the device can't hold the frame rate. */
  const adaptQuality = () => {
    if (degraded || tier.name !== 'high' || stats.count < ADAPTIVE.warmupFrames) return;
    // Median, not mean: the first frames include shader compiles that say nothing about the device.
    if (stats.medianMs() <= 1000 / ADAPTIVE.minFps) return;
    degraded = true;
    tier = TIERS.mid;
    scene.applyTier(tier);
    // Fewer bricks too: drop the ones not released yet.
    plan = plan.slice(0, Math.max(nextSpawn, tier.brickCount));
    released = Math.min(released, plan.length);
  };

  /** Applies the hover/overlap rule: which bricks currently pass through the pusher. */
  const updateExclusions = () => {
    const next = nextExclusions(excluded, hovered, physics.pusherPosition, (id) => {
      const p = physics.position(id);
      return p && plan[id] ? { x: p.x, z: p.z, radius: footprintRadius(plan[id].shape) } : null;
    });
    for (const id of excluded) if (!next.has(id)) physics.setIgnoresPusher(id, false);
    for (const id of next) if (!excluded.has(id)) physics.setIgnoresPusher(id, true);
    excluded = next;
  };

  /** Eases the ambient lift of resting bricks near the cursor. Returns true while animating. */
  const updateLifts = (dt: number): boolean => {
    let animating = false;
    physics.forEachPose((id, pose) => {
      const current = lifts.get(id) ?? 0;
      const target =
        liftCenter && physics.isSleeping(id)
          ? liftAt(Math.hypot(pose.position.x - liftCenter.x, pose.position.z - liftCenter.z))
          : 0;
      if (settled(current, target, 1e-4)) {
        if (target === 0) lifts.delete(id);
        else lifts.set(id, target);
        return;
      }
      lifts.set(id, approach(current, target, AMBIENT.liftRate, dt));
      animating = true;
    });
    return animating;
  };

  const hoveredInfo = () => {
    const p = hovered === null ? null : physics.position(hovered);
    return hovered !== null && p ? { id: hovered, x: p.x, z: p.z } : null;
  };

  const reportDebug = (now: number) => {
    if (!options.onDebug || now - lastDebugAt < DEBUG.refreshMs) return;
    lastDebugAt = now;
    const pusher = physics.pusherPosition;
    scene.setDebugPusher(pusher ? { x: pusher.x, y: PUSHER_Y, z: pusher.z } : null);
    options.onDebug({
      fps: stats.averageFps(),
      p95Ms: stats.p95Ms(),
      tier: tier.name,
      bricks: nextSpawn,
      redrops,
      pointerState: pointer?.state.kind ?? 'away',
      speedPxPerS: pointer?.speedPxPerS ?? 0,
      input: input.stats(),
      pusher,
      hovered: hoveredInfo(),
      excluded: excluded.size,
    });
  };

  const tick = (now: number) => {
    frame = 0;
    const elapsedMs = lastTick > 0 ? now - lastTick : PHYSICS.step * 1000;
    lastTick = now;
    stats.add(elapsedMs);
    const dt = Math.min(elapsedMs, 100) / 1000;

    // Capped so a long frame (or a resumed tab) never runs a burst of catch-up steps.
    accumulator = Math.min(accumulator + elapsedMs / 1000, PHYSICS.step * PHYSICS.maxStepsPerFrame);
    while (accumulator >= PHYSICS.step) {
      spawnDue();
      physics.step();
      simTime += PHYSICS.step;
      accumulator -= PHYSICS.step;
    }
    updateExclusions();
    const lifting = ambient && updateLifts(dt);
    const orbiting = ambient && scene.updateParallax(dt);
    physics.forEachPose((id, pose) => {
      if (isEscaped(pose.position)) redrop(id, pose.position);
      scene.setPose(id, pose.position, pose.rotation, lifts.get(id) ?? 0);
    });
    scene.render();
    adaptQuality();
    reportDebug(now);

    const resting = nextSpawn >= released && !physics.pushing && physics.isResting();
    setActivity(resting ? 'resting' : 'moving');
    // Render on demand: stop once nothing moves or eases (debug mode keeps measuring).
    if (!resting || lifting || orbiting || options.debug) schedule();
  };

  function schedule(): void {
    if (frame !== 0 || !ready || !visible || !onScreen) return;
    frame = requestAnimationFrame(tick);
  }

  const wake = () => {
    lastTick = 0;
    schedule();
  };

  const onPointer = (report: PointerReport) => {
    pointer = report;
    lastInteractionAt = performance.now();
    const ray = report.position ? scene.rayAt(report.position.x, report.position.y) : null;
    const onPlane = ray ? rayToPlane(ray.origin, ray.direction, PUSHER_Y) : null;
    if (!ray || !onPlane || !fit) {
      physics.setPusher(null);
      hovered = null;
      liftCenter = null;
      scene.setParallaxTarget(0, 0);
      wake();
      return;
    }
    const slow = report.speedPxPerS <= PUSH.hoverMaxPxPerS;
    hovered = hoverCandidate(
      physics.brickAt(ray.origin, ray.direction),
      // The overlap query only matters (and only costs) when the pointer is slow.
      slow ? physics.bricksTouching(onPlane.x, onPlane.z) : [],
      report.speedPxPerS,
    );
    physics.setPusher(report.state.kind === 'pushing' ? onPlane : null);
    updateExclusions();
    if (ambient && report.position) {
      const { widthPx, heightPx } = fit.viewport;
      const a = parallaxAngles((report.position.x / widthPx) * 2 - 1, (report.position.y / heightPx) * 2 - 1);
      scene.setParallaxTarget(a.yaw, a.pitch);
      liftCenter = onPlane;
    }
    wake();
  };

  const startCascade = () => {
    if (!fit || !area) return;
    physics.removeAllBricks();
    excluded = new Set();
    lifts.clear();
    const extra = idleDrop ? AMBIENT.idleDrop.max : 0;
    plan = planCascade({
      count: tier.brickCount + extra,
      area,
      keepOut: keepOut ? inflate(keepOut, WALLS.cardMargin) : null,
      spawnHeight: fit.height * CASCADE.spawnHeightShare,
      seed: CASCADE.seed + round,
    });
    scene.setBricks(plan.map((s) => ({ shapeId: s.shape.id, colorIndex: s.colorIndex })));
    released = tier.brickCount;
    nextSpawn = 0;
    simTime = 0;
    accumulator = 0;
    stats.reset();
    round++;
    setActivity('moving');
    wake();
  };

  /** Optional (AMBIENT.idleDrop): one more brick after a while without interaction. */
  const idleTimer = idleDrop
    ? setInterval(() => {
        const now = performance.now();
        const cfg = AMBIENT.idleDrop;
        if (!visible || !onScreen || nextSpawn < released || released >= plan.length) return;
        if (now - lastInteractionAt < cfg.afterSeconds * 1000 || now - lastIdleDropAt < cfg.everySeconds * 1000) return;
        lastIdleDropAt = now;
        spawn(released);
        released++;
        nextSpawn = released;
        wake();
      }, 1000)
    : undefined;

  const layout = () => {
    const viewport = { widthPx: els.host.clientWidth, heightPx: els.host.clientHeight };
    if (viewport.widthPx === 0 || viewport.heightPx === 0) return;
    if (fit?.viewport.widthPx === viewport.widthPx && fit.viewport.heightPx === viewport.heightPx) return;

    fit = scene.resize(viewport);
    // The parallax can shift the view by this much: keep bricks (and the card margin) inside it.
    const shift = ambient ? parallaxMargin(fit.distance) : 0;
    const nextArea = playArea(fit.ground, shift);
    const nextKeepOut = inflate(pixelRectToGround(relativeRect(els.card, els.host), fit), shift);
    area = nextArea;
    keepOut = nextKeepOut;
    const spawnHeight = fit.height * CASCADE.spawnHeightShare;
    physics.setGravity(gravityFor(spawnHeight));
    physics.setWalls(wallLayout(nextArea, nextKeepOut, spawnHeight + WALLS.headroom));

    if (plan.length === 0) {
      startCascade();
      return;
    }
    // Bricks the new walls would cut through are moved back into the play area.
    physics.forEachPose((id, pose) => {
      const p = safeSpot(pose.position.x, pose.position.z);
      if (p.x !== pose.position.x || p.z !== pose.position.z) physics.moveBrick(id, p.x, p.z);
    });
    physics.wakeAll();
    wake();
  };

  const resizeObserver = new ResizeObserver(layout);
  resizeObserver.observe(els.host);
  const intersection = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    if (onScreen) wake();
  });
  intersection.observe(els.host);
  const onVisibility = () => {
    visible = document.visibilityState === 'visible';
    if (visible) wake();
  };
  document.addEventListener('visibilitychange', onVisibility);
  const onTheme = () => {
    scene.setTheme(theme());
    wake();
  };
  darkQuery.addEventListener('change', onTheme);
  const input = attachPointerInput(els.canvas, { pushEnabled: true, onReport: onPointer });
  layout();
  await scene.precompile();
  ready = true;
  wake();

  return {
    replay: startCascade,
    dispose() {
      cancelAnimationFrame(frame);
      clearInterval(idleTimer);
      input.detach();
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      darkQuery.removeEventListener('change', onTheme);
      physics.dispose();
      scene.dispose();
    },
  };
}
