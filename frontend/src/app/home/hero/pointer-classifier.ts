/**
 * Pure pointer-speed measurement and the dead-zone rule. Speeds are in CSS px/s: they describe
 * the hand, so the same thresholds hold on every screen size.
 */
import { PUSH } from './config';

export interface PointerSample {
  /** CSS pixels relative to the canvas. */
  readonly x: number;
  readonly y: number;
  /** Event timestamp in ms. */
  readonly timeMs: number;
}

/** `still`: inside the dead zone (resting cursor). `moving`: anything faster pushes. */
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

/** Dead zone with hysteresis, so a cursor resting on a brick doesn't flicker into a push. */
export function classifyMotion(
  previous: Motion,
  speedPxPerS: number,
  cfg: Pick<typeof PUSH, 'deadZonePxPerS' | 'deadZoneExitShare'> = PUSH,
): Motion {
  const threshold = previous === 'moving' ? cfg.deadZonePxPerS * cfg.deadZoneExitShare : cfg.deadZonePxPerS;
  return speedPxPerS > threshold ? 'moving' : 'still';
}
