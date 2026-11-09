import { Component, input } from '@angular/core';

export interface DebugRow {
  readonly label: string;
  readonly value: string;
}

/** Read-only diagnostic panel for `?debug=1`. Decorative for assistive tech, never clickable. */
@Component({
  selector: 'app-debug-overlay',
  template: `
    <dl class="overlay" aria-hidden="true" data-testid="hero-debug-overlay">
      @for (row of rows(); track row.label) {
        <dt>{{ row.label }}</dt>
        <dd [attr.data-debug]="row.label">{{ row.value }}</dd>
      }
    </dl>
  `,
  styles: `
    .overlay {
      position: absolute;
      z-index: 3;
      left: 8px;
      bottom: 8px;
      display: grid;
      grid-template-columns: auto auto;
      gap: 2px 10px;
      margin: 0;
      padding: 8px 10px;
      max-width: calc(100% - 80px);
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.72);
      color: #fff;
      font: 11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace;
      pointer-events: none;
    }
    dt {
      color: #a3a3a3;
    }
    dd {
      margin: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `,
})
export class DebugOverlay {
  readonly rows = input.required<readonly DebugRow[]>();
}
