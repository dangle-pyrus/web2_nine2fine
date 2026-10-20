import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, map, switchMap } from 'rxjs';
import { IconComponent } from '../../../shared/ui/icon.component';
import { ACCOUNT_API } from '../data-access/account-api';
import { Order } from '../../orders/order-models';
import { accountErrorMessage } from '../account-messages';
import { canBuyAgain, canPay, formatDate, formatDateTime } from '../../orders/order-status';
import { canRequestReturn, returnDeadline } from '../../orders/order-returns';
import { ToastService } from '../../../shared/ui/toast';
import { BuyAgain } from './buy-again';
import { OrderStatusBadge } from '../../orders/order-status-badge';
import { OrderView } from '../../orders/order-view';
import { OrderCancellation } from './order-cancellation';

/** Figma `detail-order` (193:2518) with ProgressStep (226:94) and StatusBadge (226:95). */
@Component({
  selector: 'n2f-order-detail-page',
  imports: [RouterLink, IconComponent, OrderStatusBadge, OrderView],
  template: `
    <a class="back" routerLink="/account/orders"
      ><n2f-icon name="reiconArrowLeft" size="16px" /> Lịch sử mua hàng</a
    >
    @if (error()) {
      <p class="form-error" role="alert">{{ error() }}</p>
    }
    @if (order(); as current) {
      <header class="title-row">
        <div>
          <h1>Đơn #{{ current.id }}</h1>
          <p class="meta">Đặt lúc {{ date(current.placedAt) }}</p>
        </div>
        <n2f-order-status-badge [status]="current.status" />
      </header>

      @if (notice()) {
        <p class="notice" role="status">{{ notice() }}</p>
      }
      <n2f-order-view [order]="current">
        @if (payable(current)) {
          <div class="actions" actions>
            <a class="pill" [routerLink]="['/payment', current.id]">Thanh toán ngay</a>
            <button
              type="button"
              class="pill outline"
              [disabled]="busy()"
              (click)="cancel(current)"
            >
              {{ busy() ? 'Đang hủy…' : 'Hủy đơn' }}
            </button>
          </div>
        } @else if (current.status === 'processing') {
          <div class="actions" actions>
            <button
              type="button"
              class="pill outline"
              [disabled]="busy()"
              (click)="cancel(current)"
            >
              {{ busy() ? 'Đang hủy…' : 'Hủy đơn' }}
            </button>
          </div>
        } @else if (rebuyable(current)) {
          <div class="actions" actions>
            @if (returnable(current)) {
              <a class="pill outline" [routerLink]="['/account/orders', current.id, 'return']"
                >Yêu cầu trả hàng</a
              >
            }
            <button
              type="button"
              class="pill"
              [class.outline]="current.status !== 'completed'"
              [disabled]="busy()"
              (click)="buyAgain(current)"
            >
              Mua lại đơn này
            </button>
            @if (returnable(current)) {
              <p class="hint">Có thể yêu cầu trả hàng đến hết ngày {{ deadline(current) }}.</p>
            }
          </div>
        }
      </n2f-order-view>
      <p class="help">
        Cần hỗ trợ đơn #{{ current.id }}?
        <a routerLink="/help"><strong>Liên hệ nine2fine →</strong></a>
        <span class="hint">Nhớ gửi kèm mã đơn để được xử lý nhanh hơn.</span>
      </p>
    } @else if (!error()) {
      <p class="state" role="status">Đang tải đơn hàng…</p>
    }
  `,
  styleUrl: '../ui/account.scss',
  styles: `
    :host {
      max-width: 1130px;
    }
    .back {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--muted);
      font-size: 13px;
    }
    .title-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 16px;
      margin-top: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--ink);
    }
    h1 {
      font-size: max(26px, calc(40 * var(--u)));
      font-weight: 700;
    }
    .meta {
      margin: 6px 0 0;
      color: var(--muted);
      font-size: 13px;
    }
    .notice {
      margin: 24px 0 0;
      padding: 12px 16px;
      border-radius: var(--radius-button);
      background: var(--surface);
      font-size: 14px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 18px;
    }
    .help {
      margin-top: 40px;
      font-size: 13px;
    }
    .actions .hint {
      flex-basis: 100%;
      margin: 0;
      color: var(--muted);
      font-size: 13px;
    }
    .help .hint {
      display: block;
      margin-top: 4px;
      color: var(--muted);
    }
    @media (max-width: 700px) {
      .actions .pill {
        flex: 1;
        padding-inline: 12px;
      }
      .title-row {
        align-items: flex-start;
        flex-direction: column;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderDetailPage {
  readonly order = signal<Order | null>(null);
  readonly error = signal('');
  readonly notice = signal('');
  readonly busy = signal(false);

  private readonly api = inject(ACCOUNT_API);
  private readonly cancellation = inject(OrderCancellation);
  private readonly buyer = inject(BuyAgain);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    inject(ActivatedRoute)
      .paramMap.pipe(
        map((params) => params.get('orderId') ?? ''),
        switchMap((id) => this.api.getOrder(id)),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: (order) => this.order.set(order),
        error: (error: unknown) => this.error.set(accountErrorMessage(error)),
      });
  }

  date(iso: string): string {
    return formatDateTime(iso);
  }

  payable(order: Order): boolean {
    return canPay(order);
  }

  rebuyable(order: Order): boolean {
    return canBuyAgain(order);
  }

  returnable(order: Order): boolean {
    return canRequestReturn(order);
  }

  deadline(order: Order): string {
    const iso = returnDeadline(order);
    return iso ? formatDate(iso) : '';
  }

  buyAgain(order: Order): void {
    this.busy.set(true);
    this.buyer
      .add(order)
      .pipe(
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  cancel(order: Order): void {
    this.busy.set(true);
    this.notice.set('');
    this.cancellation
      .cancel(order)
      .pipe(
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (cancelled) => {
          this.order.set(cancelled);
          this.notice.set(`Đã hủy đơn #${cancelled.id}.`);
          this.toast.show({ title: 'Đã hủy đơn hàng', detail: `Đơn #${cancelled.id}` });
        },
        error: (error: unknown) => this.error.set(accountErrorMessage(error)),
      });
  }
}
