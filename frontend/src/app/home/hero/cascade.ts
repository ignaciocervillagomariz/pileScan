/**
 * Pure plan of the intro cascade: which brick drops when, where, and how it spins.
 * Seeded, so every run (and every test) gets the same pile.
 */
import { BrickShape, colorIndex, PALETTE, SHAPES } from './catalog';
import { CASCADE } from './config';
import { contains, GroundRect, inflate } from './layout';
import { Quat, Vec3 } from './pose';
import { createRandom, Random, randomBetween } from './random';

export interface Spawn {
  readonly atSeconds: number;
  readonly shape: BrickShape;
  readonly colorIndex: number;
  readonly position: Vec3;
  readonly rotation: Quat;
  readonly linvel: Vec3;
  readonly angvel: Vec3;
}

export interface CascadeInput {
  readonly count: number;
  readonly area: GroundRect;
  readonly keepOut: GroundRect | null;
  readonly spawnHeight: number;
  readonly seed: number;
}

/** Bricks are the stars; plates and tiles add variety without dominating. */
const SHAPE_WEIGHTS: Readonly<Record<string, number>> = {
  'brick-1x1': 1,
  'brick-1x2': 3,
  'brick-1x4': 2,
  'brick-2x2': 3,
  'brick-2x4': 3,
  'plate-1x2': 1,
  'plate-2x2': 1,
  'plate-2x4': 1,
  'tile-1x2': 1,
  'tile-2x2': 1,
};

/** Common colors appear more often; white and light grey are always well represented. */
const COLOR_WEIGHTS: Readonly<Record<string, number>> = {
  Red: 3,
  Blue: 3,
  Yellow: 3,
  White: 3,
  Black: 2,
  'Light Bluish Gray': 3,
  'Dark Bluish Gray': 2,
  Green: 2,
  Orange: 1,
  Tan: 1,
};

/** Weighted bag, shuffled and cycled: proportions hold even for small counts. */
function weightedBag<T>(items: readonly T[], weight: (item: T) => number, random: Random): T[] {
  const bag = items.flatMap((item) => Array.from({ length: weight(item) }, () => item));
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

/** Uniformly random rotation (Shoemake). */
export function randomRotation(random: Random): Quat {
  const u1 = random();
  const u2 = random() * Math.PI * 2;
  const u3 = random() * Math.PI * 2;
  const a = Math.sqrt(1 - u1);
  const b = Math.sqrt(u1);
  return { x: a * Math.sin(u2), y: a * Math.cos(u2), z: b * Math.sin(u3), w: b * Math.cos(u3) };
}

/** Radius of the circle that contains the shape's footprint at any rotation. */
export function footprintRadius(shape: BrickShape): number {
  return Math.hypot(shape.width, shape.depth) / 2;
}

/** Gravity that makes a drop from `height` take `seconds` (from rest). */
export function gravityFor(height: number, seconds: number = CASCADE.fallSeconds): number {
  return (2 * height) / (seconds * seconds);
}

/**
 * A drop point inside `area` and outside `blocked`. Spacing from recent drops is preferred but
 * given up when the free area is small (phones); the keep-out never is: a brick spawned inside
 * the card's collider would be ejected through the walls.
 */
function pickSpot(
  random: Random,
  area: GroundRect,
  blocked: GroundRect | null,
  recent: readonly { x: number; z: number }[],
  spacing: number,
  attempts: number,
): { x: number; z: number } {
  let fallback: { x: number; z: number } | null = null;
  for (let attempt = 0; attempt < attempts * 4; attempt++) {
    const x = randomBetween(random, area.minX, area.maxX);
    const z = randomBetween(random, area.minZ, area.maxZ);
    if (blocked && contains(blocked, x, z)) continue;
    if (attempt >= attempts || !recent.some((p) => Math.hypot(p.x - x, p.z - z) < spacing)) return { x, z };
    fallback ??= { x, z };
  }
  if (fallback) return fallback;
  // The keep-out covers the sampled area entirely: drop along the area's free bottom edge.
  return { x: randomBetween(random, area.minX, area.maxX), z: area.maxZ };
}

export function planCascade(input: CascadeInput, cfg = CASCADE): Spawn[] {
  const random = createRandom(input.seed);
  const shapes = weightedBag(SHAPES, (s) => SHAPE_WEIGHTS[s.id] ?? 1, random);
  const colors = weightedBag(PALETTE, (c) => COLOR_WEIGHTS[c.name] ?? 1, random).map((c) => colorIndex(c.name));
  const gap = input.count > 1 ? cfg.durationSeconds / (input.count - 1) : 0;
  const recent: { x: number; z: number }[] = [];
  const spawns: Spawn[] = [];

  for (let i = 0; i < input.count; i++) {
    const shape = shapes[i % shapes.length];
    const radius = footprintRadius(shape);
    const area = inflate(input.area, -radius);
    const blocked = input.keepOut ? inflate(input.keepOut, radius) : null;

    const { x, z } = pickSpot(random, area, blocked, recent, cfg.minSpacing + radius, cfg.maxAttempts);
    recent.push({ x, z });
    if (recent.length > 6) recent.shift();

    const jitter = (random() - 0.5) * gap * cfg.timeJitter;
    spawns.push({
      atSeconds: Math.max(0, i * gap + jitter),
      shape,
      colorIndex: colors[i % colors.length],
      position: { x, y: input.spawnHeight + random() * 2, z },
      rotation: randomRotation(random),
      linvel: {
        x: randomBetween(random, -cfg.maxDrift, cfg.maxDrift),
        y: 0,
        z: randomBetween(random, -cfg.maxDrift, cfg.maxDrift),
      },
      angvel: {
        x: randomBetween(random, -cfg.maxSpin, cfg.maxSpin),
        y: randomBetween(random, -cfg.maxSpin, cfg.maxSpin),
        z: randomBetween(random, -cfg.maxSpin, cfg.maxSpin),
      },
    });
  }
  return spawns.sort((a, b) => a.atSeconds - b.atSeconds);
}
