import RAPIER from '@dimforge/rapier3d-compat';
import { SHAPES } from './catalog';
import { DIMENSIONS, SEPARATOR } from './config';
import { Physics, RapierModule } from './physics';
import { IDENTITY, toLocal, uprightness } from './pose';
import { popScale, popVelocity, separatorAction, shakeAt } from './separate';
import { Stacks } from './stacks';

const H = DIMENSIONS.brickHeight;

/** 1 at the bottom, 2 on 1, 3 on 2; 4 is loose. */
function tower(): Stacks {
  const s = new Stacks();
  [1, 2, 3, 4].forEach((id) => s.add(id));
  s.merge(3, 2);
  s.merge(2, 1);
  return s;
}

describe('separator: where it splits', () => {
  it('splits at the connection below the clicked brick: it comes off with everything above it', () => {
    expect(separatorAction(tower(), 2)).toEqual({ kind: 'split', stack: 1, pieces: [[2, 3]] });
    expect(separatorAction(tower(), 3)).toEqual({ kind: 'split', stack: 1, pieces: [[3]] });
  });

  it('on the bottom brick, splits at the connection above it instead', () => {
    expect(separatorAction(tower(), 1)).toEqual({ kind: 'split', stack: 1, pieces: [[2, 3]] });
    // Two bricks side by side on the base: each comes off with what is on it.
    const s = new Stacks();
    [1, 2, 3].forEach((id) => s.add(id));
    s.merge(2, 1);
    s.merge(3, 1);
    expect(separatorAction(s, 1)).toEqual({ kind: 'split', stack: 1, pieces: [[2], [3]] });
  });

  it('only shakes a loose brick', () => {
    expect(separatorAction(tower(), 4)).toEqual({ kind: 'shake', brick: 4 });
  });

  it('leaves both parts as stacks of their own', () => {
    const s = tower();
    expect(s.split(2)).toEqual([2, 3]);
    expect(s.stackOf(3)).toBe(2);
    expect(s.membersOf(2).map((m) => [m.id, m.parent, m.level])).toEqual([
      [2, null, 0],
      [3, 2, 1],
    ]);
    expect(s.membersOf(1).map((m) => m.id)).toEqual([1]);
    expect(() => s.split(1)).toThrow();
  });
});

describe('separator: motion', () => {
  it('pops up by about popHeight whatever the gravity, a little away, spinning', () => {
    for (const g of [30, 90]) {
      const v = popVelocity(g, { x: 1, z: 0 }, 1, false);
      expect((v.linvel.y * v.linvel.y) / (2 * g)).toBeCloseTo(SEPARATOR.popHeight);
      expect(v.linvel.x).toBeGreaterThan(0);
      expect(v.angvel.y).toBe(SEPARATOR.spin);
    }
    expect(popVelocity(30, { x: 0, z: 0 }, -1, false).linvel.x).not.toBe(0);
    expect(popVelocity(30, { x: 1, z: 0 }, 1, true).linvel.y).toBeLessThan(popVelocity(30, { x: 1, z: 0 }, 1, false).linvel.y);
  });

  it('swells briefly and returns to its size; the shake fades out', () => {
    expect(popScale(0)).toBe(1);
    expect(popScale(SEPARATOR.popSeconds / 2)).toBeCloseTo(1 + SEPARATOR.popScale);
    expect(popScale(SEPARATOR.popSeconds)).toBe(1);
    expect(shakeAt(SEPARATOR.shakeSeconds, false)).toEqual({ offset: 0, yaw: 0 });
    const peak = Math.max(...Array.from({ length: 50 }, (_, i) => Math.abs(shakeAt((i / 50) * SEPARATOR.shakeSeconds, false).offset)));
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(SEPARATOR.shakeAmplitude);
  });
});

describe('separator with real physics', () => {
  const rapier = RAPIER as unknown as RapierModule;
  beforeAll(() => RAPIER.init());

  it('pops the piece off as one body and leaves the rest of the stack in place', () => {
    const physics = new Physics(rapier, 30);
    const shape = SHAPES.find((s) => s.id === 'brick-2x2')!;
    for (const id of [1, 2, 3]) {
      physics.addBrick(id, { shape, position: { x: 0, y: H / 2 + (id - 1) * H, z: 0 }, rotation: IDENTITY, linvel: { x: 0, y: 0, z: 0 }, angvel: { x: 0, y: 0, z: 0 } });
    }
    for (let i = 0; i < 60; i++) physics.step();
    physics.liftStack(3);
    physics.mergeStack(3, 2);
    physics.dropStack(2);
    physics.liftStack(2);
    physics.mergeStack(2, 1);
    for (let i = 0; i < 30; i++) physics.step();
    const base = physics.position(1)!;
    const before = physics.stackPose(1)!;
    const offset = toLocal(before.position, before.rotation, physics.position(3)!).y - toLocal(before.position, before.rotation, physics.position(2)!).y;

    physics.splitStack([2, 3], popVelocity(physics.gravity, { x: 0, z: 0 }, 1, false));
    let peak = 0;
    for (let i = 0; i < 20; i++) {
      physics.step();
      peak = Math.max(peak, physics.position(2)!.y);
      const piece = physics.stackPose(2)!;
      // The piece stays one: 3 keeps its place on 2 while it flies and spins.
      expect(toLocal(piece.position, piece.rotation, physics.position(3)!).y).toBeCloseTo(offset, 4);
    }
    expect(peak).toBeGreaterThan(H * 1.5 + 0.5);
    // Friction with the spinning piece may drag it a fraction of a millimetre, no more.
    expect(Math.hypot(physics.position(1)!.x - base.x, physics.position(1)!.z - base.z)).toBeLessThan(0.1);
    expect(physics.position(1)!.y).toBeCloseTo(H / 2, 1);
    expect(uprightness(physics.rotation(1)!)).toBeGreaterThan(0.99);
    expect(physics.stackPose(1)).not.toBeNull();
    physics.dispose();
  });
});
