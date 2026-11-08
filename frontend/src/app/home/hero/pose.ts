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
