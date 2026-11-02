import { Component, computed, input, output, signal } from '@angular/core';
import { Detection, PieceGroup } from '../../core/api/generated/models';
import { Size } from '../../shared/bbox-geometry';
import { confidenceLabel, confidenceLevel } from '../../shared/confidence';
import { colorTitle, groupKey, groupTitle, indexById, minConfidence } from '../../shared/grouping';
import { ColorSwatch } from '../../shared/ui/color-swatch.component';
import { PieceThumb } from './piece-thumb.component';

interface GroupRow {
  key: string;
  group: PieceGroup;
  title: string;
  colorName: string;
  confidenceText: string;
  level: string;
  detections: Detection[];
  firstBox: Detection['bbox'];
}

@Component({
  selector: 'app-group-list',
  imports: [ColorSwatch, PieceThumb],
  template: `
    <ul class="groups" data-testid="group-list">
      @for (row of rows(); track row.key) {
        <li
          class="group"
          data-testid="group-row"
          [attr.data-part-num]="row.group.part?.partNum ?? null"
          [attr.data-color-id]="row.group.color?.id ?? null"
          [attr.data-count]="row.group.count"
        >
          <button
            type="button"
            class="main"
            [attr.aria-expanded]="row.group.count > 1 ? isOpen(row.key) : null"
            [attr.aria-label]="
              (row.group.count > 1 ? 'Show pieces: ' : 'Edit: ') + row.title + ', ' + row.colorName + ', ' + row.group.count + ' pieces'
            "
            (click)="onRowClick(row)"
          >
            <app-piece-thumb [imageUrl]="row.group.part?.imageUrl" [bbox]="row.firstBox" [photoSize]="photoSize()" />
            <span class="text">
              <span class="title" [class.unidentified]="!row.group.part">{{ row.title }}</span>
              <span class="meta">
                @if (row.group.color; as color) {
                  <app-color-swatch [rgb]="color.rgb" />
                }
                {{ row.colorName }}
              </span>
              <span class="conf" [class]="row.level">{{ row.confidenceText }}</span>
            </span>
            <span class="count" data-testid="group-count">&times;{{ row.group.count }}</span>
          </button>

          @if (row.group.count > 1 && isOpen(row.key)) {
            <ul class="pieces">
              @for (piece of row.detections; track piece.id; let index = $index) {
                <li>
                  <button
                    type="button"
                    class="piece"
                    data-testid="detection-row"
                    [attr.data-detection-id]="piece.id"
                    [attr.aria-label]="'Edit piece ' + (index + 1) + ' of ' + row.group.count"
                    (click)="edit.emit(piece.id)"
                  >
                    <app-piece-thumb [bbox]="piece.bbox" [photoSize]="photoSize()" style="--thumb-size: 40px" />
                    <span>Piece {{ index + 1 }} &middot; {{ pieceConfidence(piece) }}</span>
                    <span class="edit-hint" aria-hidden="true">Edit</span>
                  </button>
                </li>
              }
            </ul>
          }
        </li>
      } @empty {
        <li class="empty" data-testid="group-empty">No pieces yet. Add one to get started.</li>
      }
    </ul>
  `,
  styleUrl: './group-list.component.scss',
})
export class GroupList {
  readonly groups = input.required<readonly PieceGroup[]>();
  readonly detections = input.required<readonly Detection[]>();
  readonly photoSize = input<Size | null>(null);

  readonly edit = output<string>();
  /** Detection ids of the expanded groups, so the canvas can highlight their boxes. */
  readonly highlight = output<string[]>();

  private readonly open = signal<ReadonlySet<string>>(new Set());

  protected readonly rows = computed<GroupRow[]>(() => {
    const byId = indexById(this.detections());
    return this.groups().map((group) => {
      const detections = group.detectionIds.flatMap((id) => byId.get(id) ?? []);
      const confidence = minConfidence(group, byId);
      return {
        key: groupKey(group.part, group.color),
        group,
        title: groupTitle(group),
        colorName: colorTitle(group.color),
        confidenceText: confidenceLabel(confidence),
        level: confidenceLevel(confidence),
        detections,
        firstBox: detections.find((d) => d.bbox)?.bbox ?? null,
      };
    });
  });

  protected isOpen(key: string): boolean {
    return this.open().has(key);
  }

  protected pieceConfidence(piece: Detection): string {
    return confidenceLabel(piece.confidence);
  }

  protected onRowClick(row: GroupRow): void {
    if (row.group.count === 1) {
      this.edit.emit(row.group.detectionIds[0]);
      return;
    }
    this.open.update((current) => {
      const next = new Set(current);
      if (!next.delete(row.key)) {
        next.add(row.key);
      }
      return next;
    });
    const openKeys = this.open();
    this.highlight.emit(
      this.rows()
        .filter((r) => openKeys.has(r.key))
        .flatMap((r) => r.group.detectionIds),
    );
  }
}
