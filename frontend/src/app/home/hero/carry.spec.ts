import RAPIER from '@dimforge/rapier3d-compat';
import { Carry, CarryView, PointerRay, snapProgress, tiltFor } from './carry';
import { SHAPES } from './catalog';
import { CARRY, DIMENSIONS } from './config';
import { Physics, RapierModule } from './physics';
import { IDENTITY, Vec3 } from './pose';
import { Stacks } from './stacks';

const H = DIMENSIONS.brickHeight;
const DT = 1 / 60;

describe('snap animation', () => {
  it('starts where the stack was released and ends exactly on the target', () => {
    expect(snapProgress(0, true)).toEqual({ blend: 0, lift: 0 });
    expect(snapProgress(1, true).blend).toBe(1);
    expect(snapProgress(1, true).lift).toBeCloseTo(0, 6);
  });

  it('bounces a little after landing, and never sinks below the target', () => {
    const lifts = Array.from({ length: 101 }, (_, i) => snapProgress(i / 100, true).lift);
    expect(Math.max(...lifts)).toBeGreaterThan(0);
    expect(Math.max(...lifts)).toBeLessThanOrEqual(CARRY.bounceHeight);
    expect(Math.min(...lifts)).toBeGreaterThanOrEqual(0);
  });

  it('has no bounce with reduced motion', () => {
    expect(snapProgress(0.8, false).lift).toBe(0);
  });
});

describe('carry tilt', () => {
  it('grows with speed and is capped', () => {
    expect(tiltFor(0)).toBe(0);
    expect(tiltFor(CARRY.tiltFullSpeed / 2)).toBeLessThan(tiltFor(CARRY.tiltFullSpeed));
    expect(tiltFor(1000)).toBeCloseTo((CARRY.tiltMaxDeg * Math.PI) / 180);
  });
});

describe('Carry with real physics', () => {
  const rapier = RAPIER as unknown as RapierModule;
  beforeAll(() => RAPIER.init());

  const view: CarryView = { setCarried: () => undefined, setGhost: () => undefined, setBlobShadow: () => undefined };
  const shapeById = new Map<number, string>();
  const down = (x: number, z: number): PointerRay => ({ origin: { x, y: 50, z }, direction: { x: 0, y: -1, z: 0 } });

  function setup(bricks: { id: number; shape: string; x: number; z: number }[]) {
    const physics = new Physics(rapier, 30);
    const stacks = new Stacks();
    for (const b of bricks) {
      const shape = SHAPES.find((s) => s.id === b.shape)!;
      shapeById.set(b.id, b.shape);
      physics.addBrick(b.id, { shape, position: { x: b.x, y: shape.height / 2, z: b.z }, rotation: IDENTITY, linvel: { x: 0, y: 0, z: 0 }, angvel: { x: 0, y: 0, z: 0 } });
      stacks.add(b.id);
    }
    for (let i = 0; i < 60; i++) physics.step();
    const carry = new Carry({
      physics,
      stacks,
      view,
      shapeOf: (id) => SHAPES.find((s) => s.id === shapeById.get(id)) ?? null,
      clamp: (x, z) => ({ x, z }),
      reducedMotion: false,
    });
    const run = (frames: number, each?: (i: number) => void) => {
      for (let i = 0; i < frames; i++) {
        each?.(i);
        carry.update(DT);
        physics.step();
      }
    };
    return { physics, stacks, carry, run };
  }

  const near = (a: Vec3 | null, b: Vec3 | null) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) : Infinity);

  it('carries a brick over another without moving it, then snaps it on top as one stack', () => {
    const { physics, stacks, carry, run } = setup([
      { id: 0, shape: 'brick-2x4', x: 0, z: 0 },
      { id: 1, shape: 'brick-1x2', x: -6, z: 0 },
    ]);
    const base = physics.position(0);
    expect(carry.begin(1, down(-6, 0))).toBe(true);
    run(90, (i) => carry.setPointer(down(-6 + (6.3 * i) / 89, 0.2)));
    expect(near(physics.position(0), base)).toBeLessThan(1e-4);
    expect(carry.target).toBe(0);

    carry.release();
    run(60);
    expect(carry.busy).toBe(false);
    expect(stacks.stackOf(1)).toBe(0);
    const top = physics.position(1)!;
    expect(top.y).toBeCloseTo(H * 1.5, 2);
    // On the stud grid of the base: x at a half stud, z at a whole stud.
    expect(Math.abs(top.x) % 1).toBeCloseTo(0.5, 2);
    expect(Math.abs(top.z) % 1).toBeCloseTo(0, 2);
  });

  it('carries the whole stack wherever it is pressed, and it stays one piece', () => {
    const { physics, stacks, carry, run } = setup([
      { id: 0, shape: 'brick-2x4', x: 0, z: 0 },
      { id: 1, shape: 'brick-2x2', x: -6, z: 0 },
    ]);
    carry.begin(1, down(-6, 0));
    run(60, () => carry.setPointer(down(0, 0)));
    carry.release();
    run(60);
    expect(stacks.stackOf(1)).toBe(0);

    // Press on the top brick: the whole stack lifts, the base included.
    expect(carry.begin(1, down(0, 0))).toBe(true);
    expect([...carry.carriedIds].sort()).toEqual([0, 1]);
    run(90, () => carry.setPointer(down(6, 3)));
    const a = physics.position(0)!;
    const b = physics.position(1)!;
    expect(a.x).toBeCloseTo(6, 1);
    expect(b.y - a.y).toBeCloseTo(H, 2);
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(1.1);
    carry.release();
    run(240);
    expect(physics.position(0)!.y).toBeCloseTo(H / 2, 1);
  });
});
