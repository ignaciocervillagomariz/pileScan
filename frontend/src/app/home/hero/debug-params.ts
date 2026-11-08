/**
 * Query parameters for measuring the hero. Harmless in production: `?hero-debug` renders
 * continuously and shows a frame-time HUD.
 */
export interface HeroDebugParams {
  readonly debug: boolean;
}

export function readHeroDebugParams(search: string): HeroDebugParams {
  return { debug: new URLSearchParams(search).has('hero-debug') };
}
