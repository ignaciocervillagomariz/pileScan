import { multiplyQuat, rotate, tiltQuat, toLocal, toWorld, uprightness, yawOf, yawQuat } from './pose';

describe('pose helpers', () => {
  it('yawQuat and yawOf agree, including past 90 degrees', () => {
    for (const deg of [0, 30, 90, 135, -100]) {
      expect(yawOf(yawQuat((deg * Math.PI) / 180))).toBeCloseTo((deg * Math.PI) / 180);
    }
  });

  it('composes rotations in order (a then b in the frame of a)', () => {
    const q = multiplyQuat(yawQuat(Math.PI / 2), yawQuat(Math.PI / 2));
    expect(yawOf(q)).toBeCloseTo(Math.PI);
  });

  it('round-trips a point through a frame', () => {
    const pos = { x: 3, y: 1, z: -2 };
    const rot = multiplyQuat(yawQuat(0.7), tiltQuat(1, 0, 0.2));
    const p = toLocal(pos, rot, toWorld(pos, rot, { x: 0.5, y: 0.6, z: -1 }));
    expect(p.x).toBeCloseTo(0.5);
    expect(p.y).toBeCloseTo(0.6);
    expect(p.z).toBeCloseTo(-1);
  });

  it('measures how upright a rotation is', () => {
    expect(uprightness(yawQuat(1))).toBeCloseTo(1);
    expect(uprightness(tiltQuat(1, 0, Math.PI / 2))).toBeCloseTo(0);
    expect(rotate(tiltQuat(0, 1, Math.PI), { x: 0, y: 1, z: 0 }).y).toBeCloseTo(-1);
  });
});
