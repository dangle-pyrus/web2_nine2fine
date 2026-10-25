import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink, RouterLinkActive } from '@angular/router';
import { map, tap } from 'rxjs';
import { storeSettings } from '../../core/store-settings';
import { formatDate } from '../orders/order-status';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { findPolicy, policies, POLICIES_UPDATED_AT } from './policy-content';

/** `/policies/:slug`: one policy with the list of all policies beside it. */
@Component({
  selector: 'n2f-policy-page',
  imports: [RouterLink, RouterLinkActive, EmptyStateComponent],
  template: `
    <div class="container policies">
      <nav class="menu" aria-label="Chính sách">
        <p class="menu-title">Chính sách</p>
        @for (item of policies; track item.slug) {
          <a
            [routerLink]="['/policies', item.slug]"
            routerLinkActive="active"
            ariaCurrentWhenActive="page"
            >{{ item.label }}</a
          >
        }
        <a routerLink="/help">Liên hệ & hỗ trợ</a>
      </nav>
      @if (policy(); as current) {
        <article aria-labelledby="policy-title">
          <h1 id="policy-title">{{ current.title }}</h1>
          <p class="lead">{{ current.summary }}</p>
          <p class="updated">Cập nhật ngày {{ updated }}</p>
          @for (section of current.sections; track section.heading) {
            <section>
              <h2>{{ section.heading }}</h2>
              @if (section.cards; as cards) {
                <ul class="cards">
                  @for (card of cards; track card.name) {
                    <li>
                      <img
                        [src]="card.image"
                        [alt]="'Thẻ thành viên ' + card.name"
                        width="430"
                        height="251"
                        loading="lazy"
                      />
                      <strong>{{ card.name }}</strong>
                      <span class="requirement">{{ card.requirement }}</span>
                      <span>{{ card.perk }}</span>
                    </li>
                  }
                </ul>
              }
              @for (block of section.blocks; track $index) {
                @if (isList(block)) {
                  <ul>
                    @for (line of block; track line) {
                      <li>{{ line }}</li>
                    }
                  </ul>
                } @else {
                  <p>{{ block }}</p>
                }
              }
            </section>
          }
          <p class="contact">
            Cần hỗ trợ thêm? Gọi <a [href]="info.hotlineHref">{{ info.hotline }}</a> hoặc email
            <a [href]="'mailto:' + info.email">{{ info.email }}</a
            >.
          </p>
        </article>
      } @else {
        <n2f-empty-state
          image="/assets/illustrations/page_not_found.svg"
          heading="Không tìm thấy chính sách"
          description="Chọn một chính sách trong danh sách bên cạnh."
        />
      }
    </div>
  `,
  styles: `
    .policies {
      display: grid;
      grid-template-columns: 220px minmax(0, 760px);
      gap: 56px;
      padding-block: 40px 96px;
    }
    .menu {
      position: sticky;
      top: 96px;
      align-self: start;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .menu-title {
      margin: 0 0 8px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .menu a {
      padding: 8px 0;
      color: var(--muted);
      font-size: 15px;
    }
    .menu a:hover,
    .menu a.active {
      color: var(--ink);
    }
    .menu a.active {
      font-weight: 700;
    }
    h1 {
      margin: 0 0 10px;
      color: var(--heading);
      font-size: clamp(28px, 3.4vw, 40px);
      font-weight: 600;
      line-height: 1.2;
    }
    .lead {
      margin: 0;
      font-size: 17px;
      line-height: 1.6;
    }
    .updated {
      margin: 8px 0 0;
      color: var(--muted);
      font-size: 13px;
    }
    section {
      margin-top: 32px;
    }
    h2 {
      margin: 0 0 10px;
      font-size: 19px;
      font-weight: 700;
    }
    p,
    li {
      line-height: 1.7;
    }
    section p {
      margin: 0 0 10px;
    }
    ul {
      margin: 0 0 10px;
      padding-left: 20px;
    }
    li + li {
      margin-top: 4px;
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 20px;
      margin: 4px 0 20px;
      padding: 0;
      list-style: none;
    }
    .cards li {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin: 0;
      font-size: 14px;
      line-height: 1.5;
    }
    .cards img {
      width: 100%;
      height: auto;
      margin-bottom: 10px;
      border-radius: 12px;
      box-shadow: 0 6px 18px #0000001f;
    }
    .cards strong {
      font-size: 16px;
    }
    .cards .requirement {
      color: var(--muted);
    }
    .contact {
      margin-top: 40px;
      padding: 16px 18px;
      border-radius: var(--radius-card);
      background: var(--surface);
    }
    .contact a {
      font-weight: 700;
      text-decoration: underline;
    }
    @media (max-width: 860px) {
      .policies {
        grid-template-columns: minmax(0, 1fr);
        gap: 24px;
        padding-block: 24px 64px;
      }
      .menu {
        position: static;
        flex-direction: row;
        gap: 8px;
        overflow-x: auto;
        padding-bottom: 4px;
      }
      .menu-title {
        display: none;
      }
      .cards {
        grid-template-columns: minmax(0, 1fr);
        gap: 24px;
      }
      .cards img {
        max-width: 360px;
      }
      .menu a {
        flex-shrink: 0;
        padding: 8px 14px;
        border: 1px solid var(--line);
        border-radius: 999px;
        font-size: 14px;
        white-space: nowrap;
      }
      .menu a.active {
        border-color: var(--ink);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PolicyPage {
  private readonly title = inject(Title);
  get policies() {
    return policies();
  }
  get info() {
    return storeSettings().info;
  }
  readonly updated = formatDate(POLICIES_UPDATED_AT);
  private readonly slug = toSignal(
    inject(ActivatedRoute).paramMap.pipe(
      map((params) => params.get('slug')),
      tap((slug) => {
        const found = findPolicy(slug);
        this.title.setTitle(`${found?.label ?? 'Chính sách'} | nine2fine`);
      }),
    ),
    { initialValue: null },
  );
  readonly policy = computed(() => findPolicy(this.slug()));

  isList(block: string | string[]): block is string[] {
    return Array.isArray(block);
  }
}
