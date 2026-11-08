import { CAMERA, WALLS } from './config';
import {
  clampInto,
  fitCamera,
  inflate,
  pixelRectToGround,
  playArea,
  pushOut,
  screenToGround,
  studPixels,
  wallLayout,
} from './layout';

describe('studPixels', () => {
  it('scales with the short side and clamps on phones and big monitors', () => {
    expect(studPixels({ widthPx: 1440, heightPx: 800 })).toBeCloseTo(28);
    expect(studPixels({ widthPx: 390, heightPx: 844 })).toBe(CAMERA.studPx.min);
    expect(studPixels({ widthPx: 3840, heightPx: 2160 })).toBe(CAMERA.studPx.max);
  });
});

describe('fitCamera, straight down', () => {
  const fit = fitCamera({ widthPx: 1440, heightPx: 800 }, 30, 0);

  it('shows the whole box at studPx per stud, centered on the origin', () => {
    expect(fit.ground.maxX - fit.ground.minX).toBeCloseTo(1440 / fit.studPx);
    expect(fit.ground.maxZ - fit.ground.minZ).toBeCloseTo(800 / fit.studPx);
    expect(fit.ground.minX).toBeCloseTo(-fit.ground.maxX);
    expect(fit.height).toBeCloseTo(fit.distance);
  });

  it('places the camera so the vertical FOV spans the visible depth exactly', () => {
    expect(Math.atan(fit.ground.maxZ / fit.distance) * 2 * (180 / Math.PI)).toBeCloseTo(30);
  });

  it('a narrower FOV means a farther camera for the same view', () => {
    const v = { widthPx: 1000, heightPx: 600 };
    expect(fitCamera(v, 20, 0).distance).toBeGreaterThan(fitCamera(v, 30, 0).distance);
  });
});

describe('fitCamera, tilted', () => {
  const v = { widthPx: 1440, heightPx: 800 };
  const flat = fitCamera(v, 30, 0);
  const tilted = fitCamera(v, 30, 7);

  it('sees farther at the top of the screen than at the bottom', () => {
    const top = screenToGround(720, 0, tilted);
    const bottom = screenToGround(720, 800, tilted);
    expect(-top.z).toBeGreaterThan(bottom.z);
  });

  it('keeps the inner rectangle of the trapezoid: walls never sit outside the view', () => {
    for (const [x, y] of [
      [0, 0],
      [1440, 0],
      [0, 800],
      [1440, 800],
    ]) {
      const corner = screenToGround(x, y, tilted);
      expect(Math.abs(corner.x)).toBeGreaterThanOrEqual(tilted.ground.maxX - 1e-9);
    }
    expect(tilted.ground.maxX).toBeLessThan(flat.ground.maxX + 1);
  });

  it('keeps the camera above the ground at the same distance', () => {
    expect(tilted.distance).toBeCloseTo(flat.distance);
    expect(tilted.height).toBeLessThan(flat.height);
  });
});

describe('screenToGround and pixelRectToGround (straight down)', () => {
  const cam = fitCamera({ widthPx: 1000, heightPx: 600 }, 30, 0);

  it('maps the hero center to the origin and screen-down to +Z', () => {
    expect(screenToGround(500, 300, cam).x).toBeCloseTo(0);
    expect(screenToGround(500, 300, cam).z).toBeCloseTo(0);
    expect(screenToGround(500, 600, cam).z).toBeCloseTo(cam.ground.maxZ);
  });

  it('maps a DOM rectangle to the matching ground rectangle', () => {
    const r = pixelRectToGround({ left: 500, top: 300, width: 100, height: 50 }, cam);
    expect(r.minX).toBeCloseTo(0);
    expect(r.maxX).toBeCloseTo(100 / cam.studPx);
    expect(r.maxZ).toBeCloseTo(50 / cam.studPx);
  });
});

describe('wallLayout', () => {
  const area = { minX: -10, maxX: 10, minZ: -6, maxZ: 6 };

  it('puts the inner face of each wall on the play-area edge', () => {
    const [left, right, top, bottom] = wallLayout(area, null, 20);
    expect(left.center.x + left.half.x).toBeCloseTo(-10);
    expect(right.center.x - right.half.x).toBeCloseTo(10);
    expect(top.center.z + top.half.z).toBeCloseTo(-6);
    expect(bottom.center.z - bottom.half.z).toBeCloseTo(6);
  });

  it('makes walls as tall as requested, standing on the ground', () => {
    for (const w of wallLayout(area, null, 20)) {
      expect(w.center.y - w.half.y).toBeCloseTo(0);
      expect(w.half.y * 2).toBeCloseTo(20);
    }
  });

  it('overlaps the corners so nothing slips out diagonally', () => {
    const [left, , top] = wallLayout(area, null, 20);
    expect(top.center.x - top.half.x).toBeLessThan(left.center.x + left.half.x);
  });

  it('adds a keep-out block around the card, inflated by the card margin', () => {
    const walls = wallLayout(area, { minX: -8, maxX: -2, minZ: -3, maxZ: 3 }, 20);
    expect(walls).toHaveLength(5);
    const block = walls[4];
    expect(block.center.x - block.half.x).toBeCloseTo(-8 - WALLS.cardMargin);
    expect(block.center.z + block.half.z).toBeCloseTo(3 + WALLS.cardMargin);
  });

  it('clips the keep-out block to the play area so it never overlaps a wall', () => {
    const block = wallLayout(area, { minX: -12, maxX: 12, minZ: -7, maxZ: -2 }, 20)[4];
    expect(block.center.x - block.half.x).toBeCloseTo(-10);
    expect(block.center.x + block.half.x).toBeCloseTo(10);
    expect(block.center.z - block.half.z).toBeCloseTo(-6);
  });

  it('skips the keep-out block when the card lies outside the play area', () => {
    expect(wallLayout(area, { minX: 20, maxX: 30, minZ: 0, maxZ: 2 }, 20)).toHaveLength(4);
  });

  it('insets the play area from the visible ground', () => {
    expect(playArea({ minX: -10, maxX: 10, minZ: -5, maxZ: 5 }).maxX).toBeCloseTo(10 - WALLS.inset);
  });
});

describe('resize helpers', () => {
  const area = { minX: 0, maxX: 10, minZ: 0, maxZ: 10 };

  it('clampInto moves outside points to the margin and leaves inside points alone', () => {
    expect(clampInto(area, 15, -3, 1)).toEqual({ x: 9, z: 1 });
    expect(clampInto(area, 5, 5, 1)).toEqual({ x: 5, z: 5 });
  });

  it('pushOut exits through the nearest side', () => {
    expect(pushOut(area, 1, 5)).toEqual({ x: 0, z: 5 });
    expect(pushOut(area, 5, 9.5)).toEqual({ x: 5, z: 10 });
  });

  it('inflate grows (or with a negative amount, shrinks) every side', () => {
    expect(inflate(area, -1)).toEqual({ minX: 1, maxX: 9, minZ: 1, maxZ: 9 });
  });
});
