import { FrameStats } from './frame-stats';

describe('FrameStats', () => {
  it('reports average fps, median and p95 frame times', () => {
    const stats = new FrameStats();
    for (let i = 0; i < 99; i++) stats.add(16);
    stats.add(400);
    expect(stats.medianMs()).toBe(16);
    expect(stats.p95Ms()).toBe(16);
    expect(stats.averageFps()).toBeLessThan(60);
  });

  it('ignores a single shader-compile hitch in the median, which drives the downgrade', () => {
    const stats = new FrameStats();
    stats.add(500);
    for (let i = 0; i < 44; i++) stats.add(16.7);
    expect(stats.averageFps()).toBeLessThan(48);
    expect(stats.medianMs()).toBeCloseTo(16.7);
  });

  it('keeps a rolling window and can be reset', () => {
    const stats = new FrameStats(3);
    [10, 20, 30, 40].forEach((ms) => stats.add(ms));
    expect(stats.count).toBe(3);
    expect(stats.medianMs()).toBe(30);
    stats.reset();
    expect(stats.count).toBe(0);
    expect(stats.medianMs()).toBe(0);
  });
});
