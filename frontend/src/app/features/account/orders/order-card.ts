import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import { reiconDelivery, reiconPackage } from '@ng-icons/reicon';
import { IconComponent } from '../../../shared/ui/icon.component';
import { PricePipe } from '../../../shared/commerce/price.pipe';
import { Order } from '../../orders/order-models';
import { canBuyAgain, canPay, formatDateTime, orderNote } from '../../orders/order-status';
import { OrderStatusBadge } from '../../orders/order-status-badge';
import { OrderItems } from '../../orders/order-items';

/** Figma frame `history-card` (193:2519): one variant per order status. */
@Component({
  selector: 'n2f-order-card',
  imports: [RouterLink, IconComponent, PricePipe, OrderStatusBadge, OrderItems],
  viewProviders: [provideIcons({ reiconDelivery, reiconPackage })],
  template: `
    @let current = order();
    <article [attr.aria-labelledby]="'order-' + current.id">
      <header>
        <h2 [id]="'order-' + current.id">Đơn #{{ current.id }}</h2>
        <n2f-order-status-badge [status]="current.status" />
        <p class="placed">Đặt lúc {{ placedAt() }}</p>
        @if (note(); as info) {
          <p [class]="'note ' + info.tone">
            @if (noteIcon(); as icon) {
              <n2f-icon [name]="icon" size="16px" />
            }
            <span>{{ info.text }}</span>
          </p>
        }
      </header>
      <n2f-order-items
        [items]="current.items"
        [limit]="2"
        [moreLink]="['/account/orders', current.id]"
      />
      <div class="totals">
        <span>{{ quantity() }} sản phẩm</span>
        <span
          >Tổng thanh toán: <strong>{{ current.pricing.total | vnd }}</strong></span
        >
      </div>
      <footer>
        <a class="detail" [routerLink]="['/account/orders', current.id]"
          >Chi tiết đơn<span class="sr-only"> #{{ current.id }}</span>
          <n2f-icon name="reiconChevronRight" size="14px"
        /></a>
        <div class="actions">
          @switch (current.status) {
            @case ('pending-payment') {
              @if (payable()) {
                <button
                  type="button"
                  class="pill outline"
                  [disabled]="busy()"
                  (click)="cancelRequested.emit(current)"
                >
                  {{ busy() ? 'Đang hủy…' : 'Hủy đơn' }}
                </button>
                <button type="button" class="pill" (click)="payRequested.emit(current)">
                  Thanh toán ngay
                </button>
              }
            }
            @case ('processing') {
              <button
                type="button"
                class="pill outline"
                [disabled]="busy()"
                (click)="cancelRequested.emit(current)"
              >
                {{ busy() ? 'Đang hủy…' : 'Hủy đơn' }}
              </button>
            }
            @case ('shipping') {
              <a class="pill" [routerLink]="['/account/orders', current.id]">Theo dõi đơn hàng</a>
            }
            @case ('delivering') {
              <a class="pill" [routerLink]="['/account/orders', current.id]">Theo dõi đơn hàng</a>
            }
            @case ('completed') {
              <button
                type="button"
                class="pill"
                [disabled]="busy()"
                (click)="buyAgainRequested.emit(current)"
              >
                Mua lại
              </button>
            }
            @default {
              @if (rebuyable()) {
                <button
                  type="button"
                  class="pill outline"
                  [disabled]="busy()"
                  (click)="buyAgainRequested.emit(current)"
                >
                  Mua lại
                </button>
              }
            }
          }
        </div>
      </footer>
    </article>
  `,
  styles: `
    :host {
      display: block;
    }
    article {
      padding: 20px 24px 16px;
      background: #fff;
      border: 1px solid var(--line);
      border-radius: var(--radius-card);
    }
    /* ID and badge share the first row; date and status note run full width below. */
    header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: baseline;
      gap: 2px 16px;
      padding-bottom: 14px;
      border-bottom: 1px solid var(--line);
    }
    h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .placed,
    .note {
      grid-column: 1 / -1;
    }
    .placed {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
    }
    .note {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      margin: 8px 0 0;
      font-size: 13px;
      line-height: 1.45;
    }
    .note n2f-icon {
      margin-top: 1px;
    }
    .note.alert {
      color: var(--required);
    }
    .note.transit {
      color: #0f766e;
    }
    .note.success {
      color: #15803d;
    }
    .note.muted {
      color: var(--muted);
    }
    .totals {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: baseline;
      gap: 8px 16px;
      padding: 14px 0;
      border-top: 1px solid var(--line);
      color: var(--muted);
      font-size: 13px;
    }
    .totals strong {
      margin-left: 4px;
      color: var(--ink);
      font-size: 20px;
      font-weight: 700;
    }
    footer {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 8px 12px;
    }
    .actions:empty {
      display: none;
    }
    .detail {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      min-height: 44px;
      font-size: 13px;
      text-decoration: underline;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .pill {
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      padding: 0 24px;
      border: 1px solid var(--ink);
      border-radius: 999px;
      background: var(--ink);
      color: #fff;
      font: inherit;
      font-size: 15px;
      font-weight: 500;
    }
    .pill:hover:not(:disabled) {
      background: #333;
      color: #fff;
    }
    .pill.outline {
      border-color: var(--line);
      background: #fff;
      color: var(--ink);
    }
    .pill.outline:hover:not(:disabled) {
      border-color: var(--ink);
      background: #fff;
      color: var(--ink);
    }
    /* Phone: tighter card so product names keep one line; actions span the full width. */
    @media (max-width: 600px) {
      article {
        padding: 16px 16px 12px;
      }
      .totals {
        flex-wrap: nowrap;
      }
      .totals strong {
        font-size: 18px;
      }
      footer {
        flex-direction: column-reverse;
        align-items: stretch;
      }
      .actions {
        flex-wrap: nowrap;
      }
      .actions .pill {
        flex: 1;
        justify-content: center;
        padding: 0 12px;
      }
      .detail {
        align-self: center;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderCard {
  readonly order = input.required<Order>();
  readonly busy = input(false);
  readonly cancelRequested = output<Order>();
  readonly payRequested = output<Order>();
  readonly buyAgainRequested = output<Order>();

  readonly placedAt = computed(() => formatDateTime(this.order().placedAt));
  readonly payable = computed(() => canPay(this.order()));
  readonly rebuyable = computed(() => canBuyAgain(this.order()));
  readonly note = computed(() => orderNote(this.order()));
  /** Packing and transit notes carry a small icon; other tones are text only. */
  readonly noteIcon = computed(() => {
    switch (this.order().status) {
      case 'processing':
        return 'reiconPackage';
      case 'shipping':
        return 'reiconTruck';
      case 'delivering':
        return 'reiconDelivery';
      default:
        return null;
    }
  });
  readonly quantity = computed(() =>
    this.order().items.reduce((sum, line) => sum + line.quantity, 0),
  );
}
