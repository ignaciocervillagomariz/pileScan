/**
 * Query parameters for reviewing and measuring the hero. Harmless in production: they only
 * change the framing, the surface variant, and show a frame-time HUD.
 *   ?hero-debug           continuous rendering + fps HUD
 *   ?hero-tilt            tilted camera instead of straight down
 *   ?hero-surface=strong  stronger grain and vignette (phase 1 surface review)
 */
export interface HeroDebugParams {
  readonly debug: boolean;
  readonly tilt: boolean;
  readonly surface: 'default' | 'strong';
}

export function readHeroDebugParams(search: string): HeroDebugParams {
  const params = new URLSearchParams(search);
  return {
    debug: params.has('hero-debug'),
    tilt: params.has('hero-tilt'),
    surface: params.get('hero-surface') === 'strong' ? 'strong' : 'default',
  };
}
