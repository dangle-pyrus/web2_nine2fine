import { DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { debounceTime, distinctUntilChanged, map } from 'rxjs';
import { DateTimePipe, MoneyPipe, NumPipe } from '../../core/format.pipes';
import type { BadgeSpec } from '../../core/status';
import {
  ADMIN_RETURN_DESK_API,
  AdminReturnQuery,
  AdminReturnSort,
  AdminReturnState,
  AdminReturnTab,
  RETURN_DEFAULT_LIMIT,
  RETURN_LIMITS,
  RETURN_MAX_SEARCH,
  RETURN_REASON_LABELS,
  RETURN_SORTS,
  RETURN_SOURCE_LABELS,
  RETURN_STATE_LABELS,
  RETURN_TABS,
  returnDeskErrorMessage,
} from '../../data-access/returns-api';
import { AdmBadge } from '../../ui/badge';
import { AdminDialogs } from '../../ui/dialogs';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { loader } from '../../ui/list-state';
import { AdmPageHeader } from '../../ui/page-header';
import { AdmPager } from '../../ui/pager';
import { AdmSkeletonRows } from '../../ui/skeleton';
import { ReturnDetailDrawer } from './return-detail-drawer';

const TAB_VALUES = RETURN_TABS.map((tab) => tab.value);
const SORT_VALUES = RETURN_SORTS.map((sort) => sort.value);
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
 * URL. A row opens the request in a drawer (`?return=<id>`), where staff approve, reject, receive and
 * (admin) confirm the refund.
 */
@Component({
  selector: 'adm-return-desk-list-page',
  imports: [
    FormsModule,
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
          @for (option of sorts; track option.value) {
            <option [value]="option.value">{{ option.label }}</option>
          }
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
          <table class="table table--cards table--orders">
            <thead>
              <tr>
                <th>Đơn</th>
                <th>Gửi lúc</th>
                <th>Người nhận</th>
                <th>Lý do</th>
                <th>Trạng thái</th>
                <th>Xử lý gần nhất</th>
                <th class="num">Số SP</th>
                <th class="num">Số tiền</th>
              </tr>
            </thead>
            @if (view.state().loading) {
              <tbody [admSkeleton]="8" [columns]="8"></tbody>
            } @else {
              <tbody>
                @for (row of page()?.items ?? []; track row.id) {
                  <tr class="is-clickable" (click)="open(row.id)">
                    <td>
                      <a
                        class="cell-title mono"
                        [href]="'/admin/returns?return=' + row.id"
                        (click)="$event.preventDefault()"
                        >#{{ row.orderCode }}</a
                      >
                    </td>
                    <td data-label="Gửi lúc" class="secondary">
                      {{ row.requestedAt | admDateTime }}
                    </td>
                    <td data-label="Người nhận">
                      {{ row.recipientName }}
                      @if (row.source) {
                        <div class="cell-sub" data-testid="return-source">
                          {{ sourceLabels[row.source] }}
                        </div>
                      }
                    </td>
                    <td data-label="Lý do">
                      {{ reasons[row.reason] }}
                      <div class="cell-sub">
                        {{ row.fault === 'shop' ? 'Lỗi của shop' : 'Lỗi của khách' }}
                      </div>
                    </td>
                    <td>
                      <adm-badge [spec]="badge(row.state)" />
                      @if (row.overdue) {
                        <!-- ADM-RET-02: a warning only; nothing is approved or rejected by itself. -->
                        <div class="cell-sub">
                          <span
                            class="chip chip--static"
                            data-testid="return-overdue"
                            title="Chờ duyệt quá 24 giờ"
                            >Quá hạn xử lý</span
                          >
                        </div>
                      }
                    </td>
                    <td data-label="Xử lý" class="secondary" data-testid="return-handled">
                      @if (row.handledBy) {
                        {{ row.handledBy.name }}
                        <div class="cell-sub">
                          {{ row.handledBy.role === 'admin' ? 'Quản trị viên' : 'Nhân viên' }}
                          @if (row.handledAt) {
                            · {{ row.handledAt | admDateTime }}
                          }
                        </div>
                      } @else {
                        —
                      }
                    </td>
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
  private readonly dialogs = inject(AdminDialogs);
  private drawerRef: DialogRef<boolean> | null = null;

  protected readonly tabs = RETURN_TABS;
  protected readonly sorts = RETURN_SORTS;
  protected readonly limits = RETURN_LIMITS;
  protected readonly maxSearch = RETURN_MAX_SEARCH;
  protected readonly reasons = RETURN_REASON_LABELS;
  protected readonly sourceLabels = RETURN_SOURCE_LABELS;

  protected readonly query = toSignal(
    this.route.queryParamMap.pipe(
      map((params): AdminReturnQuery => {
        const state = params.get('state') as AdminReturnTab;
        const limit = Number(params.get('limit'));
        return {
          state: TAB_VALUES.includes(state) ? state : 'all',
          q: params.get('q') ?? '',
          sort: SORT_VALUES.includes(params.get('sort') as AdminReturnSort)
            ? (params.get('sort') as AdminReturnSort)
            : 'requestedAt',
          page: Math.max(1, Math.floor(Number(params.get('page'))) || 1),
          limit: limit === 50 ? 50 : RETURN_DEFAULT_LIMIT,
        };
      }),
    ),
    { requireSync: true },
  );
  /** `?return=<id>`: the drawer is open on that request (old `/admin/returns/<id>` links land here). */
  private readonly openId = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('return') ?? '')),
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
    toObservable(this.openId)
      .pipe(takeUntilDestroyed())
      .subscribe((id) => (id ? this.showDrawer(id) : this.drawerRef?.close()));
    inject(DestroyRef).onDestroy(() => this.drawerRef?.close());
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
        return: this.openId() || null,
        sort: next.sort === 'requestedAt' ? null : next.sort,
        page: next.page === 1 ? null : next.page,
        limit: next.limit === RETURN_DEFAULT_LIMIT ? null : next.limit,
      },
    });
  }

  open(id: string): void {
    this.setOpen(id);
  }

  private setOpen(id: string | null): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { return: id },
      queryParamsHandling: 'merge',
    });
  }

  private showDrawer(id: string): void {
    if (this.drawerRef) return;
    const ref = this.dialogs.drawer<{ id: string }, boolean>(ReturnDetailDrawer, { id }, true);
    this.drawerRef = ref;
    ref.closed.subscribe((changed) => {
      this.drawerRef = null;
      if (changed) this.view.reload();
      if (this.openId()) this.setOpen(null);
    });
  }

  clearSearch(allTabs = false): void {
    this.search.set('');
    this.update(allTabs ? { q: '', state: 'all' } : { q: '' });
  }
}
