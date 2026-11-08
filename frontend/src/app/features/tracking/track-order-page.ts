import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, switchMap } from 'rxjs';
import { CHECKOUT_API, CheckoutError } from '../checkout/checkout-api';
import { API_CONFIG } from '../../core/api-config';
import { CODE_PATTERN, cleanCode } from '../auth/auth-messages';
import { orderCanCancel } from '../orders/order-status-map';
import { Order } from '../orders/order-models';
import { canPay, cancelLabels, formatDate } from '../orders/order-status';
import { canRequestReturn } from '../orders/order-returns';
import { storeSettings } from '../../core/store-settings';
import { OrderCancellation } from '../account/orders/order-cancellation';
import { OrderStatusBadge } from '../orders/order-status-badge';
import { OrderView } from '../orders/order-view';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Guest order tracking: order code + email, then an emailed code; only the code may be in the URL. */
@Component({
  selector: 'n2f-track-order-page',
  imports: [ReactiveFormsModule, RouterLink, OrderStatusBadge, OrderView],
  template: `
    <div class="container tracking">
      <h1>Tra cứu đơn hàng</h1>
      <p class="lead">
        Nhập mã đơn và email bạn đã dùng khi đặt hàng, chúng tôi sẽ gửi mã xác minh tới email đó.
        <a routerLink="/auth/login" [queryParams]="{ returnUrl: '/account/orders' }">Đăng nhập</a>
        để xem toàn bộ lịch sử mua hàng.
      </p>
      @if (step() !== 'result') {
        <form
          [formGroup]="form"
          (ngSubmit)="step() === 'request' ? requestCode() : verify()"
          novalidate
        >
          <div class="field">
            <label for="track-order-id"
              >Mã đơn hàng<span class="req" aria-hidden="true">*</span></label
            >
            <input
              id="track-order-id"
              formControlName="orderCode"
              autocomplete="off"
              placeholder="VD: N2F2609280104"
              aria-required="true"
              [attr.aria-invalid]="invalid('orderCode')"
              [attr.aria-describedby]="invalid('orderCode') ? 'track-order-id-error' : null"
            />
            @if (invalid('orderCode')) {
              <p class="field-error" id="track-order-id-error">Nhập mã đơn hàng.</p>
            }
          </div>
          <div class="field">
            <label for="track-email"
              >Email đặt hàng<span class="req" aria-hidden="true">*</span></label
            >
            <input
              id="track-email"
              type="email"
              formControlName="email"
              autocomplete="email"
              aria-required="true"
              [attr.aria-invalid]="invalid('email')"
              [attr.aria-describedby]="invalid('email') ? 'track-email-error' : null"
            />
            @if (invalid('email')) {
              <p class="field-error" id="track-email-error">Nhập địa chỉ email hợp lệ.</p>
            }
          </div>
          @if (step() === 'request') {
            <button class="pill" type="submit" [disabled]="busy() || waitSeconds() > 0">
              {{ busy() ? 'Đang gửi…' : 'Gửi mã xác minh' }}
            </button>
          } @else {
            <div class="field code">
              <label for="track-code"
                >Mã xác minh (8 số)<span class="req" aria-hidden="true">*</span></label
              >
              <input
                id="track-code"
                formControlName="code"
                inputmode="numeric"
                autocomplete="one-time-code"
                maxlength="8"
                aria-required="true"
                [attr.aria-invalid]="invalid('code')"
                [attr.aria-describedby]="invalid('code') ? 'track-code-error' : null"
              />
              @if (invalid('code')) {
                <p class="field-error" id="track-code-error">Nhập đủ 8 chữ số của mã xác minh.</p>
              }
              <p class="hint">Mã có hiệu lực 10 phút.</p>
            </div>
            <div class="verify-actions">
              <button class="pill" type="submit" [disabled]="busy() || lockSeconds() > 0">
                {{ busy() ? 'Đang xác minh…' : 'Xem đơn hàng' }}
              </button>
              <button
                type="button"
                class="pill outline"
                [disabled]="busy() || sending() || waitSeconds() > 0"
                (click)="requestCode()"
              >
                {{ waitSeconds() > 0 ? 'Gửi lại mã sau ' + waitSeconds() + ' giây' : 'Gửi lại mã' }}
              </button>
              <button type="button" class="link" (click)="restart()">Đổi mã đơn hoặc email</button>
            </div>
          }
        </form>
      }
      <div aria-live="polite">
        @if (notice() && step() !== 'result') {
          <p class="notice" role="status">{{ notice() }}</p>
        }
      </div>
      @if (error()) {
        <p class="form-error" role="alert">
          {{ error() }}
          @if (canRetry()) {
            <button type="button" class="link" (click)="retry()">Thử lại</button>
          }
        </p>
      }

      @if (order(); as current) {
        <section class="result" aria-labelledby="result-title" #result tabindex="-1">
          <header class="title-row">
            <div>
              <h2 id="result-title">Đơn #{{ current.id }}</h2>
              <p class="meta">Đặt ngày {{ date(current.placedAt) }}</p>
            </div>
            <n2f-order-status-badge [status]="current.status" />
          </header>
          @if (notice()) {
            <p class="notice" role="status">{{ notice() }}</p>
          }
          <n2f-order-view [order]="current">
            <div class="actions" actions>
              @if (payable(current)) {
                <a class="pill" [routerLink]="['/payment', current.id]">Thanh toán ngay</a>
              }
              @if (cancellable(current)) {
                <button
                  type="button"
                  class="pill outline"
                  [disabled]="cancelling()"
                  (click)="cancel(current)"
                >
                  {{ cancelling() ? labels(current).busy : labels(current).idle }}
                </button>
              }
              @if (returnable(current)) {
                <p class="hint">
                  Muốn trả hàng?
                  <a routerLink="/auth/login" [queryParams]="{ returnUrl: '/account/orders' }"
                    >Đăng nhập</a
                  >
                  để gửi yêu cầu, hoặc gọi
                  <a [href]="info.hotlineHref">{{ info.hotline }}</a> kèm mã đơn.
                  <a routerLink="/policies/returns">Chính sách trả hàng</a>
                </p>
              }
            </div>
          </n2f-order-view>
          <p class="hint help">
            Cần hỗ trợ đơn #{{ current.id }}? <a routerLink="/help">Liên hệ nine2fine</a>
          </p>
        </section>
      }
    </div>
  `,
  styles: `
    .tracking {
      max-width: 1130px;
      padding-block: 40px 96px;
    }
    h1 {
      margin: 0 0 10px;
      color: var(--heading);
      font-size: clamp(28px, 3.4vw, 44px);
      font-weight: 600;
    }
    .lead {
      max-width: 620px;
      margin: 0 0 24px;
      color: var(--muted);
      line-height: 1.6;
    }
    .lead a {
      color: var(--ink);
      text-decoration: underline;
    }
    form {
      display: grid;
      grid-template-columns: 1fr 1fr auto;
      align-items: start;
      gap: 16px;
      max-width: 860px;
    }
    .verify-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      grid-column: 1 / -1;
    }
    .verify-actions .pill {
      margin-top: 0;
    }
    .link {
      padding: 0;
      border: 0;
      background: none;
      color: var(--ink);
      font: inherit;
      text-decoration: underline;
      cursor: pointer;
    }
    .field.code {
      grid-column: 1 / -1;
      max-width: 320px;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    label {
      font-size: 14px;
    }
    input {
      width: 100%;
      min-height: 48px;
      padding: 12px 14px;
      border: 1px solid #898989;
      border-radius: var(--radius-card);
      font: inherit;
      font-size: 16px;
    }
    input:focus {
      border-color: var(--ink);
      outline: none;
      box-shadow: 0 0 0 1px var(--ink);
    }
    [aria-invalid='true'] {
      border-color: var(--required);
    }
    .req,
    .field-error {
      color: var(--required);
    }
    .field-error {
      margin: 0;
      font-size: 13px;
    }
    .pill {
      min-height: 48px;
      margin-top: 28px;
      padding: 0 28px;
      border: 1px solid var(--ink);
      border-radius: 999px;
      background: var(--ink);
      color: #fff;
      font: inherit;
      font-weight: 600;
    }
    .form-error {
      max-width: 860px;
      margin: 20px 0 0;
      padding: 12px 16px;
      border-radius: var(--radius-button);
      background: #fdecec;
      color: var(--required);
      font-size: 14px;
    }
    .result {
      margin-top: 40px;
      outline: none;
    }
    .title-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--ink);
    }
    h2 {
      margin: 0;
      font-size: 24px;
      font-weight: 700;
    }
    .meta {
      margin: 6px 0 0;
      color: var(--muted);
      font-size: 13px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      margin-top: 16px;
    }
    .actions:empty {
      display: none;
    }
    .actions .pill {
      display: inline-flex;
      align-items: center;
      margin-top: 0;
    }
    .pill.outline {
      border-color: var(--line);
      background: #fff;
      color: var(--ink);
    }
    .hint {
      margin: 0;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.6;
    }
    .hint a {
      color: var(--ink);
      text-decoration: underline;
    }
    .help {
      margin-top: 24px;
    }
    .notice {
      margin: 16px 0 0;
      padding: 12px 14px;
      border-radius: var(--radius-card);
      background: var(--surface);
    }
    @media (max-width: 700px) {
      form {
        grid-template-columns: 1fr;
      }
      .pill {
        margin-top: 0;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrackOrderPage {
  readonly order = signal<Order | null>(null);
  readonly step = signal<'request' | 'verify' | 'result'>('request');
  readonly busy = signal(false);
  readonly sending = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly cancelling = signal(false);
  /** The failed call can be repeated with the same data. */
  readonly canRetry = signal(false);
  /** Seconds before another code can be requested. */
  readonly waitSeconds = signal(0);
  /** Seconds the code box stays locked after too many wrong codes. */
  readonly lockSeconds = signal(0);
  get info() {
    return storeSettings().info;
  }

  private readonly returnsEnabled = inject(API_CONFIG).checkoutMode === 'mock';
  private readonly api = inject(CHECKOUT_API);
  private readonly cancellation = inject(OrderCancellation);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly result = viewChild<ElementRef<HTMLElement>>('result');
  private lastAction: 'request' | 'verify' = 'request';
  private timer: ReturnType<typeof setInterval> | undefined;
  private lockTimer: ReturnType<typeof setInterval> | undefined;
  readonly form = inject(FormBuilder).nonNullable.group({
    // The code comes from the link (`?orderCode=`); email and OTP never go in the URL.
    orderCode: [
      inject(ActivatedRoute).snapshot.queryParamMap.get('orderCode') ?? '',
      [Validators.required, Validators.maxLength(20)],
    ],
    email: [
      '',
      [Validators.required, Validators.maxLength(100), Validators.pattern(EMAIL_PATTERN)],
    ],
    code: ['', [Validators.required, Validators.pattern(CODE_PATTERN)]],
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      clearInterval(this.timer);
      clearInterval(this.lockTimer);
    });
  }

  invalid(key: 'orderCode' | 'email' | 'code'): boolean {
    const control = this.form.controls[key];
    return control.invalid && control.touched;
  }

  date(iso: string): string {
    return formatDate(iso);
  }

  payable(order: Order): boolean {
    return canPay(order);
  }

  labels(order: Order): { idle: string; busy: string } {
    return cancelLabels(order);
  }

  cancellable(order: Order): boolean {
    return orderCanCancel(order);
  }

  returnable(order: Order): boolean {
    return this.returnsEnabled && canRequestReturn(order);
  }

  restart(): void {
    this.step.set('request');
    this.form.controls.code.reset('');
    this.error.set('');
    this.notice.set('');
  }

  retry(): void {
    if (this.lastAction === 'verify') this.verify();
    else this.requestCode();
  }

  /** Step 1: always the same answer, whether or not the order and email match. */
  requestCode(): void {
    this.lastAction = 'request';
    this.form.controls.orderCode.markAsTouched();
    this.form.controls.email.markAsTouched();
    if (
      this.form.controls.orderCode.invalid ||
      this.form.controls.email.invalid ||
      this.busy() ||
      this.sending() ||
      this.waitSeconds() > 0
    ) {
      return;
    }
    this.sending.set(true);
    this.busy.set(this.step() === 'request');
    this.error.set('');
    this.canRetry.set(false);
    const { orderCode, email } = this.form.getRawValue();
    this.api
      .requestLookupCode({ orderCode, email: email.trim() })
      .pipe(
        finalize(() => {
          this.busy.set(false);
          this.sending.set(false);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ resendAfterSeconds }) => {
          this.notice.set(
            'Nếu thông tin khớp, chúng tôi đã gửi mã xác minh tới email của đơn hàng.',
          );
          this.step.set('verify');
          this.countdown(resendAfterSeconds, this.waitSeconds, 'timer');
        },
        error: (error: unknown) => this.onError(error),
      });
  }

  /** Step 2: order code + email + code; the server starts a 30-minute view (cookie). */
  verify(): void {
    this.lastAction = 'verify';
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy() || this.lockSeconds() > 0) return;
    this.busy.set(true);
    this.error.set('');
    this.canRetry.set(false);
    const { orderCode, email, code } = this.form.getRawValue();
    this.api
      .verifyLookup({ orderCode, email: email.trim(), code: cleanCode(code) })
      .pipe(
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (order) => this.show(order),
        error: (error: unknown) => this.onError(error),
      });
  }

  cancel(order: Order): void {
    this.notice.set('');
    this.error.set('');
    this.cancellation
      .ask(order)
      .pipe(
        switchMap(({ reason }) => {
          this.cancelling.set(true);
          return this.api.cancel(order.id, reason).pipe(finalize(() => this.cancelling.set(false)));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (updated) => {
          this.order.set(updated);
          this.notice.set(
            updated.status === 'cancel-requested'
              ? `Đã gửi yêu cầu huỷ đơn #${updated.id}. nine2fine sẽ phản hồi qua email; trong lúc chờ đơn vẫn được giữ nguyên.`
              : `Đã hủy đơn #${updated.id}. Sản phẩm được hoàn lại kho${
                  updated.payment.paid
                    ? `, số tiền đã thanh toán được hoàn lại trong ${storeSettings().policy.refundWorkingDays} ngày làm việc`
                    : ''
                }.`,
          );
        },
        error: (error: unknown) => this.onCancelError(error, order.id),
      });
  }

  private show(order: Order): void {
    this.order.set(order);
    this.step.set('result');
    this.notice.set('');
    afterNextRender(() => this.result()?.nativeElement.focus(), { injector: this.injector });
  }

  private onCancelError(error: unknown, orderCode: string): void {
    const code = error instanceof CheckoutError ? error.code : 'unavailable';
    if (code === 'not-cancellable') {
      this.error.set(
        'Đơn hàng này không huỷ được trực tuyến nữa (đã bàn giao vận chuyển, đã có yêu cầu huỷ hoặc đã huỷ). Đã cập nhật lại đơn; cần hỗ trợ vui lòng gọi hotline.',
      );
      // Show where the order is now (the 30-minute view is still open).
      this.api
        .getOrder(orderCode)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({ next: (fresh) => this.order.set(fresh), error: () => undefined });
    } else if (code === 'unauthenticated') {
      this.expireView();
    } else {
      this.error.set('Chưa hủy được đơn hàng. Vui lòng thử lại.');
    }
  }

  /** The 30-minute view ended: back to the first step with the data kept. */
  private expireView(): void {
    this.order.set(null);
    this.step.set('request');
    this.form.controls.code.reset('');
    this.error.set('Phiên xem đơn đã hết hạn, vui lòng xác minh lại.');
  }

  private onError(error: unknown): void {
    const known = error instanceof CheckoutError ? error : new CheckoutError('unavailable');
    switch (known.code) {
      case 'not-found':
        this.error.set('Không tìm thấy đơn hàng phù hợp.');
        break;
      case 'code-locked':
      case 'rate-limited': {
        const seconds = known.retryAfterSeconds ?? 60;
        this.countdown(seconds, this.lockSeconds, 'lock');
        this.error.set(
          known.code === 'code-locked'
            ? `Bạn nhập sai mã quá nhiều lần. Vui lòng thử lại sau ${formatWait(seconds)}.`
            : `Bạn thao tác quá nhanh. Vui lòng thử lại sau ${formatWait(seconds)}.`,
        );
        if (this.step() === 'request') this.countdown(seconds, this.waitSeconds, 'timer');
        break;
      }
      case 'unauthenticated':
        this.expireView();
        break;
      default:
        this.error.set('Chưa kết nối được. Dữ liệu bạn nhập vẫn được giữ, hãy thử lại.');
        this.canRetry.set(true);
    }
  }

  private countdown(
    seconds: number,
    target: { set(value: number): void; update(fn: (value: number) => number): void },
    which: 'timer' | 'lock',
  ): void {
    target.set(seconds);
    const handle = setInterval(() => {
      target.update((left) => Math.max(0, left - 1));
      if ((which === 'timer' ? this.waitSeconds() : this.lockSeconds()) === 0) {
        clearInterval(handle);
      }
    }, 1000);
    if (which === 'timer') {
      clearInterval(this.timer);
      this.timer = handle;
    } else {
      clearInterval(this.lockTimer);
      this.lockTimer = handle;
    }
  }
}

function formatWait(seconds: number): string {
  return seconds >= 120 ? `${Math.ceil(seconds / 60)} phút` : `${seconds} giây`;
}
