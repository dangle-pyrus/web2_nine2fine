import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EMPTY, expand, map, reduce } from 'rxjs';
import { API_CONFIG } from '../../../core/api-config';
import { DatePipe, NumPipe } from '../../core/format.pipes';
import { ADMIN_REVIEWS_API, type AdminReview } from '../../data-access/content-api';
import { AdmBadge } from '../../ui/badge';
import { loader } from '../../ui/list-state';

const PAGE = 50;

/**
 * "Đánh giá" block of the product page (admin upgrade 2026-11-15): average, star spread, fit per size
 * and the latest reviews of THIS product. The admin reviews API has no product filter, so the list
 * is read page by page (50 at a time) and filtered here; hidden reviews are listed but left out of
 * the average, like on the storefront. Replies and hiding stay on the Đánh giá screen.
 */
@Component({
  selector: 'adm-product-reviews',
  imports: [RouterLink, AdmBadge, NumPipe, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (enabled) {
      <section class="section stack" aria-labelledby="pr-title" data-testid="product-reviews">
        <header class="pr-head">
          <h2 id="pr-title">Đánh giá</h2>
          <a class="small link" routerLink="/admin/reviews">Mở màn Đánh giá</a>
        </header>
        @if (view.state().error; as message) {
          <p class="small secondary" role="alert">{{ message }}</p>
        } @else if (stats(); as s) {
          @if (!s.count) {
            <p class="small secondary">Sản phẩm chưa có đánh giá nào.</p>
          } @else {
            <div class="pr-summary">
              <div class="pr-score">
                <span class="pr-avg num">{{ s.average }}</span>
                <span class="stars" [attr.aria-label]="s.average + ' trên 5 sao'"
                  >{{ '★'.repeat(s.rounded)
                  }}<span class="off">{{ '★'.repeat(5 - s.rounded) }}</span></span
                >
                <span class="small tertiary"
                  >{{ s.visible | admNum }} đánh giá hiển thị{{
                    s.hidden ? ', ' + s.hidden + ' đã ẩn' : ''
                  }}</span
                >
              </div>
              <ul class="pr-dist" aria-label="Phân bố số sao">
                @for (row of s.dist; track row.star) {
                  <li>
                    <span class="small">{{ row.star }}★</span>
                    <span class="pr-track"
                      ><span class="pr-bar" [style.width.%]="row.pct"></span
                    ></span>
                    <span class="small num tertiary">{{ row.count }}</span>
                  </li>
                }
              </ul>
            </div>
            @if (s.fit.length) {
              <div>
                <p class="small secondary pr-label">Độ vừa theo size đã mua</p>
                <ul class="pr-fit">
                  @for (row of s.fit; track row.size) {
                    <li>
                      <span class="small strong">{{ row.size }}</span>
                      <span class="pr-stack" [attr.aria-label]="row.text">
                        <span class="small-fit" [style.width.%]="row.small"></span>
                        <span class="true-fit" [style.width.%]="row.true"></span>
                        <span class="large-fit" [style.width.%]="row.large"></span>
                      </span>
                      <span class="small tertiary">{{ row.text }}</span>
                    </li>
                  }
                </ul>
                <p class="small tertiary legend">
                  <i class="small-fit"></i>Chật <i class="true-fit"></i>Vừa
                  <i class="large-fit"></i>Rộng
                </p>
              </div>
            }
            <ul class="pr-list">
              @for (review of s.latest; track review.id) {
                <li [class.is-hidden]="review.status === 'hidden'">
                  <div class="row">
                    <span class="stars"
                      >{{ '★'.repeat(review.rating)
                      }}<span class="off">{{ '★'.repeat(5 - review.rating) }}</span></span
                    >
                    <span class="strong pr-title">{{ review.title }}</span>
                    @if (review.status === 'hidden') {
                      <adm-badge label="Đã ẩn" tone="neutral" />
                    } @else if (!review.reply) {
                      <adm-badge label="Chưa trả lời" tone="warning" />
                    }
                  </div>
                  <p class="small secondary pr-body">{{ review.body }}</p>
                  <p class="small tertiary meta-list">
                    <span>{{ review.author }}</span>
                    <span>Size {{ review.sizeBought }}</span>
                    <span>{{ review.date | admDate }}</span>
                  </p>
                </li>
              }
            </ul>
          }
        } @else {
          <div class="stack"><span class="sk sk--title"></span><span class="sk"></span></div>
        }
      </section>
    }
  `,
  styles: `
    .pr-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      h2 {
        font-size: 16px;
        line-height: 24px;
      }
    }
    .pr-summary {
      display: grid;
      grid-template-columns: minmax(140px, auto) minmax(0, 1fr);
      gap: 24px;
      align-items: center;
    }
    .pr-score {
      display: grid;
      gap: 2px;
    }
    .pr-avg {
      font-size: 32px;
      line-height: 40px;
      font-weight: 600;
    }
    .stars {
      color: #b45309;
      letter-spacing: 1px;
      .off {
        color: var(--adm-muted-strong);
      }
    }
    .pr-dist,
    .pr-fit,
    .pr-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 6px;
    }
    .pr-dist li {
      display: grid;
      grid-template-columns: 28px minmax(0, 1fr) 28px;
      align-items: center;
      gap: 8px;
    }
    .pr-track {
      height: 8px;
      border-radius: 9999px;
      background: var(--adm-muted);
      overflow: hidden;
    }
    .pr-bar {
      display: block;
      height: 100%;
      background: #b45309;
      border-radius: 9999px;
    }
    .pr-label {
      margin-bottom: 6px;
    }
    .pr-fit li {
      display: grid;
      grid-template-columns: 36px minmax(0, 1fr) minmax(120px, auto);
      align-items: center;
      gap: 8px;
    }
    .pr-stack {
      display: flex;
      height: 10px;
      border-radius: 9999px;
      overflow: hidden;
      background: var(--adm-muted);
    }
    .small-fit {
      background: #93c5fd;
    }
    .true-fit {
      background: #15803d;
    }
    .large-fit {
      background: #fbbf24;
    }
    .legend {
      margin-top: 6px;
      i {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 2px;
        margin: 0 4px 0 8px;
      }
      i:first-child {
        margin-left: 0;
      }
    }
    .pr-list {
      gap: 0;
      li {
        padding: 12px 0;
        border-top: 1px solid var(--adm-divider);
        display: grid;
        gap: 4px;
      }
      li.is-hidden > :not(.row) {
        opacity: 0.55;
      }
      .row {
        flex-wrap: wrap;
      }
    }
    .pr-body {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .strong {
      font-weight: 500;
    }
    @media (max-width: 767px) {
      .pr-summary {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
})
export class AdmProductReviews {
  readonly productId = input.required<string>();
  private readonly api = inject(ADMIN_REVIEWS_API);
  private readonly config = inject(API_CONFIG);
  /** The mock back office has its review mock; on the desk only when reviews run on the API. */
  protected readonly enabled =
    this.config.adminOrdersMode === 'mock' || this.config.reviewsMode === 'http';

  protected readonly view = loader(this.productId, (productId) =>
    this.api.list({ view: 'all', rating: 0, page: 1, limit: PAGE }).pipe(
      expand((page) =>
        page.page * page.limit < page.total
          ? this.api.list({ view: 'all', rating: 0, page: page.page + 1, limit: PAGE })
          : EMPTY,
      ),
      map((page) => page.items.filter((item) => item.productId === productId)),
      reduce((all, items) => [...all, ...items], [] as AdminReview[]),
    ),
  );

  protected readonly stats = computed(() => {
    const items = this.view.data();
    if (!items) return null;
    const visible = items.filter((item) => item.status !== 'hidden');
    const sum = visible.reduce((total, item) => total + item.rating, 0);
    const average = visible.length ? Math.round((sum / visible.length) * 10) / 10 : 0;
    const dist = [5, 4, 3, 2, 1].map((star) => {
      const count = visible.filter((item) => item.rating === star).length;
      return { star, count, pct: visible.length ? (count / visible.length) * 100 : 0 };
    });
    const sizes = new Map<string, { small: number; true: number; large: number }>();
    for (const item of visible) {
      const entry = sizes.get(item.sizeBought) ?? { small: 0, true: 0, large: 0 };
      if (item.fit < 0) entry.small++;
      else if (item.fit > 0) entry.large++;
      else entry.true++;
      sizes.set(item.sizeBought, entry);
    }
    const fit = [...sizes.entries()].map(([size, c]) => {
      const total = c.small + c.true + c.large || 1;
      return {
        size,
        small: (c.small / total) * 100,
        true: (c.true / total) * 100,
        large: (c.large / total) * 100,
        text: `${c.true} vừa, ${c.small} chật, ${c.large} rộng`,
      };
    });
    const latest = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
    return {
      count: items.length,
      visible: visible.length,
      hidden: items.length - visible.length,
      average,
      rounded: Math.round(average),
      dist,
      fit,
      latest,
    };
  });
}
