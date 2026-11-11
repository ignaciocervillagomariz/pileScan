import { PUSH } from './config';
import { Motion, motionOf, PointerSample, PointerSpeed, touchIntent } from './pointer-classifier';
import { createRandom } from './random';

/**
 * A realistic pointer stream: small steps at the display's event rate (60 or 120 Hz), with a
 * little timing jitter, along a gentle curve. Real trackpads and mice deliver this, not the
 * large jumps of synthetic test input.
 */
function stream(opts: { pxPerSecond: number; hz: number; seconds: number; seed?: number; tremorPx?: number }): PointerSample[] {
  const random = createRandom(opts.seed ?? 1);
  const samples: PointerSample[] = [];
  let t = 0;
  let x = 400;
  let y = 300;
  let heading = 0;
  const period = 1000 / opts.hz;
  while (t <= opts.seconds * 1000) {
    const dt = period * (0.9 + random() * 0.2);
    heading += (random() - 0.5) * 0.1;
    x += Math.cos(heading) * opts.pxPerSecond * (dt / 1000);
    y += Math.sin(heading) * opts.pxPerSecond * (dt / 1000);
    const tremor = opts.tremorPx ?? 0;
    samples.push({ x: x + (random() - 0.5) * tremor, y: y + (random() - 0.5) * tremor, timeMs: t });
    t += dt;
  }
  return samples;
}

function classify(samples: PointerSample[]): { motions: Motion[]; speeds: number[] } {
  const speed = new PointerSpeed();
  const motions: Motion[] = [];
  const speeds: number[] = [];
  let last: PointerSample | null = null;
  for (const s of samples) {
    speeds.push(speed.add(s));
    motions.push(last ? motionOf(s.x - last.x, s.y - last.y) : 'still');
    last = s;
  }
  return { motions, speeds };
}

describe('pointer speed on realistic input', () => {
  for (const hz of [60, 120]) {
    it(`measures a normal 300 px/s trackpad move at ${hz} Hz (steps of ${(300 / hz).toFixed(1)} px)`, () => {
      const { speeds } = classify(stream({ pxPerSecond: 300, hz, seconds: 0.5 }));
      expect(speeds[speeds.length - 1]).toBeGreaterThan(270);
      expect(speeds[speeds.length - 1]).toBeLessThan(330);
    });

    it(`pushes from the second sample of a move at ${hz} Hz (no ramp-up)`, () => {
      const { motions } = classify(stream({ pxPerSecond: 300, hz, seconds: 0.3 }));
      expect(motions.indexOf('moving')).toBe(1);
    });
  }


  it('coalesced 120 Hz samples inside 60 Hz events give the same speed as the plain stream', () => {
    const fine = stream({ pxPerSecond: 500, hz: 120, seconds: 0.5, seed: 3 });
    const coarse = fine.filter((_, i) => i % 2 === 0);
    const a = classify(fine).speeds.at(-1) ?? 0;
    const b = classify(coarse).speeds.at(-1) ?? 0;
    expect(Math.abs(a - b) / a).toBeLessThan(0.1);
  });
});

describe('PointerSpeed edge cases', () => {
  it('starts over after a gap instead of averaging a jump', () => {
    const speed = new PointerSpeed();
    speed.add({ x: 0, y: 0, timeMs: 0 });
    speed.add({ x: 800, y: 0, timeMs: PUSH.maxSampleGapMs + 1 });
    expect(speed.speed).toBe(0);
  });

  it('ignores duplicate timestamps', () => {
    const speed = new PointerSpeed();
    speed.add({ x: 0, y: 0, timeMs: 10 });
    expect(speed.add({ x: 5, y: 0, timeMs: 10 })).toBe(0);
  });
});

describe('Push has no threshold', () => {
  it('a 1 px/s crawl pushes on every sample', () => {
    const { motions } = classify(stream({ pxPerSecond: 1, hz: 60, seconds: 1 }));
    expect(motions.slice(1).every((m) => m === 'moving')).toBe(true);
  });

  it('even sub-pixel tremor counts as movement', () => {
    const { motions } = classify(stream({ pxPerSecond: 0, hz: 120, seconds: 0.5, tremorPx: 0.3 }));
    expect(motions.slice(1).every((m) => m === 'moving')).toBe(true);
  });

  it('only a pointer that has not moved at all is still', () => {
    expect(motionOf(0, 0)).toBe('still');
    expect(motionOf(0.01, 0)).toBe('moving');
  });

  it('has no speed thresholds left in the configuration', () => {
    for (const key of ['deadZonePxPerS', 'deadZoneExitShare', 'hoverMaxPxPerS']) {
      expect(key in PUSH).toBe(false);
    }
  });
});

describe('touch intent', () => {
  it('stays undecided inside the touch slop, so the first moves of a scroll never push', () => {
    expect(touchIntent(3, -5)).toBe('undecided');
  });

  it('a mostly vertical gesture is a scroll, a mostly sideways one pushes', () => {
    expect(touchIntent(4, -25)).toBe('scroll');
    expect(touchIntent(25, 6)).toBe('push');
  });

  it('decides as soon as the finger leaves the slop', () => {
    expect(touchIntent(PUSH.touchSlopPx, 0)).toBe('push');
  });
});
