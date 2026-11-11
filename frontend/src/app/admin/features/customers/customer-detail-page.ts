import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminSession } from '../../core/admin-session';
import { DatePipe, DateTimePipe, MoneyPipe, NumPipe } from '../../core/format.pipes';
import { paymentState, statusBadge } from '../../core/order-desk-status';
import { paymentBadge, tierBadge } from '../../core/status';
import { ADMIN_CUSTOMER_ACCOUNTS_API } from '../../data-access/customers-api';
import { errorMessage } from '../../data-access/http-support';
import type { DeskOrderSummary } from '../../data-access/order-desk-models';
import type { CustomerDetail } from '../../data-access/users-models';
import { AdmBadge } from '../../ui/badge';
import { AdminDialogs } from '../../ui/dialogs';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { AdmPageHeader } from '../../ui/page-header';
import { AdmPager } from '../../ui/pager';
import { ReasonDialog, ReasonDialogData } from '../../ui/reason-dialog';
import { routeParam } from '../../ui/route-param';
import { AdminToastService } from '../../ui/toast';

const ORDER_PAGE_SIZE = 20;

/**
 * Customer profile (BR-USR-10..12, 14, 15). What the API leaves out stays out: staff get masked
 * contact details and no birth date or address book, and this page neither masks nor invents them.
 */
@Component({
  selector: 'adm-customer-detail-page',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    AdmPageHeader,
    AdmBadge,
    AdmIcon,
    AdmPager,
    AdmEmptyState,
    MoneyPipe,
    NumPipe,
    DatePipe,
    DateTimePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (customer(); as customer) {
      <adm-page-header [heading]="customer.name" back="/admin/customers">
        <ng-container badges>
          <adm-badge [spec]="tierBadge(customer.tier)" />
          @if (customer.status === 'blocked') {
            <adm-badge label="Đã khóa" tone="critical" />
          }
        </ng-container>
        <p subtitle class="secondary small">Khách hàng từ {{ customer.createdAt | admDate }}</p>
        <ng-container actions>
          @if (canEdit) {
            <button
              type="button"
              class="adm-btn adm-btn--lg"
              data-testid="toggle-lock"
              (click)="toggleLock(customer)"
            >
              {{ customer.status === 'blocked' ? 'Mở khóa tài khoản' : 'Khóa tài khoản' }}
            </button>
          }
          @if (customer.contactMasked) {
            <button type="button" class="adm-btn adm-btn--lg" (click)="showAllOrders()">
              Xem tất cả đơn
            </button>
          } @else {
            <a
              class="adm-btn adm-btn--lg"
              routerLink="/admin/orders"
              [queryParams]="{ q: customer.email }"
              >Xem tất cả đơn (theo email)</a
            >
          }
        </ng-container>
      </adm-page-header>

      <div class="columns">
        <div class="col-main">
          @if (customer.status === 'blocked') {
            <div class="banner banner--critical" role="status">
              <adm-icon name="reiconAlertCircle" />
              <div class="banner-body">
                <p class="banner-title">Tài khoản đang bị khóa</p>
                <p>
                  Khách không đăng nhập được cho đến khi bạn mở khoá. Đơn đang xử lý không bị ảnh
                  hưởng.
                </p>
              </div>
            </div>
          }
          <div class="kpis">
            <div>
              <p class="kpi-label">Đã chi</p>
              <p class="kpi-value">{{ customer.totalSpent | admMoney }}</p>
            </div>
            <div>
              <p class="kpi-label">Chi tiêu năm nay</p>
              <p class="kpi-value" data-testid="spent-this-year">
                {{ customer.spentThisYear | admMoney }}
              </p>
            </div>
            <div>
              <p class="kpi-label">Số đơn</p>
              <p class="kpi-value">{{ customer.orderCount | admNum }}</p>
            </div>
            <div>
              <p class="kpi-label">Đơn gần nhất</p>
              <p class="kpi-value kpi-small">
                {{ customer.lastOrderAt ? (customer.lastOrderAt | admDate) : '—' }}
              </p>
            </div>
          </div>
          <p class="hint">Hạng tính theo chi tiêu năm nay.</p>

          <section class="section" aria-labelledby="orders-title">
            <header>
              <h2 id="orders-title">Đơn hàng gần đây</h2>
            </header>
            @if (!customer.recentOrders.length) {
              <p class="secondary">Khách chưa đặt đơn nào.</p>
            } @else {
              <ng-container
                [ngTemplateOutlet]="orderTable"
                [ngTemplateOutletContext]="{ $implicit: customer.recentOrders }"
              />
            }
          </section>

          @if (allOrders(); as all) {
            <section class="section" aria-labelledby="all-orders-title" id="all-orders">
              <header>
                <h2 id="all-orders-title">Tất cả đơn của khách ({{ all.total | admNum }})</h2>
              </header>
              @if (ordersError()) {
                <adm-empty
                  kind="error"
                  heading="Không tải được danh sách đơn"
                  [description]="ordersError()"
                >
                  <button type="button" class="adm-btn" (click)="loadOrders(ordersPage())">
                    Thử lại
                  </button>
                </adm-empty>
              } @else {
                <ng-container
                  [ngTemplateOutlet]="orderTable"
                  [ngTemplateOutletContext]="{ $implicit: all.items }"
                />
                <adm-pager
                  [total]="all.total"
                  [page]="all.page"
                  [pageSize]="all.limit"
                  [sizes]="[20]"
                  (pageChange)="loadOrders($event)"
                />
              }
            </section>
          } @else if (ordersLoading()) {
            <p class="secondary" role="status">Đang tải danh sách đơn…</p>
          } @else if (ordersError()) {
            <adm-empty
              kind="error"
              heading="Không tải được danh sách đơn"
              [description]="ordersError()"
            >
              <button type="button" class="adm-btn" (click)="loadOrders(1)">Thử lại</button>
            </adm-empty>
          }

          @if (customer.addresses; as addresses) {
            <section class="section" aria-labelledby="addr-title">
              <header>
                <h2 id="addr-title">Sổ địa chỉ</h2>
              </header>
              @if (!addresses.length) {
                <p class="secondary">Chưa lưu địa chỉ nào.</p>
              } @else {
                <ul class="addresses">
                  @for (address of addresses; track $index) {
                    <li>
                      <p>
                        <strong>{{ address.recipient }}</strong>
                        @if (address.isDefault) {
                          <span class="chip chip--static small">Mặc định</span>
                        }
                      </p>
                      <p class="secondary num">{{ address.phone }}</p>
                      <p class="secondary">{{ address.line }}</p>
                    </li>
                  }
                </ul>
              }
            </section>
          }
        </div>

        <div class="col-side">
          <section class="section" aria-labelledby="contact-title">
            <header>
              <h2 id="contact-title">Liên hệ</h2>
            </header>
            <dl class="dl">
              <div>
                <dt>Email</dt>
                <dd>
                  @if (customer.contactMasked) {
                    {{ customer.email }}
                  } @else {
                    <a class="link" [href]="'mailto:' + customer.email">{{ customer.email }}</a>
                  }
                </dd>
              </div>
              <div>
                <dt>Điện thoại</dt>
                <dd class="num">{{ customer.phone ?? '—' }}</dd>
              </div>
              @if (customer.birthDate) {
                <div>
                  <dt>Sinh nhật</dt>
                  <dd>{{ customer.birthDate | admDate }}</dd>
                </div>
              }
              <div>
                <dt>Nhận tin khuyến mãi</dt>
                <dd>{{ customer.marketingOptIn ? 'Có' : 'Không' }}</dd>
              </div>
            </dl>
            @if (customer.contactMasked) {
              <p class="hint" data-testid="contact-masked">
                Liên hệ được ẩn bớt theo quyền của bạn.
              </p>
            }
          </section>
        </div>
      </div>

      <ng-template #orderTable let-orders>
        <div class="table-wrap">
          <table class="table table--cards">
            <thead>
              <tr>
                <th>Đơn</th>
                <th>Ngày đặt</th>
                <th>Thanh toán</th>
                <th>Trạng thái</th>
                <th class="num">Tổng</th>
              </tr>
            </thead>
            <tbody>
              @for (order of orders; track order.id) {
                <tr>
                  <td>
                    <a class="cell-title mono" [routerLink]="['/admin/orders', order.id]"
                      >#{{ order.id }}</a
                    >
                  </td>
                  <td class="secondary" data-label="Ngày đặt">
                    {{ order.placedAt | admDateTime }}
                  </td>
                  <td data-label="Thanh toán">
                    <adm-badge [spec]="paymentBadge(paymentState(order))" />
                  </td>
                  <td data-label="Trạng thái">
                    <adm-badge [spec]="statusBadge(order)" />
                  </td>
                  <td class="num" data-label="Tổng">{{ order.total | admMoney }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </ng-template>
    } @else if (error()) {
      <adm-page-header heading="Khách hàng" back="/admin/customers" />
      <adm-empty kind="error" heading="Không tải được khách hàng" [description]="error()">
        <button type="button" class="adm-btn" (click)="load()">Thử lại</button>
      </adm-empty>
    } @else {
      <adm-page-header heading="Đang tải…" back="/admin/customers" />
      <div class="columns">
        <div class="col-main stack">
          <div class="sk sk--title"></div>
          <div class="sk"></div>
          <div class="sk"></div>
        </div>
      </div>
    }
  `,
  styles: `
    .kpis {
      margin-bottom: 8px;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    }
    .kpis > div {
      padding: 4px 16px 20px;
    }
    .kpis > div:first-child {
      padding-left: 0;
    }
    .kpi-value {
      font-size: 22px;
    }
    .kpi-small {
      font-size: 16px;
    }
    .hint {
      margin-bottom: 24px;
    }
    .addresses {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 12px;
    }
    .addresses li {
      padding: 14px 16px;
      border: 1px solid var(--adm-divider);
      border-radius: var(--adm-radius-lg);
      display: grid;
      gap: 2px;
    }
    .addresses .chip {
      height: 22px;
      margin-left: 6px;
      font-size: 11px;
    }
  `,
})
export class CustomerDetailPage {
  private readonly api = inject(ADMIN_CUSTOMER_ACCOUNTS_API);
  private readonly dialogs = inject(AdminDialogs);
  private readonly toast = inject(AdminToastService);
  protected readonly id = routeParam('id');
  protected readonly canEdit = inject(AdminSession).can('customers.edit');
  protected readonly tierBadge = tierBadge;
  protected readonly statusBadge = statusBadge;
  protected readonly paymentBadge = paymentBadge;
  protected readonly paymentState = paymentState;

  protected readonly customer = signal<CustomerDetail | null>(null);
  protected readonly error = signal('');
  /** Staff only: the paged list of every order, opened by "Xem tất cả đơn". */
  protected readonly allOrders = signal<{
    items: DeskOrderSummary[];
    total: number;
    page: number;
    limit: number;
  } | null>(null);
  protected readonly ordersLoading = signal(false);
  protected readonly ordersError = signal('');
  protected readonly ordersPage = signal(1);

  constructor() {
    effect(() => {
      if (this.id()) this.load();
    });
  }

  load(): void {
    const id = this.id();
    if (!id) return;
    this.error.set('');
    this.api.get(id).subscribe({
      next: (customer) => this.customer.set(customer),
      error: (error: unknown) => this.error.set(errorMessage(error)),
    });
  }

  showAllOrders(): void {
    this.loadOrders(1);
    setTimeout(() => document.getElementById('all-orders')?.scrollIntoView?.({ block: 'start' }));
  }

  loadOrders(page: number): void {
    const id = this.id();
    if (!id) return;
    this.ordersPage.set(page);
    this.ordersError.set('');
    this.ordersLoading.set(true);
    this.api.orders(id, page, ORDER_PAGE_SIZE).subscribe({
      next: (result) => {
        this.ordersLoading.set(false);
        this.allOrders.set(result);
      },
      error: (error: unknown) => {
        this.ordersLoading.set(false);
        this.ordersError.set(errorMessage(error));
      },
    });
  }

  toggleLock(customer: CustomerDetail): void {
    const id = customer.id;
    const locking = customer.status !== 'blocked';
    const data: ReasonDialogData<CustomerDetail> = locking
      ? {
          title: `Khóa tài khoản ${customer.name}?`,
          message:
            'Khách không đăng nhập được cho đến khi bạn mở khoá. Đơn đang xử lý không bị ảnh hưởng.',
          confirmLabel: 'Khóa tài khoản',
          danger: true,
          required: true,
          run: (reason) => this.api.lock(id, reason),
        }
      : {
          title: `Mở khóa tài khoản ${customer.name}?`,
          message: 'Khách đăng nhập lại được như bình thường. Các phiên cũ không được khôi phục.',
          confirmLabel: 'Mở khóa tài khoản',
          required: false,
          run: (reason) => this.api.unlock(id, reason || undefined),
        };
    this.dialogs
      .modal<ReasonDialogData<CustomerDetail>, CustomerDetail>(ReasonDialog, data)
      .closed.subscribe((updated) => {
        if (!updated) return;
        // The reply of a write is the admin shape; a customer read as staff never gets here.
        this.customer.set({ ...customer, ...updated });
        this.toast.show(locking ? 'Đã khóa tài khoản' : 'Đã mở khóa tài khoản');
      });
  }
}
