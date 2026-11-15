/**
 * Pure rule for which bricks ignore the pusher. The pusher appears at the pointer when a push or
 * a sweep starts, and it may appear inside a brick (the cursor rested on it). Rapier would then
 * shove that brick out at full depenetration speed, which looks like an explosion rather than a
 * push. So bricks the pusher overlaps when it appears ignore it until it has moved clear of
 * them; every other contact is a normal collision. This is about placement, not speed: there is
 * no speed threshold.
 */
import { PUSH } from './config';

export interface BrickFootprint {
  readonly x: number;
  readonly z: number;
  /** Radius of the circle around the brick's footprint. */
  readonly radius: number;
}

/** Keeps a brick excluded while the pusher still overlaps it; drops the rest. */
export function nextExclusions(
  previous: ReadonlySet<number>,
  pusher: { readonly x: number; readonly z: number } | null,
  footprint: (id: number) => BrickFootprint | null,
  cfg: Pick<typeof PUSH, 'radius'> = PUSH,
): Set<number> {
  const next = new Set<number>();
  if (!pusher) return next;
  for (const id of previous) {
    const f = footprint(id);
    if (f && Math.hypot(f.x - pusher.x, f.z - pusher.z) < f.radius + cfg.radius) next.add(id);
  }
  return next;
}
