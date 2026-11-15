import { ROTATION } from './config';
import { deltaInPixels, keyTurn, WheelAccumulator, wheelTurn } from './rotation-input';

const DEG = Math.PI / 180;
const PIXEL = 0;
const LINE = 1;
const PAGE = 2;

describe('rotation input', () => {
  it('turns a quarter for R and the other way for Shift+R, and ignores other keys', () => {
    expect(keyTurn('r', false)).toBeCloseTo(90 * DEG);
    expect(keyTurn('R', true)).toBeCloseTo(-90 * DEG);
    expect(keyTurn('e', false)).toBeNull();
  });

  it('turns ROTATION.stepDeg per wheel step', () => {
    expect(wheelTurn(1)).toBeCloseTo(ROTATION.stepDeg * DEG);
    expect(wheelTurn(-1)).toBeCloseTo(-ROTATION.stepDeg * DEG);
  });

  it('converts line and page deltas to pixels', () => {
    expect(deltaInPixels(3, LINE, 800)).toBe(48);
    expect(deltaInPixels(1, PAGE, 800)).toBe(800);
    expect(deltaInPixels(7, PIXEL, 800)).toBe(7);
  });
});

describe('WheelAccumulator', () => {
  it('gives one step per mouse notch, whatever size the browser reports', () => {
    for (const [deltaY, mode] of [[100, PIXEL], [120, PIXEL], [3, LINE], [1, PAGE]]) {
      const wheel = new WheelAccumulator(800);
      expect(wheel.add({ deltaY, deltaMode: mode, timeMs: 0 })).toBe(1);
      expect(wheel.accumulated).toBe(0);
    }
  });

  it('gives one step per notch on consecutive notches, in both directions', () => {
    const wheel = new WheelAccumulator(800);
    const steps = [100, 100, -100].map((d, i) => wheel.add({ deltaY: d, deltaMode: PIXEL, timeMs: i * 50 }));
    expect(steps).toEqual([1, 1, -1]);
  });

  it('adds up small trackpad deltas into steps and keeps the remainder', () => {
    const wheel = new WheelAccumulator(800);
    const steps: number[] = [];
    for (let i = 0; i < 10; i++) steps.push(wheel.add({ deltaY: -5, deltaMode: PIXEL, timeMs: i * 16 }));
    expect(steps.filter((s) => s !== 0)).toEqual([-1]);
    expect(wheel.accumulated).toBe(-10);
  });

  it('drops leftovers after a pause, so they never count toward the next gesture', () => {
    const wheel = new WheelAccumulator(800);
    wheel.add({ deltaY: ROTATION.wheelThresholdPx - 1, deltaMode: PIXEL, timeMs: 0 });
    expect(wheel.add({ deltaY: 2, deltaMode: PIXEL, timeMs: ROTATION.wheelIdleResetMs + 1 })).toBe(0);
    expect(wheel.accumulated).toBe(2);
  });

  it('forgets everything on reset', () => {
    const wheel = new WheelAccumulator(800);
    wheel.add({ deltaY: 20, deltaMode: PIXEL, timeMs: 0 });
    wheel.reset();
    expect(wheel.accumulated).toBe(0);
  });
});
