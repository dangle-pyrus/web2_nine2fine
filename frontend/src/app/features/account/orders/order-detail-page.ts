import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, distinctUntilChanged, finalize, map, of, switchMap, tap } from 'rxjs';
import { IconComponent } from '../../../shared/ui/icon.component';
import { API_CONFIG } from '../../../core/api-config';
import { ORDERS_API, orderErrorMessage } from '../data-access/orders-api';
import { isOrderStateChanged } from '../../checkout/checkout-api';
import { Order } from '../../orders/order-models';
import {
  cancelLabels,
  formatDate,
  formatDateTime,
  isPaymentOverdue,
  orderActions,
} from '../../orders/order-status';
import { injectNow } from '../../../shared/ui/now';
import { canRequestReturn, returnDeadline, returnsEnabled } from '../../orders/order-returns';
import { ReturnStatusSection } from '../../orders/return-status-section';
import { ToastService } from '../../../shared/ui/toast';
import { BuyAgain } from './buy-again';
import { OrderStatusBadge } from '../../orders/order-status-badge';
import { OrderView } from '../../orders/order-view';
import { OrderCancellation } from './order-cancellation';
import { OrderReceipt } from './order-receipt';

/** Figma `detail-order` (193:2518) with ProgressStep (226:94) and StatusBadge (226:95). */
@Component({
  selector: 'n2f-order-detail-page',
  imports: [RouterLink, IconComponent, OrderStatusBadge, OrderView, ReturnStatusSection],
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
      <!-- ORD-06: same rule as the history card (orderActions); "Đã nhận hàng" only here. -->
      @let can = actions();
      <n2f-order-view [order]="current">
        @if (can.pay) {
          <div class="actions" actions>
            <a class="pill" [routerLink]="['/payment', current.id]">Thanh toán ngay</a>
            @if (can.cancel) {
              <button
                type="button"
                class="pill outline"
                [disabled]="busy()"
                (click)="cancel(current)"
              >
                {{ busy() ? labels(current).busy : labels(current).idle }}
              </button>
            }
          </div>
        } @else if (can.cancel) {
          <div class="actions" actions>
            <button
              type="button"
              class="pill outline"
              [disabled]="busy()"
              (click)="cancel(current)"
            >
              {{ busy() ? labels(current).busy : labels(current).idle }}
            </button>
          </div>
        } @else if (can.confirmReceived) {
          <div class="actions" actions>
            <button
              type="button"
              class="pill"
              data-testid="confirm-received"
              [disabled]="busy()"
              (click)="received(current)"
            >
              {{ busy() ? 'Đang xác nhận…' : 'Đã nhận hàng' }}
            </button>
            <p class="hint">
              Đơn sẽ tự chuyển sang Hoàn thành sau 7 ngày kể từ khi giao cho đơn vị vận chuyển.
            </p>
          </div>
        } @else if (can.buyAgain) {
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
      @if (current.returnCase; as request) {
        <n2f-return-status [order]="current" [request]="request" (changed)="reload(current.id)" />
      }
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

  private readonly returnsEnabled = returnsEnabled(inject(API_CONFIG));
  private readonly api = inject(ORDERS_API);
  private readonly cancellation = inject(OrderCancellation);
  private readonly receipt = inject(OrderReceipt);
  private readonly buyer = inject(BuyAgain);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  /** Order code in the URL; answers for any other code are dropped (ORD-08). */
  private currentId = '';
  /** ORD-10: ticks while the page is open. */
  private readonly now = injectNow();
  /** ORD-06: the buttons this order offers, by the rule shared with the history card. */
  readonly actions = computed(() => {
    const order = this.order();
    return order
      ? orderActions(order, this.now())
      : { pay: false, cancel: false, confirmReceived: false, track: false, buyAgain: false };
  });
  /** Order whose expired payment hold was already re-read, so it is fetched once only. */
  private expiredReload = '';

  constructor() {
    // ORD-10: when the transfer hold runs out on screen, re-read the order once; the server
    // cancels it on read, so the page then shows the real outcome instead of a stale countdown.
    effect(() => {
      const order = this.order();
      if (!order || !isPaymentOverdue(order, this.now())) return;
      if (this.expiredReload === order.id) return;
      this.expiredReload = order.id;
      untracked(() => this.reload(order.id));
    });
    inject(ActivatedRoute)
      .paramMap.pipe(
        map((params) => params.get('orderId') ?? ''),
        distinctUntilChanged(),
        tap((id) => {
          // ORD-08: a new code never shows the previous order, even if its own request fails.
          this.currentId = id;
          this.order.set(null);
          this.error.set('');
          this.notice.set('');
          this.busy.set(false);
        }),
        // ORD-07: "Đơn hàng của tôi" opens only the account's own orders, never a guest grant's.
        switchMap((id) =>
          this.api.getMine(id).pipe(
            map((order) => ({ order, error: null as unknown })),
            catchError((error: unknown) => of({ order: null, error })),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ order, error }) => {
        if (order) this.order.set(order);
        else this.error.set(orderErrorMessage(error));
      });
  }

  /** Applies an answer only while it still belongs to the order in the URL. */
  private show(order: Order): boolean {
    if (order.id.toUpperCase() !== this.currentId.toUpperCase()) return false;
    this.order.set(order);
    return true;
  }

  date(iso: string): string {
    return formatDateTime(iso);
  }

  labels(order: Order): { idle: string; busy: string } {
    return cancelLabels(order);
  }

  returnable(order: Order): boolean {
    // Mock returns only with mock orders; `returnsMode: http` follows the server's `canReturn`.
    return this.returnsEnabled && canRequestReturn(order);
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

  reload(id: string): void {
    this.api
      .getMine(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (fresh) => this.show(fresh), error: () => undefined });
  }

  received(order: Order): void {
    this.notice.set('');
    this.receipt
      .ask(order)
      .pipe(
        switchMap(() => {
          this.busy.set(true);
          return this.api.confirmReceived(order.id).pipe(finalize(() => this.busy.set(false)));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (updated) => {
          if (!this.show(updated)) return;
          this.error.set('');
          this.notice.set(`Cảm ơn bạn! Đơn #${updated.id} đã hoàn thành.`);
          this.toast.show({ title: 'Đã xác nhận nhận hàng', detail: `Đơn #${updated.id}` });
        },
        error: (error: unknown) => {
          this.error.set(orderErrorMessage(error));
          this.reload(order.id);
        },
      });
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
        next: (updated) => {
          if (!this.show(updated)) return;
          this.error.set('');
          if (updated.status === 'cancel-requested') {
            this.notice.set(
              `Đã gửi yêu cầu huỷ đơn #${updated.id}. nine2fine sẽ phản hồi qua email; trong lúc chờ đơn vẫn được giữ nguyên.`,
            );
            this.toast.show({ title: 'Đã gửi yêu cầu huỷ', detail: `Đơn #${updated.id}` });
          } else {
            this.notice.set(`Đã hủy đơn #${updated.id}.`);
            this.toast.show({ title: 'Đã hủy đơn hàng', detail: `Đơn #${updated.id}` });
          }
        },
        error: (error: unknown) => {
          this.error.set(orderErrorMessage(error));
          // ORD-CC-04: the order moved on (handed over, request already sent): show where it is now.
          if (isOrderStateChanged(error)) this.reload(order.id);
        },
      });
  }
}
