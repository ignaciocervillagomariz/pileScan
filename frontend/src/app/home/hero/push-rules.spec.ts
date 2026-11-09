import { PUSH } from './config';
import { BrickFootprint, hoverCandidate, nextExclusions } from './push-rules';

describe('hoverCandidate', () => {
  const slow = PUSH.hoverMaxPxPerS - 1;

  it('is the brick under a slow pointer, and nothing under a fast one', () => {
    expect(hoverCandidate(4, [], slow)).toBe(4);
    expect(hoverCandidate(4, [4], PUSH.hoverMaxPxPerS + 1)).toBeNull();
    expect(hoverCandidate(null, [], 0)).toBeNull();
  });

  it('claims the nearest brick the pusher already touches, so approaching never nudges it away', () => {
    expect(hoverCandidate(null, [7, 3], slow)).toBe(7);
  });

  it('prefers the brick under the cursor over a merely touched one', () => {
    expect(hoverCandidate(4, [7], slow)).toBe(4);
  });
});

describe('nextExclusions', () => {
  const footprints: Record<number, BrickFootprint> = {
    1: { x: 0, z: 0, radius: 1 },
    2: { x: 10, z: 0, radius: 1 },
  };
  const at = (id: number) => footprints[id] ?? null;

  it('excludes the hovered brick so it never flees the cursor', () => {
    expect([...nextExclusions(new Set(), 1, { x: 0, z: 0 }, at)]).toEqual([1]);
  });

  it('keeps a brick excluded while the pusher still overlaps it, so it gets no sudden kick', () => {
    const near = { x: 1 + PUSH.radius - 0.1, z: 0 };
    expect(nextExclusions(new Set([1]), null, near, at).has(1)).toBe(true);
  });

  it('releases it once the pusher has moved clear', () => {
    const clear = { x: 1 + PUSH.radius + 0.1, z: 0 };
    expect(nextExclusions(new Set([1]), null, clear, at).has(1)).toBe(false);
  });

  it('releases everything except the hovered brick when the pusher is off', () => {
    expect([...nextExclusions(new Set([1, 2]), 2, null, at)]).toEqual([2]);
  });
});
