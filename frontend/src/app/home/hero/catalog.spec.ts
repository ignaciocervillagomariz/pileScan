import { colorIndex, PALETTE, SHAPES, studCenters } from './catalog';
import { DIMENSIONS } from './config';

describe('brick catalog', () => {
  it('has the ten requested shapes with real proportions (1 unit = 8 mm)', () => {
    expect(SHAPES.map((s) => s.id)).toEqual([
      'brick-1x1',
      'brick-1x2',
      'brick-1x4',
      'brick-2x2',
      'brick-2x4',
      'plate-1x2',
      'plate-2x2',
      'plate-2x4',
      'tile-1x2',
      'tile-2x2',
    ]);
    expect(DIMENSIONS.brickHeight).toBeCloseTo(1.2);
    expect(DIMENSIONS.plateHeight).toBeCloseTo(0.4);
    expect(DIMENSIONS.studRadius * 2).toBeCloseTo(0.6);
  });

  it('gives tiles no studs, so nothing can be stacked on them', () => {
    expect(SHAPES.filter((s) => !s.hasStuds).every((s) => s.kind === 'tile')).toBe(true);
  });

  it('centers studs on the body, one per stud of footprint', () => {
    const c = studCenters({ id: 'b', kind: 'brick', width: 2, depth: 4, height: 1.2, hasStuds: true });
    expect(c).toHaveLength(8);
    expect(Math.min(...c.map((p) => p.x))).toBe(-0.5);
    expect(Math.max(...c.map((p) => p.z))).toBe(1.5);
  });

  it('has the ten palette colors and rejects unknown names', () => {
    expect(PALETTE).toHaveLength(10);
    expect(PALETTE[colorIndex('White')].name).toBe('White');
    expect(() => colorIndex('Chrome Gold')).toThrow();
  });
});
