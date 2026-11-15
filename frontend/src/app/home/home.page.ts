import {
  afterNextRender,
  ChangeDetectorRef,
  Component,
  computed,
  ElementRef,
  inject,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent, ViewDidLeave, ViewWillEnter } from '@ionic/angular';
import { BUILD_STAMP } from '../../build-info';
import { AppFooter } from '../shared/ui/app-footer.component';
import { DebugOverlay, DebugRow } from './debug-overlay.component';
import {
  prefersReducedMotion,
  readConnection,
  readQualitySignals,
  supportsHardwareWebGL2,
} from './hero/capabilities';
import { isDebugRequested } from './hero/debug-params';
import type { HeroActivity, HeroDebugInfo, HeroHandle } from './hero/hero';
import { measureAsync } from './hero/perf';
import { connectionAllows3d, pickTier } from './hero/quality';
import { DEFAULT_TOOL, Tool, toolAfterKey, toolInfo, TOOLS } from './hero/tools';

/**
 * - `static`: CSS surface only, before the 3D chunk is requested (first paint).
 * - `loading`: the 3D chunk is downloading.
 * - `live`: the 3D scene is running.
 * - `fallback`: no 3D (no WebGL2, slow or metered connection, low-end device, load failure).
 */
export type HeroState = 'static' | 'loading' | 'live' | 'fallback';

/** Why the hero shows the static surface (debug overlay). */
type FallbackReason = 'low tier' | 'slow or metered connection' | 'no hardware WebGL2' | 'load failed';

@Component({
  selector: 'app-home-page',
  imports: [IonContent, RouterLink, AppFooter, DebugOverlay],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
  host: { '(document:keydown)': 'onKey($event)' },
})
export class HomePage implements OnDestroy, ViewWillEnter, ViewDidLeave {
  private readonly hostEl = viewChild.required<ElementRef<HTMLElement>>('hero');
  private readonly canvasEl = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly cardEl = viewChild.required<ElementRef<HTMLElement>>('card');
  private readonly dockEl = viewChild.required<ElementRef<HTMLElement>>('dock');

  protected readonly tools = TOOLS;
  protected readonly tool = signal<Tool>(DEFAULT_TOOL);
  protected readonly hint = computed(() => toolInfo(this.tool()).hint);
  /** The hint shows for each newly chosen tool and fades after the first interaction with it. */
  protected readonly hintVisible = signal(true);

  protected readonly heroState = signal<HeroState>('static');
  /** `moving` during the cascade or a push, `resting` once every brick sleeps (see HeroActivity). */
  protected readonly heroActivity = signal<HeroActivity | null>(null);
  protected readonly debug = isDebugRequested(window.location.search);
  private readonly reducedMotion = prefersReducedMotion(window);
  private readonly tierName = signal('-');
  private readonly fallbackReason = signal<FallbackReason | null>(null);
  private readonly debugInfo = signal<HeroDebugInfo | null>(null);
  private readonly elementUnderPointer = signal('-');

  protected readonly debugRows = computed<DebugRow[]>(() => {
    const d = this.debugInfo();
    const px = (n: number) => `${Math.round(n)} px/s`;
    return [
      { label: 'build', value: BUILD_STAMP },
      { label: 'hero', value: `${this.heroState()} · ${this.heroActivity() ?? '-'}` },
      { label: 'fallback', value: this.fallbackReason() ?? 'no' },
      { label: 'tier', value: d?.tier ?? this.tierName() },
      { label: 'reduced motion', value: this.reducedMotion ? 'yes' : 'no' },
      { label: 'tool', value: this.tool() },
      { label: 'fps', value: d ? `${d.fps.toFixed(0)} · p95 ${d.p95Ms.toFixed(1)} ms` : '-' },
      { label: 'bricks', value: d ? `${d.bricks} · redrops ${d.redrops}` : '-' },
      { label: 'pointer', value: d ? `${d.pointerState} · ${px(d.speedPxPerS)}` : '-' },
      {
        label: 'input',
        value: d ? `${d.input.pointerType} · ${d.input.eventsPerSecond} ev/s · ${d.input.samplesPerEvent}/ev` : '-',
      },
      { label: 'pusher', value: d?.pusher ? `on at ${d.pusher.x.toFixed(1)}, ${d.pusher.z.toFixed(1)}` : 'off' },
      {
        label: 'hover',
        value: d
          ? `${d.hovered ? `#${d.hovered.id} at ${d.hovered.x.toFixed(2)}, ${d.hovered.z.toFixed(2)}` : '-'} · clearing pusher ${d.excluded}`
          : '-',
      },
      {
        label: 'carry',
        value: d?.carry
          ? `${d.carry.bricks} brick(s) · target ${d.carry.target === null ? '-' : `#${d.carry.target}`} · ${d.carry.angleDeg.toFixed(0)}° · wheel ${d.carry.wheelPx.toFixed(0)} px`
          : '-',
      },
      { label: 'under pointer', value: this.elementUnderPointer() },
      { label: 'dpr', value: String(window.devicePixelRatio) },
    ];
  });

  private readonly changeDetector = inject(ChangeDetectorRef);
  private hero: HeroHandle | null = null;
  /**
   * Bumped whenever the scene must go away (page left or destroyed). A load that started
   * under an older generation disposes what it built instead of going live.
   */
  private generation = 0;
  /** True between leaving the page and coming back: the scene was released. */
  private left = false;
  /** Changing it re-creates the canvas: a canvas whose WebGL context was released stays lost. */
  protected readonly canvasKey = signal(0);

  constructor() {
    // The headline is the LCP element: request the 3D chunk only after first paint, when idle.
    afterNextRender(() => this.startWhenIdle());
    if (this.debug) window.addEventListener('pointermove', this.trackElementUnderPointer, { passive: true });
  }

  /**
   * Ionic keeps this page alive (hidden) under /scan and the rest of the flow, so ngOnDestroy
   * doesn't run there. Release the WebGL context, the physics world and the listeners on leave:
   * phones kill background tabs that hold them (the camera app opens on top), and Esc on later
   * pages must not reach the hidden scene.
   */
  ionViewDidLeave(): void {
    this.left = true;
    this.releaseHero();
    this.canvasKey.update((k) => k + 1);
    if (this.heroState() !== 'fallback') this.heroState.set('static');
    // Ionic detaches a leaving page from change detection: render the released state once
    // (swap in the fresh canvas, drop the dock's live state) while it's hidden.
    this.changeDetector.detectChanges();
  }

  ionViewWillEnter(): void {
    if (!this.left) return;
    this.left = false;
    if (this.heroState() === 'static') this.startWhenIdle();
  }

  ngOnDestroy(): void {
    window.removeEventListener('pointermove', this.trackElementUnderPointer);
    this.releaseHero();
  }

  private startWhenIdle(): void {
    const generation = this.generation;
    whenIdle(() => {
      if (generation === this.generation) void this.startHero();
    });
  }

  private releaseHero(): void {
    this.generation++;
    this.hero?.dispose();
    this.hero = null;
    this.heroActivity.set(null);
    this.tool.set(DEFAULT_TOOL);
    this.hintVisible.set(true);
  }

  protected replay(): void {
    this.hero?.replay();
  }

  protected selectTool(tool: Tool): void {
    if (tool === this.tool()) return;
    this.tool.set(tool);
    this.hintVisible.set(true);
    this.hero?.setTool(tool);
  }

  protected onKey(event: KeyboardEvent): void {
    if (this.heroState() !== 'live') return;
    this.selectTool(toolAfterKey(this.tool(), event.key));
  }

  /** Debug: which element would receive a pointer event here (is the canvas really on top?). */
  private readonly trackElementUnderPointer = (e: PointerEvent) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    this.elementUnderPointer.set(el ? describeElement(el) : '-');
  };

  private fallback(reason: FallbackReason): void {
    this.fallbackReason.set(reason);
    this.heroState.set('fallback');
  }

  private async startHero(): Promise<void> {
    const generation = this.generation;
    const tier = pickTier(readQualitySignals(window));
    this.tierName.set(tier.name);
    if (!tier.render3d) return this.fallback('low tier');
    if (!connectionAllows3d(readConnection(window))) return this.fallback('slow or metered connection');
    if (!supportsHardwareWebGL2(document)) return this.fallback('no hardware WebGL2');

    this.heroState.set('loading');
    try {
      const { createHero } = await measureAsync('load', () => import('./hero/hero'));
      if (generation !== this.generation) return;
      const hero = await measureAsync('create', () => createHero(
        {
          host: this.hostEl().nativeElement,
          canvas: this.canvasEl().nativeElement,
          keepOuts: [this.cardEl().nativeElement, this.dockEl().nativeElement],
        },
        {
          tier,
          debug: this.debug,
          reducedMotion: this.reducedMotion,
          onActivity: (activity) => this.heroActivity.set(activity),
          onInteract: () => this.hintVisible.set(false),
          onDebug: this.debug ? (info) => this.debugInfo.set(info) : undefined,
        },
      ));
      // The page may have been left while the scene was getting ready.
      if (generation !== this.generation) {
        hero.dispose();
        return;
      }
      this.hero = hero;
      this.heroState.set('live');
    } catch (error) {
      if (generation !== this.generation) return;
      console.warn('Hero scene unavailable, showing the static surface.', error);
      this.fallback('load failed');
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

function describeElement(el: Element): string {
  const testId = el.getAttribute('data-testid');
  const cls = [...el.classList].slice(0, 2).map((c) => `.${c}`).join('');
  return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls}${testId ? `[${testId}]` : ''}`;
}
