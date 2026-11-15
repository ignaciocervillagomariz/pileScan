/**
 * Pure stud-grid math for the Glove: how high a carried stack flies, and where it snaps.
 * No physics: a carried stack ignores every other brick, so these rules alone decide where it
 * can go. Units are studs (1 = 8 mm); a brick's local X runs along its width, Z along its depth.
 */
import { CARRY } from './config';
import { multiplyQuat, Quat, rotate, toLocal, toWorld, uprightness, Vec3, yawOf, yawQuat } from './pose';

/** A brick on the table (or in a stack), as the snap math sees it. */
export interface WorldBrick {
  readonly id: number;
  readonly center: Vec3;
  readonly rotation: Quat;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly hasStuds: boolean;
  /** At rest (its body sleeps). Only resting bricks are snap targets. */
  readonly settled: boolean;
  /** Its layer in its stack (0 = bottom) and that stack's height in layers. */
  readonly level: number;
  readonly stackHeight: number;
}

/** One brick of the carried stack, in the frame of the stack's bottom brick. */
export interface CarriedPart {
  readonly offset: Vec3;
  /** Yaw relative to the bottom brick (whole quarter turns once snapped). */
  readonly yaw: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
}

export interface Carried {
  /** Center of the bottom brick. */
  readonly position: Vec3;
  readonly yaw: number;
  /** The bottom brick first, with a zero offset. */
  readonly parts: readonly CarriedPart[];
  /** Height of the carried stack in layers. */
  readonly layers: number;
}

export interface SnapTarget {
  /** The brick the carried stack lands on. */
  readonly targetId: number;
  /** World pose of the carried bottom brick once snapped. */
  readonly position: Vec3;
  readonly rotation: Quat;
  /** The same pose in the target brick's frame (stays valid if the target is nudged). */
  readonly local: { readonly position: Vec3; readonly quarterTurns: number };
}

/** A ground rectangle: center, unit axis of its "width" side, and half extents. */
interface Rect {
  readonly cx: number;
  readonly cz: number;
  readonly ux: number;
  readonly uz: number;
  readonly hx: number;
  readonly hz: number;
}

interface Solid {
  readonly rect: Rect;
  readonly bottom: number;
  readonly top: number;
}

const QUARTER = Math.PI / 2;

function rectFor(cx: number, cz: number, yaw: number, width: number, depth: number): Rect {
  // Local X in world (x, z) is (cos, -sin) for yawQuat(yaw).
  return { cx, cz, ux: Math.cos(yaw), uz: -Math.sin(yaw), hx: width / 2, hz: depth / 2 };
}

/**
 * The space a world brick fills. Upright bricks use their real footprint; tilted or tumbled
 * ones use the bounding box of their rotated extents, which is safe (never too small).
 */
function solidOf(b: WorldBrick): Solid {
  const half = { x: b.width / 2, y: b.height / 2, z: b.depth / 2 };
  const ax = rotate(b.rotation, { x: half.x, y: 0, z: 0 });
  const ay = rotate(b.rotation, { x: 0, y: half.y, z: 0 });
  const az = rotate(b.rotation, { x: 0, y: 0, z: half.z });
  const halfY = Math.abs(ax.y) + Math.abs(ay.y) + Math.abs(az.y);
  const rect = isUpright(b)
    ? rectFor(b.center.x, b.center.z, yawOf(b.rotation), b.width, b.depth)
    : {
        cx: b.center.x,
        cz: b.center.z,
        ux: 1,
        uz: 0,
        hx: Math.abs(ax.x) + Math.abs(ay.x) + Math.abs(az.x),
        hz: Math.abs(ax.z) + Math.abs(ay.z) + Math.abs(az.z),
      };
  return { rect, bottom: b.center.y - halfY, top: b.center.y + halfY };
}

function isUpright(b: WorldBrick, cfg = CARRY): boolean {
  return uprightness(b.rotation) >= Math.cos((cfg.uprightMaxDeg * Math.PI) / 180);
}

function contains(r: Rect, x: number, z: number): boolean {
  const dx = x - r.cx;
  const dz = z - r.cz;
  const along = dx * r.ux + dz * r.uz;
  const across = -dx * r.uz + dz * r.ux;
  return Math.abs(along) <= r.hx && Math.abs(across) <= r.hz;
}

/** Separating-axis test for two ground rectangles, each shrunk by `margin` (touching is fine). */
function rectsOverlap(a: Rect, b: Rect, margin: number): boolean {
  const axes = [
    [a.ux, a.uz],
    [-a.uz, a.ux],
    [b.ux, b.uz],
    [-b.uz, b.ux],
  ];
  const dx = b.cx - a.cx;
  const dz = b.cz - a.cz;
  for (const [x, z] of axes) {
    const ra = Math.abs(a.hx * (a.ux * x + a.uz * z)) + Math.abs(a.hz * (-a.uz * x + a.ux * z));
    const rb = Math.abs(b.hx * (b.ux * x + b.uz * z)) + Math.abs(b.hz * (-b.uz * x + b.ux * z));
    if (Math.abs(dx * x + dz * z) >= ra + rb - 2 * margin) return false;
  }
  return true;
}

/** The carried parts as solids, with the bottom brick's center at `position` and the given rotation. */
function carriedSolids(carried: Carried, position: Vec3, rotation: Quat): Solid[] {
  const yaw = yawOf(rotation);
  return carried.parts.map((p) => {
    const c = toWorld(position, rotation, p.offset);
    return {
      rect: rectFor(c.x, c.z, yaw + p.yaw, p.width, p.depth),
      bottom: c.y - p.height / 2,
      top: c.y + p.height / 2,
    };
  });
}

/**
 * Height of the carried stack's bottom brick center while it flies: the highest top surface
 * under any of its parts, plus about one brick of clearance. It passes over stacks, never
 * through them.
 */
export function carryCenterY(carried: Carried, world: readonly WorldBrick[], cfg = CARRY): number {
  const rotation = yawQuat(carried.yaw);
  const footprints = carriedSolids(carried, carried.position, rotation).map((s) => s.rect);
  let surface = 0;
  for (const b of world) {
    const solid = solidOf(b);
    if (solid.top > surface && footprints.some((f) => rectsOverlap(f, solid.rect, 0))) surface = solid.top;
  }
  return surface + cfg.clearance + carried.parts[0].height / 2;
}

/**
 * The topmost brick under the carried stack's bottom center, or null over the bare table.
 * Only this brick can be the target: the carried stack never snaps to a brick hidden under
 * another.
 */
export function topmostUnder(x: number, z: number, world: readonly WorldBrick[]): WorldBrick | null {
  let best: WorldBrick | null = null;
  let bestTop = -Infinity;
  for (const b of world) {
    const solid = solidOf(b);
    if (solid.top > bestTop && contains(solid.rect, x, z)) {
      best = b;
      bestTop = solid.top;
    }
  }
  return best;
}

/**
 * Where the carried stack would snap: on the topmost brick under it, at the nearest position of
 * that brick's stud grid with at least one stud overlapping, turned in 90° steps, overlapping
 * no other brick, and with at most `CARRY.maxStackHeight` layers in the combined stack.
 * Null when there is no valid position (the release then drops the stack).
 */
export function snapTarget(carried: Carried, world: readonly WorldBrick[], cfg = CARRY): SnapTarget | null {
  const target = topmostUnder(carried.position.x, carried.position.z, world);
  if (!target || !target.hasStuds || !target.settled || !isUpright(target, cfg)) return null;
  if (target.level + 1 + carried.layers > cfg.maxStackHeight) return null;

  const bottom = carried.parts[0];
  const targetYaw = yawOf(target.rotation);
  const quarterTurns = (((Math.round((carried.yaw - targetYaw) / QUARTER) % 4) + 4) % 4) as 0 | 1 | 2 | 3;
  const turned = quarterTurns % 2 === 1;
  const w = turned ? bottom.depth : bottom.width;
  const d = turned ? bottom.width : bottom.depth;
  const here = toLocal(target.center, target.rotation, carried.position);
  const y = target.height / 2 + bottom.height / 2;
  const rotation = multiplyQuat(target.rotation, yawQuat(quarterTurns * QUARTER));

  const candidates: { x: number; z: number; distance: number }[] = [];
  for (const x of gridOffsets(target.width, w)) {
    for (const z of gridOffsets(target.depth, d)) {
      candidates.push({ x, z, distance: Math.hypot(x - here.x, z - here.z) });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance);

  const others = world.map((b) => ({ id: b.id, solid: solidOf(b) }));
  for (const c of candidates) {
    const local = { x: c.x, y, z: c.z };
    const position = toWorld(target.center, target.rotation, local);
    const solids = carriedSolids(carried, position, rotation);
    const blocked = solids.some((s) =>
      others.some(
        (o) =>
          Math.min(s.top, o.solid.top) - Math.max(s.bottom, o.solid.bottom) > cfg.overlapMargin &&
          rectsOverlap(s.rect, o.solid.rect, cfg.overlapMargin),
      ),
    );
    if (!blocked) return { targetId: target.id, position, rotation, local: { position: local, quarterTurns } };
  }
  return null;
}

/**
 * Centers (along one axis of the target) where a part `size` studs long sits on the target's
 * stud grid with at least one stud overlapping a target `targetSize` studs long.
 */
export function gridOffsets(targetSize: number, size: number): number[] {
  const reach = (targetSize + size) / 2 - 1;
  const offsets: number[] = [];
  for (let x = -reach; x <= reach + 1e-9; x += 1) offsets.push(Math.round(x * 2) / 2 + 0); // + 0 turns -0 into 0
  return offsets;
}
