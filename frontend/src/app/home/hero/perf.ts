/**
 * User Timing marks for the hero's start-up stages. They show up in the DevTools performance
 * panel and in Lighthouse traces, which is how the main-thread cost of each stage is tracked.
 */
export function measure<T>(name: string, work: () => T): T {
  const start = performance.now();
  try {
    return work();
  } finally {
    performance.measure(`hero:${name}`, { start, end: performance.now() });
  }
}

export async function measureAsync<T>(name: string, work: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await work();
  } finally {
    performance.measure(`hero:${name}`, { start, end: performance.now() });
  }
}

interface SchedulerWithYield {
  yield(): Promise<void>;
}

/** Ends the current task so input and rendering can run (scheduler.yield where supported). */
export function yieldToMain(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: SchedulerWithYield }).scheduler;
  if (scheduler?.yield) return scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}
