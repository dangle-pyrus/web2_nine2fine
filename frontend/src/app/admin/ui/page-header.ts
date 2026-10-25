import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import { AdmIcon } from './icon';

/**
 * Sticky page header (2.3, 3.5): back link, title, badges on the left; secondary then primary
 * actions on the right. Project `[badges]`, `[subtitle]` and `[actions]`.
 */
@Component({
  selector: 'adm-page-header',
  imports: [RouterLink, AdmIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (back()) {
      <a
        class="adm-btn adm-btn--icon adm-btn--ghost back"
        [routerLink]="back()"
        [queryParams]="backQuery()"
        [attr.aria-label]="backLabel()"
      >
        <adm-icon name="reiconArrowLeft" />
      </a>
    }
    <div class="heading">
      <div class="title-row">
        <h1>{{ heading() }}</h1>
        <ng-content select="[badges]" />
      </div>
      <ng-content select="[subtitle]" />
    </div>
    <div class="actions"><ng-content select="[actions]" /></div>
  `,
  styles: `
    :host {
      position: sticky;
      top: 0;
      z-index: 20;
      min-height: 76px;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 32px;
      background: var(--adm-bg);
      border-bottom: 1px solid var(--adm-divider);
    }
    .back {
      margin-left: -8px;
    }
    .heading {
      flex: 1;
      min-width: 0;
    }
    .title-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 12px;
    }
    h1 {
      font-size: 20px;
      line-height: 28px;
      font-weight: 600;
      letter-spacing: -0.01em;
      overflow-wrap: anywhere;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
    }
    @media (max-width: 767px) {
      :host {
        padding: 12px 16px;
        flex-wrap: wrap;
        min-height: 64px;
      }
      .actions {
        width: 100%;
        justify-content: flex-start;
      }
      .actions:empty {
        display: none;
      }
    }
  `,
})
export class AdmPageHeader {
  readonly heading = input.required<string>();
  readonly back = input<string | unknown[] | null>(null);
  /** Query of the list the user came from, so "back" returns to the same filters and page. */
  readonly backQuery = input<Params | null>(null);
  readonly backLabel = input('Quay lại danh sách');
}
