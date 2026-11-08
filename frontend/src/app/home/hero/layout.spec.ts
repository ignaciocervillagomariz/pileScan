import { CAMERA } from './config';
import { fitCamera, inflate, pixelRectToGround, studPixels } from './layout';

describe('studPixels', () => {
  it('scales with the short side and clamps on phones and big monitors', () => {
    expect(studPixels({ widthPx: 1440, heightPx: 800 })).toBeCloseTo(28);
    expect(studPixels({ widthPx: 390, heightPx: 844 })).toBe(CAMERA.studPx.min);
    expect(studPixels({ widthPx: 3840, heightPx: 2160 })).toBe(CAMERA.studPx.max);
  });
});

describe('fitCamera', () => {
  it('shows the whole box, centered on the origin', () => {
    const fit = fitCamera({ widthPx: 1440, heightPx: 800 }, 30);
    expect(fit.ground.maxX - fit.ground.minX).toBeCloseTo(1440 / fit.studPx);
    expect(fit.ground.maxZ - fit.ground.minZ).toBeCloseTo(800 / fit.studPx);
    expect(fit.ground.minX).toBeCloseTo(-fit.ground.maxX);
  });

  it('places the camera so the vertical FOV spans the visible depth exactly', () => {
    const fit = fitCamera({ widthPx: 1000, heightPx: 600 }, 30);
    const halfDepth = fit.ground.maxZ;
    expect(Math.atan(halfDepth / fit.distance) * 2 * (180 / Math.PI)).toBeCloseTo(30);
  });

  it('a narrower FOV means a farther camera for the same view', () => {
    const v = { widthPx: 1000, heightPx: 600 };
    expect(fitCamera(v, 20).distance).toBeGreaterThan(fitCamera(v, 30).distance);
  });
});

describe('pixelRectToGround', () => {
  const v = { widthPx: 1000, heightPx: 600 };

  it('maps the hero center to the origin and keeps screen-down as +Z', () => {
    const r = pixelRectToGround({ left: 500, top: 300, width: 100, height: 50 }, v, 25);
    expect(r).toEqual({ minX: 0, maxX: 4, minZ: 0, maxZ: 2 });
  });

  it('maps the top-left corner to (-halfWidth, -halfDepth)', () => {
    const r = pixelRectToGround({ left: 0, top: 0, width: 0, height: 0 }, v, 25);
    expect(r.minX).toBe(-20);
    expect(r.minZ).toBe(-12);
  });
});

describe('inflate', () => {
  it('grows (or with a negative amount, shrinks) every side', () => {
    expect(inflate({ minX: 0, maxX: 2, minZ: 0, maxZ: 2 }, 1)).toEqual({ minX: -1, maxX: 3, minZ: -1, maxZ: 3 });
    expect(inflate({ minX: 0, maxX: 4, minZ: 0, maxZ: 4 }, -1)).toEqual({ minX: 1, maxX: 3, minZ: 1, maxZ: 3 });
  });
});
