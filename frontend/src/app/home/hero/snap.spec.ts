import { CARRY, DIMENSIONS } from './config';
import { IDENTITY, Quat, tiltQuat, yawOf, yawQuat } from './pose';
import { Carried, carryCenterY, gridOffsets, snapTarget, WorldBrick } from './snap';

const H = DIMENSIONS.brickHeight;
const DEG = Math.PI / 180;

function brick(
  id: number,
  size: [number, number],
  at: { x: number; z: number; layer?: number },
  extra: Partial<WorldBrick> = {},
): WorldBrick {
  const layer = at.layer ?? 0;
  return {
    id,
    center: { x: at.x, y: H / 2 + layer * H, z: at.z },
    rotation: IDENTITY,
    width: size[0],
    depth: size[1],
    height: H,
    hasStuds: true,
    settled: true,
    level: layer,
    stackHeight: layer + 1,
    ...extra,
  };
}

function carried(size: [number, number], at: { x: number; z: number }, yaw = 0, layers = 1): Carried {
  const parts = Array.from({ length: layers }, (_, i) => ({
    offset: { x: 0, y: i * H, z: 0 },
    yaw: 0,
    width: size[0],
    depth: size[1],
    height: H,
  }));
  return { position: { x: at.x, y: 10, z: at.z }, yaw, parts, layers };
}

describe('carry height', () => {
  it('flies one brick of clearance above the bare table', () => {
    expect(carryCenterY(carried([1, 2], { x: 0, z: 0 }), [])).toBeCloseTo(CARRY.clearance + H / 2);
  });

  it('passes over the highest stack under any part of its footprint', () => {
    const world = [brick(1, [2, 4], { x: 0, z: 0 }), brick(2, [2, 2], { x: 0, z: 0, layer: 1 }), brick(3, [1, 1], { x: 6, z: 0 })];
    // A 1x4 whose far end only grazes the stack still has to clear it.
    const y = carryCenterY(carried([4, 1], { x: 2.6, z: 0 }), world);
    expect(y).toBeCloseTo(2 * H + CARRY.clearance + H / 2);
  });
});

describe('snap target', () => {
  it('is the topmost brick under the carried stack, not the one below it', () => {
    const base = brick(1, [2, 4], { x: 0, z: 0 }, { stackHeight: 2 });
    const top = brick(2, [2, 2], { x: 0, z: 0, layer: 1 }, { stackHeight: 2 });
    const snap = snapTarget(carried([1, 2], { x: 0.2, z: 0.3 }), [base, top]);
    expect(snap?.targetId).toBe(2);
    expect(snap?.position.y).toBeCloseTo(2 * H + H / 2);
  });

  it('lands on the stud grid at the nearest position, with at least one stud overlapping', () => {
    const snap = snapTarget(carried([1, 2], { x: 0.3, z: 0.1 }), [brick(1, [2, 4], { x: 0, z: 0 })]);
    expect(snap?.local.position.x).toBeCloseTo(0.5);
    expect(snap?.local.position.z).toBeCloseTo(0);
    // Near the edge, it is pulled in so one stud still overlaps.
    const edge = snapTarget(carried([4, 2], { x: 0.95, z: 0 }), [brick(1, [2, 4], { x: 0, z: 0 })]);
    expect(edge?.local.position.x).toBeCloseTo(1);
  });

  it('only allows offsets with at least one stud overlapping', () => {
    expect(gridOffsets(2, 1)).toEqual([-0.5, 0.5]);
    expect(gridOffsets(2, 4)).toEqual([-2, -1, 0, 1, 2]);
    expect(gridOffsets(1, 1)).toEqual([0]);
  });

  it('turns in 90° steps relative to the target', () => {
    const target = brick(1, [2, 4], { x: 0, z: 0 }, { rotation: yawQuat(20 * DEG) });
    const snap = snapTarget(carried([2, 2], { x: 0, z: 0 }, 95 * DEG), [target]);
    expect(snap?.local.quarterTurns).toBe(1);
    expect(yawOf(snap?.rotation as Quat)).toBeCloseTo(110 * DEG);
  });

  it('snaps a free angle to the nearest quarter turn relative to a turned target', () => {
    const target = brick(1, [2, 4], { x: 0, z: 0 }, { rotation: yawQuat(30 * DEG) });
    // 30° + 50° is 50° from the target: nearer a quarter turn than none.
    const near = snapTarget(carried([2, 2], { x: 0, z: 0 }, 80 * DEG), [target]);
    expect(near?.local.quarterTurns).toBe(1);
    expect(yawOf(near?.rotation as Quat)).toBeCloseTo(120 * DEG);
    // 40° from the target: back to no turn. Angles past a full turn wrap around.
    const back = snapTarget(carried([2, 2], { x: 0, z: 0 }, (30 + 40 + 360) * DEG), [target]);
    expect(back?.local.quarterTurns).toBe(0);
    expect(yawOf(back?.rotation as Quat)).toBeCloseTo(30 * DEG);
  });

  it('skips positions that would overlap another brick and takes the next nearest', () => {
    const base = brick(1, [2, 4], { x: 0, z: 0 }, { stackHeight: 2 });
    // A 1x2 already on the left half of the base, front.
    const neighbor = brick(2, [1, 2], { x: -0.5, z: -1, layer: 1 }, { stackHeight: 2 });
    const snap = snapTarget(carried([2, 2], { x: 0.4, z: -0.5 }), [base, neighbor]);
    expect(snap?.targetId).toBe(1);
    expect(snap?.local.position.x).toBeCloseTo(1);
  });

  it('respects the combined height limit of a carried stack', () => {
    const top = brick(5, [2, 2], { x: 0, z: 0, layer: 4 }, { stackHeight: 5 });
    expect(snapTarget(carried([2, 2], { x: 0, z: 0 }, 0, 1), [top])).not.toBeNull();
    expect(snapTarget(carried([2, 2], { x: 0, z: 0 }, 0, 2), [top])).toBeNull();
    expect(CARRY.maxStackHeight).toBe(6);
  });

  it('never targets a tile, a tilted brick or one still moving', () => {
    const at = carried([1, 2], { x: 0, z: 0 });
    expect(snapTarget(at, [brick(1, [2, 2], { x: 0, z: 0 }, { hasStuds: false })])).toBeNull();
    expect(snapTarget(at, [brick(1, [2, 2], { x: 0, z: 0 }, { rotation: tiltQuat(1, 0, 30 * DEG) })])).toBeNull();
    expect(snapTarget(at, [brick(1, [2, 2], { x: 0, z: 0 }, { settled: false })])).toBeNull();
  });

  it('has no target over the bare table', () => {
    expect(snapTarget(carried([1, 2], { x: 5, z: 5 }), [brick(1, [2, 2], { x: 0, z: 0 })])).toBeNull();
  });
});
