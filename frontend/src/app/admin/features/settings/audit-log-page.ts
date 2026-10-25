import { ChangeDetectionStrategy, Component, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DateTimePipe } from '../../core/format.pipes';
import { ADMIN_SETTINGS_API } from '../../data-access/admin-apis';
import type { AuditEntry, AuditQuery } from '../../data-access/models';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { loader, urlQuery } from '../../ui/list-state';
import { AdmPageHeader } from '../../ui/page-header';
import { AdmPager } from '../../ui/pager';
import { AdmSkeletonRows } from '../../ui/skeleton';

const TARGETS: { value: AuditQuery['targetType']; label: string }[] = [
  { value: '', label: 'Mọi đối tượng' },
  { value: 'order', label: 'Đơn hàng' },
  { value: 'product', label: 'Sản phẩm' },
  { value: 'inventory', label: 'Tồn kho' },
  { value: 'customer', label: 'Khách hàng' },
  { value: 'promotion', label: 'Khuyến mãi' },
  { value: 'staff', label: 'Nhân viên' },
  { value: 'settings', label: 'Cài đặt' },
];

const LINKS: Partial<Record<AuditEntry['target']['type'], string>> = {
  order: '/admin/orders',
  product: '/admin/products',
  customer: '/admin/customers',
  promotion: '/admin/promotions',
};

/** Who did what and when (Phụ lục A, settings.audit). Read-only. */
@Component({
  selector: 'adm-audit-log-page',
  imports: [
    FormsModule,
    RouterLink,
    AdmPageHeader,
    AdmIcon,
    AdmPager,
    AdmSkeletonRows,
    AdmEmptyState,
    DateTimePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <adm-page-header heading="Nhật ký hoạt động" back="/admin/settings" />
    <div class="page-body page-body--wide">
      <form class="toolbar" role="search" (ngSubmit)="list.update({ search: search().trim() })">
        <div class="affix search">
          <span class="prefix-icon"><adm-icon name="reiconSearch" [size]="16" /></span>
          <input
            class="input input--sm"
            type="search"
            name="search"
            placeholder="Người thực hiện, thao tác hoặc đối tượng"
            aria-label="Tìm trong nhật ký"
            [ngModel]="search()"
            (ngModelChange)="search.set($event)"
          />
        </div>
        <select
          class="select select--sm"
          name="target"
          aria-label="Lọc theo đối tượng"
          [ngModel]="query().targetType"
          (ngModelChange)="list.update({ targetType: $event })"
        >
          @for (item of targets; track item.value) {
            <option [value]="item.value">{{ item.label }}</option>
          }
        </select>
      </form>

      @if (view.state().error && !page()) {
        <adm-empty
          kind="error"
          heading="Không tải được nhật ký"
          [description]="view.state().error ?? ''"
        >
          <button type="button" class="adm-btn" (click)="view.reload()">Thử lại</button>
        </adm-empty>
      } @else if (page() && !page()!.total) {
        <adm-empty
          heading="Không có hoạt động nào phù hợp"
          description="Thử từ khóa hoặc đối tượng khác."
        >
          <button type="button" class="adm-btn" (click)="search.set(''); list.reset()">
            Xóa bộ lọc
          </button>
        </adm-empty>
      } @else {
        <div class="table-wrap" [class.is-refreshing]="view.state().refreshing">
          <table class="table table--cards">
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Người thực hiện</th>
                <th>Thao tác</th>
                <th>Đối tượng</th>
                <th>Thay đổi</th>
              </tr>
            </thead>
            @if (view.state().loading) {
              <tbody [admSkeleton]="12" [columns]="5"></tbody>
            } @else {
              <tbody>
                @for (entry of page()?.items ?? []; track entry.id) {
                  <tr>
                    <td class="secondary nowrap">{{ entry.at | admDateTime }}</td>
                    <td data-label="Người thực hiện">{{ entry.actor }}</td>
                    <td data-label="Thao tác">{{ entry.action }}</td>
                    <td data-label="Đối tượng">
                      @if (link(entry); as url) {
                        <a class="link" [routerLink]="url">{{ entry.target.label }}</a>
                      } @else {
                        {{ entry.target.label }}
                      }
                    </td>
                    <td class="secondary small" data-label="Thay đổi">
                      @if (entry.before || entry.after) {
                        <span>{{ entry.before ?? '—' }}</span> →
                        <span class="change-after">{{ entry.after ?? '—' }}</span>
                      } @else {
                        —
                      }
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
    .nowrap {
      white-space: nowrap;
    }
    .change-after {
      color: var(--adm-text);
    }
  `,
})
export class AuditLogPage {
  private readonly api = inject(ADMIN_SETTINGS_API);
  protected readonly targets = TARGETS;
  protected readonly list = urlQuery<AuditQuery>({ targetType: '', sort: 'at', dir: 'desc' });
  protected readonly query = this.list.query;
  protected readonly view = loader(this.query, (query) => this.api.audit(query));
  protected readonly page = this.view.data;
  protected readonly search = signal(this.query().search);

  link(entry: AuditEntry): unknown[] | null {
    const base = LINKS[entry.target.type];
    return base
      ? [base, entry.target.id]
      : entry.target.type === 'inventory'
        ? ['/admin/inventory']
        : null;
  }
}
