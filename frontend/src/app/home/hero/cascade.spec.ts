import { footprintRadius, gravityFor, planCascade, randomRotation } from './cascade';
import { PALETTE } from './catalog';
import { CASCADE } from './config';
import { contains, inflate } from './layout';
import { createRandom } from './random';

const area = { minX: -24, maxX: 24, minZ: -14, maxZ: 14 };
const keepOut = { minX: -20, maxX: -6, minZ: -6, maxZ: 6 };
const input = { count: 35, area, keepOut, spawnHeight: 30, seed: 7 };

describe('planCascade', () => {
  const plan = planCascade(input);

  it('plans the requested number of bricks', () => {
    expect(plan).toHaveLength(35);
    expect(planCascade({ ...input, count: 15 })).toHaveLength(15);
  });

  it('releases them in order over ~2.5 s', () => {
    const times = plan.map((s) => s.atSeconds);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(times[0]).toBeGreaterThanOrEqual(0);
    expect(times[times.length - 1]).toBeLessThanOrEqual(CASCADE.durationSeconds * 1.1);
    expect(times[times.length - 1]).toBeGreaterThan(CASCADE.durationSeconds * 0.8);
  });

  it('drops every brick from above the spawn height, inside the area and outside the card', () => {
    for (const s of plan) {
      const r = footprintRadius(s.shape);
      expect(s.position.y).toBeGreaterThanOrEqual(input.spawnHeight);
      expect(contains(inflate(area, -r + 1e-9), s.position.x, s.position.z)).toBe(true);
      expect(contains(keepOut, s.position.x, s.position.z)).toBe(false);
    }
  });

  it('is deterministic for a seed and different across seeds', () => {
    expect(planCascade(input)).toEqual(plan);
    expect(planCascade({ ...input, seed: 8 })[0].position).not.toEqual(plan[0].position);
  });

  it('mixes shapes and always includes white and light grey', () => {
    expect(new Set(plan.map((s) => s.shape.id)).size).toBeGreaterThanOrEqual(8);
    const names = new Set(plan.map((s) => PALETTE[s.colorIndex].name));
    expect(names.has('White')).toBe(true);
    expect(names.has('Light Bluish Gray')).toBe(true);
  });

  it('starts every brick with a random, normalized rotation', () => {
    for (const { rotation: q } of plan) {
      expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1);
    }
  });
});

describe('planCascade on a phone', () => {
  // 390x844 portrait: the card spans the full width over the top third.
  const phoneArea = { minX: -9.3, maxX: 9.3, minZ: -20.7, maxZ: 20.7 };
  const fullWidthCard = { minX: -10.6, maxX: 10.6, minZ: -21, maxZ: -5 };

  it('never drops a brick inside the card keep-out, even when the free area is crowded', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const plan = planCascade({ count: 15, area: phoneArea, keepOut: fullWidthCard, spawnHeight: 40, seed });
      for (const s of plan) {
        expect(contains(fullWidthCard, s.position.x, s.position.z)).toBe(false);
      }
    }
  });

  it('still drops every brick when the keep-out covers the whole area', () => {
    const plan = planCascade({ count: 5, area: phoneArea, keepOut: inflate(phoneArea, 5), spawnHeight: 40, seed: 1 });
    expect(plan).toHaveLength(5);
  });
});

describe('cascade helpers', () => {
  it('derives gravity so the drop takes the configured time', () => {
    const g = gravityFor(30, 1);
    expect(g).toBeCloseTo(60);
    expect(Math.sqrt((2 * 30) / g)).toBeCloseTo(1);
  });

  it('gives a 2x4 a footprint radius of half its diagonal', () => {
    expect(footprintRadius({ id: 'b', kind: 'brick', width: 2, depth: 4, height: 1.2, hasStuds: true })).toBeCloseTo(
      Math.sqrt(5),
    );
  });

  it('produces unit quaternions', () => {
    const random = createRandom(1);
    for (let i = 0; i < 20; i++) {
      const q = randomRotation(random);
      expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1);
    }
  });
});
