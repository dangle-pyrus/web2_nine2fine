import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DateTimePipe, MoneyPipe, NumPipe } from '../../core/format.pipes';
import { RETURN_REASONS, returnBadge } from '../../core/status';
import { ADMIN_RETURNS_API } from '../../data-access/admin-apis';
import type { ReturnQuery, ReturnSummary } from '../../data-access/models';
import { AdmBadge } from '../../ui/badge';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { loader, urlQuery } from '../../ui/list-state';
import { AdmPageHeader } from '../../ui/page-header';
import { AdmPager } from '../../ui/pager';
import { AdmSkeletonRows } from '../../ui/skeleton';

const STATES: { value: ReturnQuery['state']; label: string }[] = [
  { value: '', label: 'Tất cả' },
  { value: 'pending', label: 'Chờ duyệt' },
  { value: 'approved', label: 'Chờ nhận hàng' },
  { value: 'completed', label: 'Đã hoàn tiền' },
  { value: 'rejected', label: 'Đã từ chối' },
];

/**
 * Return requests (6.6). Requests start from the shopper's order, so each row opens the original
 * order where staff approve, reject and refund. The reason column helps spot sizing problems.
 */
@Component({
  selector: 'adm-return-list-page',
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
    DateTimePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <adm-page-header heading="Trả hàng">
      <p subtitle class="secondary small">
        Yêu cầu được tạo từ đơn hàng của khách. Mở đơn gốc để duyệt và hoàn tiền.
      </p>
    </adm-page-header>
    <div class="page-body page-body--wide">
      <nav class="tabs" aria-label="Trạng thái trả hàng">
        @for (item of states; track item.value) {
          <button
            type="button"
            [class.is-active]="query().state === item.value"
            (click)="list.update({ state: item.value })"
          >
            {{ item.label }}
          </button>
        }
      </nav>
      <form class="toolbar" role="search" (ngSubmit)="list.update({ search: search().trim() })">
        <div class="affix search">
          <span class="prefix-icon"><adm-icon name="reiconSearch" [size]="16" /></span>
          <input
            class="input input--sm"
            type="search"
            name="search"
            placeholder="Mã đơn hoặc tên khách"
            aria-label="Tìm yêu cầu trả hàng"
            [ngModel]="search()"
            (ngModelChange)="search.set($event)"
          />
        </div>
      </form>
      @if (view.state().error && !page()) {
        <adm-empty
          kind="error"
          heading="Không tải được danh sách trả hàng"
          [description]="view.state().error ?? ''"
        >
          <button type="button" class="adm-btn" (click)="view.reload()">Thử lại</button>
        </adm-empty>
      } @else if (page() && !page()!.total) {
        @if (query().state || query().search) {
          <adm-empty
            heading="Không có yêu cầu phù hợp"
            description="Thử chọn trạng thái khác hoặc bỏ từ khóa."
          >
            <button type="button" class="adm-btn" (click)="search.set(''); list.reset()">
              Xóa bộ lọc
            </button>
          </adm-empty>
        } @else {
          <adm-empty
            kind="first"
            image="/assets/illustrations/walk_in_the_city.svg"
            heading="Chưa có yêu cầu trả hàng"
            description="Khi khách gửi yêu cầu trả hàng từ trang đơn hàng của họ, yêu cầu sẽ hiện ở đây."
          />
        }
      } @else {
        <div class="table-wrap" [class.is-refreshing]="view.state().refreshing">
          <table class="table table--cards">
            <thead>
              <tr>
                <th>Đơn gốc</th>
                <th>Ngày yêu cầu</th>
                <th>Khách hàng</th>
                <th>Lý do</th>
                <th>Trạng thái</th>
                <th class="num">Số SP</th>
                <th class="num">Giá trị</th>
              </tr>
            </thead>
            @if (view.state().loading) {
              <tbody [admSkeleton]="6" [columns]="7"></tbody>
            } @else {
              <tbody>
                @for (item of page()?.items ?? []; track item.orderId) {
                  <tr class="clickable" (click)="open(item)">
                    <td>
                      <a class="cell-title mono" [routerLink]="['/admin/orders', item.orderId]"
                        >#{{ item.orderId }}</a
                      >
                    </td>
                    <td class="secondary" data-label="Ngày">
                      {{ item.requestedAt | admDateTime }}
                    </td>
                    <td data-label="Khách">{{ item.customerName }}</td>
                    <td data-label="Lý do">{{ reasons[item.reason] }}</td>
                    <td><adm-badge [spec]="badge(item.state)" /></td>
                    <td class="num hide-sm">{{ item.itemCount | admNum }}</td>
                    <td class="num" data-label="Giá trị">{{ item.amount | admMoney }}</td>
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
})
export class ReturnListPage {
  private readonly api = inject(ADMIN_RETURNS_API);
  private readonly router = inject(Router);
  protected readonly states = STATES;
  protected readonly reasons = RETURN_REASONS;
  protected readonly badge = returnBadge;
  protected readonly list = urlQuery<ReturnQuery>({ state: '', sort: 'requestedAt' });
  protected readonly query = this.list.query;
  protected readonly view = loader(this.query, (query) => this.api.list(query));
  protected readonly page = this.view.data;
  protected readonly search = signal(this.query().search);

  open(item: ReturnSummary): void {
    void this.router.navigate(['/admin/orders', item.orderId]);
  }
}
