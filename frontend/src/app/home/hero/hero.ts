/**
 * Entry point of the lazily loaded hero chunk: wires the scene to the host element
 * (resize, theme, card keep-out) and renders on demand.
 */
import { FrameStats } from './frame-stats';
import { PixelRect, pixelRectToGround, Viewport } from './layout';
import { previewLayout } from './preview-layout';
import { QualityTier } from './quality';
import { HeroScene, Theme } from './scene';

export interface HeroOptions {
  readonly tier: QualityTier;
  readonly debug: boolean;
}

export interface HeroElements {
  /** The hero section: its size is the scene's viewport. */
  readonly host: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  /** The text card: bricks keep out of the area under it. */
  readonly card: HTMLElement;
}

export interface HeroHandle {
  dispose(): void;
}

function relativeRect(el: HTMLElement, host: HTMLElement): PixelRect {
  const a = el.getBoundingClientRect();
  const b = host.getBoundingClientRect();
  return { left: a.left - b.left, top: a.top - b.top, width: a.width, height: a.height };
}

export function createHero(els: HeroElements, options: HeroOptions): HeroHandle {
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const theme = (): Theme => (darkQuery.matches ? 'dark' : 'light');
  const scene = new HeroScene(els.canvas, { tier: options.tier, theme: theme() });
  const stats = new FrameStats();
  const hud = options.debug ? createHud(els.host) : null;

  let frame = 0;
  let lastFrameAt = 0;
  let lastViewport: Viewport | null = null;

  const renderFrame = (now: number) => {
    frame = 0;
    scene.render();
    if (hud) {
      if (lastFrameAt > 0) stats.add(now - lastFrameAt);
      lastFrameAt = now;
      hud.textContent = `${stats.averageFps().toFixed(0)} fps · p95 ${stats.p95Ms().toFixed(1)} ms · ${options.tier.name}`;
      // Debug mode renders continuously so the HUD measures the real per-frame cost.
      frame = requestAnimationFrame(renderFrame);
    }
  };
  const requestRender = () => {
    if (frame === 0) frame = requestAnimationFrame(renderFrame);
  };

  const layout = () => {
    const viewport = { widthPx: els.host.clientWidth, heightPx: els.host.clientHeight };
    if (viewport.widthPx === 0 || viewport.heightPx === 0) return;
    if (lastViewport?.widthPx === viewport.widthPx && lastViewport.heightPx === viewport.heightPx) return;
    lastViewport = viewport;
    const fit = scene.resize(viewport);
    const keepOut = pixelRectToGround(relativeRect(els.card, els.host), viewport, fit.studPx);
    scene.setBricks(previewLayout(fit.ground, keepOut, options.tier.brickCount));
    requestRender();
  };

  const resizeObserver = new ResizeObserver(layout);
  resizeObserver.observe(els.host);
  const onTheme = () => {
    scene.setTheme(theme());
    requestRender();
  };
  darkQuery.addEventListener('change', onTheme);
  layout();

  return {
    dispose() {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      darkQuery.removeEventListener('change', onTheme);
      hud?.remove();
      scene.dispose();
    },
  };
}

function createHud(host: HTMLElement): HTMLElement {
  const hud = document.createElement('div');
  hud.setAttribute('aria-hidden', 'true');
  hud.dataset['testid'] = 'hero-debug-hud';
  hud.style.cssText =
    'position:absolute;right:8px;bottom:8px;z-index:3;padding:4px 8px;border-radius:6px;' +
    'font:12px/1.4 ui-monospace,monospace;background:rgba(0,0,0,.65);color:#fff;pointer-events:none';
  host.appendChild(hud);
  return hud;
}
