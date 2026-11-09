import { PUSH } from './config';
import { classifyMotion, GroundSample, Motion, PointerSpeed } from './pointer-classifier';

/** Samples every 16 ms moving along X at `studsPerSecond`. */
function sweep(studsPerSecond: number, frames: number, start = 0): GroundSample[] {
  return Array.from({ length: frames }, (_, i) => ({
    x: (studsPerSecond * (i * 16)) / 1000,
    z: 0,
    timeMs: start + i * 16,
  }));
}

/** Feeds samples through speed + hysteresis, as the DOM adapter does. */
function run(samples: GroundSample[], speed = new PointerSpeed(), motion: Motion = 'slow'): Motion[] {
  return samples.map((s) => (motion = classifyMotion(motion, speed.add(s))));
}

describe('PointerSpeed', () => {
  it('converges on the true ground speed', () => {
    const speed = new PointerSpeed();
    sweep(30, 30).forEach((s) => speed.add(s));
    expect(speed.speed).toBeCloseTo(30, 0);
  });

  it('starts over after a gap instead of averaging a jump', () => {
    const speed = new PointerSpeed();
    speed.add({ x: 0, z: 0, timeMs: 0 });
    speed.add({ x: 40, z: 0, timeMs: PUSH.maxSampleGapMs + 1 });
    expect(speed.speed).toBe(0);
  });

  it('ignores duplicate timestamps', () => {
    const speed = new PointerSpeed();
    speed.add({ x: 0, z: 0, timeMs: 10 });
    expect(speed.add({ x: 5, z: 0, timeMs: 10 })).toBe(0);
  });
});

describe('push vs slow classification', () => {
  it('never pushes while the pointer moves slowly, however long it moves', () => {
    expect(run(sweep(PUSH.enterSpeed * 0.9, 200))).not.toContain('fast');
  });

  it('pushes on a fast flick within a few frames', () => {
    const motions = run(sweep(PUSH.enterSpeed * 2, 10));
    expect(motions.indexOf('fast')).toBeGreaterThan(0);
    expect(motions.indexOf('fast')).toBeLessThan(6);
  });

  it('a single jittery sample does not trigger a push (the average smooths it)', () => {
    const samples = sweep(3, 10);
    samples[5] = { ...samples[5], x: samples[5].x + 0.6 };
    expect(run(samples)).not.toContain('fast');
  });

  it('keeps pushing while a swipe slows down between the thresholds (hysteresis)', () => {
    const speed = new PointerSpeed();
    const fast = run(sweep(PUSH.enterSpeed * 2, 15), speed);
    expect(fast[fast.length - 1]).toBe('fast');
    const middle = (PUSH.enterSpeed + PUSH.exitSpeed) / 2;
    const slowing = run(sweep(middle, 30, 15 * 16), speed, 'fast');
    expect(slowing.every((m) => m === 'fast')).toBe(true);
  });

  it('stops pushing once the pointer drops below the exit speed', () => {
    const speed = new PointerSpeed();
    run(sweep(PUSH.enterSpeed * 2, 15), speed);
    const after = run(sweep(PUSH.exitSpeed * 0.3, 40, 15 * 16), speed, 'fast');
    expect(after[after.length - 1]).toBe('slow');
  });
});
