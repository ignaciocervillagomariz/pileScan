/**
 * Entry point of the lazily loaded hero chunk. Wires scene and physics to the host element and
 * runs the loop: fixed 60 Hz physics, render on demand, paused when off-screen or hidden.
 */
import { gravityFor, planCascade, Spawn } from './cascade';
import { ADAPTIVE, CASCADE, PHYSICS, WALLS } from './config';
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
  screenToGround,
  wallLayout,
} from './layout';
import { yieldToMain } from './perf';
import { Physics } from './physics';
import { attachPointerInput } from './pointer-input';
import { QualityTier, TIERS } from './quality';
import { HeroScene, Theme } from './scene';

export type HeroActivity = 'moving' | 'resting';

export interface HeroOptions {
  readonly tier: QualityTier;
  readonly debug: boolean;
  /** Called when the scene starts moving or comes to rest (state attribute, tests). */
  readonly onActivity?: (activity: HeroActivity) => void;
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
  let tier = options.tier;
  await yieldToMain();
  const scene = new HeroScene(els.canvas, { tier, theme: theme() });
  await scene.prepare(yieldToMain);
  await yieldToMain();
  const physics = new Physics(1);
  const stats = new FrameStats();
  const hud = options.debug ? createHud(els.host) : null;

  let fit: CameraFit | null = null;
  let area: GroundRect | null = null;
  let keepOut: GroundRect | null = null;
  let plan: Spawn[] = [];
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
  let redrops = 0;
  const redrop = (id: number, p: { x: number; y: number; z: number }) => {
    if (!fit) return;
    if (hud) console.debug('hero: redrop', { id, at: p, simTime, area });
    const spot = safeSpot(p.x, p.z);
    physics.redrop(id, { x: spot.x, y: fit.height * CASCADE.spawnHeightShare * 0.5, z: spot.z });
    redrops++;
  };

  const spawnDue = () => {
    while (nextSpawn < plan.length && plan[nextSpawn].atSeconds <= simTime) {
      const spawn = plan[nextSpawn];
      // The area may have shrunk since the plan was made (resize during the cascade).
      const p = area ? clampInto(area, spawn.position.x, spawn.position.z, 1) : spawn.position;
      physics.addBrick(nextSpawn, { ...spawn, position: { ...spawn.position, x: p.x, z: p.z } });
      nextSpawn++;
    }
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
  };

  const tick = (now: number) => {
    frame = 0;
    const elapsedMs = lastTick > 0 ? now - lastTick : PHYSICS.step * 1000;
    lastTick = now;
    stats.add(elapsedMs);

    // Capped so a long frame (or a resumed tab) never runs a burst of catch-up steps.
    accumulator = Math.min(accumulator + elapsedMs / 1000, PHYSICS.step * PHYSICS.maxStepsPerFrame);
    while (accumulator >= PHYSICS.step) {
      spawnDue();
      physics.step();
      simTime += PHYSICS.step;
      accumulator -= PHYSICS.step;
    }
    physics.forEachPose((id, pose) => {
      if (isEscaped(pose.position)) redrop(id, pose.position);
      scene.setPose(id, pose.position, pose.rotation);
    });
    scene.render();
    adaptQuality();
    if (hud) {
      hud.textContent =
        `${stats.averageFps().toFixed(0)} fps · p95 ${stats.p95Ms().toFixed(1)} ms · ${tier.name} · ` +
        `${nextSpawn} bricks · ${redrops} redrops`;
    }

    // While pushing, keep stepping even if every brick sleeps: the pusher is on its way to them.
    const resting = nextSpawn >= plan.length && !physics.pushing && physics.isResting();
    setActivity(resting ? 'resting' : 'moving');
    // Render on demand: stop once everything sleeps (debug mode keeps measuring).
    if (!resting || hud) schedule();
  };

  function schedule(): void {
    if (frame !== 0 || !ready || !visible || !onScreen) return;
    frame = requestAnimationFrame(tick);
  }

  const wake = () => {
    lastTick = 0;
    schedule();
  };

  const startCascade = () => {
    if (!fit || !area) return;
    physics.removeAllBricks();
    plan = planCascade({
      count: tier.brickCount,
      area,
      keepOut: keepOut ? inflate(keepOut, WALLS.cardMargin) : null,
      spawnHeight: fit.height * CASCADE.spawnHeightShare,
      seed: CASCADE.seed + round,
    });
    scene.setBricks(plan.map((s) => ({ shapeId: s.shape.id, colorIndex: s.colorIndex })));
    nextSpawn = 0;
    simTime = 0;
    accumulator = 0;
    stats.reset();
    round++;
    setActivity('moving');
    wake();
  };

  const layout = () => {
    const viewport = { widthPx: els.host.clientWidth, heightPx: els.host.clientHeight };
    if (viewport.widthPx === 0 || viewport.heightPx === 0) return;
    if (fit?.viewport.widthPx === viewport.widthPx && fit.viewport.heightPx === viewport.heightPx) return;

    fit = scene.resize(viewport);
    const nextArea = playArea(fit.ground);
    const nextKeepOut = pixelRectToGround(relativeRect(els.card, els.host), fit);
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
  const detachPointer = attachPointerInput({
    canvas: els.canvas,
    toGround: (xPx, yPx) => (fit ? screenToGround(xPx, yPx, fit, Physics.PUSHER_Y) : null),
    pushEnabled: true,
    onChange: (state, ground) => {
      if (state.kind === 'push' && ground) {
        physics.setPusher(ground);
        setActivity('moving');
        wake();
      } else {
        physics.setPusher(null);
      }
    },
  });
  layout();
  await scene.precompile();
  ready = true;
  wake();

  return {
    replay: startCascade,
    dispose() {
      cancelAnimationFrame(frame);
      detachPointer();
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      darkQuery.removeEventListener('change', onTheme);
      hud?.remove();
      physics.dispose();
      scene.dispose();
    },
  };
}

function createHud(host: HTMLElement): HTMLElement {
  const hud = document.createElement('div');
  hud.setAttribute('aria-hidden', 'true');
  hud.dataset['testid'] = 'hero-debug-hud';
  hud.style.cssText =
    'position:absolute;left:8px;bottom:8px;z-index:3;padding:4px 8px;border-radius:6px;' +
    'font:12px/1.4 ui-monospace,monospace;background:rgba(0,0,0,.65);color:#fff;pointer-events:none';
  host.appendChild(hud);
  return hud;
}
