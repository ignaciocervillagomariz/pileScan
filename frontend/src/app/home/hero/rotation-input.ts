/**
 * Keys and wheel events that turn a carried stack. R turns a quarter (Shift+R the other way).
 * Wheel events become finer steps. A mouse sends one large event per
 * notch; a trackpad sends a stream of small ones. Deltas add up and give one step per
 * `wheelThresholdPx`, and a single event never gives more than one step, so a mouse notch is
 * one step whatever size the browser reports, and a short trackpad swipe gives a few.
 */
import { ROTATION } from './config';

/** WheelEvent.deltaMode values (the DOM constants, kept here so tests need no DOM). */
const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;

/** Pixels per line in line mode (Firefox with a mouse): a typical line height. */
const LINE_PX = 16;

const DEG = Math.PI / 180;

/** The turn for a key press, in radians, or null if the key doesn't turn anything. */
export function keyTurn(key: string, shift: boolean): number | null {
  if (key !== 'r' && key !== 'R') return null;
  return (shift ? -90 : 90) * DEG;
}

/** One wheel step, in radians, in the given direction. */
export function wheelTurn(step: -1 | 1, cfg = ROTATION): number {
  return step * cfg.stepDeg * DEG;
}

export interface WheelSample {
  readonly deltaY: number;
  readonly deltaMode: number;
  /** Event time in ms. */
  readonly timeMs: number;
}

export function deltaInPixels(deltaY: number, deltaMode: number, pagePx: number): number {
  if (deltaMode === DOM_DELTA_LINE) return deltaY * LINE_PX;
  if (deltaMode === DOM_DELTA_PAGE) return deltaY * pagePx;
  return deltaY;
}

export class WheelAccumulator {
  private sum = 0;
  private lastMs = -Infinity;

  constructor(
    private readonly pagePx: number,
    private readonly cfg = ROTATION,
  ) {}

  /** Scrolling added up so far, in px (debug overlay). */
  get accumulated(): number {
    return this.sum;
  }

  /** Adds one event; returns the steps to turn: -1, 0 or 1 (positive = scrolling down). */
  add(sample: WheelSample): -1 | 0 | 1 {
    // A pause ends the gesture: leftovers from the last swipe must not count toward the next.
    if (sample.timeMs - this.lastMs > this.cfg.wheelIdleResetMs) this.sum = 0;
    this.lastMs = sample.timeMs;
    const threshold = this.cfg.wheelThresholdPx;
    const px = deltaInPixels(sample.deltaY, sample.deltaMode, this.pagePx);
    this.sum = Math.max(-threshold, Math.min(threshold, this.sum + px));
    if (Math.abs(this.sum) < threshold) return 0;
    const step = this.sum > 0 ? 1 : -1;
    this.sum = 0;
    return step;
  }

  reset(): void {
    this.sum = 0;
    this.lastMs = -Infinity;
  }
}
