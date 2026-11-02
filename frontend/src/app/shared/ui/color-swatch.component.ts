import { Component, input } from '@angular/core';

/** Color chip. The color name is always rendered next to it, so color is never the only cue. */
@Component({
  selector: 'app-color-swatch',
  template: `<span class="swatch" [style.background]="rgb()" aria-hidden="true"></span>`,
  styles: `
    .swatch {
      display: inline-block;
      width: var(--swatch-size, 18px);
      height: var(--swatch-size, 18px);
      border-radius: 50%;
      border: 1px solid rgba(0, 0, 0, 0.35);
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.5);
      flex: none;
    }
  `,
})
export class ColorSwatch {
  readonly rgb = input.required<string>();
}
