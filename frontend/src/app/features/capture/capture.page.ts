import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonSpinner, IonTitle, IonToolbar } from '@ionic/angular';
import { ScanStore } from '../../core/scan.store';
import { checkImageFile, prepareForUpload } from '../../shared/image-prep';
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

  protected readonly tips = [
    'Use a plain, contrasting background (a white sheet works well).',
    'Spread pieces out so none overlap or touch.',
    'Shoot straight down from above, with the whole pile in frame.',
    'Use even, bright light and avoid hard shadows.',
  ];

  ngOnDestroy(): void {
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
    try {
      const id = await this.store.upload(await prepareForUpload(selected.file));
      if (id) {
        await this.router.navigate(['/scan', id]);
      }
    } finally {
      this.uploading.set(false);
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
    this.selected.set({ file, previewUrl: URL.createObjectURL(file) });
  }

  private revokePreview(): void {
    const current = this.selected();
    if (current) {
      URL.revokeObjectURL(current.previewUrl);
    }
  }
}
