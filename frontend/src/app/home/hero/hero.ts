/**
 * Entry point of the lazily loaded hero chunk. Wires scene, physics and pointer input to the
 * host element and runs the loop: fixed 60 Hz physics, render on demand (also for the ambient
 * easing), paused when off-screen or hidden. The active tool (set by the page's dock) decides
 * what the pointer does; see `interaction.ts`.
 */
import * as RAPIER from '@dimforge/rapier3d';
import { approach, parallaxAngles, parallaxMargin, settled } from './ambient';
import { Carry } from './carry';
import { footprintRadius, gravityFor, planCascade, Spawn } from './cascade';
import { ADAPTIVE, AMBIENT, CARRY, CASCADE, DEBUG, GLOVE, PHYSICS, PUSH, WALLS } from './config';
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
import { AWAY, InteractionState, PressTarget, pusherActive, transition } from './interaction';
import { yieldToMain } from './perf';
import { Physics, PUSHER_Y } from './physics';
import { attachPointerInput, PointerReport, PointerStats, PressKind } from './pointer-input';
import { nextExclusions } from './push-rules';
import { QualityTier, TIERS } from './quality';
import { HeroScene, Theme } from './scene';
import { Stacks } from './stacks';
import { DEFAULT_TOOL, Tool } from './tools';

/** Which cursor the canvas shows; the page's stylesheet maps it to the cursor images. */
export type HeroCursor = 'default' | 'glove-open' | 'glove-closed' | 'separator';

export type HeroActivity = 'moving' | 'resting';

/** What the ?debug=1 overlay shows about the scene. */
export interface HeroDebugInfo {
  readonly fps: number;
  readonly p95Ms: number;
  readonly tier: string;
  readonly bricks: number;
  readonly redrops: number;
  readonly tool: Tool;
  readonly pointerState: string;
  readonly speedPxPerS: number;
  readonly input: PointerStats;
  readonly pusher: { readonly x: number; readonly z: number } | null;
  readonly hovered: { readonly id: number; readonly x: number; readonly z: number } | null;
  readonly excluded: number;
  /** The carried stack's bricks and its snap target, if any. */
  readonly carry: { readonly bricks: number; readonly target: number | null } | null;
}

export interface HeroOptions {
  readonly tier: QualityTier;
  readonly debug: boolean;
  /** prefers-reduced-motion: gentle pushes, no parallax, lift or idle drops. */
  readonly reducedMotion: boolean;
  /** Called when the bricks start moving or come to rest (state attribute, tests). */
  readonly onActivity?: (activity: HeroActivity) => void;
  /** Called when the visitor does something with the active tool (the hint fades). */
  readonly onInteract?: () => void;
  /** ?debug=1 only: called at most every DEBUG.refreshMs. */
  readonly onDebug?: (info: HeroDebugInfo) => void;
}

export interface HeroElements {
  /** The hero section: its size is the scene's viewport. */
  readonly host: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  /** Overlays (the text card, the tool dock): bricks keep out of the areas under them. */
  readonly keepOuts: readonly HTMLElement[];
}

export interface HeroHandle {
  /** Clears the table and drops a new cascade. */
  replay(): void;
  /** Switches the tool; whatever the pointer was doing ends. */
  setTool(tool: Tool): void;
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
  const physics = new Physics(RAPIER, 1, options.reducedMotion ? PUSH.reducedMotionMaxSpeed : PUSH.maxSpeed);
  const stats = new FrameStats();

  let fit: CameraFit | null = null;
  let area: GroundRect | null = null;
  let keepOuts: GroundRect[] = [];
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

  let tool: Tool = DEFAULT_TOOL;
  let interaction: InteractionState = AWAY;
  let pointer: PointerReport | null = null;
  /** Glove: the brick under a hovering mouse or pen; its whole stack lifts slightly (never moves). */
  let hovered: number | null = null;
  let hoveredStack = new Set<number>();
  /** Trackpads send many small wheel events: a quarter turn per this much scrolling. */
  let wheelSum = 0;
  const stacks = new Stacks();
  let excluded = new Set<number>();
  const lifts = new Map<number, number>();
  let lastInteractionAt = performance.now();
  let lastIdleDropAt = 0;

  const setActivity = (next: HeroActivity) => {
    if (next === activity) return;
    activity = next;
    options.onActivity?.(next);
  };

  /** Nearest point inside the play area and clear of the keep-out blocks, `margin` from their edges. */
  const safeSpot = (x: number, z: number, margin = 1): { x: number; z: number } => {
    if (!area) return { x, z };
    let spot = clampInto(area, x, z, margin);
    for (const keepOut of keepOuts) {
      const blocked = inflate(keepOut, WALLS.cardMargin);
      if (contains(inflate(blocked, margin - 1), spot.x, spot.z)) {
        const out = pushOut(inflate(blocked, margin), spot.x, spot.z);
        spot = clampInto(area, out.x, out.z, margin);
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
    stacks.add(id);
  };

  const carry = new Carry({
    physics,
    stacks,
    view: scene,
    shapeOf: (id) => plan[id]?.shape ?? null,
    clamp: (x, z, radius) => safeSpot(x, z, radius),
    reducedMotion: options.reducedMotion,
  });

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

  /** Applies the overlap rule: which bricks still pass through a freshly placed pusher. */
  const updateExclusions = () => {
    const next = nextExclusions(excluded, physics.pusherPosition, (id) => {
      const p = physics.position(id);
      return p && plan[id] ? { x: p.x, z: p.z, radius: footprintRadius(plan[id].shape) } : null;
    });
    for (const id of excluded) if (!next.has(id)) physics.setIgnoresPusher(id, false);
    for (const id of next) if (!excluded.has(id)) physics.setIgnoresPusher(id, true);
    excluded = next;
  };

  /** Eases the Glove's hover lift (visual only). Returns true while animating. */
  const updateLifts = (dt: number): boolean => {
    let animating = false;
    physics.forEachPose((id) => {
      const current = lifts.get(id) ?? 0;
      const target = hoveredStack.has(id) && physics.isSleeping(id) ? GLOVE.hoverLift : 0;
      if (settled(current, target, 1e-4)) {
        if (target === 0) lifts.delete(id);
        else lifts.set(id, target);
        return;
      }
      lifts.set(id, approach(current, target, GLOVE.liftRate, dt));
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
      tool,
      pointerState: interaction.kind,
      speedPxPerS: pointer?.speedPxPerS ?? 0,
      input: input.stats(),
      pusher,
      hovered: hoveredInfo(),
      excluded: excluded.size,
      carry: carry.busy ? { bricks: carry.carriedIds.length, target: carry.target } : null,
    });
  };

  const tick = (now: number) => {
    frame = 0;
    const elapsedMs = lastTick > 0 ? now - lastTick : PHYSICS.step * 1000;
    lastTick = now;
    stats.add(elapsedMs);
    const dt = Math.min(elapsedMs, 100) / 1000;

    carry.update(dt);
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
    const carried = new Set(carry.carriedIds);
    physics.forEachPose((id, pose) => {
      if (!carried.has(id) && isEscaped(pose.position)) redrop(id, pose.position);
      scene.setPose(id, pose.position, pose.rotation, lifts.get(id) ?? 0);
    });
    scene.render();
    adaptQuality();
    reportDebug(now);

    const resting = nextSpawn >= released && !carry.busy && !physics.pusherMoving && physics.isResting();
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

  const cursorFor = (): HeroCursor => {
    switch (tool) {
      case 'push':
        return 'default';
      case 'separator':
        return 'separator';
      case 'glove':
        return interaction.kind === 'sweeping' || interaction.kind === 'carrying' ? 'glove-closed' : 'glove-open';
    }
  };

  const setInteraction = (next: InteractionState) => {
    const acting = (s: InteractionState) => s.kind === 'pushing' || s.kind === 'sweeping' || s.kind === 'carrying';
    if (acting(next) && !acting(interaction)) options.onInteract?.();
    // However carrying ends (release, pointer gone, tool switched), the stack snaps or drops.
    if (interaction.kind === 'carrying' && next.kind !== 'carrying') carry.release();
    interaction = next;
    els.canvas.dataset['cursor'] = cursorFor();
  };

  const setHovered = (brick: number | null) => {
    hovered = brick;
    const stack = brick === null ? null : stacks.stackOf(brick);
    hoveredStack = new Set(stack === null ? [] : stacks.membersOf(stack).map((m) => m.id));
    scene.setHighlight(hoveredStack);
  };

  /** The pointer is gone (left, cancelled, tool switched): nothing follows it any more. */
  const stopFollowing = () => {
    physics.setPusher(null);
    setHovered(null);
    scene.setParallaxTarget(0, 0);
  };

  /** Starts or moves the pusher. Bricks it appears inside ignore it until it has moved clear. */
  const followWithPusher = (at: { x: number; z: number }) => {
    if (!physics.pushing) {
      excluded = new Set(physics.bricksTouching(at.x, at.z));
      for (const id of excluded) physics.setIgnoresPusher(id, true);
    }
    physics.setPusher(at);
  };

  /**
   * What a press lands on. A touch hold only grabs a brick (a hold on the table is left to the
   * browser); a sideways touch drag always sweeps or pushes, wherever it started.
   */
  const pressTarget = (kind: PressKind, under: number | null): PressTarget | null => {
    if (kind === 'hold') return tool === 'glove' && under !== null && !carry.busy ? 'brick' : null;
    if (kind === 'drag') return 'table';
    // A stack still snapping into place can't be grabbed again until it has landed.
    return under === null ? 'table' : carry.busy ? null : 'brick';
  };

  const onPointer = (report: PointerReport): boolean => {
    pointer = report;
    lastInteractionAt = performance.now();
    const ray = report.position ? scene.rayAt(report.position.x, report.position.y) : null;
    const onPlane = ray ? rayToPlane(ray.origin, ray.direction, PUSHER_Y) : null;
    if (!ray || !onPlane || !fit) {
      setInteraction(transition(interaction, { type: 'leave' }, tool));
      stopFollowing();
      wake();
      return false;
    }
    const under = physics.brickAt(ray.origin, ray.direction);
    const { action } = report;
    let taken = true;
    if (action.type === 'press') {
      const on = pressTarget(action.kind, under);
      if (on === null) {
        taken = false;
      } else {
        const next = transition(interaction, { type: 'press', on }, tool);
        // Carrying starts only if the stack could really be picked up.
        if (next.kind === 'carrying' && !(under !== null && carry.begin(under, ray))) {
          setInteraction(transition(interaction, { type: 'release' }, tool));
        } else {
          setInteraction(next);
        }
      }
    } else {
      setInteraction(transition(interaction, action, tool));
    }
    if (interaction.kind === 'carrying') carry.setPointer(ray);

    if (pusherActive(interaction)) followWithPusher(onPlane);
    else physics.setPusher(null);
    updateExclusions();
    // Hovering is the Glove's only visible feedback, and touch has no hover.
    setHovered(tool === 'glove' && interaction.kind === 'hovering' && report.hovers && !carry.busy ? under : null);

    if (!report.hovers) scene.setParallaxTarget(0, 0);
    if (ambient && report.hovers && report.position) {
      const { widthPx, heightPx } = fit.viewport;
      const a = parallaxAngles((report.position.x / widthPx) * 2 - 1, (report.position.y / heightPx) * 2 - 1);
      scene.setParallaxTarget(a.yaw, a.pitch);
    }
    wake();
    return taken;
  };

  /** R or the mouse wheel turns a carried stack a quarter turn. */
  const onKey = (e: KeyboardEvent) => {
    if (interaction.kind !== 'carrying' || e.repeat || (e.key !== 'r' && e.key !== 'R')) return;
    carry.rotate(e.shiftKey ? -1 : 1);
    wake();
  };
  const onWheel = (e: WheelEvent) => {
    if (interaction.kind !== 'carrying') return;
    // Only while carrying: otherwise the wheel scrolls the page as usual.
    e.preventDefault();
    wheelSum += e.deltaY;
    if (Math.abs(wheelSum) < CARRY.wheelStepPx) return;
    carry.rotate(wheelSum > 0 ? 1 : -1);
    wheelSum = 0;
    wake();
  };

  const setTool = (next: Tool) => {
    if (next === tool) return;
    tool = next;
    setInteraction(AWAY);
    stopFollowing();
    updateExclusions();
    wake();
  };

  const startCascade = () => {
    if (!fit || !area) return;
    carry.reset();
    setInteraction(AWAY);
    physics.removeAllBricks();
    stacks.clear();
    setHovered(null);
    excluded = new Set();
    lifts.clear();
    const extra = idleDrop ? AMBIENT.idleDrop.max : 0;
    plan = planCascade({
      count: tier.brickCount + extra,
      area,
      keepOuts: keepOuts.map((k) => inflate(k, WALLS.cardMargin)),
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

    const cam = scene.resize(viewport);
    fit = cam;
    // The parallax can shift the view by this much: keep bricks (and the card margin) inside it.
    const shift = ambient ? parallaxMargin(fit.distance) : 0;
    const nextArea = playArea(fit.ground, shift);
    keepOuts = els.keepOuts.map((el) => inflate(pixelRectToGround(relativeRect(el, els.host), cam), shift));
    area = nextArea;
    const spawnHeight = fit.height * CASCADE.spawnHeightShare;
    physics.setGravity(gravityFor(spawnHeight));
    physics.setWalls(wallLayout(nextArea, keepOuts, spawnHeight + WALLS.headroom));

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
  const input = attachPointerInput(els.canvas, onPointer);
  document.addEventListener('keydown', onKey);
  els.canvas.addEventListener('wheel', onWheel, { passive: false });
  els.canvas.dataset['cursor'] = cursorFor();
  layout();
  await scene.precompile();
  ready = true;
  wake();

  return {
    replay: startCascade,
    setTool,
    dispose() {
      cancelAnimationFrame(frame);
      clearInterval(idleTimer);
      input.detach();
      document.removeEventListener('keydown', onKey);
      els.canvas.removeEventListener('wheel', onWheel);
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      darkQuery.removeEventListener('change', onTheme);
      physics.dispose();
      scene.dispose();
    },
  };
}
