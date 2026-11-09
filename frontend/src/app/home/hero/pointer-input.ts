/**
 * DOM adapter: turns pointer events on the canvas into speed samples (all coalesced samples
 * where the browser provides them), runs the interaction reducer and reports the result.
 * Mouse and trackpad push without a button; touch pushes with a horizontal swipe (the canvas
 * has touch-action: pan-y, so vertical swipes scroll the page and arrive as pointercancel).
 * Any page scroll pauses interaction briefly: the canvas moves under a still cursor, and
 * browsers then send pointermoves that look like a fast swipe.
 */
import { PUSH } from './config';
import { AWAY, InteractionState, transition } from './interaction';
import { classifyMotion, Motion, PointerSpeed } from './pointer-classifier';

export interface PointerReport {
  readonly state: InteractionState;
  /** Canvas-relative CSS pixels; null while away. */
  readonly position: { readonly x: number; readonly y: number } | null;
  readonly speedPxPerS: number;
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

export function attachPointerInput(
  canvas: HTMLCanvasElement,
  options: { readonly pushEnabled: boolean; readonly onReport: (report: PointerReport) => void },
): PointerInput {
  const speed = new PointerSpeed();
  const eventTimes: number[] = [];
  let state: InteractionState = AWAY;
  let motion: Motion = 'still';
  let position: { x: number; y: number } | null = null;
  let stillTimer: ReturnType<typeof setTimeout> | undefined;
  let pausedUntil = 0;
  let pointerType = '-';
  let samplesPerEvent = 1;

  const report = (next: InteractionState) => {
    state = next;
    options.onReport({ state, position: state.kind === 'away' ? null : position, speedPxPerS: speed.speed });
  };
  const apply = (event: Parameters<typeof transition>[1]) =>
    report(transition(state, event, { pushEnabled: options.pushEnabled }));

  /** A pointer that stops sends no more events: drop to the dead zone after a short gap. */
  const onStill = () => {
    speed.reset();
    motion = 'still';
    if (state.kind !== 'away') apply({ type: 'move', motion });
  };

  const onMove = (e: PointerEvent) => {
    if (e.timeStamp < pausedUntil) return;
    pointerType = e.pointerType;
    const rect = canvas.getBoundingClientRect();
    const coalesced = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    const samples = coalesced.length > 0 ? coalesced : [e];
    samplesPerEvent = samples.length;
    for (const s of samples) speed.add({ x: s.clientX - rect.left, y: s.clientY - rect.top, timeMs: s.timeStamp });
    position = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    eventTimes.push(e.timeStamp);
    while (eventTimes.length > 0 && eventTimes[0] < e.timeStamp - 1000) eventTimes.shift();

    motion = classifyMotion(motion, speed.speed);
    apply({ type: 'move', motion });
    clearTimeout(stillTimer);
    stillTimer = setTimeout(onStill, PUSH.maxSampleGapMs);
  };

  const end = (type: 'leave' | 'cancel') => {
    clearTimeout(stillTimer);
    speed.reset();
    motion = 'still';
    apply({ type });
  };
  const onLeave = () => end('leave');
  const onCancel = () => end('cancel');
  /** A lifted finger ends the gesture; a released mouse button does not. */
  const onUp = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') end('leave');
  };
  const onScroll = (e: Event) => {
    pausedUntil = e.timeStamp + PUSH.scrollPauseMs;
    if (state.kind !== 'away') end('cancel');
  };

  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('pointerup', onUp);
  // Scroll events don't bubble, but a capturing listener sees them all (ion-content scrolls inside).
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });

  return {
    stats: () => ({ pointerType, eventsPerSecond: eventTimes.length, samplesPerEvent }),
    detach() {
      clearTimeout(stillTimer);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('pointerup', onUp);
      document.removeEventListener('scroll', onScroll, { capture: true });
    },
  };
}
