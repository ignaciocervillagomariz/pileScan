import { approach, parallaxAngles, parallaxMargin, settled } from './ambient';
import { AMBIENT, GLOVE } from './config';

const DEG = Math.PI / 180;

describe('parallax', () => {
  it('orbits up to the configured angle toward the pointer and is centered at rest', () => {
    expect(parallaxAngles(0, 0)).toEqual({ yaw: 0, pitch: 0 });
    expect(parallaxAngles(1, -1).yaw).toBeCloseTo(AMBIENT.parallaxMaxDeg * DEG);
    expect(parallaxAngles(1, -1).pitch).toBeCloseTo(-AMBIENT.parallaxMaxDeg * DEG);
  });

  it('clamps a pointer outside the hero', () => {
    expect(parallaxAngles(3, 0).yaw).toBeCloseTo(AMBIENT.parallaxMaxDeg * DEG);
  });

  it('stays within 1–2 degrees and reports how far it can shift the view', () => {
    expect(AMBIENT.parallaxMaxDeg).toBeGreaterThanOrEqual(1);
    expect(AMBIENT.parallaxMaxDeg).toBeLessThanOrEqual(2);
    expect(parallaxMargin(60)).toBeCloseTo(60 * Math.tan(AMBIENT.parallaxMaxDeg * DEG));
  });
});

describe('Glove hover lift', () => {
  it('lifts the hovered brick 1–2 mm (1 stud = 8 mm)', () => {
    const mm = GLOVE.hoverLift * 8;
    expect(mm).toBeGreaterThanOrEqual(1);
    expect(mm).toBeLessThanOrEqual(2);
  });
});

describe('easing', () => {
  it('approaches the target independently of the frame rate', () => {
    const at60 = Array.from({ length: 60 }).reduce<number>((v) => approach(v, 1, 4, 1 / 60), 0);
    const at120 = Array.from({ length: 120 }).reduce<number>((v) => approach(v, 1, 4, 1 / 120), 0);
    expect(at60).toBeCloseTo(at120, 5);
    expect(settled(approach(0, 1, 4, 10), 1)).toBe(true);
  });
});
