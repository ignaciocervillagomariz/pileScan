import {
  afterNextRender,
  Component,
  ElementRef,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { AppFooter } from '../shared/ui/app-footer.component';
import {
  readConnection,
  readQualitySignals,
  supportsWebGL2,
} from './hero/capabilities';
import { readHeroDebugParams } from './hero/debug-params';
import type { HeroHandle } from './hero/hero';
import { connectionAllows3d, pickTier } from './hero/quality';

/**
 * - `static`: CSS surface only, before the 3D chunk is requested (first paint).
 * - `loading`: the 3D chunk is downloading.
 * - `live`: the 3D scene is running.
 * - `fallback`: no 3D (no WebGL2, slow or metered connection, low-end device, load failure).
 */
export type HeroState = 'static' | 'loading' | 'live' | 'fallback';

@Component({
  selector: 'app-home-page',
  imports: [IonContent, RouterLink, AppFooter],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
})
export class HomePage implements OnDestroy {
  private readonly hostEl = viewChild.required<ElementRef<HTMLElement>>('hero');
  private readonly canvasEl = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly cardEl = viewChild.required<ElementRef<HTMLElement>>('card');

  protected readonly heroState = signal<HeroState>('static');
  protected readonly debugParams = readHeroDebugParams(window.location.search);

  private hero: HeroHandle | null = null;
  private destroyed = false;

  constructor() {
    // The headline is the LCP element: request the 3D chunk only after first paint, when idle.
    afterNextRender(() => whenIdle(() => void this.startHero()));
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.hero?.dispose();
    this.hero = null;
  }

  private async startHero(): Promise<void> {
    if (this.destroyed) return;
    const tier = pickTier(readQualitySignals(window));
    if (!tier.render3d || !connectionAllows3d(readConnection(window)) || !supportsWebGL2(document)) {
      this.heroState.set('fallback');
      return;
    }

    this.heroState.set('loading');
    try {
      const { createHero } = await import('./hero/hero');
      if (this.destroyed) return;
      this.hero = createHero(
        {
          host: this.hostEl().nativeElement,
          canvas: this.canvasEl().nativeElement,
          card: this.cardEl().nativeElement,
        },
        { tier, tilt: this.debugParams.tilt, debug: this.debugParams.debug },
      );
      this.heroState.set('live');
    } catch (error) {
      console.warn('Hero scene unavailable, showing the static surface.', error);
      this.heroState.set('fallback');
    }
  }
}

function whenIdle(task: () => void): void {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(task, { timeout: 2000 });
  } else {
    setTimeout(task, 200);
  }
}
