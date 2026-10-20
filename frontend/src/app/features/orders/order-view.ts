import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import {
  reiconCard,
  reiconChevronUp,
  reiconDelivery,
  reiconPackage,
  reiconReceipt,
} from '@ng-icons/reicon';
import { IconComponent } from '../../shared/ui/icon.component';
import { PricePipe } from '../../shared/commerce/price.pipe';
import { Order, ReturnReason } from './order-models';
import { returnReason } from './order-returns';
import {
  carrierTrackingUrl,
  formatDate,
  formatDateTime,
  orderHeadline,
  orderProgress,
  orderTimeline,
  paymentMethodLabel,
  paymentStateLabel,
  refundState,
} from './order-status';
import { OrderItems } from './order-items';

/**
 * Order body from Figma `detail-order` (193:2518): status headline, ProgressStep (226:94),
 * refund block, items, payment summary and delivery info. Pages add their own title and actions.
 */
@Component({
  selector: 'n2f-order-view',
  imports: [IconComponent, PricePipe, OrderItems],
  viewProviders: [
    provideIcons({ reiconCard, reiconChevronUp, reiconDelivery, reiconPackage, reiconReceipt }),
  ],
  template: `
    @let head = headline();
    <section class="status" aria-labelledby="order-status-title">
      <div class="status-copy">
        <p class="eyebrow">{{ head.eyebrow }}</p>
        <h2 id="order-status-title">{{ head.title }}</h2>
        @if (head.detail) {
          <p class="detail">{{ head.detail }}</p>
        }
        <!-- Page actions (pay, cancel, buy again) sit next to the status they act on. -->
        <ng-content select="[actions]" />
      </div>
      @if (order().refund; as refund) {
        <dl class="refund">
          <div>
            <dt>Số tiền hoàn</dt>
            <dd>{{ refund.amount | vnd }}</dd>
          </div>
          <div>
            <dt>Hoàn về</dt>
            <dd>{{ refund.destination }}</dd>
          </div>
          @if (refundInfo(); as state) {
            <div>
              <dt>{{ state.done ? 'Đã hoàn ngày' : 'Dự kiến nhận' }}</dt>
              <dd [class.accent]="!state.done">
                {{ state.done ? date(state.date) : 'Trước ' + date(state.date) }}
              </dd>
            </div>
          }
        </dl>
      }
    </section>

    @if (order().returnRequest; as request) {
      <section class="return" aria-labelledby="return-title">
        <h2 class="caps" id="return-title">Yêu cầu trả hàng</h2>
        <dl>
          <div>
            <dt>Lý do</dt>
            <dd>{{ reasonLabel(request.reason) }}</dd>
          </div>
          <div>
            <dt>Sản phẩm trả</dt>
            <dd>
              @for (line of request.lines; track line.index) {
                <span class="return-line"
                  >{{ order().items[line.index]?.name }} ({{ order().items[line.index]?.color }} /
                  {{ order().items[line.index]?.size }}) × {{ line.quantity }}</span
                >
              }
            </dd>
          </div>
          <div>
            <dt>Dự kiến hoàn</dt>
            <dd>
              {{ request.amount | vnd }}
              @if (request.returnShippingFee) {
                <small>(đã trừ phí gửi trả {{ request.returnShippingFee | vnd }})</small>
              }
            </dd>
          </div>
          <div>
            <dt>Hoàn về</dt>
            <dd>
              @if (request.refundAccount; as account) {
                {{ account.bank }} · {{ maskAccount(account.accountNumber) }} ·
                {{ account.accountName }}
              } @else {
                Phương thức đã thanh toán
              }
            </dd>
          </div>
          @if (request.detail) {
            <div>
              <dt>Mô tả</dt>
              <dd>{{ request.detail }}</dd>
            </div>
          }
        </dl>
      </section>
    }

    @if (steps(); as progress) {
      <ol class="progress" aria-label="Tiến trình đơn hàng">
        @for (step of progress; track step.label) {
          <li [class]="step.state" [attr.aria-current]="step.state === 'current' ? 'step' : null">
            <span class="node"
              ><n2f-icon [name]="step.state === 'done' ? 'reiconCheck' : step.icon" size="20px"
            /></span>
            <span class="label"
              >{{ step.label
              }}<span class="sr-only">{{
                step.state === 'done'
                  ? ' (đã hoàn tất)'
                  : step.state === 'current'
                    ? ' (đang thực hiện)'
                    : ''
              }}</span></span
            >
          </li>
        }
      </ol>
    }

    <div class="grid">
      <section class="items" aria-labelledby="items-title">
        <h2 class="caps" id="items-title">Sản phẩm ({{ order().items.length }})</h2>
        <n2f-order-items
          id="order-lines"
          [items]="order().items"
          [limit]="expanded() ? null : itemLimit"
          [reviewable]="order().status === 'completed'"
        />
        @if (order().items.length > itemLimit) {
          <button
            type="button"
            class="toggle"
            aria-controls="order-lines"
            [attr.aria-expanded]="expanded()"
            (click)="expanded.set(!expanded())"
          >
            {{
              expanded()
                ? 'Thu gọn'
                : 'Xem thêm ' + (order().items.length - itemLimit) + ' sản phẩm'
            }}
            <n2f-icon [name]="expanded() ? 'reiconChevronUp' : 'reiconChevronDown'" size="16px" />
          </button>
        }
      </section>
      <section class="summary" aria-labelledby="summary-title">
        <h2 class="caps" id="summary-title">Tóm tắt thanh toán</h2>
        <dl>
          <div>
            <dt>Tạm tính</dt>
            <dd>{{ order().pricing.subtotal | vnd }}</dd>
          </div>
          @if (order().pricing.discount) {
            <div>
              <dt>Giảm giá</dt>
              <dd class="minus">−{{ order().pricing.discount | vnd }}</dd>
            </div>
          }
          @let pricing = order().pricing;
          @if (pricing.shippingDiscount >= pricing.shippingFee) {
            <div>
              <dt>Phí vận chuyển</dt>
              <dd>
                <s class="was">{{ pricing.shippingFee | vnd }}</s> Miễn phí
              </dd>
            </div>
          } @else {
            <div>
              <dt>Phí vận chuyển</dt>
              <dd>{{ pricing.shippingFee | vnd }}</dd>
            </div>
            @if (pricing.shippingDiscount) {
              <div>
                <dt>Giảm phí vận chuyển</dt>
                <dd class="minus">−{{ pricing.shippingDiscount | vnd }}</dd>
              </div>
            }
          }
          <div class="total">
            <dt>{{ totalLabel() }}</dt>
            <dd>{{ pricing.total | vnd }}</dd>
          </div>
        </dl>
      </section>
    </div>

    <div class="grid info">
      <section>
        <h2 class="caps">Giao đến</h2>
        <p>
          <strong>{{ order().shippingAddress.recipient }}</strong> |
          {{ order().shippingAddress.phone }}<br />{{ order().shippingAddress.street }},
          {{ order().shippingAddress.ward }}<br />{{ order().shippingAddress.province }}
        </p>
        @if (order().note; as note) {
          <p class="note"><span>Ghi chú:</span> {{ note }}</p>
        }
      </section>
      <section>
        <h2 class="caps">Thanh toán</h2>
        <p>
          <strong>{{ methodLabel() }}</strong
          ><br />{{ stateLabel() }}
        </p>
        @if (order().invoice; as invoice) {
          <h2 class="caps">Hóa đơn công ty</h2>
          <p>
            <strong>{{ invoice.companyName }}</strong
            ><br />MST {{ invoice.taxCode }}<br />{{ invoice.address }}<br />Gửi về
            {{ invoice.email }}
          </p>
        }
        @if (order().delivery; as delivery) {
          <h2 class="caps">Vận chuyển</h2>
          <p class="tracking">
            {{ delivery.carrier }} · Mã vận đơn <strong>{{ delivery.trackingCode }}</strong>
            <button
              type="button"
              class="copy"
              (click)="copy(delivery.trackingCode)"
              [attr.aria-label]="'Sao chép mã vận đơn ' + delivery.trackingCode"
            >
              <n2f-icon [name]="copied() ? 'reiconCopySuccess' : 'reiconCopy'" size="16px" />
              {{ copied() ? 'Đã chép' : 'Sao chép' }}
            </button>
          </p>
          @if (trackingUrl(); as url) {
            <p>
              <a class="external" [href]="url" target="_blank" rel="noopener noreferrer"
                >Tra cứu trên trang {{ delivery.carrier }}<span class="sr-only"> (mở tab mới)</span>
                <n2f-icon name="reiconArrowUpRight" size="14px"
              /></a>
            </p>
          }
        }
      </section>
    </div>

    @if (events().length) {
      <section class="history" aria-labelledby="history-title">
        <h2 class="caps" id="history-title">Lịch sử đơn hàng</h2>
        <ol>
          @for (event of events(); track event.at + event.title; let first = $first) {
            <li [class.latest]="first">
              <time [attr.datetime]="event.at">{{ dateTime(event.at) }}</time>
              <div>
                <strong>{{ event.title }}</strong>
                @if (event.detail) {
                  <span>{{ event.detail }}</span>
                }
              </div>
            </li>
          }
        </ol>
      </section>
    }
    <ng-content />
  `,
  styles: `
    :host {
      display: block;
    }
    .status {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 16px 40px;
      margin-top: 24px;
    }
    .status-copy {
      flex: 1 1 320px;
    }
    .eyebrow {
      margin: 0;
      color: var(--brand);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .status h2 {
      margin: 6px 0;
      font-size: 22px;
      font-weight: 700;
    }
    .detail {
      margin: 0;
      font-size: 14px;
    }
    .refund {
      display: flex;
      flex-wrap: wrap;
      gap: 16px 40px;
      margin: 0;
    }
    .refund dt {
      color: var(--muted);
      font-size: 12px;
    }
    .refund dd {
      margin: 4px 0 0;
      font-weight: 700;
    }
    .refund .accent {
      color: var(--brand);
    }
    .progress {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      max-width: 760px;
      margin: 32px auto 8px;
      padding: 0;
      list-style: none;
    }
    .progress li {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      text-align: center;
    }
    .progress li:not(:first-child)::before {
      content: '';
      position: absolute;
      top: 22px;
      right: 50%;
      width: 100%;
      border-top: 1px solid var(--ink);
      z-index: -1;
    }
    .progress li.done::before,
    .progress li.current::before {
      border-color: var(--brand);
    }
    .node {
      width: 44px;
      height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--muted);
      border-radius: 50%;
      background: #fff;
      color: var(--muted);
    }
    .done .node {
      border-color: var(--ink);
      background: var(--ink);
      color: #fff;
    }
    .current .node {
      border-color: var(--brand);
      background: var(--brand);
      color: #fff;
      box-shadow: 0 0 0 4px #d9070c22;
    }
    .label {
      color: var(--muted);
      font-size: 12px;
    }
    .done .label,
    .current .label {
      color: var(--ink);
      font-weight: 600;
    }
    .grid {
      display: grid;
      grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
      gap: 24px 64px;
      margin-top: 32px;
    }
    .caps {
      margin: 0 0 8px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .items,
    .summary {
      padding-top: 16px;
      border-top: 1px solid var(--ink);
    }
    .toggle {
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 0;
      border: 0;
      background: none;
      color: var(--ink);
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      text-decoration: underline;
      cursor: pointer;
    }
    .summary dl {
      margin: 16px 0 0;
    }
    .summary dl div {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 6px 0;
      font-size: 14px;
    }
    .summary dd {
      margin: 0;
      font-weight: 700;
    }
    .summary .minus {
      color: var(--brand);
    }
    .summary .total {
      align-items: baseline;
      margin-top: 16px;
    }
    .summary .total dd {
      font-size: 24px;
    }
    .summary .was {
      margin-right: 6px;
      color: var(--muted);
      font-weight: 400;
    }
    .info p {
      margin: 0 0 16px;
      font-size: 14px;
      line-height: 1.6;
    }
    .tracking {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 8px;
    }
    .copy {
      min-height: 32px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 0 10px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: #fff;
      color: var(--ink);
      font: inherit;
      font-size: 12px;
      cursor: pointer;
    }
    .copy:hover {
      border-color: var(--ink);
    }
    .external {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      text-decoration: underline;
    }
    .history {
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px solid var(--ink);
    }
    .history ol {
      margin: 16px 0 0;
      padding: 0;
      list-style: none;
    }
    .history li {
      position: relative;
      display: grid;
      grid-template-columns: 140px 1fr;
      gap: 4px 24px;
      padding: 0 0 18px 22px;
      font-size: 14px;
    }
    /* Dot and connecting line of the vertical timeline. */
    .history li::before {
      content: '';
      position: absolute;
      top: 5px;
      left: 0;
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: var(--line);
    }
    .history li:not(:last-child)::after {
      content: '';
      position: absolute;
      top: 16px;
      bottom: 0;
      left: 4px;
      border-left: 1px solid var(--line);
    }
    .history li.latest::before {
      background: var(--brand);
      box-shadow: 0 0 0 3px #d9070c22;
    }
    .history time {
      color: var(--muted);
      font-size: 13px;
    }
    .history li div {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .history li span {
      color: var(--muted);
      font-size: 13px;
    }
    .history li:not(.latest) strong {
      font-weight: 500;
    }
    .note span {
      color: var(--muted);
    }
    .return {
      margin-top: 24px;
      padding: 16px 20px;
      border-radius: var(--radius-card);
      background: var(--surface);
    }
    .return dl {
      display: grid;
      gap: 10px;
      margin: 0;
    }
    .return dt {
      color: var(--muted);
      font-size: 13px;
    }
    .return dd {
      margin: 2px 0 0;
    }
    .return-line {
      display: block;
    }
    .return small {
      color: var(--muted);
    }
    @media (max-width: 700px) {
      .grid {
        grid-template-columns: 1fr;
      }
      /* Mobile: vertical stepper so labels stay readable instead of 11px squeezed columns. */
      .progress {
        grid-template-columns: 1fr;
        gap: 10px;
        margin: 20px 0 8px;
      }
      .progress li {
        flex-direction: row;
        gap: 12px;
        text-align: left;
      }
      .progress li:not(:first-child)::before {
        top: auto;
        right: auto;
        bottom: 50%;
        left: 15px;
        width: 0;
        height: calc(100% + 10px);
        border-top: 0;
        border-left: 1px solid var(--ink);
      }
      .progress li.done::before,
      .progress li.current::before {
        border-left-color: var(--brand);
      }
      .progress .label {
        font-size: 14px;
      }
      .node {
        flex-shrink: 0;
        width: 32px;
        height: 32px;
      }
      .history li {
        grid-template-columns: 1fr;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderView {
  readonly order = input.required<Order>();
  readonly headline = computed(() => orderHeadline(this.order()));
  readonly steps = computed(() => orderProgress(this.order()));
  readonly events = computed(() => orderTimeline(this.order()));
  readonly refundInfo = computed(() => refundState(this.order()));
  readonly methodLabel = computed(() => paymentMethodLabel(this.order()));
  readonly stateLabel = computed(() => paymentStateLabel(this.order()));
  readonly totalLabel = computed(() => {
    const order = this.order();
    if (order.payment.paid) return 'Đã thanh toán';
    if (order.status === 'cancelled') return 'Tổng đơn';
    return order.payment.method === 'cod' ? 'Thanh toán khi nhận hàng' : 'Cần thanh toán';
  });
  readonly trackingUrl = computed(() => {
    const delivery = this.order().delivery;
    return delivery ? carrierTrackingUrl(delivery.carrier, delivery.trackingCode) : null;
  });
  readonly copied = signal(false);
  /** Long orders show the first lines and expand on demand. */
  readonly itemLimit = 3;
  readonly expanded = signal(false);

  date(iso: string): string {
    return formatDate(iso);
  }

  dateTime(iso: string): string {
    return formatDateTime(iso);
  }

  reasonLabel(reason: ReturnReason): string {
    return returnReason(reason).label;
  }

  /** Only the last four digits of a refund account are shown back. */
  maskAccount(number: string): string {
    const digits = number.replace(/\s/g, '');
    return digits.length > 4 ? `•••• ${digits.slice(-4)}` : digits;
  }

  copy(code: string): void {
    void navigator.clipboard?.writeText(code).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }
}
