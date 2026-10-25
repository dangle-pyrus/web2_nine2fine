import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { of } from 'rxjs';
import { AdminSession } from '../../core/admin-session';
import { maskEmail } from '../../core/format';
import { DatePipe, MoneyPipe, NumPipe, PhonePipe } from '../../core/format.pipes';
import { tierBadge } from '../../core/status';
import { ADMIN_CUSTOMERS_API } from '../../data-access/admin-apis';
import { errorMessage } from '../../data-access/http-support';
import type { AdminCustomerSummary, CustomerQuery, CustomerTier } from '../../data-access/models';
import { AdmBadge } from '../../ui/badge';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { AdminDialogs } from '../../ui/dialogs';
import { ExportDialog, ExportDialogData, ExportScope } from '../../ui/export-dialog';
import { downloadCsv, fetchAllPages, loader, urlQuery } from '../../ui/list-state';
import { AdmPageHeader } from '../../ui/page-header';
import { AdmPager } from '../../ui/pager';
import { AdmSkeletonRows } from '../../ui/skeleton';
import { AdminToastService } from '../../ui/toast';

const TIERS: { value: CustomerTier; label: string }[] = [
  { value: 'member', label: 'Thành viên' },
  { value: 'silver', label: 'Bạc' },
  { value: 'gold', label: 'Vàng' },
];

/** Customers index (6.5). Contact details are masked for roles without `customers.contact`. */
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
    PhonePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <adm-page-header heading="Khách hàng">
      <ng-container actions>
        @if (canContact) {
          <button
            type="button"
            class="adm-btn adm-btn--lg"
            [disabled]="!page()?.items?.length"
            (click)="exportCsv()"
          >
            <adm-icon name="reiconDownload" [size]="16" /> Xuất CSV
          </button>
        }
      </ng-container>
    </adm-page-header>
    <div class="page-body page-body--wide">
      <nav class="tabs" aria-label="Lọc khách hàng">
        <button
          type="button"
          [class.is-active]="!query().status"
          (click)="list.update({ status: '' })"
        >
          Tất cả
        </button>
        <button
          type="button"
          [class.is-active]="query().status === 'blocked'"
          (click)="list.update({ status: 'blocked' })"
        >
          Đã khóa
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
          [ngModel]="query().sort + ':' + query().dir"
          (ngModelChange)="sort($event)"
        >
          <option value="lastOrderAt:desc">Mua gần đây</option>
          <option value="totalSpent:desc">Chi tiêu cao nhất</option>
          <option value="orderCount:desc">Nhiều đơn nhất</option>
          <option value="name:asc">Tên A–Z</option>
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
          <button type="button" class="link small" (click)="search.set(''); list.reset(['status'])">
            Xóa tất cả
          </button>
        </div>
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
        @if (query().search || query().tier || query().status) {
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
            description="Khách hàng xuất hiện ở đây sau khi đăng ký tài khoản hoặc đặt đơn đầu tiên."
          />
        }
      } @else {
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
                      <div>
                        {{ canContact ? customer.email : maskEmail(customer.email) }}
                      </div>
                      <div class="cell-sub">
                        {{ customer.phone | admPhone: !canContact }}
                      </div>
                    </td>
                    <td data-label="Hạng">
                      <adm-badge [spec]="tierBadge(customer.tier)" />
                    </td>
                    <td class="num" data-label="Số đơn">
                      {{ customer.orderCount | admNum }}
                    </td>
                    <td class="num" data-label="Đã chi">
                      {{ customer.totalSpent | admMoney }}
                    </td>
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
            [pageSize]="data.pageSize"
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
  private readonly api = inject(ADMIN_CUSTOMERS_API);
  private readonly router = inject(Router);
  private readonly dialogs = inject(AdminDialogs);
  private readonly toast = inject(AdminToastService);
  protected readonly canContact = inject(AdminSession).can('customers.contact');
  protected readonly tiers = TIERS;
  protected readonly tierBadge = tierBadge;
  protected readonly maskEmail = maskEmail;
  protected readonly list = urlQuery<CustomerQuery>({
    tier: '',
    status: '',
    sort: 'lastOrderAt',
    dir: 'desc',
  });
  protected readonly query = this.list.query;
  protected readonly view = loader(this.query, (query) => this.api.list(query));
  protected readonly page = this.view.data;
  protected readonly search = signal(this.query().search);

  initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return ((parts.at(-2)?.[0] ?? '') + (parts.at(-1)?.[0] ?? '')).toUpperCase();
  }

  sort(value: string): void {
    const [sort, dir] = value.split(':') as [string, 'asc' | 'desc'];
    this.list.update({ sort, dir });
  }

  open(customer: AdminCustomerSummary, event: MouseEvent): void {
    if ((event.target as HTMLElement).closest('a, button, input')) return;
    void this.router.navigate(['/admin/customers', customer.id]);
  }

  exportCsv(): void {
    const page = this.page();
    if (!page) return;
    this.dialogs
      .modal<ExportDialogData, ExportScope>(ExportDialog, {
        noun: 'khách hàng',
        pageCount: page.items.length,
        total: page.total,
      })
      .closed.subscribe((scope) => {
        if (!scope) return;
        const rows =
          scope === 'page'
            ? of(page.items)
            : fetchAllPages((index, pageSize) =>
                this.api.list({ ...this.query(), page: index, pageSize }),
              );
        rows.subscribe({
          next: (items) => {
            downloadCsv(
              `khach-hang-${new Date().toISOString().slice(0, 10)}.csv`,
              ['Tên', 'Email', 'Điện thoại', 'Hạng', 'Số đơn', 'Đã chi', 'Đơn gần nhất'],
              items.map((c) => [
                c.name,
                c.email,
                c.phone,
                tierBadge(c.tier).label,
                c.orderCount,
                c.totalSpent,
                c.lastOrderAt ?? '',
              ]),
            );
            this.toast.show(`Đã xuất ${items.length} khách hàng`);
          },
          error: (error: unknown) => this.toast.error(errorMessage(error)),
        });
      });
  }
}
