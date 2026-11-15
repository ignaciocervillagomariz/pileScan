import { DIMENSIONS } from './config';

export type ShapeKind = 'brick' | 'plate' | 'tile';

/** A brick shape. `width` runs along world X and `depth` along world Z, both in studs. */
export interface BrickShape {
  readonly id: string;
  readonly kind: ShapeKind;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  /** Tiles are smooth on top: nothing can be stacked on them. */
  readonly hasStuds: boolean;
}

function shape(kind: ShapeKind, width: number, depth: number): BrickShape {
  return {
    id: `${kind}-${width}x${depth}`,
    kind,
    width,
    depth,
    height: kind === 'brick' ? DIMENSIONS.brickHeight : DIMENSIONS.plateHeight,
    hasStuds: kind !== 'tile',
  };
}

export const SHAPES: readonly BrickShape[] = [
  shape('brick', 1, 1),
  shape('brick', 1, 2),
  shape('brick', 1, 4),
  shape('brick', 2, 2),
  shape('brick', 2, 4),
  shape('plate', 1, 2),
  shape('plate', 2, 2),
  shape('plate', 2, 4),
  shape('tile', 1, 2),
  shape('tile', 2, 2),
];

export interface BrickColor {
  readonly name: string;
  /** sRGB, close to the common catalog values for each color. */
  readonly hex: string;
}

export const PALETTE: readonly BrickColor[] = [
  { name: 'Red', hex: '#c91a09' },
  { name: 'Blue', hex: '#0055bf' },
  { name: 'Yellow', hex: '#f2cd37' },
  // Slightly below pure white, as white plastic photographs: keeps its shading from clipping.
  { name: 'White', hex: '#ecebe6' },
  { name: 'Black', hex: '#1b2a34' },
  { name: 'Light Bluish Gray', hex: '#a0a5a9' },
  { name: 'Dark Bluish Gray', hex: '#6c6e68' },
  { name: 'Green', hex: '#237841' },
  { name: 'Orange', hex: '#fe8a18' },
  { name: 'Tan', hex: '#e4cd9e' },
];

export function colorIndex(name: string): number {
  const index = PALETTE.findIndex((c) => c.name === name);
  if (index < 0) throw new Error(`Unknown brick color: ${name}`);
  return index;
}

/** What stands inside the hollow underside, in the shape's local frame (X, Z). */
export interface UndersideLayout {
  /** Hollow tubes, one between each 2×2 group of studs (2-wide shapes). */
  readonly tubes: readonly { x: number; z: number }[];
  /** Solid pins, one between each pair of studs (1-wide shapes longer than 1). */
  readonly pins: readonly { x: number; z: number }[];
}

/**
 * Tubes and pins sit where four (or two) studs meet: between consecutive stud columns along
 * each axis that is at least 2 long, and on the center line of an axis that is 1 long.
 */
export function undersideLayout(s: BrickShape): UndersideLayout {
  const between = (n: number) => (n >= 2 ? Array.from({ length: n - 1 }, (_, i) => i - (n - 2) / 2) : [0]);
  if (s.width === 1 && s.depth === 1) return { tubes: [], pins: [] };
  const points = between(s.width).flatMap((x) => between(s.depth).map((z) => ({ x, z })));
  return s.width >= 2 && s.depth >= 2 ? { tubes: points, pins: [] } : { tubes: [], pins: points };
}

/** Stud centers in the shape's local frame (origin at the body center, Y up). */
export function studCenters(s: BrickShape): { x: number; z: number }[] {
  const centers: { x: number; z: number }[] = [];
  for (let i = 0; i < s.width; i++) {
    for (let j = 0; j < s.depth; j++) {
      centers.push({ x: i - (s.width - 1) / 2, z: j - (s.depth - 1) / 2 });
    }
  }
  return centers;
}
