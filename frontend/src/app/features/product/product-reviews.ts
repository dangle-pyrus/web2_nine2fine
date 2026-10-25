import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { ProductReview } from '../catalog/models/product';
import { formatDate } from '../orders/order-status';

/** Reviews as a fitting room (Baymard): aggregate fit scale, size bought and height per review. */
@Component({
  selector: 'n2f-product-reviews',
  template: `
    @if (!reviews().length) {
      <p class="empty">Chưa có đánh giá cho sản phẩm này.</p>
    } @else {
      <div class="overview">
        <div class="score">
          <strong>{{ average().toFixed(1) }}</strong>
          <span class="stars" role="img" [attr.aria-label]="average().toFixed(1) + ' trên 5 sao'">
            @for (star of [1, 2, 3, 4, 5]; track star) {
              <span [class.on]="star <= roundedAverage()" aria-hidden="true">★</span>
            }
          </span>
          <span class="count">{{ reviews().length }} đánh giá</span>
        </div>
        <div class="fit-scale">
          <p id="fit-scale-label">Độ vừa theo người mua</p>
          <div
            class="scale"
            role="img"
            aria-labelledby="fit-scale-label"
            [attr.aria-description]="fitLabel()"
          >
            <span class="marker" [style.left.%]="fitPosition()"></span>
          </div>
          <div class="scale-labels" aria-hidden="true">
            <span>Chật</span><span>Vừa</span><span>Rộng</span>
          </div>
          <p class="fit-label">{{ fitLabel() }}</p>
        </div>
      </div>
      <div class="filters" role="group" aria-label="Lọc theo size đã mua">
        <button type="button" [attr.aria-pressed]="!sizeFilter()" (click)="sizeFilter.set('')">
          Tất cả
        </button>
        @for (size of sizes(); track size) {
          <button
            type="button"
            [attr.aria-pressed]="sizeFilter() === size"
            (click)="sizeFilter.set(size)"
          >
            Size {{ size }}
          </button>
        }
      </div>
      <ul>
        @for (review of shown(); track review.id) {
          <li>
            <div class="review-head">
              <span
                class="stars small"
                role="img"
                [attr.aria-label]="review.rating + ' trên 5 sao'"
              >
                @for (star of [1, 2, 3, 4, 5]; track star) {
                  <span [class.on]="star <= review.rating" aria-hidden="true">★</span>
                }
              </span>
              <h3>{{ review.title }}</h3>
              @if (review.verified) {
                <span class="verified">Đã mua hàng</span>
              }
            </div>
            <p>{{ review.body }}</p>
            <p class="meta">
              {{ review.author }} · {{ date(review.date) }}
              @if (review.height) {
                · Cao {{ review.height }}
              }
              · Mua size {{ review.sizeBought }} ·
              <strong>{{ fitWords[review.fit] }}</strong>
            </p>
            @if (review.reply; as reply) {
              <div class="reply">
                <strong>Phản hồi từ nine2fine · {{ date(reply.at) }}</strong>
                <p>{{ reply.body }}</p>
              </div>
            }
          </li>
        }
      </ul>
      @if (visible().length > shown().length) {
        <button type="button" class="show-all" (click)="showAll.set(true)">
          Xem tất cả {{ visible().length }} đánh giá
        </button>
      }
    }
    @if (hasSamples()) {
      <p class="sample">
        Đánh giá mẫu dùng cho bản trải nghiệm, không phải nhận xét của khách hàng thật.
      </p>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .overview {
      display: grid;
      grid-template-columns: minmax(160px, 220px) minmax(0, 1fr);
      gap: 32px;
      align-items: center;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--line);
    }
    .score {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .score strong {
      font-size: 44px;
      font-weight: 700;
      line-height: 1;
    }
    .stars {
      color: #d0d0d0;
      font-size: 18px;
      letter-spacing: 2px;
    }
    .stars .on {
      color: var(--ink);
    }
    .stars.small {
      font-size: 14px;
    }
    .count,
    .meta,
    .sample,
    .empty {
      color: var(--muted);
      font-size: 13px;
    }
    .fit-scale p {
      margin: 0 0 10px;
      font-size: 14px;
      font-weight: 600;
    }
    .scale {
      position: relative;
      height: 6px;
      border-radius: 999px;
      background: var(--line);
    }
    .marker {
      position: absolute;
      top: 50%;
      width: 16px;
      height: 16px;
      border: 3px solid #fff;
      border-radius: 50%;
      background: var(--ink);
      box-shadow: 0 0 0 1px var(--ink);
      transform: translate(-50%, -50%);
    }
    .scale-labels {
      display: flex;
      justify-content: space-between;
      margin-top: 8px;
      color: var(--muted);
      font-size: 12px;
    }
    .fit-scale .fit-label {
      margin: 8px 0 0;
      font-weight: 500;
    }
    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 16px 0 4px;
    }
    .filters button {
      min-height: 36px;
      padding: 0 14px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: #fff;
      font: inherit;
      font-size: 13px;
    }
    .filters [aria-pressed='true'] {
      border-color: var(--ink);
      background: var(--ink);
      color: #fff;
    }
    ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      padding: 18px 0;
      border-bottom: 1px solid var(--line);
    }
    .review-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 12px;
    }
    h3 {
      margin: 0;
      font-size: 15px;
      font-weight: 600;
    }
    li p {
      margin: 8px 0 0;
      line-height: 1.6;
    }
    .reply {
      margin-top: 10px;
      padding: 10px 14px;
      border-left: 3px solid var(--ink);
      background: var(--surface);
      font-size: 14px;
    }
    .reply p {
      margin: 4px 0 0;
    }
    .sample {
      margin: 14px 0 0;
      font-style: italic;
    }
    .verified {
      padding: 1px 8px;
      border-radius: 999px;
      background: #e8f5ec;
      color: #1a7f37;
      font-size: 12px;
      font-weight: 600;
    }
    @media (max-width: 600px) {
      .overview {
        grid-template-columns: 1fr;
        gap: 20px;
      }
    }
    .show-all {
      min-height: 44px;
      margin-top: 16px;
      padding: 0 22px;
      border: 1px solid var(--ink);
      border-radius: 999px;
      background: #fff;
      color: var(--ink);
      font: inherit;
      font-weight: 600;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductReviews {
  readonly reviews = input.required<ProductReview[]>();
  readonly sizeFilter = signal('');
  /** The page shows two reviews until the shopper asks for the rest. */
  readonly showAll = signal(false);
  readonly fitWords: Record<ProductReview['fit'], string> = {
    [-1]: 'Hơi chật',
    0: 'Vừa size',
    1: 'Hơi rộng',
  };
  readonly average = computed(() => {
    const list = this.reviews();
    return list.length ? list.reduce((sum, review) => sum + review.rating, 0) / list.length : 0;
  });
  readonly roundedAverage = computed(() => Math.round(this.average()));
  readonly hasSamples = computed(() => this.reviews().some((review) => review.sample));
  /** -1..1 mapped onto 0..100% of the scale. */
  readonly fitScore = computed(() => {
    const list = this.reviews();
    return list.length ? list.reduce((sum, review) => sum + review.fit, 0) / list.length : 0;
  });
  readonly fitPosition = computed(() => (this.fitScore() + 1) * 50);
  readonly fitLabel = computed(() => {
    const score = this.fitScore();
    if (score <= -0.25) return 'Đa số thấy hơi chật, cân nhắc chọn lớn hơn một size.';
    if (score >= 0.25) return 'Đa số thấy hơi rộng, có thể chọn nhỏ hơn một size.';
    return 'Đa số thấy vừa đúng size.';
  });
  readonly sizes = computed(() => [...new Set(this.reviews().map((review) => review.sizeBought))]);
  readonly visible = computed(() => {
    const size = this.sizeFilter();
    return size ? this.reviews().filter((review) => review.sizeBought === size) : this.reviews();
  });

  readonly shown = computed(() => (this.showAll() ? this.visible() : this.visible().slice(0, 2)));

  date(iso: string): string {
    return formatDate(iso);
  }
}
