import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, map } from 'rxjs';
import { DateTimePipe, MoneyPipe, NumPipe } from '../../core/format.pipes';
import type { BadgeSpec } from '../../core/status';
import {
  ADMIN_RETURN_DESK_API,
  AdminReturnQuery,
  AdminReturnState,
  AdminReturnTab,
  RETURN_DEFAULT_LIMIT,
  RETURN_LIMITS,
  RETURN_MAX_SEARCH,
  RETURN_REASON_LABELS,
  RETURN_STATE_LABELS,
  RETURN_TABS,
  returnDeskErrorMessage,
} from '../../data-access/returns-api';
import { AdmBadge } from '../../ui/badge';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { loader } from '../../ui/list-state';
import { AdmPageHeader } from '../../ui/page-header';
import { AdmPager } from '../../ui/pager';
import { AdmSkeletonRows } from '../../ui/skeleton';

const TAB_VALUES = RETURN_TABS.map((tab) => tab.value);
const TONES: Record<AdminReturnState, BadgeSpec['tone']> = {
  requested: 'warning',
  approved: 'info',
  received: 'warning',
  refunded: 'success',
  rejected: 'neutral',
  cancelled: 'neutral',
};

/**
 * `/admin/returns` (Slice 9, BR-RET-31, 42): tabs with counts, search, sort, page + limit, all in the
 * URL. A row opens the request, where staff approve, reject, receive and (admin) confirm the refund.
 */
@Component({
  selector: 'adm-return-desk-list-page',
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
    <adm-page-header heading="Trả hàng" />
    <div class="page-body page-body--wide">
      <nav class="tabs" aria-label="Trạng thái trả hàng">
        @for (item of tabs; track item.value) {
          <button
            type="button"
            [class.is-active]="query().state === item.value"
            [attr.aria-current]="query().state === item.value ? 'page' : null"
            [attr.data-tab]="item.value"
            (click)="update({ state: item.value })"
          >
            {{ item.label }}
            @if (counts(); as numbers) {
              <span class="count" [attr.data-count]="item.value">{{
                numbers[item.value] | admNum
              }}</span>
            }
          </button>
        }
      </nav>
      <form class="toolbar" role="search" (submit)="$event.preventDefault()">
        <div class="affix search">
          <span class="prefix-icon"><adm-icon name="reiconSearch" [size]="16" /></span>
          <input
            class="input input--sm"
            type="search"
            name="q"
            placeholder="Mã đơn, tên người nhận, SĐT"
            aria-label="Tìm yêu cầu trả hàng"
            [attr.maxlength]="maxSearch"
            [ngModel]="search()"
            (ngModelChange)="search.set($event)"
          />
        </div>
        <select
          class="select select--sm"
          name="sort"
          aria-label="Sắp xếp"
          [ngModel]="query().sort"
          (ngModelChange)="update({ sort: $event })"
        >
          <option value="requestedAt">Mới nhất trước</option>
          <option value="amount">Số tiền giảm dần</option>
        </select>
        @if (query().q) {
          <button type="button" class="link small" (click)="clearSearch()">Xóa tìm kiếm</button>
        }
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
        @if (query().q || query().state !== 'all') {
          <adm-empty
            heading="Không có yêu cầu phù hợp"
            description="Thử đổi từ khóa hoặc chuyển tab."
          >
            <button type="button" class="adm-btn" (click)="clearSearch(true)">Xóa bộ lọc</button>
          </adm-empty>
        } @else {
          <adm-empty
            heading="Chưa có yêu cầu trả hàng"
            description="Yêu cầu khách gửi từ đơn đã giao sẽ hiện ở đây."
          />
        }
      } @else if (page() && !page()!.items.length) {
        <adm-empty
          heading="Trang này không có yêu cầu"
          description="Số trang vượt quá số yêu cầu hiện có."
        >
          <button type="button" class="adm-btn" (click)="update({ page: 1 })">Về trang đầu</button>
        </adm-empty>
      } @else {
        <div class="table-wrap" [class.is-refreshing]="view.state().refreshing" aria-live="polite">
          <table class="table table--cards">
            <thead>
              <tr>
                <th>Đơn</th>
                <th>Gửi lúc</th>
                <th>Người nhận</th>
                <th>Lý do</th>
                <th>Trạng thái</th>
                <th class="num">Số SP</th>
                <th class="num">Số tiền</th>
              </tr>
            </thead>
            @if (view.state().loading) {
              <tbody [admSkeleton]="8" [columns]="7"></tbody>
            } @else {
              <tbody>
                @for (row of page()?.items ?? []; track row.id) {
                  <tr>
                    <td>
                      <a class="cell-title mono" [routerLink]="['/admin/returns', row.id]"
                        >#{{ row.orderCode }}</a
                      >
                      @if (row.overdue) {
                        <div class="cell-sub">
                          <span class="chip chip--static">Quá hạn xử lý</span>
                        </div>
                      }
                    </td>
                    <td data-label="Gửi lúc" class="secondary">
                      {{ row.requestedAt | admDateTime }}
                    </td>
                    <td data-label="Người nhận">{{ row.recipientName }}</td>
                    <td data-label="Lý do">
                      {{ reasons[row.reason] }}
                      <div class="cell-sub">
                        {{ row.fault === 'shop' ? 'Lỗi của shop' : 'Lỗi của khách' }}
                      </div>
                    </td>
                    <td><adm-badge [spec]="badge(row.state)" /></td>
                    <td class="num hide-sm">{{ row.itemCount | admNum }}</td>
                    <td class="num" data-label="Số tiền">{{ row.amount | admMoney }}</td>
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
            [sizes]="limits"
            (pageChange)="update({ page: $event })"
            (sizeChange)="update({ limit: $event })"
          />
        }
      }
    </div>
  `,
})
export class ReturnDeskListPage {
  private readonly api = inject(ADMIN_RETURN_DESK_API);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly tabs = RETURN_TABS;
  protected readonly limits = RETURN_LIMITS;
  protected readonly maxSearch = RETURN_MAX_SEARCH;
  protected readonly reasons = RETURN_REASON_LABELS;

  protected readonly query = toSignal(
    this.route.queryParamMap.pipe(
      map((params): AdminReturnQuery => {
        const state = params.get('state') as AdminReturnTab;
        const limit = Number(params.get('limit'));
        return {
          state: TAB_VALUES.includes(state) ? state : 'all',
          q: params.get('q') ?? '',
          sort: params.get('sort') === 'amount' ? 'amount' : 'requestedAt',
          page: Math.max(1, Math.floor(Number(params.get('page'))) || 1),
          limit: limit === 50 ? 50 : RETURN_DEFAULT_LIMIT,
        };
      }),
    ),
    { requireSync: true },
  );
  protected readonly view = loader(
    this.query,
    (query) => this.api.list(query),
    returnDeskErrorMessage,
  );
  protected readonly page = this.view.data;
  protected readonly counts = computed(() => this.page()?.counts ?? null);
  protected readonly search = signal(this.query().q);

  constructor() {
    toObservable(this.search)
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((value) => {
        const q = value.trim();
        if (q !== this.query().q) this.update({ q });
      });
  }

  protected badge(state: AdminReturnState): BadgeSpec {
    return { label: RETURN_STATE_LABELS[state], tone: TONES[state] };
  }

  update(patch: Partial<AdminReturnQuery>): void {
    const next = { ...this.query(), ...patch };
    if (!('page' in patch)) next.page = 1;
    void this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: {
        state: next.state === 'all' ? null : next.state,
        q: next.q || null,
        sort: next.sort === 'requestedAt' ? null : next.sort,
        page: next.page === 1 ? null : next.page,
        limit: next.limit === RETURN_DEFAULT_LIMIT ? null : next.limit,
      },
    });
  }

  clearSearch(allTabs = false): void {
    this.search.set('');
    this.update(allTabs ? { q: '', state: 'all' } : { q: '' });
  }
}
