/**
 * Pure rules for the Separator: where a click splits a stack, how the piece pops off, and the
 * small animations (a swell on the piece, a shake on a loose brick).
 */
import { SEPARATOR } from './config';
import { Vec3 } from './pose';
import { Stacks } from './stacks';

export type SeparatorAction =
  /** Nothing to separate: the brick is loose. */
  | { readonly kind: 'shake'; readonly brick: number }
  /** Each piece pops off as one, its first brick being the piece's bottom. */
  | { readonly kind: 'split'; readonly stack: number; readonly pieces: readonly (readonly number[])[] };

/**
 * A click on a stacked brick splits at the connection below it: the brick and everything above
 * it come off together. On the bottom brick there is no connection below, so it splits at the
 * connection(s) above it: each brick standing on it comes off with what is above it.
 */
export function separatorAction(stacks: Stacks, brick: number): SeparatorAction {
  const stack = stacks.stackOf(brick);
  const member = stacks.member(brick);
  if (stack === null || member === null || stacks.membersOf(stack).length < 2) return { kind: 'shake', brick };
  const piece = (root: number) => [root, ...stacks.above(root)];
  if (member.parent !== null) return { kind: 'split', stack, pieces: [piece(brick)] };
  const onTop = stacks.membersOf(stack).filter((m) => m.parent === brick);
  return { kind: 'split', stack, pieces: onTop.map((m) => piece(m.id)) };
}

/**
 * Velocities that make a piece pop off: up by about `popHeight` under this gravity, a little
 * away from the rest of the stack, spinning slightly. `away` is the piece's offset from the
 * stack it leaves (only its direction counts).
 */
export function popVelocity(
  gravity: number,
  away: { readonly x: number; readonly z: number },
  spinSign: 1 | -1,
  gentle: boolean,
  cfg = SEPARATOR,
): { linvel: Vec3; angvel: Vec3 } {
  const share = gentle ? cfg.reducedMotionShare : 1;
  const up = Math.sqrt(2 * gravity * cfg.popHeight * share);
  const length = Math.hypot(away.x, away.z);
  // Straight on top: pick a fixed side rather than none, so it never lands back in place.
  const dir = length > 0.05 ? { x: away.x / length, z: away.z / length } : { x: Math.SQRT1_2, z: Math.SQRT1_2 };
  const side = up * cfg.awayShare;
  return {
    linvel: { x: dir.x * side, y: up, z: dir.z * side },
    // Tumble about the horizontal axis across the direction of travel: the far edge dips.
    angvel: { x: dir.z * cfg.tumble * share, y: spinSign * cfg.spin * share, z: -dir.x * cfg.tumble * share },
  };
}

/** Scale of a popping brick at `t` seconds: a quick swell and back to 1. */
export function popScale(t: number, cfg = SEPARATOR): number {
  if (t <= 0 || t >= cfg.popSeconds) return 1;
  return 1 + cfg.popScale * Math.sin((Math.PI * t) / cfg.popSeconds);
}

/** Visual shake of a loose brick at `t` seconds: a sideways offset (studs) and a yaw (radians). */
export function shakeAt(t: number, gentle: boolean, cfg = SEPARATOR): { offset: number; yaw: number } {
  if (t <= 0 || t >= cfg.shakeSeconds) return { offset: 0, yaw: 0 };
  const decay = 1 - t / cfg.shakeSeconds;
  const wave = Math.sin(2 * Math.PI * cfg.shakeHz * t) * decay * (gentle ? cfg.reducedMotionShare : 1);
  return { offset: cfg.shakeAmplitude * wave, yaw: ((cfg.shakeDeg * Math.PI) / 180) * wave };
}
