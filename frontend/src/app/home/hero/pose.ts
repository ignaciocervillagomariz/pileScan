/** Plain pose types shared by the layout, physics and render layers (no three.js). */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Quat {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

export interface BrickInstance {
  readonly shapeId: string;
  readonly colorIndex: number;
  readonly position: Vec3;
  readonly rotation: Quat;
}

/** Rotation about the vertical axis. */
export function yawQuat(radians: number): Quat {
  return { x: 0, y: Math.sin(radians / 2), z: 0, w: Math.cos(radians / 2) };
}

export const IDENTITY: Quat = { x: 0, y: 0, z: 0, w: 1 };

export function multiplyQuat(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

export function conjugate(q: Quat): Quat {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

/** Rotates a vector by a unit quaternion. */
export function rotate(q: Quat, v: Vec3): Vec3 {
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

/** Heading of the local X axis on the ground plane, in radians (same sense as `yawQuat`). */
export function yawOf(q: Quat): number {
  const x = rotate(q, { x: 1, y: 0, z: 0 });
  return Math.atan2(-x.z, x.x);
}

/** Cosine of the angle between the local up axis and world up: 1 when studs point straight up. */
export function uprightness(q: Quat): number {
  return rotate(q, { x: 0, y: 1, z: 0 }).y;
}

/** Rotation about a horizontal axis (x, z) by `radians`; used for the carry tilt. */
export function tiltQuat(axisX: number, axisZ: number, radians: number): Quat {
  const length = Math.hypot(axisX, axisZ);
  if (length < 1e-9 || radians === 0) return IDENTITY;
  const s = Math.sin(radians / 2) / length;
  return { x: axisX * s, y: 0, z: axisZ * s, w: Math.cos(radians / 2) };
}

/** Normalized linear interpolation, taking the short way round. Fine for small steps. */
export function nlerpQuat(a: Quat, b: Quat, t: number): Quat {
  const sign = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w < 0 ? -1 : 1;
  const x = a.x + (b.x * sign - a.x) * t;
  const y = a.y + (b.y * sign - a.y) * t;
  const z = a.z + (b.z * sign - a.z) * t;
  const w = a.w + (b.w * sign - a.w) * t;
  const n = Math.hypot(x, y, z, w);
  return { x: x / n, y: y / n, z: z / n, w: w / n };
}

/** World pose of a point given in a frame (`frame` position and rotation). */
export function toWorld(framePos: Vec3, frameRot: Quat, local: Vec3): Vec3 {
  const r = rotate(frameRot, local);
  return { x: framePos.x + r.x, y: framePos.y + r.y, z: framePos.z + r.z };
}

/** A world point expressed in a frame. */
export function toLocal(framePos: Vec3, frameRot: Quat, world: Vec3): Vec3 {
  return rotate(conjugate(frameRot), { x: world.x - framePos.x, y: world.y - framePos.y, z: world.z - framePos.z });
}
