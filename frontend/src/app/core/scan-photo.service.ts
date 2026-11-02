import { computed, Injectable, signal } from '@angular/core';

/** Loads the stored scan image once so the canvas and the crop thumbnails share it. */
@Injectable({ providedIn: 'root' })
export class ScanPhotoService {
  private readonly _image = signal<HTMLImageElement | null>(null);
  private loadedUrl: string | null = null;

  readonly image = this._image.asReadonly();
  readonly ready = computed(() => this._image() !== null);

  load(url: string): void {
    if (this.loadedUrl === url) {
      return;
    }
    this.loadedUrl = url;
    this._image.set(null);
    const image = new Image();
    image.onload = () => {
      if (this.loadedUrl === url) {
        this._image.set(image);
      }
    };
    image.onerror = () => {
      if (this.loadedUrl === url) {
        this.loadedUrl = null;
      }
    };
    image.src = url;
  }
}
