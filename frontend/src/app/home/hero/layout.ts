/**
 * Pure mapping between the hero's CSS-pixel box and the ground plane (world units, Y up,
 * +X = screen right, +Z = screen down), plus the invisible walls derived from it.
 *
 * The camera sits at (0, d·cos t, d·sin t) looking at the origin, tilted by t from straight
 * down, with screen-up pointing to -Z. The scene uses the same pose (scene.ts).
 */
import { CAMERA, WALLS } from './config';

export interface Viewport {
  readonly widthPx: number;
  readonly heightPx: number;
}

/** Axis-aligned rectangle on the ground plane, in world units. */
export interface GroundRect {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** A DOM rectangle relative to the hero's top-left corner, in CSS pixels. */
export interface PixelRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface CameraFit {
  readonly viewport: Viewport;
  readonly studPx: number;
  readonly fovDeg: number;
  readonly tiltDeg: number;
  /** Distance from the camera to the origin along its view axis. */
  readonly distance: number;
  /** Camera height above the ground. */
  readonly height: number;
  /** Largest axis-aligned rectangle of ground that is fully visible. */
  readonly ground: GroundRect;
}

/** A box collider: center and half extents, world units. */
export interface Cuboid {
  readonly center: { x: number; y: number; z: number };
  readonly half: { x: number; y: number; z: number };
}

const DEG = Math.PI / 180;

export function studPixels(v: Viewport, cfg = CAMERA.studPx): number {
  const ideal = Math.min(v.widthPx, v.heightPx) * cfg.shareOfShortSide;
  return Math.min(cfg.max, Math.max(cfg.min, ideal));
}

/**
 * Picks the distance that shows the hero box at `studPx` per stud when seen straight down,
 * then measures what the (possibly tilted) camera really sees.
 */
export function fitCamera(
  v: Viewport,
  fovDeg: number = CAMERA.fovDeg,
  tiltDeg: number = CAMERA.tiltDeg,
): CameraFit {
  const studPx = studPixels(v);
  const distance = v.heightPx / studPx / 2 / Math.tan((fovDeg / 2) * DEG);
  const partial = { viewport: v, studPx, fovDeg, tiltDeg, distance, height: distance * Math.cos(tiltDeg * DEG) };
  const corners = [
    screenToGround(0, 0, partial),
    screenToGround(v.widthPx, 0, partial),
    screenToGround(0, v.heightPx, partial),
    screenToGround(v.widthPx, v.heightPx, partial),
  ];
  // Tilted, the far (top) edge is wider than the near (bottom) one: keep the inner rectangle.
  const ground: GroundRect = {
    minX: Math.max(corners[0].x, corners[2].x),
    maxX: Math.min(corners[1].x, corners[3].x),
    minZ: Math.max(corners[0].z, corners[1].z),
    maxZ: Math.min(corners[2].z, corners[3].z),
  };
  return { ...partial, ground };
}

type CameraPose = Pick<CameraFit, 'viewport' | 'fovDeg' | 'tiltDeg' | 'distance'>;

/** Where the ray through a hero pixel meets the horizontal plane y = planeY (default: ground). */
export function screenToGround(
  xPx: number,
  yPx: number,
  cam: CameraPose,
  planeY = 0,
): { x: number; z: number } {
  const t = cam.tiltDeg * DEG;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const origin = { y: cam.distance * c, z: cam.distance * s };
  const tanV = Math.tan((cam.fovDeg / 2) * DEG);
  const aspect = cam.viewport.widthPx / cam.viewport.heightPx;
  const nx = (xPx / cam.viewport.widthPx) * 2 - 1;
  const ny = 1 - (yPx / cam.viewport.heightPx) * 2;
  // Basis: forward (0, -c, -s), right (1, 0, 0), up (0, s, -c).
  const dir = {
    x: nx * tanV * aspect,
    y: -c + ny * tanV * s,
    z: -s - ny * tanV * c,
  };
  const lambda = (planeY - origin.y) / dir.y;
  return { x: lambda * dir.x, z: origin.z + lambda * dir.z };
}

/** Ground footprint of a DOM rectangle: bounding box of its four projected corners. */
export function pixelRectToGround(rect: PixelRect, cam: CameraPose): GroundRect {
  const pts = [
    screenToGround(rect.left, rect.top, cam),
    screenToGround(rect.left + rect.width, rect.top, cam),
    screenToGround(rect.left, rect.top + rect.height, cam),
    screenToGround(rect.left + rect.width, rect.top + rect.height, cam),
  ];
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    maxX: Math.max(...pts.map((p) => p.x)),
    minZ: Math.min(...pts.map((p) => p.z)),
    maxZ: Math.max(...pts.map((p) => p.z)),
  };
}

export function inflate(r: GroundRect, by: number): GroundRect {
  return { minX: r.minX - by, maxX: r.maxX + by, minZ: r.minZ - by, maxZ: r.maxZ + by };
}

export function intersect(a: GroundRect, b: GroundRect): GroundRect {
  return {
    minX: Math.max(a.minX, b.minX),
    maxX: Math.min(a.maxX, b.maxX),
    minZ: Math.max(a.minZ, b.minZ),
    maxZ: Math.min(a.maxZ, b.maxZ),
  };
}

export function contains(r: GroundRect, x: number, z: number): boolean {
  return x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
}

/** The area bricks may occupy: the visible ground minus a small margin. */
export function playArea(ground: GroundRect, cfg = WALLS): GroundRect {
  return inflate(ground, -cfg.inset);
}

/**
 * Four walls whose inner faces are the play area's edges, plus a keep-out block under the text
 * card. Walls are taller than the spawn height so nothing can land on top of them.
 */
export function wallLayout(area: GroundRect, keepOut: GroundRect | null, height: number, cfg = WALLS): Cuboid[] {
  const t = cfg.thickness / 2;
  const h = height / 2;
  const midX = (area.minX + area.maxX) / 2;
  const midZ = (area.minZ + area.maxZ) / 2;
  const halfX = (area.maxX - area.minX) / 2 + cfg.thickness;
  const halfZ = (area.maxZ - area.minZ) / 2 + cfg.thickness;
  const walls: Cuboid[] = [
    { center: { x: area.minX - t, y: h, z: midZ }, half: { x: t, y: h, z: halfZ } },
    { center: { x: area.maxX + t, y: h, z: midZ }, half: { x: t, y: h, z: halfZ } },
    { center: { x: midX, y: h, z: area.minZ - t }, half: { x: halfX, y: h, z: t } },
    { center: { x: midX, y: h, z: area.maxZ + t }, half: { x: halfX, y: h, z: t } },
  ];
  if (keepOut) {
    // Clipped to the play area: fixed colliders that overlap the walls trap bricks between them.
    const k = intersect(inflate(keepOut, cfg.cardMargin), area);
    if (k.minX < k.maxX && k.minZ < k.maxZ) {
      walls.push({
        center: { x: (k.minX + k.maxX) / 2, y: h, z: (k.minZ + k.maxZ) / 2 },
        half: { x: (k.maxX - k.minX) / 2, y: h, z: (k.maxZ - k.minZ) / 2 },
      });
    }
  }
  return walls;
}

/** Moves a point inside the area (used when a resize shrinks it around a resting brick). */
export function clampInto(area: GroundRect, x: number, z: number, margin: number): { x: number; z: number } {
  return {
    x: Math.min(area.maxX - margin, Math.max(area.minX + margin, x)),
    z: Math.min(area.maxZ - margin, Math.max(area.minZ + margin, z)),
  };
}

/** Moves a point that lies inside a rectangle out through the rectangle's nearest side. */
export function pushOut(r: GroundRect, x: number, z: number): { x: number; z: number } {
  const exits = [
    { distance: x - r.minX, point: { x: r.minX, z } },
    { distance: r.maxX - x, point: { x: r.maxX, z } },
    { distance: z - r.minZ, point: { x, z: r.minZ } },
    { distance: r.maxZ - z, point: { x, z: r.maxZ } },
  ];
  return exits.reduce((best, e) => (e.distance < best.distance ? e : best)).point;
}
