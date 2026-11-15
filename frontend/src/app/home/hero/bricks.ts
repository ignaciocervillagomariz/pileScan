/**
 * Procedural brick geometry and the shared plastic material. Studs are plain and the underside
 * is blank: no logo, text or numbers anywhere.
 */
import {
  BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  LatheGeometry,
  MeshPhysicalMaterial,
  RingGeometry,
  Vector2,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BrickShape, studCenters, undersideLayout } from './catalog';
import { DIMENSIONS, MATERIAL, STUD_SHADE, UNDERSIDE } from './config';

export interface GeometryOptions {
  readonly studSegments: number;
  readonly undersideSegments: number;
}

/**
 * Per-vertex brightness, multiplied with the instance color. `shadeAt(y)` gives the factor at
 * height y (0 = stud base); the brick body passes nothing and stays at 1.
 */
function withShade(geometry: BufferGeometry, shadeAt?: (y: number) => number): BufferGeometry {
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const v = shadeAt ? shadeAt(position.getY(i)) : 1;
    colors.set([v, v, v], i * 3);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geometry;
}

function smoothstep(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/**
 * Seen from above, studs on white and light grey bricks vanish. Real studs read because of the
 * soft contact shadow where they meet the top face: bake it into the stud's lower wall and a
 * thin halo ring lying on the top face around it.
 */
function shadeFrom(t: number): number {
  return STUD_SHADE.base + (1 - STUD_SHADE.base) * smoothstep(t);
}

function studHalo(segments: number): BufferGeometry {
  const r = DIMENSIONS.studRadius;
  const ring = new RingGeometry(r, r + STUD_SHADE.haloWidth, segments, 1);
  ring.rotateX(-Math.PI / 2).translate(0, STUD_SHADE.haloLift, 0);
  const nonIndexed = ring.toNonIndexed();
  ring.dispose();
  const position = nonIndexed.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const v = shadeFrom((Math.hypot(position.getX(i), position.getZ(i)) - r) / STUD_SHADE.haloWidth);
    colors.set([v, v, v], i * 3);
  }
  nonIndexed.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return nonIndexed;
}

/** One stud, base at y = 0, axis along Y. The chamfered top edge is smoothed into a fillet. */
function studGeometry(segments: number): BufferGeometry {
  const r = DIMENSIONS.studRadius;
  const h = DIMENSIONS.studHeight;
  const c = DIMENSIONS.studChamfer;
  const profile = [
    new Vector2(r, 0),
    new Vector2(r, h - c),
    new Vector2(r - c * 0.3, h - c * 0.3),
    new Vector2(r - c, h),
    new Vector2(0, h),
  ];
  const lathe = new LatheGeometry(profile, segments);
  // RoundedBoxGeometry is non-indexed, and mergeGeometries cannot mix indexed and non-indexed.
  const nonIndexed = lathe.toNonIndexed();
  lathe.dispose();
  const wall = withShade(nonIndexed, (y) => shadeFrom(y / (DIMENSIONS.studHeight * STUD_SHADE.reach)));
  const halo = studHalo(segments);
  const stud = mergeGeometries([wall, halo]);
  wall.dispose();
  halo.dispose();
  if (!stud) throw new Error('Could not merge stud geometry');
  return stud;
}

/**
 * Geometry for one shape, origin at the center of the body (not counting studs), so it matches
 * the cuboid collider used for physics. The body is hollow and open at the bottom.
 */
export function buildShapeGeometry(shape: BrickShape, opts: GeometryOptions): BufferGeometry {
  const width = shape.width - DIMENSIONS.sideGap;
  const depth = shape.depth - DIMENSIONS.sideGap;
  const shell = new RoundedBoxGeometry(width, shape.height, depth, 2, DIMENSIONS.edgeRadius);
  const parts: BufferGeometry[] = [withShade(withoutFlatBottom(shell, -shape.height / 2)), ...underside(shape, opts)];
  shell.dispose();

  if (shape.hasStuds) {
    const stud = studGeometry(opts.studSegments);
    for (const c of studCenters(shape)) parts.push(stud.clone().translate(c.x, shape.height / 2, c.z));
    stud.dispose();
  }
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error(`Could not merge geometry for ${shape.id}`);
  return merged;
}

/**
 * Drops the flat bottom face of a rounded box (the triangles lying entirely on `y`), leaving an
 * opening of the box size minus the edge radius. The rounded bottom edges stay.
 */
function withoutFlatBottom(box: BufferGeometry, y: number): BufferGeometry {
  const source = box.index ? box.toNonIndexed() : box;
  const position = source.getAttribute('position');
  const keep: number[] = [];
  for (let t = 0; t < position.count / 3; t++) {
    const flat = [0, 1, 2].every((k) => Math.abs(position.getY(t * 3 + k) - y) < 1e-6);
    if (!flat) keep.push(t);
  }
  const result = new BufferGeometry();
  for (const name of ['position', 'normal', 'uv'] as const) {
    const attr = source.getAttribute(name);
    const out = new Float32Array(keep.length * 3 * attr.itemSize);
    keep.forEach((t, i) => {
      for (let k = 0; k < 3; k++) {
        for (let c = 0; c < attr.itemSize; c++) out[(i * 3 + k) * attr.itemSize + c] = attr.array[(t * 3 + k) * attr.itemSize + c];
      }
    });
    result.setAttribute(name, new Float32BufferAttribute(out, attr.itemSize));
  }
  if (source !== box) source.dispose();
  return result;
}

/**
 * Inside the shell: inner walls, the underside of the top, a flat rim closing the wall
 * thickness at the bottom, then tubes or pins. Everything inside is shaded darker with depth.
 */
function underside(shape: BrickShape, opts: GeometryOptions): BufferGeometry[] {
  const u = UNDERSIDE;
  const halfW = (shape.width - DIMENSIONS.sideGap) / 2;
  const halfD = (shape.depth - DIMENSIONS.sideGap) / 2;
  const r = DIMENSIONS.edgeRadius;
  const bottom = -shape.height / 2;
  const ceiling = shape.height / 2 - u.topThickness;
  const ix = halfW - u.wallThickness;
  const iz = halfD - u.wallThickness;
  const ox = halfW - r;
  const oz = halfD - r;
  const down = new Vector3(0, -1, 0);
  const at = (x: number, y: number, z: number) => new Vector3(x, y, z);
  const inside = (y: number) => u.shadeOpen + (u.shadeDeep - u.shadeOpen) * ((y - bottom) / (ceiling - bottom));

  const rim = [
    quad([at(-ox, bottom, iz), at(ox, bottom, iz), at(ox, bottom, oz), at(-ox, bottom, oz)], down),
    quad([at(-ox, bottom, -oz), at(ox, bottom, -oz), at(ox, bottom, -iz), at(-ox, bottom, -iz)], down),
    quad([at(ix, bottom, -iz), at(ox, bottom, -iz), at(ox, bottom, iz), at(ix, bottom, iz)], down),
    quad([at(-ox, bottom, -iz), at(-ix, bottom, -iz), at(-ix, bottom, iz), at(-ox, bottom, iz)], down),
  ].map((g) => withShade(g));

  const cavity = [
    quad([at(-ix, ceiling, -iz), at(ix, ceiling, -iz), at(ix, ceiling, iz), at(-ix, ceiling, iz)], down),
    quad([at(ix, bottom, -iz), at(ix, bottom, iz), at(ix, ceiling, iz), at(ix, ceiling, -iz)], new Vector3(-1, 0, 0)),
    quad([at(-ix, bottom, -iz), at(-ix, bottom, iz), at(-ix, ceiling, iz), at(-ix, ceiling, -iz)], new Vector3(1, 0, 0)),
    quad([at(-ix, bottom, iz), at(ix, bottom, iz), at(ix, ceiling, iz), at(-ix, ceiling, iz)], new Vector3(0, 0, -1)),
    quad([at(-ix, bottom, -iz), at(ix, bottom, -iz), at(ix, ceiling, -iz), at(-ix, ceiling, -iz)], new Vector3(0, 0, 1)),
  ];

  const layout = undersideLayout(shape);
  const height = ceiling - bottom;
  const columns: BufferGeometry[] = [];
  if (layout.tubes.length > 0) {
    const tube = tubeGeometry(height, opts.undersideSegments);
    for (const c of layout.tubes) columns.push(tube.clone().translate(c.x, bottom, c.z));
    tube.dispose();
  }
  if (layout.pins.length > 0) {
    const pin = pinGeometry(height, opts.undersideSegments);
    for (const c of layout.pins) columns.push(pin.clone().translate(c.x, bottom, c.z));
    pin.dispose();
  }
  return [...rim, ...[...cavity, ...columns].map((g) => withShade(g, inside))];
}

/** A flat quad facing `normal`, as two non-indexed triangles; the winding follows the normal. */
function quad(corners: readonly Vector3[], normal: Vector3): BufferGeometry {
  const [a, b, c] = corners;
  const facing = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a)).dot(normal) > 0;
  const [p0, p1, p2, p3] = facing ? corners : [...corners].reverse();
  const triangles = [p0, p1, p2, p0, p2, p3];
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(triangles.flatMap((p) => [p.x, p.y, p.z]), 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(triangles.flatMap(() => [normal.x, normal.y, normal.z]), 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(new Float32Array(triangles.length * 2), 2));
  return geometry;
}

/** Turns a geometry inside out: reversed winding and normals (for the inside of a tube). */
function flipped(geometry: BufferGeometry): BufferGeometry {
  const result = geometry.toNonIndexed();
  for (const name of ['position', 'normal', 'uv']) {
    const attr = result.getAttribute(name);
    const n = attr.itemSize;
    const a = attr.array;
    for (let v = 0; v < attr.count; v += 3) {
      for (let c = 0; c < n; c++) [a[(v + 1) * n + c], a[(v + 2) * n + c]] = [a[(v + 2) * n + c], a[(v + 1) * n + c]];
    }
  }
  const normal = result.getAttribute('normal');
  for (let i = 0; i < normal.array.length; i++) normal.array[i] = -normal.array[i];
  return result;
}

/** Open cylinder wall from y = 0 to `height`. */
function cylinderWall(radius: number, height: number, segments: number): BufferGeometry {
  const cylinder = new CylinderGeometry(radius, radius, height, segments, 1, true).translate(0, height / 2, 0);
  const nonIndexed = cylinder.toNonIndexed();
  cylinder.dispose();
  return nonIndexed;
}

/** Disc or ring at y = 0, facing down. */
function downFacing(geometry: BufferGeometry): BufferGeometry {
  geometry.rotateX(Math.PI / 2);
  const nonIndexed = geometry.toNonIndexed();
  geometry.dispose();
  return nonIndexed;
}

/** A hollow tube from y = 0 (open end) up to `height` (where it meets the ceiling). */
function tubeGeometry(height: number, segments: number): BufferGeometry {
  const u = UNDERSIDE;
  const inner = cylinderWall(u.tubeInnerRadius, height, segments);
  const parts = [
    cylinderWall(u.tubeOuterRadius, height, segments),
    flipped(inner),
    downFacing(new RingGeometry(u.tubeInnerRadius, u.tubeOuterRadius, segments, 1)),
  ];
  inner.dispose();
  return mergedOrThrow(parts, 'tube');
}

/** A solid pin from y = 0 up to `height`. */
function pinGeometry(height: number, segments: number): BufferGeometry {
  const parts = [cylinderWall(UNDERSIDE.pinRadius, height, segments), downFacing(new CircleGeometry(UNDERSIDE.pinRadius, segments))];
  return mergedOrThrow(parts, 'pin');
}

function mergedOrThrow(parts: BufferGeometry[], what: string): BufferGeometry {
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error(`Could not merge ${what} geometry`);
  return merged;
}

/** White base color: instanceColor gives each brick its color, vertex colors add stud shading. */
export function createBrickMaterial(withClearcoat: boolean): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: MATERIAL.roughness,
    metalness: 0,
    ior: MATERIAL.ior,
    clearcoat: withClearcoat ? MATERIAL.clearcoat : 0,
    clearcoatRoughness: MATERIAL.clearcoatRoughness,
  });
}
