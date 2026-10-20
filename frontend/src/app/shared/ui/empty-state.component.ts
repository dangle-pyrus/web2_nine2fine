import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'n2f-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="empty-state">
      <img [src]="image()" alt="" width="230" height="170" />
      <h2>{{ heading() }}</h2>
      <p>{{ description() }}</p>
      <ng-content />
    </section>
  `,
  styles: `
    .empty-state {
      text-align: center;
      padding: 64px 20px;
    }
    img {
      object-fit: contain;
      max-width: 100%;
      /* Images are display: block globally, so text-align alone left them off-centre. */
      margin: 0 auto 20px;
    }
    h2 {
      font-size: 22px;
      font-weight: 500;
    }
    p {
      color: var(--muted);
      font-size: 14px;
      margin: 16px auto 25px;
      max-width: 380px;
      line-height: 1.6;
    }
  `,
})
export class EmptyStateComponent {
  readonly image = input('/assets/illustrations/web_search.svg');
  readonly heading = input.required<string>();
  readonly description = input.required<string>();
}
