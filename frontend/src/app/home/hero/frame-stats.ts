/** Rolling frame-time statistics, for the debug HUD and (later) adaptive quality. */
export class FrameStats {
  private readonly samples: number[] = [];

  constructor(private readonly capacity = 120) {}

  add(frameMs: number): void {
    this.samples.push(frameMs);
    if (this.samples.length > this.capacity) this.samples.shift();
  }

  get count(): number {
    return this.samples.length;
  }

  averageFps(): number {
    if (this.samples.length === 0) return 0;
    const mean = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    return 1000 / mean;
  }

  /** 95th percentile frame time in ms: catches hitches an average hides. */
  p95Ms(): number {
    if (this.samples.length === 0) return 0;
    const sorted = [...this.samples].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  }
}
