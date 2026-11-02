import { Component, computed, input, signal } from '@angular/core';
import { SetCandidate } from '../../core/api/generated/models';
import { PieceThumb } from '../review/piece-thumb.component';
import { ColorSwatch } from '../../shared/ui/color-swatch.component';

@Component({
  selector: 'app-set-card',
  imports: [ColorSwatch, PieceThumb],
  templateUrl: './set-card.component.html',
  styleUrl: './set-card.component.scss',
})
export class SetCard {
  readonly candidate = input.required<SetCandidate>();

  protected readonly expanded = signal(false);
  protected readonly imageFailed = signal(false);
  protected readonly hasImage = computed(() => !!this.candidate().set.imageUrl && !this.imageFailed());
  protected readonly missingTotal = computed(() => this.candidate().missingPieces);
  /** The list is capped by the API, so the shown lines may not add up to the total. */
  protected readonly listedMissing = computed(() =>
    this.candidate().missingParts.reduce((sum, p) => sum + Math.max(0, p.quantityNeeded - p.quantityHave), 0),
  );

  protected toggle(): void {
    this.expanded.update((value) => !value);
  }

  protected percent(ratio: number): string {
    return `${Math.round(ratio * 100)}%`;
  }

  protected matchText(value: number): string {
    return `${Math.round(value)}%`;
  }
}
