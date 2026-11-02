import { Component, computed, effect, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { ScanPhotoService } from '../../core/scan-photo.service';
import { BBox, cropRect, Size } from '../../shared/bbox-geometry';

const THUMB_PX = 96;

/**
 * Thumbnail of a piece: the catalog image when there is one, otherwise a crop of the user's own
 * photo (also used when the catalog image fails to load).
 */
@Component({
  selector: 'app-piece-thumb',
  template: `
    @if (showCatalogImage()) {
      <img [src]="imageUrl()" alt="" loading="lazy" referrerpolicy="no-referrer" (error)="failedUrl.set(imageUrl() ?? null)" />
    } @else if (bbox()) {
      <canvas #crop [width]="size" [height]="size" aria-hidden="true"></canvas>
    } @else {
      <span class="placeholder" aria-hidden="true">?</span>
    }
  `,
  styles: `
    :host {
      display: inline-grid;
      place-items: center;
      width: var(--thumb-size, 56px);
      height: var(--thumb-size, 56px);
      flex: none;
      overflow: hidden;
      border-radius: 10px;
      background: #ece8dd;
      border: 1px solid var(--ps-line);
    }
    img,
    canvas {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .placeholder {
      color: var(--ps-ink-soft);
      font-weight: 700;
    }
  `,
})
export class PieceThumb {
  readonly imageUrl = input<string | null | undefined>(null);
  readonly bbox = input<BBox | null | undefined>(null);
  /** Natural size of the scan photo, needed to crop. */
  readonly photoSize = input<Size | null>(null);

  private readonly photo = inject(ScanPhotoService);
  private readonly crop = viewChild<ElementRef<HTMLCanvasElement>>('crop');

  protected readonly size = THUMB_PX;
  protected readonly failedUrl = signal<string | null>(null);
  protected readonly showCatalogImage = computed(() => !!this.imageUrl() && this.imageUrl() !== this.failedUrl());

  constructor() {
    effect(() => this.drawCrop());
  }

  private drawCrop(): void {
    const canvas = this.crop()?.nativeElement;
    const image = this.photo.image();
    const box = this.bbox();
    const size = this.photoSize();
    const context = canvas?.getContext('2d');
    if (!canvas || !context || !image || !box || !size) {
      return;
    }
    const source = cropRect(box, size);
    const fit = Math.min(THUMB_PX / source.width, THUMB_PX / source.height);
    const width = source.width * fit;
    const height = source.height * fit;
    context.clearRect(0, 0, THUMB_PX, THUMB_PX);
    // Source rect is in image pixels; scale to the loaded bitmap in case its size differs.
    const sx = image.naturalWidth / size.width;
    const sy = image.naturalHeight / size.height;
    context.drawImage(
      image,
      source.x * sx,
      source.y * sy,
      source.width * sx,
      source.height * sy,
      (THUMB_PX - width) / 2,
      (THUMB_PX - height) / 2,
      width,
      height,
    );
  }
}
