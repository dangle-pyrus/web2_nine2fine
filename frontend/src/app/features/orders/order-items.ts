import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PricePipe } from '../../shared/commerce/price.pipe';
import { getMedia } from '../../../media/media-manifest';
import { OrderItem } from './order-models';

/** Order line list shared by the history card and the order detail page. */
@Component({
  selector: 'n2f-order-items',
  imports: [RouterLink, PricePipe],
  template: `
    <ul>
      @for (line of shown(); track line.productSlug + line.color + line.size) {
        <li [class.has-review]="reviewable()">
          <img
            [src]="media(line.mediaId).src"
            [alt]="media(line.mediaId).alt"
            width="80"
            height="100"
            loading="lazy"
          />
          <div class="info">
            <a class="name" [routerLink]="['/product', line.productSlug]">{{ line.name }}</a>
            <span class="meta">{{ line.color }} · Size {{ line.size }}</span>
            <span class="meta">{{ line.unitPrice | vnd }} × {{ line.quantity }}</span>
          </div>
          <div class="price">
            @if (line.compareAtPrice) {
              <s
                ><span class="sr-only">Giá gốc </span
                >{{ line.compareAtPrice * line.quantity | vnd }}</s
              >
            }
            <strong>{{ line.unitPrice * line.quantity | vnd }}</strong>
          </div>
          @if (reviewable()) {
            <a class="review" [routerLink]="['/product', line.productSlug]" fragment="reviews"
              >Viết đánh giá<span class="sr-only"> cho {{ line.name }}</span></a
            >
          }
        </li>
      }
    </ul>
    @if (moreLink(); as link) {
      @if (hidden(); as more) {
        <p class="more">
          <a [routerLink]="link">và {{ more }} sản phẩm khác</a>
        </p>
      }
    }
  `,
  styles: `
    ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: grid;
      grid-template-columns: 64px 1fr auto;
      align-items: center;
      gap: 16px;
      padding: 14px 0;
      border-bottom: 1px solid var(--line);
    }
    li:last-child {
      border-bottom: 0;
    }
    img {
      width: 64px;
      height: 80px;
      object-fit: cover;
      background: #d9d9d9;
    }
    .info {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .name {
      display: -webkit-box;
      overflow: hidden;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      font-size: 16px;
      font-weight: 600;
    }
    .meta {
      color: var(--muted);
      font-size: 13px;
    }
    .price {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 2px;
      font-size: 15px;
      white-space: nowrap;
    }
    s {
      color: var(--muted);
      font-size: 13px;
    }
    .has-review {
      row-gap: 4px;
    }
    .has-review img {
      grid-row: span 2;
    }
    .review {
      grid-column: 2;
      justify-self: start;
      font-size: 13px;
      text-decoration: underline;
    }
    .more {
      margin: 0;
      padding: 0 0 14px 80px;
      color: var(--muted);
      font-size: 13px;
    }
    .more a {
      color: var(--ink);
      text-decoration: underline;
    }
    /* Phone: price moves under the name so long names keep their width. */
    @media (max-width: 600px) {
      li {
        grid-template-columns: 64px 1fr;
        align-items: start;
        gap: 4px 14px;
      }
      img {
        grid-row: span 2;
      }
      .has-review img {
        grid-row: span 3;
      }
      .price {
        flex-direction: row-reverse;
        justify-content: flex-end;
        align-items: baseline;
        gap: 8px;
      }
      .more {
        padding-left: 78px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderItems {
  readonly items = input.required<OrderItem[]>();
  /** Show only the first lines (history cards); the rest is summarised as "và N sản phẩm khác". */
  readonly limit = input<number | null>(null);
  /** Where "và N sản phẩm khác" leads, usually the order detail page. */
  readonly moreLink = input<readonly string[] | null>(null);
  /** Completed orders link each line to its product's review section. */
  readonly reviewable = input(false);
  readonly media = getMedia;

  readonly shown = computed(() => {
    const limit = this.limit();
    return limit ? this.items().slice(0, limit) : this.items();
  });
  readonly hidden = computed(() => this.items().length - this.shown().length);
}
