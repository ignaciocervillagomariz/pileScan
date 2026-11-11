/**
 * Pure pointer measurement: speed (for the debug overlay; the pusher's strength comes from
 * following the pointer itself), whether the pointer moved at all, and what a touch gesture is
 * for. Speeds are in CSS px/s: they describe the hand, so they hold on every screen size.
 */
import { PUSH } from './config';

export interface PointerSample {
  /** CSS pixels relative to the canvas. */
  readonly x: number;
  readonly y: number;
  /** Event timestamp in ms. */
  readonly timeMs: number;
}

/**
 * `still`: the pointer has not moved (no events for `PUSH.maxSampleGapMs`, or an event at the
 * same spot). `moving`: any displacement at all. There is deliberately no speed threshold.
 */
export type Motion = 'still' | 'moving';

/** Exponential moving average of the pointer speed, in px/s. */
export class PointerSpeed {
  private last: PointerSample | null = null;
  private value = 0;

  constructor(private readonly cfg: Pick<typeof PUSH, 'speedTauMs' | 'maxSampleGapMs'> = PUSH) {}

  get speed(): number {
    return this.value;
  }

  add(sample: PointerSample): number {
    const last = this.last;
    this.last = sample;
    if (!last) return this.value;
    const dtMs = sample.timeMs - last.timeMs;
    if (dtMs <= 0) return this.value;
    if (dtMs > this.cfg.maxSampleGapMs) {
      // A gap means the pointer stopped or left: start over instead of averaging a jump.
      this.value = 0;
      return this.value;
    }
    const instant = (Math.hypot(sample.x - last.x, sample.y - last.y) / dtMs) * 1000;
    const alpha = 1 - Math.exp(-dtMs / this.cfg.speedTauMs);
    this.value += alpha * (instant - this.value);
    return this.value;
  }

  reset(): void {
    this.last = null;
    this.value = 0;
  }
}

/** Any displacement counts as movement, however slow: only a completely still pointer is ignored. */
export function motionOf(dxPx: number, dyPx: number): Motion {
  return dxPx !== 0 || dyPx !== 0 ? 'moving' : 'still';
}

/** What a touch gesture is for: undecided inside the slop, then a sideways push or a scroll. */
export type TouchIntent = 'undecided' | 'push' | 'scroll';

/** Mostly vertical means scroll (the browser handles it, touch-action: pan-y); sideways pushes. */
export function touchIntent(dx: number, dy: number, cfg: Pick<typeof PUSH, 'touchSlopPx'> = PUSH): TouchIntent {
  if (Math.hypot(dx, dy) < cfg.touchSlopPx) return 'undecided';
  return Math.abs(dx) > Math.abs(dy) ? 'push' : 'scroll';
}
