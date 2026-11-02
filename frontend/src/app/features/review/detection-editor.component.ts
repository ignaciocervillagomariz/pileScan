import {
  AfterViewInit,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  OnInit,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CatalogService } from '../../core/catalog.service';
import { toAppError } from '../../core/api-error';
import { ColorRef, Detection, DetectionUpdate, Part, PartRef } from '../../core/api/generated/models';
import { ColorSwatch } from '../../shared/ui/color-swatch.component';
import { PieceThumb } from './piece-thumb.component';

export interface EditorSave {
  partNum: string;
  colorId: number;
  /** Only the fields the user actually changed, for PATCH. */
  changes: DetectionUpdate;
}

const SEARCH_DEBOUNCE_MS = 250;

/**
 * Bottom-sheet dialog to fix one piece (edit mode) or to describe a missed one (add mode).
 * Uses a native <dialog>, which gives focus trapping, Escape handling and correct semantics.
 */
@Component({
  selector: 'app-detection-editor',
  imports: [ColorSwatch, PieceThumb],
  templateUrl: './detection-editor.component.html',
  styleUrl: './detection-editor.component.scss',
})
export class DetectionEditor implements OnInit, AfterViewInit {
  /** The detection being fixed; null when adding a new piece. */
  readonly detection = input<Detection | null>(null);
  readonly busy = input(false);

  readonly saved = output<EditorSave>();
  readonly deleted = output<void>();
  readonly dismissed = output<void>();

  private readonly catalog = inject(CatalogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  private searchSeq = 0;

  protected readonly part = signal<PartRef | null>(null);
  protected readonly colorId = signal<number | null>(null);
  protected readonly partQuery = signal('');
  protected readonly partResults = signal<Part[]>([]);
  protected readonly searching = signal(false);
  protected readonly colorQuery = signal('');
  protected readonly loadError = signal<string | null>(null);

  protected readonly isEdit = computed(() => this.detection() !== null);
  protected readonly colors = this.catalog.colors;
  protected readonly color = computed(() => this.colors().find((c) => c.id === this.colorId()) ?? null);
  /** Classifier suggestions that could be mapped to a catalog part. */
  protected readonly partCandidates = computed(() =>
    (this.detection()?.partCandidates ?? []).flatMap((c) =>
      c.partNum
        ? [{ key: c.rawPartId, score: c.score, part: { partNum: c.partNum, name: c.name, imageUrl: c.imageUrl } }]
        : [],
    ),
  );
  protected readonly colorCandidates = computed(() => this.detection()?.colorCandidates ?? []);
  protected readonly filteredColors = computed(() => {
    const query = this.colorQuery().trim().toLowerCase();
    const all = this.colors();
    return query ? all.filter((c) => c.name.toLowerCase().includes(query)) : all;
  });
  protected readonly selectedColorRef = computed<ColorRef | null>(() => {
    const color = this.color();
    return color ? { id: color.id, name: color.name, rgb: color.rgb } : null;
  });

  protected readonly canSave = computed(() => {
    const part = this.part();
    const colorId = this.colorId();
    if (!part || colorId === null) {
      return false;
    }
    const current = this.detection();
    return !current || part.partNum !== current.part?.partNum || colorId !== current.color?.id;
  });

  ngOnInit(): void {
    const current = this.detection();
    this.part.set(current?.part ?? null);
    this.colorId.set(current?.color?.id ?? null);
    this.catalog.loadColors().catch((error) => this.loadError.set(toAppError(error).message));
    this.destroyRef.onDestroy(() => clearTimeout(this.searchTimer));
  }

  ngAfterViewInit(): void {
    this.dialog().nativeElement.showModal();
  }

  protected onPartInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.partQuery.set(value);
    clearTimeout(this.searchTimer);
    const query = value.trim();
    if (!query) {
      this.partResults.set([]);
      this.searching.set(false);
      return;
    }
    this.searching.set(true);
    this.searchTimer = setTimeout(() => void this.search(query), SEARCH_DEBOUNCE_MS);
  }

  protected onColorInput(event: Event): void {
    this.colorQuery.set((event.target as HTMLInputElement).value);
  }

  protected pickPart(part: PartRef): void {
    this.part.set(part);
    this.partQuery.set('');
    this.partResults.set([]);
  }

  protected pickColor(id: number): void {
    this.colorId.set(id);
  }

  protected save(): void {
    const part = this.part();
    const colorId = this.colorId();
    if (!part || colorId === null || !this.canSave()) {
      return;
    }
    const current = this.detection();
    // PATCH only what changed so the server does not mark untouched fields as corrected.
    const changes: DetectionUpdate = {};
    if (part.partNum !== current?.part?.partNum) {
      changes.partNum = part.partNum;
    }
    if (colorId !== current?.color?.id) {
      changes.colorId = colorId;
    }
    this.saved.emit({ partNum: part.partNum, colorId, changes });
  }

  protected onDialogClose(): void {
    this.dismissed.emit();
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }

  protected percent(score: number): string {
    return `${Math.round(score * 100)}%`;
  }

  private async search(query: string): Promise<void> {
    const seq = ++this.searchSeq;
    try {
      const results = await this.catalog.search(query);
      if (seq === this.searchSeq) {
        this.partResults.set(results);
      }
    } catch (error) {
      if (seq === this.searchSeq) {
        this.partResults.set([]);
        this.loadError.set(toAppError(error).message);
      }
    } finally {
      if (seq === this.searchSeq) {
        this.searching.set(false);
      }
    }
  }
}
