/**
 * Pure rules for which bricks ignore the pusher. Under a slow pointer, the hover (and, in
 * phase 4, grab) candidate must not flee from the cursor: that is the brick under the cursor,
 * or else the nearest one the pusher capsule already touches (approaching a brick would
 * otherwise nudge it away before the cursor gets there). Other bricks the capsule grazes are
 * still nudged. A brick stays excluded until the pusher no longer overlaps it, so it never
 * gets a sudden kick when the cursor slides off.
 */
import { PUSH } from './config';

export interface BrickFootprint {
  readonly x: number;
  readonly z: number;
  /** Radius of the circle around the brick's footprint. */
  readonly radius: number;
}

export function hoverCandidate(
  brickUnderPointer: number | null,
  touchingNearestFirst: readonly number[],
  speedPxPerS: number,
  cfg: Pick<typeof PUSH, 'hoverMaxPxPerS'> = PUSH,
): number | null {
  if (speedPxPerS > cfg.hoverMaxPxPerS) return null;
  return brickUnderPointer ?? touchingNearestFirst[0] ?? null;
}

export function nextExclusions(
  previous: ReadonlySet<number>,
  hovered: number | null,
  pusher: { readonly x: number; readonly z: number } | null,
  footprint: (id: number) => BrickFootprint | null,
  cfg: Pick<typeof PUSH, 'radius'> = PUSH,
): Set<number> {
  const next = new Set<number>();
  if (hovered !== null) next.add(hovered);
  if (!pusher) return next;
  for (const id of previous) {
    const f = footprint(id);
    if (f && Math.hypot(f.x - pusher.x, f.z - pusher.z) < f.radius + cfg.radius) next.add(id);
  }
  return next;
}
