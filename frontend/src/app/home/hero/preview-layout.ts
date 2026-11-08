/**
 * Phase 1 only: a static, seeded arrangement of upright bricks for reviewing the look of the
 * scene before physics exists. Replaced by the cascade in phase 2.
 */
import { colorIndex, SHAPES } from './catalog';
import { PREVIEW } from './config';
import { GroundRect, inflate } from './layout';
import { BrickInstance, yawQuat } from './pose';
import { createRandom, randomBetween } from './random';

/** White and light grey come first and repeat, so contrast against the surface is judged. */
const COLOR_ORDER = [
  'White',
  'Light Bluish Gray',
  'Red',
  'Blue',
  'Yellow',
  'White',
  'Black',
  'Light Bluish Gray',
  'Green',
  'Orange',
  'Tan',
  'Dark Bluish Gray',
].map(colorIndex);

interface Placed {
  x: number;
  z: number;
  radius: number;
  top: number;
  yaw: number;
  width: number;
  depth: number;
  hasStuds: boolean;
}

function overlapsRect(x: number, z: number, radius: number, r: GroundRect): boolean {
  const cx = Math.max(r.minX, Math.min(x, r.maxX));
  const cz = Math.max(r.minZ, Math.min(z, r.maxZ));
  return Math.hypot(x - cx, z - cz) < radius;
}

export function previewLayout(
  ground: GroundRect,
  keepOut: GroundRect | null,
  count: number,
): BrickInstance[] {
  const random = createRandom(PREVIEW.seed);
  const area = inflate(ground, -PREVIEW.edgeMargin);
  const blocked = keepOut ? inflate(keepOut, PREVIEW.cardMargin) : null;
  const placed: Placed[] = [];
  const bricks: BrickInstance[] = [];

  for (let i = 0; i < count; i++) {
    const shape = SHAPES[i % SHAPES.length];
    const color = COLOR_ORDER[i % COLOR_ORDER.length];
    const yaw = randomBetween(random, 0, Math.PI * 2);
    const radius = (Math.hypot(shape.width, shape.depth) / 2) * PREVIEW.spacing;

    // Occasionally stack on an earlier brick to show how a stack reads from above.
    const base = placed.length > 0 && random() < PREVIEW.stackChance ? placed[placed.length - 1] : null;
    // Same width/depth parity, so a centered brick lands exactly on the stud grid.
    const fitsGrid =
      base !== null &&
      base.hasStuds &&
      radius <= base.radius &&
      (base.width - shape.width) % 2 === 0 &&
      (base.depth - shape.depth) % 2 === 0;
    if (base && fitsGrid) {
      bricks.push({
        shapeId: shape.id,
        colorIndex: color,
        position: { x: base.x, y: base.top + shape.height / 2, z: base.z },
        rotation: yawQuat(base.yaw + (random() < 0.5 ? 0 : Math.PI)),
      });
      base.top += shape.height;
      base.hasStuds = shape.hasStuds;
      continue;
    }

    for (let attempt = 0; attempt < PREVIEW.maxAttemptsPerBrick; attempt++) {
      const x = randomBetween(random, area.minX + radius, area.maxX - radius);
      const z = randomBetween(random, area.minZ + radius, area.maxZ - radius);
      if (blocked && overlapsRect(x, z, radius, blocked)) continue;
      if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < p.radius + radius)) continue;
      placed.push({ x, z, radius, top: shape.height, yaw, width: shape.width, depth: shape.depth, hasStuds: shape.hasStuds });
      bricks.push({
        shapeId: shape.id,
        colorIndex: color,
        position: { x, y: shape.height / 2, z },
        rotation: yawQuat(yaw),
      });
      break;
    }
  }
  return bricks;
}
