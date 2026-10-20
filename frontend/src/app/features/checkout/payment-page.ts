import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap, takeWhile, timer } from 'rxjs';
import { AuthSession } from '../auth/auth-session';
import { PricePipe } from '../../shared/commerce/price.pipe';
import { IconComponent } from '../../shared/ui/icon.component';
import { formatDateTime } from '../orders/order-status';
import { CHECKOUT_API, PAYMENT_SIMULATOR, PaymentSession } from './checkout-api';

const POLL_MS = 3000;

/**
 * Bank transfer by QR + per-order virtual account (user flow 2026-10-18). The page polls the
 * payment session; the backend reconciles the transfer, then confirms payment and the order.
 * Unpaid orders are cancelled when the 30-minute hold ends. In mock mode the money "arrives"
 * 15 seconds after the QR is first shown (user setting), and demo buttons can settle it early.
 */
@Component({
  selector: 'n2f-payment-page',
  imports: [RouterLink, PricePipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container payment">
      @if (session(); as pay) {
        @switch (pay.status) {
          @case ('awaiting') {
            <p class="eyebrow">Thanh toán đơn hàng #{{ pay.orderId }}</p>
            <h1>Quét mã QR để thanh toán</h1>
            <p class="lead">
              Mở ứng dụng ngân hàng, quét mã và xác nhận chuyển khoản. Đơn hàng được xác nhận tự
              động ngay khi chúng tôi nhận được tiền.
            </p>

            <section class="card" aria-labelledby="qr-title">
              <h2 id="qr-title" class="sr-only">Mã QR và tài khoản nhận tiền</h2>
              <div class="qr">
                <img [src]="pay.qrImage" alt="Mã QR chuyển khoản cho đơn {{ pay.orderId }}" />
                <p class="countdown" [class.urgent]="remainingMs() < 5 * 60_000" role="timer">
                  Mã hết hạn sau <strong>{{ countdown() }}</strong>
                </p>
              </div>
              <dl>
                <div class="amount">
                  <dt>Số tiền</dt>
                  <dd>{{ pay.amount | vnd }}</dd>
                </div>
                <div>
                  <dt>Ngân hàng</dt>
                  <dd>{{ pay.account.bank }}</dd>
                </div>
                <div>
                  <dt>Số tài khoản</dt>
                  <dd class="account">
                    <span>{{ pay.account.accountNumber }}</span>
                    <button
                      type="button"
                      class="copy"
                      [attr.aria-label]="'Sao chép số tài khoản ' + pay.account.accountNumber"
                      (click)="copy(pay.account.accountNumber)"
                    >
                      <n2f-icon
                        [name]="copied() ? 'reiconCopySuccess' : 'reiconCopy'"
                        size="18px"
                      />
                      {{ copied() ? 'Đã chép' : 'Sao chép' }}
                    </button>
                  </dd>
                </div>
                <div>
                  <dt>Chủ tài khoản</dt>
                  <dd>{{ pay.account.accountName }}</dd>
                </div>
              </dl>
              <p class="va-note">
                Đây là tài khoản ảo chỉ dành cho đơn này. Chuyển đúng số tiền, không cần nhập nội
                dung chuyển khoản.
              </p>
            </section>

            <p class="status" aria-live="polite">
              <span class="pulse" aria-hidden="true"></span>
              Đang chờ thanh toán. Bạn có thể giữ trang này mở, trạng thái sẽ tự cập nhật.
            </p>

            @if (simulator) {
              <aside class="demo" aria-label="Bản trải nghiệm">
                <p>
                  <strong>Bản trải nghiệm:</strong> không chuyển tiền thật. Hệ thống giả lập nhận
                  tiền sau 15 giây kể từ khi mở mã QR.
                </p>
                <div>
                  <button type="button" class="button dark" (click)="simulate('paid')">
                    Giả lập đã nhận tiền
                  </button>
                  <button type="button" class="button" (click)="simulate('expired')">
                    Giả lập hết hạn
                  </button>
                </div>
              </aside>
            }

            <div class="actions">
              <a class="text-link" [routerLink]="orderLink()" [state]="orderState()"
                >Xem chi tiết đơn hàng</a
              >
            </div>
          }
          @case ('paid') {
            <div class="result">
              <span class="badge ok"><n2f-icon name="reiconCheckCircle" size="40px" /></span>
              <p class="eyebrow">Thanh toán thành công</p>
              <h1>Đã nhận {{ pay.amount | vnd }}</h1>
              <p class="lead">
                Đơn hàng <strong>#{{ pay.orderId }}</strong> đã được xác nhận và đang được chuẩn bị.
                @if (pay.paidAt) {
                  Ghi nhận lúc {{ dateTime(pay.paidAt) }}.
                }
              </p>
              <div class="actions">
                <a class="button dark" [routerLink]="orderLink()" [state]="orderState()"
                  >Theo dõi đơn hàng</a
                >
                <a class="button" routerLink="/shop">Tiếp tục mua sắm</a>
              </div>
            </div>
          }
          @case ('expired') {
            <div class="result">
              <span class="badge fail"><n2f-icon name="reiconXCircle" size="40px" /></span>
              <p class="eyebrow">Đơn hàng đã hủy</p>
              <h1>Hết thời gian thanh toán</h1>
              <p class="lead">
                Sau 30 phút chưa nhận được thanh toán nên đơn <strong>#{{ pay.orderId }}</strong> đã
                tự động hủy. Nếu bạn đã chuyển tiền, chúng tôi sẽ hoàn lại trong 1–3 ngày làm việc.
              </p>
              <div class="actions">
                <a class="button dark" routerLink="/shop">Tiếp tục mua sắm</a>
              </div>
            </div>
          }
        }
      } @else if (failed()) {
        <p class="eyebrow">Thanh toán</p>
        <h1>Không tìm thấy phiên thanh toán</h1>
        <p class="lead">Đơn hàng không tồn tại hoặc không dùng chuyển khoản QR.</p>
        <div class="actions">
          <a class="button dark" routerLink="/track-order">Tra cứu đơn hàng</a>
        </div>
      } @else {
        <div class="skeleton loading" aria-label="Đang tải thông tin thanh toán"></div>
      }
    </div>
  `,
  styles: `
    .payment {
      max-width: 760px;
      padding-block: 48px 96px;
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
      margin: 10px 0 8px;
      color: var(--heading);
      font-size: 32px;
      font-weight: 600;
      line-height: 1.2;
    }
    .lead {
      margin: 0;
      color: var(--muted);
      font-size: 15px;
      line-height: 1.6;
    }
    .lead strong {
      color: var(--ink);
    }
    .card {
      display: grid;
      grid-template-columns: 240px minmax(0, 1fr);
      gap: 32px;
      align-items: start;
      margin-top: 28px;
      padding: 28px;
      border: 1px solid var(--line);
      border-radius: var(--radius-card);
    }
    .qr img {
      width: 240px;
      height: 240px;
      object-fit: contain;
      padding: 10px;
      border-radius: var(--radius-card);
      background: #fff;
      box-shadow: inset 0 0 0 1px var(--line);
    }
    .countdown {
      margin: 12px 0 0;
      font-size: 14px;
      text-align: center;
    }
    .countdown strong {
      font-variant-numeric: tabular-nums;
    }
    .countdown.urgent strong {
      color: var(--brand);
    }
    dl {
      margin: 0;
    }
    dl > div {
      padding-block: 12px;
      border-bottom: 1px solid var(--line);
    }
    dl > div:first-child {
      padding-top: 0;
    }
    dt {
      color: var(--muted);
      font-size: 13px;
    }
    dd {
      margin: 4px 0 0;
      font-size: 16px;
      font-weight: 600;
    }
    .amount dd {
      font-size: 28px;
      font-weight: 800;
    }
    .account {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.02em;
    }
    .copy {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 36px;
      padding: 0 12px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: #fff;
      font: inherit;
      font-size: 13px;
      font-weight: 600;
    }
    .copy:hover {
      border-color: var(--ink);
    }
    .va-note {
      grid-column: 1 / -1;
      margin: 0;
      padding: 12px 14px;
      border-radius: var(--radius-button);
      background: var(--surface);
      font-size: 14px;
      line-height: 1.6;
    }
    .status {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 20px 0 0;
      font-size: 14px;
    }
    .pulse {
      flex-shrink: 0;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #d97706;
      animation: pulse 1.4s ease-in-out infinite;
    }
    @keyframes pulse {
      50% {
        opacity: 0.3;
        transform: scale(0.8);
      }
    }
    .demo {
      margin-top: 24px;
      padding: 16px;
      border: 1px dashed var(--line);
      border-radius: var(--radius-card);
      font-size: 14px;
      line-height: 1.6;
    }
    .demo p {
      margin: 0 0 12px;
    }
    .demo div,
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .actions {
      margin-top: 28px;
    }
    .text-link {
      font-size: 14px;
      text-decoration: underline;
      text-underline-offset: 3px;
    }
    .result {
      text-align: center;
    }
    .result .actions {
      justify-content: center;
    }
    .badge {
      display: inline-grid;
      place-items: center;
      width: 72px;
      height: 72px;
      margin-bottom: 16px;
      border-radius: 50%;
    }
    .badge.ok {
      background: #e8f5ec;
      color: #1a7f37;
    }
    .badge.fail {
      background: #fdecec;
      color: var(--brand);
    }
    .loading {
      height: 420px;
      border-radius: var(--radius-card);
    }
    @media (max-width: 700px) {
      .payment {
        padding-block: 28px 64px;
      }
      h1 {
        font-size: 26px;
      }
      .card {
        grid-template-columns: minmax(0, 1fr);
        gap: 20px;
        padding: 20px;
      }
      .qr {
        justify-self: center;
      }
      .qr img {
        width: 220px;
        height: 220px;
      }
      .amount dd {
        font-size: 24px;
      }
      .result .button,
      .demo .button {
        flex: 1;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .pulse {
        animation: none;
      }
    }
  `,
})
export class PaymentPage {
  private readonly api = inject(CHECKOUT_API);
  private readonly auth = inject(AuthSession);
  private readonly destroyRef = inject(DestroyRef);
  readonly simulator = inject(PAYMENT_SIMULATOR, { optional: true });
  readonly orderId = inject(ActivatedRoute).snapshot.paramMap.get('orderId') ?? '';

  readonly session = signal<PaymentSession | null>(null);
  readonly failed = signal(false);
  readonly copied = signal(false);
  private readonly now = signal(Date.now());

  readonly remainingMs = computed(() => {
    const pay = this.session();
    return pay ? Math.max(0, Date.parse(pay.expiresAt) - this.now()) : 0;
  });
  readonly countdown = computed(() => {
    const total = Math.ceil(this.remainingMs() / 1000);
    const minutes = Math.floor(total / 60);
    return `${String(minutes).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  });
  readonly orderLink = computed(() =>
    this.auth.signedIn() ? ['/account/orders', this.orderId] : ['/track-order'],
  );
  readonly orderState = computed(() => (this.auth.signedIn() ? {} : { orderId: this.orderId }));

  constructor() {
    // Poll until the backend reports a final state (paid or expired).
    timer(0, POLL_MS)
      .pipe(
        switchMap(() =>
          this.api.paymentSession(this.orderId).pipe(
            catchError(() => {
              this.failed.set(true);
              return of(null);
            }),
          ),
        ),
        takeWhile((pay) => pay?.status === 'awaiting', true),
        takeUntilDestroyed(),
      )
      .subscribe((pay) => {
        if (pay) this.session.set(pay);
      });
    timer(0, 1000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.now.set(Date.now()));
  }

  copy(value: string): void {
    void navigator.clipboard?.writeText(value.replace(/\s/g, '')).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  simulate(outcome: 'paid' | 'expired'): void {
    this.simulator?.simulatePayment(this.orderId, outcome);
    this.api
      .paymentSession(this.orderId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((pay) => this.session.set(pay));
  }

  dateTime(iso: string): string {
    return formatDateTime(iso);
  }
}
