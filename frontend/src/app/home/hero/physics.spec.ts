/**
 * These run the real Rapier engine (the -compat build of the app's version, see RapierModule):
 * the guarantees here are about collisions, which a pure model could only assume.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { SHAPES } from './catalog';
import { DIMENSIONS } from './config';
import { Physics, RapierModule } from './physics';
import { IDENTITY, toLocal, Vec3, yawQuat } from './pose';

const H = DIMENSIONS.brickHeight;
const shape = (id: string) => SHAPES.find((s) => s.id === id)!;
const still = { x: 0, y: 0, z: 0 };

// Same Rapier version as the app, with the wasm inlined. Its classes are declared separately, so
// TypeScript sees them as different types although the API is identical.
const rapier = RAPIER as unknown as RapierModule;
beforeAll(() => RAPIER.init());

function world(): Physics {
  return new Physics(rapier, 30);
}

function add(physics: Physics, id: number, shapeId: string, at: { x: number; y?: number; z: number }): void {
  physics.addBrick(id, {
    shape: shape(shapeId),
    position: { x: at.x, y: at.y ?? shape(shapeId).height / 2, z: at.z },
    rotation: IDENTITY,
    linvel: still,
    angvel: still,
  });
}

function steps(physics: Physics, n: number, each?: (i: number) => void): void {
  for (let i = 0; i < n; i++) {
    each?.(i);
    physics.step();
  }
}

const distance = (a: Vec3 | null, b: Vec3 | null) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) : Infinity);

describe('physics: carrying', () => {
  it('carrying a brick over (and even through) others moves none of them', () => {
    const physics = world();
    add(physics, 0, 'brick-1x2', { x: -4, z: 0 });
    add(physics, 1, 'brick-2x2', { x: 0, z: 0 });
    add(physics, 2, 'brick-2x4', { x: 3, z: 0.5 });
    add(physics, 3, 'plate-2x2', { x: 6, z: -0.5 });
    steps(physics, 120);
    const before = [1, 2, 3].map((id) => physics.position(id));

    physics.liftStack(0);
    // Low enough to cut straight through the others: only the collision groups keep them still.
    steps(physics, 120, (i) => physics.carryStack(0, { x: -4 + (14 * i) / 119, y: H / 2, z: 0 }, yawQuat(i * 0.05)));
    steps(physics, 30);

    [1, 2, 3].forEach((id, i) => expect(distance(physics.position(id), before[i])).toBeLessThan(1e-4));
    expect(physics.position(0)?.x).toBeCloseTo(10, 1);
    physics.dispose();
  });

  it('a carried stack moves as one', () => {
    const physics = world();
    add(physics, 0, 'brick-2x4', { x: 0, z: 0 });
    add(physics, 1, 'brick-2x2', { x: 0, y: H * 1.5, z: 0.5 });
    steps(physics, 60);
    physics.liftStack(1);
    physics.mergeStack(1, 0);
    expect(physics.stackPose(1)).toBeNull();

    physics.liftStack(0);
    const turn = yawQuat(Math.PI / 2);
    steps(physics, 90, (i) => physics.carryStack(0, { x: (5 * i) / 89, y: 3, z: (2 * i) / 89 }, turn));
    const base = physics.stackPose(0)!;
    expect(base.position.x).toBeCloseTo(5, 3);
    const offset = toLocal(base.position, base.rotation, physics.position(1)!);
    expect(offset.x).toBeCloseTo(0, 3);
    expect(offset.y).toBeCloseTo(H, 2);
    expect(offset.z).toBeCloseTo(0.5, 2);
    physics.dispose();
  });

  it('an invalid release drops onto the table and lands studs-up', () => {
    const physics = world();
    add(physics, 0, 'brick-1x2', { x: 0, z: 0 });
    steps(physics, 30);
    physics.liftStack(0);
    steps(physics, 30, () => physics.carryStack(0, { x: 8, y: 3, z: 2 }, IDENTITY));
    physics.dropStack(0);
    steps(physics, 240);
    const p = physics.position(0)!;
    expect(p.y).toBeCloseTo(H / 2, 1);
    expect(p.x).toBeCloseTo(8, 1);
    expect(physics.isResting()).toBe(true);
    physics.dispose();
  });

  it('a dropped stack collides normally: it lands on a brick below instead of passing through', () => {
    const physics = world();
    add(physics, 0, 'brick-2x2', { x: -5, z: 0 });
    add(physics, 1, 'brick-2x4', { x: 0, z: 0 });
    steps(physics, 30);
    physics.liftStack(0);
    steps(physics, 30, () => physics.carryStack(0, { x: 0, y: 3, z: 0 }, IDENTITY));
    physics.dropStack(0);
    steps(physics, 240);
    expect(physics.position(0)!.y).toBeCloseTo(H * 1.5, 1);
    physics.dispose();
  });
});
