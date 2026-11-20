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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  EMPTY,
  map,
  Observable,
  of,
  switchMap,
  tap,
} from 'rxjs';
import { DateTimePipe, MoneyPipe, NumPipe } from '../../core/format.pipes';
import {
  DESK_PAYMENT_METHODS,
  DESK_TABS,
  OVERDUE_LABELS,
  paymentState,
  statusBadge,
} from '../../core/order-desk-status';
import { paymentBadge } from '../../core/status';
import { ADMIN_ORDER_DESK_API } from '../../data-access/order-desk-api';
import { AdminSession } from '../../core/admin-session';
import { AdminDialogs } from '../../ui/dialogs';
import { AdminToastService } from '../../ui/toast';
import { errorMessage } from '../../data-access/http-support';
import {
  actionKindOf,
  DeskActionDialog,
  type DeskActionDialogData,
  type DeskActionOutcome,
} from './order-action-dialog';
import {
  BulkShipDialog,
  type BulkShipData,
  type BulkShipResult,
  ExportDialog,
  type ExportDialogData,
  type ExportScope,
} from './order-desk-bulk';
import {
  DESK_DEFAULT_LIMIT,
  DESK_LIMITS,
  DESK_MAX_SEARCH,
  DESK_SORTS,
  type DeskOrderPage,
  type DeskOrderSummary,
  type DeskSort,
  type DeskOrderCounts,
  type DeskOrderQuery,
  type DeskPaymentMethod,
  type DeskAction,
  type DeskBucket,
  type DeskTab,
} from '../../data-access/order-desk-models';
import { AdmBadge } from '../../ui/badge';
import { AdmCopyButton } from '../../ui/copy-button';
import { mediaSrc } from '../content/media-picker';
import { CHANNELS } from '../../data-access/marketplace-demo';
import { OrderDetailDrawer } from './order-detail-drawer';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { DATE_PRESETS, loader, presetRange, Selection } from '../../ui/list-state';
import { AdmPageHeader } from '../../ui/page-header';
import { AdmPager } from '../../ui/pager';
import { AdmSkeletonRows } from '../../ui/skeleton';

const TAB_VALUES = DESK_TABS.map((tab) => tab.value);

/** "Từ ngày" after "Đến ngày": the filter is shown as invalid and no request is made. */
function invalidRange(query: { from: string; to: string }): boolean {
  return !!query.from && !!query.to && query.from > query.to;
}
const SORT_VALUES = DESK_SORTS.map((sort) => sort.value);
/** One-click button of a row: the first step the order's tab waits for (the server still decides). */
const QUICK_ACTIONS: Partial<Record<DeskBucket, { action: DeskAction; label: string }>> = {
  'to-confirm': { action: 'confirm', label: 'Xác nhận' },
  'to-fulfil': { action: 'ship', label: 'Bàn giao' },
  'in-transit': { action: 'deliver', label: 'Giao xong' },
};

/**
 * Orders desk list (Slice 4, BR-ADM-05..08): tabs with counts, search, payment and date filters,
 * page + limit. Everything lives in the URL so a filtered view survives reload and "back".
 */
@Component({
  selector: 'adm-order-desk-list-page',
  imports: [
    FormsModule,
    RouterLink,
    AdmPageHeader,
    AdmBadge,
    AdmCopyButton,
    AdmIcon,
    AdmPager,
    AdmSkeletonRows,
    AdmEmptyState,
    MoneyPipe,
    NumPipe,
    DateTimePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './order-desk-list-page.html',
  styles: `
    .w-platform {
      width: 112px;
    }
    .platform-logo {
      display: block;
      height: 16px;
      width: auto;
      max-width: 96px;
    }
    /* The nine2fine wordmark is solid and wide: smaller so it weighs like the marketplace logos. */
    .platform-logo--website {
      height: 11px;
    }
  `,
})
export class OrderDeskListPage {
  private readonly api = inject(ADMIN_ORDER_DESK_API);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialogs = inject(AdminDialogs);
  private readonly toast = inject(AdminToastService);
  private drawerRef: DialogRef<boolean> | null = null;
  /** ADM-ORD-18: CSV export is admin only. */
  protected readonly canExport = inject(AdminSession).user()?.role === 'admin';
  protected readonly sorts = DESK_SORTS;
  protected readonly presets = DATE_PRESETS;
  protected readonly src = mediaSrc;
  private readonly customRange = signal(false);
  protected readonly selection = new Selection<string>();
  protected readonly exporting = signal(false);

  protected readonly tabs = DESK_TABS;
  protected readonly methods = DESK_PAYMENT_METHODS;
  protected readonly limits = DESK_LIMITS;
  protected readonly maxSearch = DESK_MAX_SEARCH;
  protected readonly overdueLabels = OVERDUE_LABELS;
  protected readonly statusBadge = statusBadge;
  protected readonly paymentBadge = paymentBadge;
  protected readonly paymentState = paymentState;
  /** Cột "Nền tảng": logo của kênh bán (đơn từ API hiện đều là Website nine2fine). */
  protected platformOf(order: DeskOrderSummary) {
    return CHANNELS.find((channel) => channel.key === (order.channel ?? 'website')) ?? null;
  }

  protected readonly query = toSignal(
    this.route.queryParamMap.pipe(
      map((params): DeskOrderQuery => {
        const view = params.get('view') as DeskTab;
        const payment = params.get('payment');
        const limit = Number(params.get('limit'));
        const sort = params.get('sort') as DeskSort;
        return {
          sort: SORT_VALUES.includes(sort) ? sort : 'placed-desc',
          view: TAB_VALUES.includes(view) ? view : 'all',
          q: params.get('q') ?? '',
          payment: payment === 'cod' || payment === 'bank-transfer' ? payment : '',
          from: params.get('from') ?? '',
          to: params.get('to') ?? '',
          page: Math.max(1, Math.floor(Number(params.get('page'))) || 1),
          limit: Number.isInteger(limit) && limit >= 1 && limit <= 50 ? limit : DESK_DEFAULT_LIMIT,
        };
      }),
    ),
    { requireSync: true },
  );
  /** `?order=<code>`: the detail drawer is open on that order (old `/admin/orders/<code>` links land here). */
  private readonly openId = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('order') ?? '')),
    { requireSync: true },
  );
  /**
   * DASH-05 `?late=1` ("Giao trễ" on Tổng quan): only "Đang vận chuyển" orders past their latest
   * estimated delivery day, filtered and paged by the server (`GET /admin/orders?late=1`).
   */
  protected readonly late = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('late') === '1')),
    { requireSync: true },
  );
  private readonly listQuery = computed(() => ({ ...this.query(), late: this.late() }));
  /** ADM-ORD-01/02: a range that ends before it starts is never sent to the API. */
  protected readonly view = loader(this.listQuery, ({ late, ...query }) =>
    invalidRange(query) ? EMPTY : late ? this.listLate(query) : this.api.list(query),
  );
  protected readonly page = this.view.data;
  protected readonly counts = signal<DeskOrderCounts | null>(null);
  protected readonly search = signal(this.query().q);

  protected readonly filtered = computed(() => {
    const query = this.query();
    return !!(query.q || query.payment || query.from || query.to || this.late());
  });
  protected readonly ids = computed(() => this.page()?.items.map((order) => order.id) ?? []);
  protected readonly selectedOrders = computed(() =>
    (this.page()?.items ?? []).filter((order) => this.selection.has(order.id)),
  );
  /** ADM-ORD-19: only when every ticked order can be handed over now. */
  protected readonly canBulkShip = computed(() => {
    const orders = this.selectedOrders();
    return (
      orders.length > 0 &&
      orders.length === this.selection.count() &&
      orders.every((order) => order.status === 'to_ship' && !order.needsCall)
    );
  });
  /** Select value: the preset matching from/to exactly, else "custom" when a range is set. */
  protected readonly rangeValue = computed(() => {
    const { from, to } = this.query();
    const match = DATE_PRESETS.find((preset) => {
      const range = presetRange(preset.value);
      return range.from === from && range.to === to;
    });
    return this.customRange() || (!match && (from || to)) ? 'custom' : (match?.value ?? '');
  });
  protected readonly paymentLabel = (value: string) =>
    DESK_PAYMENT_METHODS.find((method) => method.value === value)?.label ?? value;
  protected readonly rangeInvalid = computed(() => invalidRange(this.query()));

  constructor() {
    // Counts follow the same filters as the list but not the tab or the page (BR-ADM-07).
    // ADM-ORD-01/02: they are cleared at once when the filters change (never old numbers next to
    // a new list), and not asked for at all while the date range is invalid.
    const filter = computed(() => {
      const { q, payment, from, to } = this.query();
      return { q, payment, from, to };
    });
    toObservable(filter)
      .pipe(
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
        tap(() => this.counts.set(null)),
        switchMap((value) =>
          invalidRange(value) ? of(null) : this.api.counts(value).pipe(catchError(() => of(null))),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((counts) => this.counts.set(counts));
    // The drawer follows the URL: open on `?order=`, closed (also by "back") without it.
    toObservable(this.openId)
      .pipe(takeUntilDestroyed())
      .subscribe((id) => (id ? this.showDrawer(id) : this.drawerRef?.close()));
    inject(DestroyRef).onDestroy(() => this.drawerRef?.close());
    // Typing waits 300 ms before it asks the server (BR-ADM-06).
    toObservable(this.search)
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((value) => {
        const q = value.trim();
        if (q !== this.query().q) this.update({ q });
      });
  }

  setTab(view: DeskTab): void {
    // ADM-ORD-19: a new tab starts with nothing selected.
    this.selection.clear();
    this.update({ view }, { late: false });
  }

  /** DASH-05: the server filters "Đang vận chuyển" down to the late orders (`late=1`) and pages them. */
  private listLate(query: DeskOrderQuery): Observable<DeskOrderPage> {
    return this.api.list({ ...query, view: 'in-transit', late: true });
  }

  setRangeChoice(value: string): void {
    this.customRange.set(value === 'custom');
    if (value === 'custom') return;
    const range = presetRange(value);
    this.update({ from: range.from, to: range.to });
  }

  quickOf(order: DeskOrderSummary): { action: DeskAction; label: string } | null {
    const quick = QUICK_ACTIONS[order.tab];
    return quick && (quick.action !== 'confirm' || order.needsCall) ? quick : null;
  }

  /** Row button: loads the order, and opens the action's dialog only if the server allows it now. */
  quickRun(order: DeskOrderSummary, action: DeskAction): void {
    const kind = actionKindOf(action);
    if (!kind) return;
    this.api.get(order.id).subscribe({
      next: (full) => {
        if (!full.allowedActions.includes(action)) return this.setOpen(order.id);
        this.dialogs
          .modal<DeskActionDialogData, DeskActionOutcome>(DeskActionDialog, { order: full, kind })
          .closed.subscribe((outcome) => {
            if (!outcome) return;
            this.toast.show(outcome.message);
            this.retry();
          });
      },
      error: (error: unknown) => this.toast.error(errorMessage(error)),
    });
  }

  /** Click on a row (not on its links, buttons or checkbox) opens that order in the drawer. */
  openQuick(order: DeskOrderSummary, event?: Event): void {
    if ((event?.target as HTMLElement | undefined)?.closest('a,button,input,label,adm-copy')) return;
    this.setOpen(order.id);
  }

  private setOpen(id: string | null): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { order: id },
      queryParamsHandling: 'merge',
    });
  }

  private showDrawer(id: string): void {
    if (this.drawerRef) return;
    const ref = this.dialogs.drawer<{ id: string }, boolean>(OrderDetailDrawer, { id }, true);
    this.drawerRef = ref;
    ref.closed.subscribe((changed) => {
      this.drawerRef = null;
      if (changed) this.retry();
      if (this.openId()) this.setOpen(null);
    });
  }

  bulkShip(): void {
    const orders: DeskOrderSummary[] = this.selectedOrders();
    if (!this.canBulkShip()) return;
    this.dialogs
      .modal<BulkShipData, BulkShipResult>(BulkShipDialog, { orders }, [
        'adm-modal-panel',
        'adm-modal-panel--wide',
      ])
      .closed.subscribe((result) => {
        if (!result || (!result.shipped && !result.failed)) return;
        this.selection.clear();
        this.retry();
        this.toast.show(
          result.failed
            ? `Đã bàn giao ${result.shipped} đơn, ${result.failed} đơn chưa bàn giao được.`
            : `Đã bàn giao ${result.shipped} đơn cho vận chuyển.`,
        );
      });
  }

  exportCsv(): void {
    const data: ExportDialogData = {
      pageCount: this.page()?.items.length ?? 0,
      selectedCount: this.selection.count(),
      matchingCount: this.page()?.total ?? 0,
    };
    this.dialogs
      .modal<ExportDialogData, ExportScope>(ExportDialog, data)
      .closed.subscribe((scope) => {
        if (!scope) return;
        const { q, payment, from, to, view, sort } = this.query();
        const codes =
          scope === 'page'
            ? this.ids()
            : scope === 'selected'
              ? [...this.selection.ids()]
              : undefined;
        // ADM-ORD-18: "Trang hiện tại" / "Đơn đã chọn" with no rows must not export everything.
        if (codes && !codes.length) {
          this.toast.error('Không có đơn nào trong phạm vi đã chọn để xuất.');
          return;
        }
        this.exporting.set(true);
        this.api.exportCsv({ q, payment, from, to, view, sort, codes }).subscribe({
          next: ({ blob, filename }) => {
            this.exporting.set(false);
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          },
          error: (error: unknown) => {
            this.exporting.set(false);
            this.toast.error(errorMessage(error));
          },
        });
      });
  }

  update(patch: Partial<DeskOrderQuery>, options: { late?: boolean } = {}): void {
    const next = { ...this.query(), ...patch };
    if (!('page' in patch)) next.page = 1;
    const late = options.late ?? this.late();
    void this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: {
        late: late ? 1 : null,
        view: late ? 'in-transit' : next.view === 'all' ? null : next.view,
        q: next.q || null,
        payment: next.payment || null,
        from: next.from || null,
        to: next.to || null,
        order: this.openId() || null,
        sort: next.sort === 'placed-desc' ? null : next.sort,
        page: next.page === 1 ? null : next.page,
        limit: next.limit === DESK_DEFAULT_LIMIT ? null : next.limit,
      },
    });
  }

  setPayment(value: string): void {
    this.update({ payment: value as DeskPaymentMethod | '' });
  }

  clearFilters(): void {
    this.search.set('');
    this.selection.clear();
    this.customRange.set(false);
    this.update({ q: '', payment: '', from: '', to: '', view: 'all' }, { late: false });
  }

  retry(): void {
    if (this.rangeInvalid()) return;
    this.view.reload();
    const { q, payment, from, to } = this.query();
    this.api.counts({ q, payment, from, to }).subscribe({
      next: (counts) => this.counts.set(counts),
      error: () => undefined,
    });
  }
}
