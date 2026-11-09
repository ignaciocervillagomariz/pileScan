/**
 * DOM adapter: turns pointer events on the canvas into ground samples, classifies their speed
 * and runs the interaction reducer. Mouse pushes without a button; touch pushes with a
 * horizontal swipe (the canvas has touch-action: pan-y, so vertical swipes still scroll the
 * page and arrive here as pointercancel).
 */
import { PUSH } from './config';
import { IDLE, InteractionState, transition } from './interaction';
import { classifyMotion, PointerSpeed } from './pointer-classifier';

export interface PointerInputOptions {
  readonly canvas: HTMLCanvasElement;
  /** Projects a canvas pixel onto the interaction plane; null before the first layout. */
  readonly toGround: (xPx: number, yPx: number) => { x: number; z: number } | null;
  readonly pushEnabled: boolean;
  readonly onChange: (state: InteractionState, ground: { x: number; z: number } | null) => void;
}

export function attachPointerInput(opts: PointerInputOptions): () => void {
  const { canvas } = opts;
  const speed = new PointerSpeed();
  let state: InteractionState = IDLE;
  let stillTimer: ReturnType<typeof setTimeout> | undefined;

  const emit = (next: InteractionState, ground: { x: number; z: number } | null) => {
    state = next;
    opts.onChange(state, ground);
  };

  /** A pointer that stops sends no more events: without this, a push would never end. */
  const onStill = () => {
    speed.reset();
    emit(transition(state, { type: 'move', motion: 'slow' }, { pushEnabled: opts.pushEnabled }), null);
  };

  const onMove = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    const ground = opts.toGround(e.clientX - rect.left, e.clientY - rect.top);
    if (!ground) return;
    const v = speed.add({ x: ground.x, z: ground.z, timeMs: e.timeStamp });
    const motion = classifyMotion(state.kind === 'push' ? 'fast' : 'slow', v);
    emit(transition(state, { type: 'move', motion }, { pushEnabled: opts.pushEnabled }), ground);
    clearTimeout(stillTimer);
    if (state.kind === 'push') stillTimer = setTimeout(onStill, PUSH.maxSampleGapMs);
  };

  const onLeave = () => {
    clearTimeout(stillTimer);
    speed.reset();
    emit(transition(state, { type: 'leave' }, { pushEnabled: opts.pushEnabled }), null);
  };

  const onCancel = () => {
    clearTimeout(stillTimer);
    speed.reset();
    emit(transition(state, { type: 'cancel' }, { pushEnabled: opts.pushEnabled }), null);
  };

  /** A lifted finger ends the gesture; a released mouse button does not (the mouse is still there). */
  const onUp = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') onLeave();
  };

  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('pointerup', onUp);
  return () => {
    clearTimeout(stillTimer);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerleave', onLeave);
    canvas.removeEventListener('pointercancel', onCancel);
    canvas.removeEventListener('pointerup', onUp);
  };
}
