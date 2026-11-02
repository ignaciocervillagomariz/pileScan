import {
  boxFromCorners,
  clientToImagePoint,
  containsPoint,
  cropRect,
  fitCanvasSize,
  hitTest,
  imageToCanvasScale,
  MIN_BOX_SIZE,
  scaleBBox,
} from './bbox-geometry';

describe('bbox geometry', () => {
  it('scales boxes from image pixels to canvas pixels', () => {
    const scale = imageToCanvasScale({ width: 4000, height: 3000 }, { width: 1000, height: 750 });
    expect(scale).toBe(0.25);
    expect(scaleBBox({ x: 400, y: 800, width: 200, height: 100 }, scale)).toEqual({
      x: 100,
      y: 200,
      width: 50,
      height: 25,
    });
  });

  it('keeps small images at natural size and caps large ones preserving aspect ratio', () => {
    expect(fitCanvasSize({ width: 800, height: 600 }, 1800)).toEqual({ width: 800, height: 600 });
    expect(fitCanvasSize({ width: 4000, height: 3000 }, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(fitCanvasSize({ width: 3000, height: 4000 }, 2000)).toEqual({ width: 1500, height: 2000 });
  });

  it('maps pointer positions on a CSS-scaled element back to image pixels', () => {
    const rect = { left: 10, top: 20, width: 400, height: 300 };
    const image = { width: 4000, height: 3000 };
    expect(clientToImagePoint({ x: 210, y: 170 }, rect, image)).toEqual({ x: 2000, y: 1500 });
  });

  it('clamps pointer positions outside the element to the image', () => {
    const rect = { left: 0, top: 0, width: 100, height: 100 };
    expect(clientToImagePoint({ x: -50, y: 500 }, rect, { width: 1000, height: 1000 })).toEqual({
      x: 0,
      y: 1000,
    });
  });

  it('detects points inside a box, edges included', () => {
    const box = { x: 10, y: 10, width: 20, height: 20 };
    expect(containsPoint(box, { x: 10, y: 30 })).toBe(true);
    expect(containsPoint(box, { x: 31, y: 20 })).toBe(false);
  });

  describe('hitTest', () => {
    const detections = [
      { id: 'big', bbox: { x: 0, y: 0, width: 100, height: 100 } },
      { id: 'small', bbox: { x: 40, y: 40, width: 10, height: 10 } },
      { id: 'no-box', bbox: null },
    ];

    it('prefers the smallest box so nested pieces stay tappable', () => {
      expect(hitTest(detections, { x: 45, y: 45 })).toBe('small');
      expect(hitTest(detections, { x: 5, y: 5 })).toBe('big');
    });

    it('returns null when nothing is hit', () => {
      expect(hitTest(detections, { x: 500, y: 500 })).toBeNull();
    });
  });

  describe('boxFromCorners', () => {
    const image = { width: 1000, height: 800 };

    it('normalizes drag direction and rounds to integers', () => {
      expect(boxFromCorners({ x: 300.4, y: 200.6 }, { x: 100.2, y: 100.1 }, image)).toEqual({
        x: 100,
        y: 100,
        width: 200,
        height: 101,
      });
    });

    it('clamps to the image bounds', () => {
      expect(boxFromCorners({ x: 900, y: 700 }, { x: 1200, y: 900 }, image)).toEqual({
        x: 900,
        y: 700,
        width: 100,
        height: 100,
      });
    });

    it('rejects accidental taps', () => {
      expect(
        boxFromCorners({ x: 10, y: 10 }, { x: 10 + MIN_BOX_SIZE - 1, y: 200 }, image),
      ).toBeNull();
    });
  });

  describe('cropRect', () => {
    it('pads the box and stays inside the image', () => {
      expect(cropRect({ x: 100, y: 100, width: 100, height: 100 }, { width: 1000, height: 1000 })).toEqual({
        x: 90,
        y: 90,
        width: 120,
        height: 120,
      });
      expect(cropRect({ x: 0, y: 0, width: 50, height: 50 }, { width: 100, height: 100 })).toEqual({
        x: 0,
        y: 0,
        width: 55,
        height: 55,
      });
      const edge = cropRect({ x: 950, y: 950, width: 50, height: 50 }, { width: 1000, height: 1000 });
      expect(edge.x + edge.width).toBeLessThanOrEqual(1000);
      expect(edge.y + edge.height).toBeLessThanOrEqual(1000);
    });
  });
});
