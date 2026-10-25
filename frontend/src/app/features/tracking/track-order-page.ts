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
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter, finalize, switchMap } from 'rxjs';
import { CHECKOUT_API, CheckoutError, TrackOrderRequest } from '../checkout/checkout-api';
import { Order } from '../orders/order-models';
import { canCancel, canPay, formatDate } from '../orders/order-status';
import { canRequestReturn } from '../orders/order-returns';
import { storeSettings } from '../../core/store-settings';
import { OverlayService } from '../../shared/ui/overlay.service';
import { ConfirmDialog, ConfirmDialogData } from '../../shared/ui/confirm-dialog';
import { OrderStatusBadge } from '../orders/order-status-badge';
import { OrderView } from '../orders/order-view';

const CONTACT_PATTERN = /^(?:(?:0|\+84)\d{9}|[^\s@]+@[^\s@]+\.[^\s@]+)$/;

/** Guest order tracking (plan 18): order ID + phone/email, never carried in the URL. */
@Component({
  selector: 'n2f-track-order-page',
  imports: [ReactiveFormsModule, RouterLink, OrderStatusBadge, OrderView],
  template: `
    <div class="container tracking">
      <h1>Tra cứu đơn hàng</h1>
      <p class="lead">
        Nhập mã đơn và số điện thoại hoặc email bạn đã dùng khi đặt hàng.
        <a routerLink="/auth/login" [queryParams]="{ returnUrl: '/account/orders' }">Đăng nhập</a>
        để xem toàn bộ lịch sử mua hàng.
      </p>
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="field">
          <label for="track-order-id"
            >Mã đơn hàng<span class="req" aria-hidden="true">*</span></label
          >
          <input
            id="track-order-id"
            formControlName="orderId"
            autocomplete="off"
            placeholder="VD: N2F260928010"
            aria-required="true"
            [attr.aria-invalid]="invalid('orderId')"
          />
          @if (invalid('orderId')) {
            <p class="field-error">Nhập mã đơn hàng.</p>
          }
        </div>
        <div class="field">
          <label for="track-contact"
            >Số điện thoại hoặc email<span class="req" aria-hidden="true">*</span></label
          >
          <input
            id="track-contact"
            formControlName="contact"
            autocomplete="email"
            aria-required="true"
            [attr.aria-invalid]="invalid('contact')"
          />
          @if (invalid('contact')) {
            <p class="field-error">Nhập số điện thoại (0 hoặc +84) hoặc email hợp lệ.</p>
          }
        </div>
        <button class="pill" type="submit" [disabled]="busy()">
          {{ busy() ? 'Đang tra cứu…' : 'Tra cứu' }}
        </button>
      </form>
      @if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
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
                  {{ cancelling() ? 'Đang hủy…' : 'Hủy đơn' }}
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
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly cancelling = signal(false);
  get info() {
    return storeSettings().info;
  }
  /** Order ID + contact that found the current result; reused to prove a cancellation. */
  private verified: TrackOrderRequest | null = null;

  private readonly api = inject(CHECKOUT_API);
  private readonly overlay = inject(OverlayService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly result = viewChild<ElementRef<HTMLElement>>('result');
  readonly form = inject(FormBuilder).nonNullable.group({
    orderId: [(history.state as { orderId?: string } | null)?.orderId ?? '', Validators.required],
    contact: ['', [Validators.required, Validators.pattern(CONTACT_PATTERN)]],
  });

  invalid(key: 'orderId' | 'contact'): boolean {
    const control = this.form.controls[key];
    return control.invalid && control.touched;
  }

  date(iso: string): string {
    return formatDate(iso);
  }

  payable(order: Order): boolean {
    return canPay(order);
  }

  cancellable(order: Order): boolean {
    return canCancel(order);
  }

  returnable(order: Order): boolean {
    return canRequestReturn(order);
  }

  cancel(order: Order): void {
    const proof = this.verified;
    if (!proof) return;
    const data: ConfirmDialogData = {
      title: 'Hủy đơn hàng?',
      message: order.payment.paid
        ? `Đơn #${order.id} sẽ được hủy và số tiền đã thanh toán được hoàn lại trong ${storeSettings().policy.refundWorkingDays} ngày làm việc.`
        : `Đơn #${order.id} sẽ được hủy và không thể khôi phục.`,
      confirmLabel: 'Hủy đơn',
    };
    this.notice.set('');
    this.overlay
      .open(ConfirmDialog, data.title, 'modal', data)
      .closed.pipe(
        filter((confirmed) => confirmed === true),
        switchMap(() => {
          this.cancelling.set(true);
          return this.api.cancelOrder(proof).pipe(finalize(() => this.cancelling.set(false)));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (cancelled) => {
          this.order.set(cancelled);
          this.notice.set(`Đã hủy đơn #${cancelled.id}.`);
        },
        error: (error: unknown) =>
          this.error.set(
            error instanceof CheckoutError && error.code === 'not-cancellable'
              ? `Đơn hàng đã được giao cho đơn vị vận chuyển nên không thể hủy trực tuyến. Vui lòng gọi ${storeSettings().info.hotline}.`
              : 'Chưa hủy được đơn hàng. Vui lòng thử lại.',
          ),
      });
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.order.set(null);
    this.notice.set('');
    this.verified = null;
    const { orderId, contact } = this.form.getRawValue();
    this.api
      .trackOrder({ orderId, contact })
      .pipe(
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (order) => {
          this.verified = { orderId, contact };
          this.order.set(order);
          afterNextRender(() => this.result()?.nativeElement.focus(), { injector: this.injector });
        },
        error: () =>
          this.error.set(
            'Không tìm thấy đơn hàng khớp với thông tin đã nhập. Vui lòng kiểm tra mã đơn và số điện thoại/email.',
          ),
      });
  }
}
