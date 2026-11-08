/**
 * Procedural brick geometry and the shared plastic material. Studs are plain: no logo or text.
 */
import {
  BufferGeometry,
  Float32BufferAttribute,
  LatheGeometry,
  MeshPhysicalMaterial,
  RingGeometry,
  Vector2,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BrickShape, studCenters } from './catalog';
import { DIMENSIONS, MATERIAL, STUD_SHADE } from './config';

export interface GeometryOptions {
  readonly studSegments: number;
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
 * the cuboid collider used for physics.
 */
export function buildShapeGeometry(shape: BrickShape, opts: GeometryOptions): BufferGeometry {
  const body = withShade(
    new RoundedBoxGeometry(
      shape.width - DIMENSIONS.sideGap,
      shape.height,
      shape.depth - DIMENSIONS.sideGap,
      2,
      DIMENSIONS.edgeRadius,
    ),
  );
  if (!shape.hasStuds) return body;

  const parts: BufferGeometry[] = [body];
  const stud = studGeometry(opts.studSegments);
  for (const c of studCenters(shape)) {
    parts.push(stud.clone().translate(c.x, shape.height / 2, c.z));
  }
  stud.dispose();
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error(`Could not merge geometry for ${shape.id}`);
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
