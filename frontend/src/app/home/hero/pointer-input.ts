/**
 * DOM adapter: turns pointer events on the canvas into actions (move, press, release, leave,
 * cancel) with a canvas-relative position and the pointer speed. It knows nothing about bricks
 * or tools: the hero decides what a press landed on and runs the interaction reducer.
 *
 * Mouse and pen report hover moves and button presses. Touch has no hover: a gesture reports
 * nothing until it is either clearly sideways (a `drag` press where the finger went down, then
 * moves) or held still for `CARRY.longPressMs` (a `hold` press). The canvas has
 * touch-action: pan-y, so vertical swipes scroll the page and arrive as pointercancel; once a
 * hold is taken, touchmove is cancelled so the page stays put while a stack is carried.
 * Any page scroll pauses interaction briefly: the canvas moves under a still cursor, and
 * browsers then send pointermoves that look like a fast swipe.
 */
import { CARRY, PUSH } from './config';
import { Motion, motionOf, PointerSpeed, TouchIntent, touchIntent } from './pointer-classifier';

/** How a press happened: a mouse or pen button, a sideways touch drag, or a touch held still. */
export type PressKind = 'button' | 'drag' | 'hold';

export type PointerAction =
  | { readonly type: 'move'; readonly motion: Motion }
  | { readonly type: 'press'; readonly kind: PressKind }
  | { readonly type: 'release' }
  | { readonly type: 'leave' }
  | { readonly type: 'cancel' };

export interface PointerReport {
  readonly action: PointerAction;
  /** Canvas-relative CSS pixels; null after leave or cancel. */
  readonly position: { readonly x: number; readonly y: number } | null;
  readonly speedPxPerS: number;
  /** Touch has no hover: hover effects (parallax, the Glove's lift) only follow mouse and pen. */
  readonly hovers: boolean;
}

/** Input diagnostics for the ?debug=1 overlay. */
export interface PointerStats {
  readonly pointerType: string;
  readonly eventsPerSecond: number;
  /** Coalesced samples per pointermove: >1 means the browser batches high-rate input. */
  readonly samplesPerEvent: number;
}

export interface PointerInput {
  stats(): PointerStats;
  detach(): void;
}

/**
 * `onReport` returns whether the scene took the gesture. That only matters for a touch hold:
 * a hold on the bare table is not taken, and the gesture can still become a drag or a scroll.
 */
export function attachPointerInput(
  canvas: HTMLCanvasElement,
  onReport: (report: PointerReport) => boolean,
): PointerInput {
  const speed = new PointerSpeed();
  const eventTimes: number[] = [];
  let position: { x: number; y: number } | null = null;
  let stillTimer: ReturnType<typeof setTimeout> | undefined;
  let pausedUntil = 0;
  let pointerType = '-';
  let samplesPerEvent = 1;
  /** Touch only: where the finger went down (client px), and what the gesture turned out to be. */
  let touchStart: { x: number; y: number } | null = null;
  /** `hold`: a long-press was taken; every move is reported and the page must not scroll. */
  let intent: TouchIntent | 'hold' = 'undecided';
  let holdTimer: ReturnType<typeof setTimeout> | undefined;

  const relative = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };
  const report = (action: PointerAction): boolean =>
    onReport({
      action,
      position: action.type === 'leave' || action.type === 'cancel' ? null : position,
      speedPxPerS: speed.speed,
      hovers: pointerType !== 'touch',
    });

  /** A pointer that stops sends no more events: it is still once the gap has passed. */
  const onStill = () => {
    speed.reset();
    if (position) report({ type: 'move', motion: 'still' });
  };

  const onHold = () => {
    if (!touchStart || intent !== 'undecided') return;
    position = relative(touchStart.x, touchStart.y);
    if (report({ type: 'press', kind: 'hold' })) intent = 'hold';
  };

  const onDown = (e: PointerEvent) => {
    if (e.timeStamp < pausedUntil) return;
    pointerType = e.pointerType;
    if (e.pointerType === 'touch') {
      touchStart = { x: e.clientX, y: e.clientY };
      intent = 'undecided';
      clearTimeout(holdTimer);
      holdTimer = setTimeout(onHold, CARRY.longPressMs);
      return;
    }
    if (e.button !== 0) return;
    // Keep receiving moves while the button is held, even over the card or outside the canvas.
    canvas.setPointerCapture(e.pointerId);
    position = relative(e.clientX, e.clientY);
    report({ type: 'press', kind: 'button' });
  };

  const onMove = (e: PointerEvent) => {
    if (e.timeStamp < pausedUntil) return;
    pointerType = e.pointerType;
    if (e.pointerType === 'touch' && touchStart) {
      if (intent === 'undecided') {
        intent = touchIntent(e.clientX - touchStart.x, e.clientY - touchStart.y);
        // Moving before the hold time means it is not a long-press.
        if (intent !== 'undecided') clearTimeout(holdTimer);
        // Until the gesture is clearly sideways, leave it to the browser (it may become a scroll).
        if (intent !== 'push') return;
        // The press lands where the finger went down, so a drag that starts on the table sweeps.
        position = relative(touchStart.x, touchStart.y);
        report({ type: 'press', kind: 'drag' });
      }
      if (intent !== 'push' && intent !== 'hold') return;
    }
    const rect = canvas.getBoundingClientRect();
    const coalesced = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    const samples = coalesced.length > 0 ? coalesced : [e];
    samplesPerEvent = samples.length;
    for (const s of samples) speed.add({ x: s.clientX - rect.left, y: s.clientY - rect.top, timeMs: s.timeStamp });
    const next = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const motion = position ? motionOf(next.x - position.x, next.y - position.y) : 'still';
    position = next;
    eventTimes.push(e.timeStamp);
    while (eventTimes.length > 0 && eventTimes[0] < e.timeStamp - 1000) eventTimes.shift();

    report({ type: 'move', motion });
    clearTimeout(stillTimer);
    stillTimer = setTimeout(onStill, PUSH.maxSampleGapMs);
  };

  const end = (type: 'leave' | 'cancel') => {
    clearTimeout(stillTimer);
    clearTimeout(holdTimer);
    touchStart = null;
    intent = 'undecided';
    speed.reset();
    position = null;
    report({ type });
  };
  const onLeave = () => end('leave');
  const onCancel = () => end('cancel');
  const onUp = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      if (intent === 'push' || intent === 'hold') report({ type: 'release' });
      end('leave');
      return;
    }
    if (e.button !== 0) return;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    report({ type: 'release' });
  };
  /** While a stack is carried by touch, the page must not scroll under it. */
  const onTouchMove = (e: TouchEvent) => {
    if (intent === 'hold' && e.cancelable) e.preventDefault();
  };
  const onScroll = (e: Event) => {
    pausedUntil = e.timeStamp + PUSH.scrollPauseMs;
    if (position || touchStart) end('cancel');
  };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  // Scroll events don't bubble, but a capturing listener sees them all (ion-content scrolls inside).
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });

  return {
    stats: () => ({ pointerType, eventsPerSecond: eventTimes.length, samplesPerEvent }),
    detach() {
      clearTimeout(stillTimer);
      clearTimeout(holdTimer);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('pointerup', onUp);
      document.removeEventListener('scroll', onScroll, { capture: true });
    },
  };
}
