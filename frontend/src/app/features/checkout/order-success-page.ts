import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { API_CONFIG } from '../../core/api-config';
import { AuthSession } from '../auth/auth-session';
import { PricePipe } from '../../shared/commerce/price.pipe';
import { IconComponent } from '../../shared/ui/icon.component';
import { formatDate, formatDateTime } from '../orders/order-status';
import { CheckoutSession } from './checkout-session';

/** Plan section 17. Figma draft 227:76 is unfinished, so this follows the order-detail language. */
@Component({
  selector: 'n2f-order-success-page',
  imports: [RouterLink, PricePipe, IconComponent],
  template: `
    <div class="container success">
      @if (receipt(); as order) {
        <p class="eyebrow">Đặt hàng thành công</p>
        <h1>Cảm ơn bạn, {{ firstName() }}.</h1>
        <p class="order-id">
          Mã đơn hàng <strong>#{{ order.orderId }}</strong>
        </p>

        @if (order.bankTransfer; as bank) {
          <section class="panel" aria-labelledby="transfer-title">
            <h2 id="transfer-title">Hoàn tất chuyển khoản để giữ đơn</h2>
            @if (order.paymentDueAt) {
              <p class="due">Vui lòng thanh toán trước {{ dateTime(order.paymentDueAt) }}.</p>
            }
            <dl>
              <div>
                <dt>Số tiền</dt>
                <dd>{{ order.total | vnd }}</dd>
              </div>
              <div>
                <dt>Ngân hàng</dt>
                <dd>{{ bank.bank }}</dd>
              </div>
              <div>
                <dt>Số tài khoản</dt>
                <dd>{{ bank.accountNumber }}</dd>
              </div>
              <div>
                <dt>Chủ tài khoản</dt>
                <dd>{{ bank.accountName }}</dd>
              </div>
              <div>
                <dt>Nội dung chuyển khoản</dt>
                <dd>
                  <code>{{ bank.reference }}</code>
                </dd>
              </div>
            </dl>
            @if (isMock) {
              <p class="note">
                Thông tin ngân hàng chỉ dùng để trải nghiệm. Vui lòng không chuyển tiền thật.
              </p>
            }
          </section>
        } @else {
          <section class="panel" aria-labelledby="cod-title">
            <h2 id="cod-title">Thanh toán khi nhận hàng</h2>
            <p>
              Đơn hàng đã được ghi nhận và đang được chuẩn bị. Bạn thanh toán
              <strong>{{ order.total | vnd }}</strong> khi nhận hàng.
            </p>
          </section>
        }

        <p class="eta">
          <n2f-icon name="reiconTruckFast" size="20px" />
          Dự kiến giao: {{ date(order.estimatedDelivery.from) }} –
          {{ date(order.estimatedDelivery.to) }}
        </p>
        @if (isMock) {
          <p class="note">Bản trải nghiệm không gửi email hoặc tin nhắn xác nhận.</p>
        }
        <div class="actions">
          @if (session.signedIn()) {
            <a class="pill" [routerLink]="['/account/orders', order.orderId]">Theo dõi đơn hàng</a>
          } @else {
            <a class="pill" routerLink="/track-order" [state]="{ orderId: order.orderId }"
              >Theo dõi đơn hàng</a
            >
          }
          <a class="pill outline" routerLink="/shop">Tiếp tục mua sắm</a>
        </div>
      } @else {
        <p class="eyebrow">Đơn hàng</p>
        <h1>Đơn #{{ orderId() }}</h1>
        <p>
          Thông tin xác nhận chỉ hiển thị ngay sau khi đặt hàng. Bạn có thể tra cứu trạng thái đơn
          bằng mã đơn và số điện thoại hoặc email đã dùng khi đặt.
        </p>
        <div class="actions">
          <a class="pill" routerLink="/track-order" [state]="{ orderId: orderId() }"
            >Tra cứu đơn hàng</a
          >
          <a class="pill outline" routerLink="/shop">Tiếp tục mua sắm</a>
        </div>
      }
    </div>
  `,
  styles: `
    .success {
      max-width: 760px;
      padding-block: 56px 96px;
    }
    .eyebrow {
      margin: 0;
      color: var(--brand);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    h1 {
      margin: 10px 0 6px;
      color: var(--heading);
      font-size: clamp(30px, 4vw, 44px);
      font-weight: 600;
    }
    .order-id {
      margin: 0 0 28px;
      color: var(--muted);
    }
    .order-id strong {
      color: var(--ink);
    }
    .panel {
      padding: 24px;
      border: 1px solid var(--line);
      border-radius: var(--radius-card);
      background: var(--surface);
    }
    h2 {
      margin: 0 0 8px;
      font-size: 19px;
      font-weight: 700;
    }
    .due {
      margin: 0 0 16px;
      color: var(--required);
      font-size: 14px;
    }
    dl {
      margin: 0;
    }
    dl div {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 8px 0;
      border-bottom: 1px solid var(--line);
      font-size: 14px;
    }
    dd {
      margin: 0;
      font-weight: 700;
      text-align: right;
    }
    code {
      padding: 2px 6px;
      border-radius: 4px;
      background: #fff;
      font-family: inherit;
    }
    .eta {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 24px 0 0;
      font-size: 15px;
    }
    .note {
      margin: 12px 0 0;
      color: var(--muted);
      font-size: 13px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 32px;
    }
    .pill {
      min-height: 48px;
      display: inline-flex;
      align-items: center;
      padding: 0 28px;
      border: 1px solid var(--ink);
      border-radius: 999px;
      background: var(--ink);
      color: #fff;
      font-weight: 600;
    }
    .pill:hover {
      background: #333;
      color: #fff;
    }
    .pill.outline {
      border-color: var(--line);
      background: #fff;
      color: var(--ink);
    }
    .pill.outline:hover {
      border-color: var(--ink);
      background: #fff;
      color: var(--ink);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderSuccessPage {
  readonly session = inject(AuthSession);
  readonly isMock = inject(API_CONFIG).mode === 'mock';
  private readonly checkoutSession = inject(CheckoutSession);
  readonly orderId = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('orderId') ?? '')),
    { initialValue: '' },
  );
  /** Only the receipt of the order placed in this session is shown. */
  readonly receipt = computed(() => {
    const receipt = this.checkoutSession.lastReceipt();
    return receipt?.orderId === this.orderId() ? receipt : null;
  });
  readonly firstName = computed(() => {
    const name = this.receipt()?.customerName.trim() ?? '';
    return name.split(/\s+/).at(-1) ?? name;
  });

  date(iso: string): string {
    return formatDate(iso);
  }

  dateTime(iso: string): string {
    return formatDateTime(iso);
  }
}
