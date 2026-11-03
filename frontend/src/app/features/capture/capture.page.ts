import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonSpinner, IonTitle, IonToolbar } from '@ionic/angular';
import { ScanStore } from '../../core/scan.store';
import { checkImageFile, prepareForUpload } from '../../shared/image-prep';
import { PHOTO_TIPS } from '../../shared/photo-tips';
import { AppFooter } from '../../shared/ui/app-footer.component';
import { PhotoSourceService } from './photo-source.service';

interface Selected {
  file: File;
  previewUrl: string;
}

@Component({
  selector: 'app-capture-page',
  imports: [IonContent, IonHeader, IonSpinner, IonTitle, IonToolbar, AppFooter],
  templateUrl: './capture.page.html',
  styleUrl: './capture.page.scss',
})
export class CapturePage implements OnDestroy {
  private readonly store = inject(ScanStore);
  private readonly router = inject(Router);
  protected readonly source = inject(PhotoSourceService);

  protected readonly selected = signal<Selected | null>(null);
  protected readonly localError = signal<string | null>(null);
  protected readonly uploading = signal(false);
  protected readonly errorMessage = computed(
    () => this.localError() ?? this.store.error()?.message ?? null,
  );

  protected readonly tips = PHOTO_TIPS;

  /** What the loading overlay says: resizing happens on the phone, analysis on the server. */
  protected readonly stage = signal<'preparing' | 'analyzing'>('preparing');
  protected readonly elapsedSeconds = signal(0);
  protected readonly prepNote = signal<string | null>(null);
  private timer: ReturnType<typeof setInterval> | null = null;

  ngOnDestroy(): void {
    this.stopTimer();
    this.revokePreview();
  }

  protected onFileChosen(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0);
    input.value = '';
    if (file) {
      this.select(file);
    }
  }

  protected async takeNativePhoto(): Promise<void> {
    const file = await this.source.takeNativePhoto();
    if (file) {
      this.select(file);
    }
  }

  protected async upload(): Promise<void> {
    const selected = this.selected();
    if (!selected || this.uploading()) {
      return;
    }
    this.uploading.set(true);
    this.localError.set(null);
    this.prepNote.set(null);
    this.stage.set('preparing');
    this.startTimer();
    try {
      const prepared = await prepareForUpload(selected.file);
      this.prepNote.set(prepared.note);
      this.stage.set('analyzing');
      const id = await this.store.upload(prepared.file);
      if (id) {
        await this.router.navigate(['/scan', id]);
      }
    } finally {
      this.stopTimer();
      this.uploading.set(false);
    }
  }

  private startTimer(): void {
    this.stopTimer();
    this.elapsedSeconds.set(0);
    this.timer = setInterval(() => this.elapsedSeconds.update((s) => s + 1), 1000);
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  protected clear(): void {
    this.revokePreview();
    this.selected.set(null);
    this.localError.set(null);
    this.store.clearError();
  }

  private select(file: File): void {
    const check = checkImageFile(file);
    this.store.clearError();
    if (!check.ok) {
      this.localError.set(check.message);
      return;
    }
    this.revokePreview();
    this.localError.set(null);
    this.prepNote.set(null);
    this.selected.set({ file, previewUrl: URL.createObjectURL(file) });
  }

  private revokePreview(): void {
    const current = this.selected();
    if (current) {
      URL.revokeObjectURL(current.previewUrl);
    }
  }
}
