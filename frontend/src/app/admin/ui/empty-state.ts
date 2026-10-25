import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AdmIcon } from './icon';

/**
 * Empty states (5.7, Phụ lục A.3): `first` uses a greyscale unDraw illustration, `filtered` and
 * `error` an icon in a grey circle. Project the action button(s).
 */
@Component({
  selector: 'adm-empty',
  imports: [AdmIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (kind() === 'first') {
      <img [src]="image()" alt="" width="200" height="150" />
    } @else {
      <span class="icon"
        ><adm-icon [name]="kind() === 'error' ? 'reiconAlertCircle' : 'reiconSearch'" [size]="22"
      /></span>
    }
    <h2>{{ heading() }}</h2>
    @if (description()) {
      <p>{{ description() }}</p>
    }
    <div class="actions"><ng-content /></div>
  `,
  styles: `
    :host {
      display: grid;
      justify-items: center;
      gap: 8px;
      padding: 56px 16px;
      text-align: center;
    }
    img {
      width: 200px;
      height: auto;
      filter: grayscale(1);
      opacity: 0.85;
      margin-bottom: 8px;
    }
    .icon {
      width: 48px;
      height: 48px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: var(--adm-muted);
      color: var(--adm-text-secondary);
      margin-bottom: 8px;
    }
    h2 {
      font-size: 16px;
      line-height: 24px;
      font-weight: 500;
    }
    p {
      max-width: 400px;
      color: var(--adm-text-secondary);
    }
    .actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }
    .actions:empty {
      display: none;
    }
  `,
})
export class AdmEmptyState {
  readonly kind = input<'first' | 'filtered' | 'error'>('filtered');
  readonly heading = input.required<string>();
  readonly description = input('');
  readonly image = input('/assets/illustrations/shopping_bags.svg');
}
