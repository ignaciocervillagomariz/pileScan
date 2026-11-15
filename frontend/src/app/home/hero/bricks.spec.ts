import { BufferGeometry } from 'three';
import { buildShapeGeometry } from './bricks';
import { SHAPES, undersideLayout } from './catalog';
import { DIMENSIONS } from './config';
import { TIERS } from './quality';

const shape = (id: string) => SHAPES.find((s) => s.id === id)!;
const triangles = (g: BufferGeometry) => g.getAttribute('position').count / 3;
const high = { studSegments: TIERS.high.studSegments, undersideSegments: TIERS.high.undersideSegments };

describe('underside layout', () => {
  it('has tubes on 2-wide shapes and pins on 1-wide ones, one between each pair of studs', () => {
    const count = (id: string) => {
      const u = undersideLayout(shape(id));
      return { tubes: u.tubes.length, pins: u.pins.length };
    };
    expect(count('brick-1x1')).toEqual({ tubes: 0, pins: 0 });
    expect(count('brick-1x2')).toEqual({ tubes: 0, pins: 1 });
    expect(count('brick-1x4')).toEqual({ tubes: 0, pins: 3 });
    expect(count('brick-2x2')).toEqual({ tubes: 1, pins: 0 });
    expect(count('brick-2x4')).toEqual({ tubes: 3, pins: 0 });
    // Plates and tiles follow the same pattern.
    expect(count('plate-2x4')).toEqual({ tubes: 3, pins: 0 });
    expect(count('tile-1x2')).toEqual({ tubes: 0, pins: 1 });
  });

  it('puts them where the studs meet', () => {
    expect(undersideLayout(shape('brick-2x4')).tubes).toEqual([
      { x: 0, z: -1 },
      { x: 0, z: 0 },
      { x: 0, z: 1 },
    ]);
    expect(undersideLayout(shape('brick-1x2')).pins).toEqual([{ x: 0, z: 0 }]);
  });
});

describe('brick geometry', () => {
  it('stays within a triangle budget per shape (high tier)', () => {
    const budget: Record<string, number> = {
      'brick-1x1': 600,
      'brick-1x2': 900,
      'brick-1x4': 1450,
      'brick-2x2': 1450,
      'brick-2x4': 2550,
      'plate-1x2': 900,
      'plate-2x2': 1450,
      'plate-2x4': 2550,
      'tile-1x2': 400,
      'tile-2x2': 450,
    };
    for (const s of SHAPES) expect(triangles(buildShapeGeometry(s, high)), s.id).toBeLessThanOrEqual(budget[s.id]);
  });

  it('is open at the bottom: nothing covers the middle of the underside', () => {
    const g = buildShapeGeometry(shape('brick-1x1'), high);
    const position = g.getAttribute('position');
    const bottom = -shape('brick-1x1').height / 2;
    for (let i = 0; i < position.count; i++) {
      const onBottom = Math.abs(position.getY(i) - bottom) < 1e-6;
      if (onBottom) expect(Math.max(Math.abs(position.getX(i)), Math.abs(position.getZ(i)))).toBeGreaterThan(0.3);
    }
  });

  it('stays inside the collider box, apart from the studs on top', () => {
    for (const s of SHAPES) {
      const box = buildShapeGeometry(s, high);
      box.computeBoundingBox();
      const b = box.boundingBox!;
      expect(b.min.y, s.id).toBeCloseTo(-s.height / 2, 6);
      expect(b.max.x, s.id).toBeLessThanOrEqual(s.width / 2);
      expect(b.max.z, s.id).toBeLessThanOrEqual(s.depth / 2);
      expect(b.max.y, s.id).toBeLessThanOrEqual(s.height / 2 + (s.hasStuds ? DIMENSIONS.studHeight : 0) + 1e-6);
    }
  });
});
