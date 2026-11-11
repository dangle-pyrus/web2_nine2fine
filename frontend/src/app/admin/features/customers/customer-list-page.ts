import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DatePipe, MoneyPipe, NumPipe } from '../../core/format.pipes';
import { tierBadge } from '../../core/status';
import { ADMIN_CUSTOMER_ACCOUNTS_API } from '../../data-access/customers-api';
import type { PageQuery } from '../../data-access/models';
import type {
  CustomerRow,
  CustomerSort,
  CustomerView,
  UserTier,
} from '../../data-access/users-models';
import { AdmBadge } from '../../ui/badge';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { loader, urlQuery } from '../../ui/list-state';
import { AdmPageHeader } from '../../ui/page-header';
import { AdmPager } from '../../ui/pager';
import { AdmSkeletonRows } from '../../ui/skeleton';

const TIERS: { value: UserTier; label: string }[] = [
  { value: 'bronze', label: 'Đồng' },
  { value: 'silver', label: 'Bạc' },
  { value: 'gold', label: 'Vàng' },
];
const SORTS: CustomerSort[] = ['lastOrderAt', 'totalSpent', 'orderCount', 'name'];
/** The contract caps `limit` at 50. */
const PAGE_SIZES = [20, 50] as const;
const SEARCH_MAX = 100;

interface CustomerUrlQuery extends PageQuery {
  view: CustomerView;
  tier: UserTier | '';
}

/**
 * Customers index (BR-USR-08, 09, 11; AC-USR-11..14). The server filters, sorts, pages and masks
 * contact details for staff; this page only shows what it receives.
 */
@Component({
  selector: 'adm-customer-list-page',
  imports: [
    FormsModule,
    RouterLink,
    AdmPageHeader,
    AdmBadge,
    AdmIcon,
    AdmPager,
    AdmSkeletonRows,
    AdmEmptyState,
    MoneyPipe,
    NumPipe,
    DatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <adm-page-header heading="Khách hàng" />
    <div class="page-body page-body--wide">
      <nav class="tabs" aria-label="Lọc khách hàng">
        <button
          type="button"
          [class.is-active]="query().view === 'all'"
          (click)="list.update({ view: 'all' })"
        >
          Tất cả
          @if (counts(); as c) {
            <span class="tab-count">{{ c.all | admNum }}</span>
          }
        </button>
        <button
          type="button"
          [class.is-active]="query().view === 'blocked'"
          (click)="list.update({ view: 'blocked' })"
        >
          Đã khóa
          @if (counts(); as c) {
            <span class="tab-count">{{ c.blocked | admNum }}</span>
          }
        </button>
      </nav>
      <form class="toolbar" role="search" (ngSubmit)="list.update({ search: search().trim() })">
        <div class="affix search">
          <span class="prefix-icon"><adm-icon name="reiconSearch" [size]="16" /></span>
          <input
            class="input input--sm"
            type="search"
            name="search"
            placeholder="Tên, email hoặc số điện thoại"
            aria-label="Tìm khách hàng"
            [maxLength]="searchMax"
            [ngModel]="search()"
            (ngModelChange)="search.set($event)"
          />
        </div>
        <select
          class="select select--sm"
          name="tier"
          aria-label="Lọc theo hạng"
          [ngModel]="query().tier"
          (ngModelChange)="list.update({ tier: $event })"
        >
          <option value="">Hạng: tất cả</option>
          @for (item of tiers; track item.value) {
            <option [value]="item.value">{{ item.label }}</option>
          }
        </select>
        <select
          class="select select--sm"
          name="sort"
          aria-label="Sắp xếp"
          [ngModel]="query().sort"
          (ngModelChange)="list.update({ sort: $event })"
        >
          <option value="lastOrderAt">Mua gần đây</option>
          <option value="totalSpent">Chi tiêu cao nhất</option>
          <option value="orderCount">Nhiều đơn nhất</option>
          <option value="name">Tên A–Z</option>
        </select>
      </form>
      @if (query().search || query().tier) {
        <div class="chips filter-chips">
          @if (query().search) {
            <span class="chip"
              >Tìm: “{{ query().search }}”<button
                type="button"
                aria-label="Bỏ từ khóa"
                (click)="search.set(''); list.update({ search: '' })"
              >
                <adm-icon name="reiconX" [size]="12" /></button
            ></span>
          }
          @if (query().tier) {
            <span class="chip"
              >Hạng: {{ tierBadge($any(query().tier)).label
              }}<button type="button" aria-label="Bỏ lọc hạng" (click)="list.update({ tier: '' })">
                <adm-icon name="reiconX" [size]="12" /></button
            ></span>
          }
          <button type="button" class="link small" (click)="search.set(''); list.reset(['view'])">
            Xóa tất cả
          </button>
        </div>
      }
      @if (masked()) {
        <p class="hint" data-testid="contact-masked">Liên hệ được ẩn bớt theo quyền của bạn.</p>
      }

      @if (view.state().error && !page()) {
        <adm-empty
          kind="error"
          heading="Không tải được danh sách khách hàng"
          [description]="view.state().error ?? ''"
        >
          <button type="button" class="adm-btn" (click)="view.reload()">Thử lại</button>
        </adm-empty>
      } @else if (page() && !page()!.total) {
        @if (query().search || query().tier || query().view !== 'all') {
          <adm-empty
            heading="Không tìm thấy khách hàng phù hợp"
            description="Thử từ khóa khác hoặc bỏ bớt bộ lọc."
          >
            <button type="button" class="adm-btn" (click)="search.set(''); list.reset()">
              Xóa bộ lọc
            </button>
          </adm-empty>
        } @else {
          <adm-empty
            kind="first"
            image="/assets/illustrations/walk_in_the_city.svg"
            heading="Chưa có khách hàng"
            description="Khách hàng xuất hiện ở đây sau khi đăng ký tài khoản."
          />
        }
      } @else {
        @if (view.state().error) {
          <p class="error" role="alert">{{ view.state().error }}</p>
        }
        <div class="table-wrap" [class.is-refreshing]="view.state().refreshing">
          <table class="table table--cards">
            <thead>
              <tr>
                <th>Khách hàng</th>
                <th>Liên hệ</th>
                <th>Hạng</th>
                <th class="num">Số đơn</th>
                <th class="num">Đã chi</th>
                <th>Đơn gần nhất</th>
              </tr>
            </thead>
            @if (view.state().loading) {
              <tbody [admSkeleton]="10" [columns]="6"></tbody>
            } @else {
              <tbody>
                @for (customer of page()?.items ?? []; track customer.id) {
                  <tr class="clickable" (click)="open(customer, $event)">
                    <td>
                      <div class="cell-media">
                        <span class="avatar" aria-hidden="true">{{ initials(customer.name) }}</span>
                        <div>
                          <a class="cell-title" [routerLink]="['/admin/customers', customer.id]">{{
                            customer.name
                          }}</a>
                          @if (customer.status === 'blocked') {
                            <div class="cell-sub danger-text">Đã khóa</div>
                          }
                        </div>
                      </div>
                    </td>
                    <td data-label="Liên hệ">
                      <div>{{ customer.email }}</div>
                      <div class="cell-sub">{{ customer.phone ?? '—' }}</div>
                    </td>
                    <td data-label="Hạng">
                      <adm-badge [spec]="tierBadge(customer.tier)" />
                    </td>
                    <td class="num" data-label="Số đơn">{{ customer.orderCount | admNum }}</td>
                    <td class="num" data-label="Đã chi">{{ customer.totalSpent | admMoney }}</td>
                    <td class="secondary" data-label="Đơn gần nhất">
                      {{ customer.lastOrderAt ? (customer.lastOrderAt | admDate) : '—' }}
                    </td>
                  </tr>
                }
              </tbody>
            }
          </table>
        </div>
        @if (page(); as data) {
          <adm-pager
            [total]="data.total"
            [page]="data.page"
            [pageSize]="data.limit"
            [sizes]="pageSizes"
            (pageChange)="list.update({ page: $event })"
            (sizeChange)="list.update({ pageSize: $event })"
          />
        }
      }
    </div>
  `,
  styles: `
    .danger-text {
      color: var(--adm-danger);
    }
    .tab-count {
      margin-left: 4px;
      color: var(--adm-text-tertiary);
    }
    .avatar {
      flex-shrink: 0;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--adm-muted);
      font-size: 12px;
      font-weight: 600;
      color: var(--adm-text-secondary);
    }
  `,
})
export class CustomerListPage {
  private readonly api = inject(ADMIN_CUSTOMER_ACCOUNTS_API);
  private readonly router = inject(Router);
  protected readonly tiers = TIERS;
  protected readonly tierBadge = tierBadge;
  protected readonly pageSizes = PAGE_SIZES;
  protected readonly searchMax = SEARCH_MAX;
  protected readonly list = urlQuery<CustomerUrlQuery>({
    view: 'all',
    tier: '',
    sort: 'lastOrderAt',
    pageSize: PAGE_SIZES[0],
  });
  /** URL values are untrusted: a lost or odd one falls back to the default so no request is invalid. */
  protected readonly query = computed(() => {
    const value = this.list.query();
    return {
      ...value,
      view: value.view === 'blocked' ? ('blocked' as const) : ('all' as const),
      tier: TIERS.some((item) => item.value === value.tier) ? value.tier : ('' as const),
      sort: SORTS.includes(value.sort as CustomerSort) ? value.sort : 'lastOrderAt',
      search: value.search.slice(0, SEARCH_MAX),
      pageSize: value.pageSize > 50 ? 50 : value.pageSize,
    };
  });
  protected readonly view = loader(this.query, (query) =>
    this.api.list({
      q: query.search,
      view: query.view,
      tier: query.tier,
      sort: query.sort as CustomerSort,
      page: query.page,
      limit: query.pageSize,
    }),
  );
  protected readonly page = this.view.data;
  protected readonly counts = computed(() => this.page()?.counts ?? null);
  protected readonly masked = computed(() => !!this.page()?.items.some((c) => c.contactMasked));
  protected readonly search = signal(this.query().search);

  initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return ((parts.at(-2)?.[0] ?? '') + (parts.at(-1)?.[0] ?? '')).toUpperCase();
  }

  open(customer: CustomerRow, event: MouseEvent): void {
    if ((event.target as HTMLElement).closest('a, button, input')) return;
    void this.router.navigate(['/admin/customers', customer.id]);
  }
}
