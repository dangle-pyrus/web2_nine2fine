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
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { finalize, map } from 'rxjs';
import { getMedia } from '../../../../media/media-manifest';
import { ToastService } from '../../../shared/ui/toast';
import { ORDERS_API, orderErrorMessage } from '../data-access/orders-api';
import { Order } from '../../orders/order-models';
import { findOrderTab, inTab, ORDER_TABS, OrderTab } from '../../orders/order-status';
import { IconComponent } from '../../../shared/ui/icon.component';
import { OrderCard } from './order-card';
import { OrderCancellation } from './order-cancellation';
import { BuyAgain } from './buy-again';
import { centerActive } from '../../../shared/ui/center-active';

/** Orders shown before "Xem thêm"; each press shows another page. */
const PAGE_SIZE = 10;

/** Figma `history-order (1)` (116:2285, tabs + filtered empty) and `(2)` (116:3273, no orders). */
@Component({
  selector: 'n2f-orders-page',
  imports: [RouterLink, IconComponent, OrderCard],
  template: `
    <h1>Lịch sử mua hàng</h1>
    @if (error()) {
      <p class="form-error" role="alert">
        {{ error() }}
        <button type="button" class="link" (click)="load()">Thử lại</button>
      </p>
    }
    @if (orders(); as all) {
      @if (!all.length) {
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
        @if (!visible().length) {
          <div class="filtered-empty" role="status">
            <p>
              @if (query()) {
                Không tìm thấy đơn nào khớp “{{ query() }}”{{
                  status() ? ' trong mục ' + status()!.label : ''
                }}.
              } @else {
                Không có đơn nào ở mục “{{ status()?.label }}”.
              }
            </p>
            <a routerLink="." [queryParams]="{ status: null }" (click)="search('')"
              >Xem tất cả đơn hàng</a
            >
          </div>
        } @else {
          <div class="cards">
            @for (order of page(); track order.id) {
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
              <p>Đang xem {{ orders()?.length }}/{{ total() }} đơn</p>
              <button
                type="button"
                class="pill outline"
                [disabled]="loadingMore()"
                (click)="load()"
              >
                {{ loadingMore() ? 'Đang tải…' : 'Xem thêm đơn hàng' }}
              </button>
            </div>
          }
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
  readonly orders = signal<Order[] | null>(null);
  /** Orders the account has in total (the list loads 10 at a time). */
  readonly total = signal(0);
  readonly loadingMore = signal(false);
  private nextPage = 1;
  readonly error = signal('');
  readonly busyId = signal<string | null>(null);
  readonly query = signal('');
  readonly limit = signal(PAGE_SIZE);
  readonly status = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(
      map((params) => findOrderTab(params.get('status')) ?? null),
    ),
    { initialValue: null },
  );
  readonly visible = computed(() => {
    const tab = this.status();
    const term = normalize(this.query());
    return (this.orders() ?? []).filter(
      (order) =>
        (!tab || inTab(order, tab)) &&
        (!term ||
          normalize(order.id).includes(term) ||
          order.items.some((line) => normalize(line.name).includes(term))),
    );
  });
  readonly page = computed(() => this.visible());
  readonly hasMore = computed(() => (this.orders()?.length ?? 0) < this.total());

  private readonly api = inject(ORDERS_API);
  private readonly cancellation = inject(OrderCancellation);
  private readonly buyer = inject(BuyAgain);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    this.load();
    // New filter: start from the first page and keep the chosen tab in view on narrow screens.
    effect(() => {
      this.status();
      this.orders();
      this.limit.set(PAGE_SIZE);
      afterNextRender(() => centerActive(this.tabBar()?.nativeElement), {
        injector: this.injector,
      });
    });
  }

  /** First page, or the next one ("Xem thêm"): pages are appended, newest first. */
  load(): void {
    const first = this.nextPage === 1;
    if (this.loadingMore()) return;
    this.error.set('');
    this.loadingMore.set(!first);
    this.api
      .list({ page: this.nextPage, limit: PAGE_SIZE })
      .pipe(
        finalize(() => this.loadingMore.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (result) => {
          this.nextPage = result.page + 1;
          this.total.set(result.total);
          this.orders.update((list) => [...(list ?? []), ...result.items]);
        },
        error: (error: unknown) => this.error.set(orderErrorMessage(error)),
      });
  }

  count(tab: OrderTab): number {
    return (this.orders() ?? []).filter((order) => inTab(order, tab)).length;
  }

  search(value: string): void {
    this.query.set(value);
    this.limit.set(PAGE_SIZE);
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
          this.toast.show(
            updated.status === 'cancel-requested'
              ? { title: 'Đã gửi yêu cầu huỷ', detail: `Đơn #${updated.id}` }
              : { title: 'Đã hủy đơn hàng', detail: `Đơn #${updated.id}` },
          );
        },
        error: (error: unknown) => {
          this.error.set(orderErrorMessage(error));
          if ((error as { code?: string }).code === 'not-cancellable') this.reload(order.id);
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

/** Case- and accent-insensitive match, so "ao so mi" finds "Áo sơ mi". */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
}
