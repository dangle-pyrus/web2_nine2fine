import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { finalize, map, Subscription } from 'rxjs';
import { getMedia } from '../../../../media/media-manifest';
import { ToastService } from '../../../shared/ui/toast';
import { ORDERS_API, OrderPage, orderErrorMessage } from '../data-access/orders-api';
import { isOrderStateChanged } from '../../checkout/checkout-api';
import { Order } from '../../orders/order-models';
import { findOrderTab, ORDER_TABS, OrderTab } from '../../orders/order-status';
import { IconComponent } from '../../../shared/ui/icon.component';
import { OrderCard } from './order-card';
import { OrderCancellation } from './order-cancellation';
import { BuyAgain } from './buy-again';
import { centerActive } from '../../../shared/ui/center-active';

/** Orders shown before "Xem thêm"; each press shows another page. */
const PAGE_SIZE = 10;
/** Pause in typing (ms) before the search term is sent to the API. */
const SEARCH_DELAY = 300;

/** Figma `history-order (1)` (116:2285, tabs + filtered empty) and `(2)` (116:3273, no orders). */
@Component({
  selector: 'n2f-orders-page',
  imports: [RouterLink, IconComponent, OrderCard],
  template: `
    <h1>Lịch sử mua hàng</h1>
    @if (error()) {
      <p class="form-error" role="alert">
        {{ error() }}
        <button type="button" class="link" (click)="retry()">Thử lại</button>
      </p>
    }
    @if (ready()) {
      @if (neverOrdered()) {
        <p class="lead">Bạn chưa có đơn hàng nào.</p>
        <div class="empty">
          <img class="illustration" [src]="emptyImage.src" alt="" width="410" height="310" />
          <a class="pill" routerLink="/shop">Mua hàng ngay</a>
        </div>
      } @else {
        <div class="tabs-wrap">
          <nav class="tabs" aria-label="Lọc theo trạng thái đơn hàng" #tabBar>
            <a
              routerLink="."
              [queryParams]="{ status: null }"
              [class.active]="!status()"
              [attr.aria-current]="!status() ? 'page' : null"
              >Tất cả</a
            >
            @for (tab of tabs; track tab.id) {
              <a
                routerLink="."
                [queryParams]="{ status: tab.id }"
                [class.active]="status()?.id === tab.id"
                [attr.aria-current]="status()?.id === tab.id ? 'page' : null"
                >{{ tab.label }}
                @if (tab.active && count(tab); as total) {
                  <span class="count" [class.urgent]="tab.id === 'pending-payment'">{{
                    total
                  }}</span>
                }
              </a>
            }
          </nav>
        </div>
        <div class="search">
          <n2f-icon name="reiconSearch" size="18px" />
          <label class="sr-only" for="order-search">Tìm đơn hàng</label>
          <input
            id="order-search"
            type="search"
            placeholder="Tìm theo mã đơn hoặc tên sản phẩm"
            autocomplete="off"
            [value]="query()"
            (input)="search($any($event.target).value)"
          />
        </div>
        @if (orders(); as list) {
          @if (!list.length) {
            <!-- ORD-04: shown only once the API answered with no order for this tab + term. -->
            <div class="filtered-empty" role="status">
              <p>
                @if (term()) {
                  Không tìm thấy đơn nào khớp “{{ term() }}”{{
                    status() ? ' trong mục ' + status()!.label : ''
                  }}.
                } @else {
                  Không có đơn nào ở mục “{{ status()?.label }}”.
                }
              </p>
              <a routerLink="." [queryParams]="{ status: null }" (click)="clearSearch()"
                >Xem tất cả đơn hàng</a
              >
            </div>
          } @else {
            <div class="cards">
              @for (order of list; track order.id) {
                <n2f-order-card
                  [order]="order"
                  [busy]="busyId() === order.id"
                  (cancelRequested)="cancel($event)"
                  (payRequested)="pay($event)"
                  (buyAgainRequested)="buyAgain($event)"
                />
              }
            </div>
            @if (hasMore()) {
              <div class="more">
                <p>Đang xem {{ list.length }}/{{ total() }} đơn</p>
                <button
                  type="button"
                  class="pill outline"
                  [disabled]="loadingMore()"
                  (click)="loadMore()"
                >
                  {{ loadingMore() ? 'Đang tải…' : 'Xem thêm đơn hàng' }}
                </button>
              </div>
            }
          }
        } @else if (!error()) {
          <div class="skeleton" role="status" aria-label="Đang tải đơn hàng">
            @for (row of [1, 2]; track row) {
              <div class="ghost"><span></span><span></span><span></span></div>
            }
          </div>
        }
      }
    } @else if (!error()) {
      <div class="skeleton" role="status" aria-label="Đang tải đơn hàng">
        @for (row of [1, 2]; track row) {
          <div class="ghost"><span></span><span></span><span></span></div>
        }
      </div>
    }
  `,
  styleUrl: '../ui/account.scss',
  styles: `
    h1 {
      margin-bottom: calc(32 * var(--u));
    }
    .tabs-wrap {
      position: relative;
      margin-bottom: 16px;
    }
    /* Fade on the right edge hints that more tabs scroll in on narrow screens. */
    .tabs-wrap::after {
      display: none;
      content: '';
      position: absolute;
      top: 0;
      right: 0;
      bottom: 1px;
      width: 32px;
      background: linear-gradient(to right, transparent, #fff);
      pointer-events: none;
    }
    .tabs {
      display: flex;
      gap: 4px;
      padding-right: 24px;
      overflow-x: auto;
      border-bottom: 1px solid var(--line);
      scrollbar-width: none;
    }
    .tabs a {
      flex: 1 0 auto;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 0 12px;
      border-bottom: 2px solid transparent;
      color: var(--ink);
      font-size: 13px;
      white-space: nowrap;
    }
    .tabs a.active {
      border-bottom-color: var(--brand);
      color: var(--brand);
      font-weight: 600;
    }
    .count {
      min-width: 20px;
      padding: 1px 6px;
      border-radius: 999px;
      background: var(--surface);
      color: var(--ink);
      font-size: 11px;
      font-weight: 600;
      text-align: center;
    }
    .count.urgent {
      background: var(--brand);
      color: #fff;
    }
    .search {
      position: relative;
      width: min(100%, 420px);
      margin-bottom: 24px;
    }
    .search n2f-icon {
      position: absolute;
      top: 50%;
      left: 14px;
      color: var(--muted);
      transform: translateY(-50%);
      pointer-events: none;
    }
    .search input {
      width: 100%;
      min-height: 44px;
      padding: 0 14px 0 40px;
      border: 1px solid var(--line);
      border-radius: var(--radius-button);
      font: inherit;
      font-size: 14px;
    }
    .cards {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .filtered-empty {
      padding: 48px 16px;
      border: 1px dashed var(--line);
      border-radius: var(--radius-card);
      text-align: center;
      font-size: 14px;
    }
    .filtered-empty p {
      margin: 0 0 12px;
    }
    .filtered-empty a {
      text-decoration: underline;
    }
    .more {
      margin-top: 28px;
      text-align: center;
    }
    .more p {
      margin: 0 0 12px;
      color: var(--muted);
      font-size: 13px;
    }
    .ghost {
      display: grid;
      gap: 12px;
      margin-bottom: 20px;
      padding: 24px;
      border: 1px solid var(--line);
      border-radius: var(--radius-card);
    }
    .ghost span {
      height: 14px;
      border-radius: 4px;
      background: var(--surface);
      animation: pulse 1.2s ease-in-out infinite alternate;
    }
    .ghost span:nth-child(1) {
      width: 40%;
    }
    .ghost span:nth-child(2) {
      height: 80px;
    }
    .ghost span:nth-child(3) {
      width: 60%;
    }
    @keyframes pulse {
      to {
        opacity: 0.4;
      }
    }
    @media (max-width: 900px) {
      .tabs-wrap::after {
        display: block;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .ghost span {
        animation: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrdersPage {
  readonly emptyImage = getMedia('empty-orders');
  readonly tabs = ORDER_TABS;
  readonly pageSize = PAGE_SIZE;
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly injector = inject(Injector);
  private readonly tabBar = viewChild<ElementRef<HTMLElement>>('tabBar');
  /** Orders of the current tab + search term loaded so far; `null` while the first page loads. */
  readonly orders = signal<Order[] | null>(null);
  /** Orders matching the current tab + term on the server (the list loads 10 at a time). */
  readonly total = signal(0);
  /** The server says more pages exist for the current tab + term. */
  readonly hasMore = signal(false);
  /** Per-tab totals over all the account's orders, from the API (never counted from loaded rows). */
  readonly counts = signal<OrderPage['counts']>({});
  /** The first answer arrived, so tabs and search stay put while later filters load. */
  readonly ready = signal(false);
  readonly loadingMore = signal(false);
  readonly error = signal('');
  readonly busyId = signal<string | null>(null);
  /** What is typed in the search box. */
  readonly query = signal('');
  /** The term sent to the API (`q`), set after a short pause in typing. */
  readonly term = signal('');
  readonly status = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(
      map((params) => findOrderTab(params.get('status')) ?? null),
    ),
    { initialValue: null },
  );
  /** The account has no order at all: the unfiltered list came back empty. */
  readonly neverOrdered = computed(
    () => !this.status() && !this.term() && this.orders()?.length === 0 && this.total() === 0,
  );

  private nextPage = 1;
  private request?: Subscription;
  private searchTimer?: ReturnType<typeof setTimeout>;
  private readonly api = inject(ORDERS_API);
  private readonly cancellation = inject(OrderCancellation);
  private readonly buyer = inject(BuyAgain);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    // New tab or term: ask the server for its first page (ORD-02, ORD-04).
    effect(() => {
      this.status();
      this.term();
      untracked(() => this.fetch(true));
    });
    // Keep the chosen tab in view on narrow screens.
    effect(() => {
      this.status();
      this.ready();
      afterNextRender(() => centerActive(this.tabBar()?.nativeElement), {
        injector: this.injector,
      });
    });
    this.destroyRef.onDestroy(() => clearTimeout(this.searchTimer));
  }

  /** "Xem thêm" (ORD-05): the next 10 orders of the same tab + term. */
  loadMore(): void {
    this.fetch(false);
  }

  retry(): void {
    this.fetch(this.orders() === null);
  }

  /**
   * `reset`: drop what is shown and load page 1 for the current tab + term; a request still running
   * for the previous filter is cancelled so its answer can never land in the new list.
   */
  private fetch(reset: boolean): void {
    if (reset) {
      this.request?.unsubscribe();
      this.nextPage = 1;
      this.orders.set(null);
      this.hasMore.set(false);
      this.loadingMore.set(false);
    } else if (this.loadingMore() || !this.hasMore()) {
      return;
    }
    this.error.set('');
    this.loadingMore.set(!reset);
    const tab = this.status();
    this.request = this.api
      .list({ page: this.nextPage, limit: PAGE_SIZE, status: tab?.id, q: this.term() })
      .pipe(
        finalize(() => this.loadingMore.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (result) => {
          this.nextPage = result.page + 1;
          this.total.set(result.total);
          this.hasMore.set(result.hasMore);
          if (result.counts) this.counts.set(result.counts);
          this.orders.update((list) => (reset ? result.items : [...(list ?? []), ...result.items]));
          this.ready.set(true);
        },
        error: (error: unknown) => this.error.set(orderErrorMessage(error)),
      });
  }

  /**
   * Re-reads what is on screen (same tab + term, as many orders as are loaded) without the
   * loading skeleton, after an action changed an order.
   */
  private refresh(): void {
    const loaded = this.orders()?.length ?? 0;
    const pages = Math.max(1, Math.ceil(loaded / PAGE_SIZE));
    const limit = Math.min(50, pages * PAGE_SIZE);
    this.request?.unsubscribe();
    this.request = this.api
      .list({ page: 1, limit, status: this.status()?.id, q: this.term() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.nextPage = limit / PAGE_SIZE + 1;
          this.total.set(result.total);
          this.hasMore.set(result.hasMore);
          if (result.counts) this.counts.set(result.counts);
          this.orders.set(result.items);
        },
        error: () => undefined,
      });
  }

  count(tab: OrderTab): number {
    return this.counts()?.[tab.id] ?? 0;
  }

  search(value: string): void {
    this.query.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.term.set(value.trim()), SEARCH_DELAY);
  }

  clearSearch(): void {
    clearTimeout(this.searchTimer);
    this.query.set('');
    this.term.set('');
  }

  cancel(order: Order): void {
    this.error.set('');
    this.busyId.set(order.id);
    this.cancellation
      .cancel(order)
      .pipe(
        finalize(() => this.busyId.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (updated) => {
          this.replace(updated);
          // The order may have left this tab: read the tab and its counts again from the server.
          this.refresh();
          this.toast.show(
            updated.status === 'cancel-requested'
              ? { title: 'Đã gửi yêu cầu huỷ', detail: `Đơn #${updated.id}` }
              : { title: 'Đã hủy đơn hàng', detail: `Đơn #${updated.id}` },
          );
        },
        error: (error: unknown) => {
          this.error.set(orderErrorMessage(error));
          // ORD-CC-04: the order moved on meanwhile: show its current state.
          if (isOrderStateChanged(error)) this.reload(order.id);
        },
      });
  }

  private replace(updated: Order): void {
    this.orders.update((list) =>
      (list ?? []).map((candidate) => (candidate.id === updated.id ? updated : candidate)),
    );
  }

  private reload(id: string): void {
    this.api
      .get(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (fresh) => this.replace(fresh), error: () => undefined });
  }

  /** Bank-transfer orders continue on the QR / virtual-account payment page. */
  pay(order: Order): void {
    void this.router.navigate(['/payment', order.id]);
  }

  buyAgain(order: Order): void {
    this.busyId.set(order.id);
    this.buyer
      .add(order)
      .pipe(
        finalize(() => this.busyId.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }
}
