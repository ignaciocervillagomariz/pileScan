import { PUSH } from './config';
import { BrickFootprint, nextExclusions } from './push-rules';

describe('nextExclusions', () => {
  const footprints: Record<number, BrickFootprint> = {
    1: { x: 0, z: 0, radius: 1 },
    2: { x: 10, z: 0, radius: 1 },
  };
  const at = (id: number) => footprints[id] ?? null;

  it('keeps a brick excluded while the pusher still overlaps it, so it gets no sudden kick', () => {
    const near = { x: 1 + PUSH.radius - 0.1, z: 0 };
    expect(nextExclusions(new Set([1]), near, at).has(1)).toBe(true);
  });

  it('releases it once the pusher has moved clear', () => {
    const clear = { x: 1 + PUSH.radius + 0.1, z: 0 };
    expect(nextExclusions(new Set([1]), clear, at).has(1)).toBe(false);
  });

  it('never adds bricks: only ones the pusher appeared inside are excluded', () => {
    expect(nextExclusions(new Set(), { x: 0, z: 0 }, at).size).toBe(0);
  });

  it('releases everything when the pusher is off', () => {
    expect(nextExclusions(new Set([1, 2]), null, at).size).toBe(0);
  });
});
