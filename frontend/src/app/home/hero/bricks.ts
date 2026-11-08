/**
 * Procedural brick geometry and the shared plastic material. Studs are plain: no logo or text.
 */
import { BufferGeometry, LatheGeometry, MeshPhysicalMaterial, Vector2 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BrickShape, studCenters } from './catalog';
import { DIMENSIONS, MATERIAL } from './config';

export interface GeometryOptions {
  readonly studSegments: number;
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
  return nonIndexed;
}

/**
 * Geometry for one shape, origin at the center of the body (not counting studs), so it matches
 * the cuboid collider used for physics.
 */
export function buildShapeGeometry(shape: BrickShape, opts: GeometryOptions): BufferGeometry {
  const body = new RoundedBoxGeometry(
    shape.width - DIMENSIONS.sideGap,
    shape.height,
    shape.depth - DIMENSIONS.sideGap,
    2,
    DIMENSIONS.edgeRadius,
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

/** White base color: each instance's color comes from InstancedMesh.instanceColor. */
export function createBrickMaterial(withClearcoat: boolean): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: MATERIAL.roughness,
    metalness: 0,
    ior: MATERIAL.ior,
    clearcoat: withClearcoat ? MATERIAL.clearcoat : 0,
    clearcoatRoughness: MATERIAL.clearcoatRoughness,
  });
}
