import { Component } from '@angular/core';

@Component({
  selector: 'app-footer',
  template: `
    <footer class="footer" data-testid="app-footer">
      <p>
        Catalog data from
        <a href="https://rebrickable.com" target="_blank" rel="noopener noreferrer">Rebrickable</a>.
        Part recognition by
        <a href="https://brickognize.com" target="_blank" rel="noopener noreferrer">Brickognize</a>.
      </p>
      <p data-testid="trademark-disclaimer">
        LEGO® is a trademark of the LEGO Group, which does not sponsor, authorize or endorse this
        site.
      </p>
    </footer>
  `,
  styles: `
    .footer {
      max-width: 720px;
      margin: 24px auto 0;
      padding: 16px 16px calc(24px + env(safe-area-inset-bottom));
      color: var(--ps-ink-soft);
      font-size: 0.8125rem;
      line-height: 1.5;
      border-top: 1px solid var(--ps-line);
    }
    p {
      margin: 0 0 6px;
    }
    a {
      color: var(--ps-brand-dark);
      font-weight: 600;
    }
  `,
})
export class AppFooter {}
