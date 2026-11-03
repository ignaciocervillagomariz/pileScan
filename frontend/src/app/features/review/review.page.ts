import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { BBox } from '../../shared/bbox-geometry';
import { ScanPhotoService } from '../../core/scan-photo.service';
import { ScanStore } from '../../core/scan.store';
import { PHOTO_TIPS } from '../../shared/photo-tips';
import { AppFooter } from '../../shared/ui/app-footer.component';
import { BboxCanvas } from './bbox-canvas.component';
import { DetectionEditor, EditorSave } from './detection-editor.component';
import { GroupList } from './group-list.component';

type EditorState = { kind: 'edit'; id: string } | { kind: 'add'; bbox: BBox | null };

@Component({
  selector: 'app-review-page',
  imports: [
    IonBackButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonSpinner,
    IonTitle,
    IonToolbar,
    RouterLink,
    AppFooter,
    BboxCanvas,
    DetectionEditor,
    GroupList,
  ],
  templateUrl: './review.page.html',
  styleUrl: './review.page.scss',
})
export class ReviewPage {
  /** Bound from the `:id` route param. */
  readonly id = input.required<string>();

  protected readonly store = inject(ScanStore);
  protected readonly photo = inject(ScanPhotoService);

  protected readonly loaded = signal(false);
  protected readonly drawing = signal(false);
  protected readonly highlightedIds = signal<string[]>([]);
  protected readonly editor = signal<EditorState | null>(null);
  protected readonly showDebug = signal(false);
  protected readonly tips = PHOTO_TIPS;

  protected readonly scan = this.store.scan;
  protected readonly summary = this.store.summary;
  protected readonly imageSize = computed(() => {
    const image = this.scan()?.image;
    return image ? { width: image.width, height: image.height } : null;
  });
  protected readonly editedDetection = computed(() => {
    const state = this.editor();
    return state?.kind === 'edit' ? (this.store.detections().find((d) => d.id === state.id) ?? null) : null;
  });
  protected readonly identifiedPieces = computed(
    () => this.summary().totalPieces - this.summary().unidentifiedPieces,
  );

  /** Detected pieces whose part could not be classified (service error or skipped). */
  protected readonly unclassified = computed(
    () =>
      this.store
        .detections()
        .filter((d) => d.classificationStatus === 'ERROR' || d.classificationStatus === 'SKIPPED').length,
  );
  /** Zero active pieces on a scan that ran: the user needs advice, not an empty list. */
  protected readonly noDetections = computed(
    () => this.scan()?.status === 'COMPLETED' && this.store.detections().length === 0,
  );

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => void this.open(id));
    });
    effect(() => {
      const scan = this.scan();
      if (scan) {
        untracked(() => this.photo.load(scan.image.url));
      }
    });
  }

  protected onDetectionTapped(id: string): void {
    this.openEditor({ kind: 'edit', id });
  }

  protected startAdding(): void {
    this.drawing.set(true);
  }

  protected addWithoutBox(): void {
    this.drawing.set(false);
    this.openEditor({ kind: 'add', bbox: null });
  }

  protected onBoxDrawn(bbox: BBox): void {
    this.drawing.set(false);
    this.openEditor({ kind: 'add', bbox });
  }

  protected cancelDrawing(): void {
    this.drawing.set(false);
  }

  protected closeEditor(): void {
    this.editor.set(null);
    this.store.select(null);
  }

  protected async onSaved(result: EditorSave): Promise<void> {
    const state = this.editor();
    if (!state) {
      return;
    }
    const ok =
      state.kind === 'edit'
        ? await this.store.update(state.id, result.changes)
        : await this.store.add(result.partNum, result.colorId, state.bbox);
    if (ok) {
      this.closeEditor();
    }
  }

  protected async onDeleted(): Promise<void> {
    const state = this.editor();
    if (state?.kind === 'edit' && (await this.store.remove(state.id))) {
      this.closeEditor();
    }
  }

  private openEditor(state: EditorState): void {
    this.store.clearError();
    if (state.kind === 'edit') {
      this.store.select(state.id);
    }
    this.editor.set(state);
  }

  private async open(id: string): Promise<void> {
    this.loaded.set(false);
    this.showDebug.set(false);
    await this.store.load(id);
    this.loaded.set(true);
  }
}
