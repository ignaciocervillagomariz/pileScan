/**
 * Pure pointer-speed classification: is the pointer moving fast enough to push bricks?
 * Speeds are measured on the ground plane, so the thresholds mean the same on every screen.
 */
import { PUSH } from './config';

export interface GroundSample {
  readonly x: number;
  readonly z: number;
  /** Event timestamp in ms. */
  readonly timeMs: number;
}

export type Motion = 'slow' | 'fast';

/** Exponential moving average of the pointer's ground speed, in studs per second. */
export class PointerSpeed {
  private last: GroundSample | null = null;
  private value = 0;

  constructor(private readonly cfg: Pick<typeof PUSH, 'speedTauMs' | 'maxSampleGapMs'> = PUSH) {}

  get speed(): number {
    return this.value;
  }

  add(sample: GroundSample): number {
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
    const instant = (Math.hypot(sample.x - last.x, sample.z - last.z) / dtMs) * 1000;
    const alpha = 1 - Math.exp(-dtMs / this.cfg.speedTauMs);
    this.value += alpha * (instant - this.value);
    return this.value;
  }

  reset(): void {
    this.last = null;
    this.value = 0;
  }
}

/**
 * Hysteresis between the two thresholds: a pointer slowing down mid-swipe keeps pushing, and a
 * slow pointer never starts.
 */
export function classifyMotion(
  previous: Motion,
  speed: number,
  cfg: Pick<typeof PUSH, 'enterSpeed' | 'exitSpeed'> = PUSH,
): Motion {
  if (previous === 'fast') return speed < cfg.exitSpeed ? 'slow' : 'fast';
  return speed > cfg.enterSpeed ? 'fast' : 'slow';
}
