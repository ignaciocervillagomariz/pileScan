/** Pure math for the ambient effects: camera parallax and frame-rate independent easing. */
import { AMBIENT } from './config';

const DEG = Math.PI / 180;

/**
 * Camera orbit offsets (radians) for a pointer at normalized hero coordinates (-1..1 on each
 * axis, 0 = center). Clamped, so a pointer outside the hero never over-rotates.
 */
export function parallaxAngles(
  nx: number,
  ny: number,
  maxDeg: number = AMBIENT.parallaxMaxDeg,
): { yaw: number; pitch: number } {
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  return { yaw: clamp(nx) * maxDeg * DEG, pitch: clamp(ny) * maxDeg * DEG };
}

/** How far the parallax can shift the visible ground: walls and keep-out move in by this much. */
export function parallaxMargin(cameraDistance: number, maxDeg: number = AMBIENT.parallaxMaxDeg): number {
  return cameraDistance * Math.tan(maxDeg * DEG);
}

/** Frame-rate independent exponential easing toward a target. */
export function approach(current: number, target: number, ratePerSecond: number, dtSeconds: number): number {
  return target + (current - target) * Math.exp(-ratePerSecond * dtSeconds);
}

/** True when the value is close enough to its target to stop animating. */
export function settled(current: number, target: number, epsilon = 1e-4): boolean {
  return Math.abs(current - target) < epsilon;
}
