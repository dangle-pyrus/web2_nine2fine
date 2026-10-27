import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { catchError, forkJoin, map, Observable, of, switchMap } from 'rxjs';
import { AdminSession } from '../../core/admin-session';
import { dateTime } from '../../core/format';
import { DateTimePipe, MoneyPipe, NumPipe } from '../../core/format.pipes';
import { orderBadge, paymentBadge, PAYMENT_METHODS } from '../../core/status';
import { ADMIN_ORDERS_API } from '../../data-access/admin-apis';
import { errorMessage } from '../../data-access/http-support';
import type { AdminOrderSummary, OrderQuery, OrderView, SortDir } from '../../data-access/models';
import { AdmBadge } from '../../ui/badge';
import { AdminDialogs } from '../../ui/dialogs';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import {
  DATE_PRESETS,
  downloadCsv,
  fetchAllPages,
  loader,
  presetRange,
  Selection,
  urlQuery,
} from '../../ui/list-state';
import { AdmPageHeader } from '../../ui/page-header';
import { AdmPager } from '../../ui/pager';
import { AdmSkeletonRows } from '../../ui/skeleton';
import { ExportDialog, ExportDialogData, ExportScope } from '../../ui/export-dialog';
import { AdminToastService } from '../../ui/toast';
import { openPrint, PrintKind } from '../print/open-print';
import { ShipDialog } from './order-dialogs';
import { TagDialog } from './order-edit-dialogs';
import { OrderListContext } from './order-list-context';

type ListQuery = OrderQuery & { range: string };

/** Every sort spelled out, so the toolbar always says what order the list is in. */
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'placedAt:desc', label: 'Ngày đặt: mới nhất trước' },
  { value: 'placedAt:asc', label: 'Ngày đặt: cũ nhất trước' },
  { value: 'total:desc', label: 'Tổng tiền: cao đến thấp' },
  { value: 'total:asc', label: 'Tổng tiền: thấp đến cao' },
  { value: 'id:desc', label: 'Mã đơn: lớn đến nhỏ' },
  { value: 'id:asc', label: 'Mã đơn: nhỏ đến lớn' },
];

const VIEWS: { value: OrderView; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'to-confirm', label: 'Chờ xác nhận' },
  { value: 'pending-payment', label: 'Chờ thanh toán' },
  { value: 'to-fulfil', label: 'Cần giao' },
  { value: 'in-transit', label: 'Đang vận chuyển' },
  { value: 'late', label: 'Giao trễ' },
  { value: 'failed', label: 'Giao thất bại' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'cancelled', label: 'Đã hủy' },
];

/** Orders index (4.1, 6.5): saved views, search, filters as chips, bulk actions, URL state. */
@Component({
  selector: 'adm-order-list-page',
  imports: [
    FormsModule,
    RouterLink,
    CdkMenu,
    CdkMenuItem,
    CdkMenuTrigger,
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
  templateUrl: './order-list-page.html',
})
export class OrderListPage {
  protected readonly session = inject(AdminSession);
  private readonly api = inject(ADMIN_ORDERS_API);
  private readonly router = inject(Router);
  private readonly dialogs = inject(AdminDialogs);
  private readonly toast = inject(AdminToastService);

  protected readonly views = VIEWS;
  protected readonly presets = DATE_PRESETS;
  protected readonly methods = Object.entries(PAYMENT_METHODS);
  protected readonly orderBadge = orderBadge;
  protected readonly paymentBadge = paymentBadge;

  protected readonly list = urlQuery<ListQuery>({
    view: 'all',
    payment: '',
    from: '',
    to: '',
    range: '',
    sort: 'placedAt',
  });
  protected readonly query = this.list.query;
  private readonly apiQuery = computed(() => {
    const query = this.query();
    return { ...query, ...presetRange(query.range) };
  });
  protected readonly view = loader(this.apiQuery, (query) => this.api.list(query));
  protected readonly page = this.view.data;
  protected readonly counts = signal<Partial<Record<OrderView, number>>>({});
  protected readonly selection = new Selection<string>();
  protected readonly search = signal(this.query().search);
  protected readonly busy = signal(false);

  protected readonly ids = computed(() => this.page()?.items.map((order) => order.id) ?? []);
  protected readonly chips = computed(() => {
    const query = this.query();
    const chips: { key: keyof ListQuery; label: string }[] = [];
    if (query.search) chips.push({ key: 'search', label: `Tìm: “${query.search}”` });
    if (query.payment)
      chips.push({ key: 'payment', label: `Thanh toán: ${PAYMENT_METHODS[query.payment]}` });
    if (query.range)
      chips.push({
        key: 'range',
        label: `Ngày đặt: ${DATE_PRESETS.find((item) => item.value === query.range)?.label}`,
      });
    return chips;
  });
  /** Bulk "Bàn giao vận chuyển" only makes sense when every selected order is waiting to ship. */
  protected readonly selectedOrders = computed(
    () => this.page()?.items.filter((order) => this.selection.has(order.id)) ?? [],
  );
  protected readonly canBulkShip = computed(
    () =>
      this.selectedOrders().length > 0 &&
      this.selectedOrders().every((order) => order.status === 'processing'),
  );
  protected readonly canBulkConfirm = computed(
    () =>
      this.selectedOrders().length > 0 &&
      this.selectedOrders().every((order) => order.status === 'pending-confirmation'),
  );

  constructor() {
    const context = inject(OrderListContext);
    const route = inject(ActivatedRoute);
    effect(() => {
      const page = this.page();
      if (!page) return;
      context.snapshot.set({
        query: { ...this.apiQuery(), page: page.page, pageSize: page.pageSize },
        params: route.snapshot.queryParams,
        ids: page.items.map((order) => order.id),
        total: page.total,
      });
    });
    this.api.counts().subscribe({
      next: (counts) => this.counts.set(counts),
      error: () => undefined,
    });
  }

  setView(view: OrderView): void {
    this.selection.clear();
    this.list.update({ view });
  }

  submitSearch(): void {
    this.list.update({ search: this.search().trim() });
  }

  removeChip(key: keyof ListQuery): void {
    if (key === 'search') this.search.set('');
    this.list.update({ [key]: '' } as Partial<ListQuery>);
  }

  clearFilters(): void {
    this.search.set('');
    this.list.reset(['view']);
  }

  protected readonly sortOptions = SORT_OPTIONS;
  protected readonly sortKey = computed(() => {
    const { sort, dir } = this.query();
    return `${sort || 'placedAt'}:${dir}`;
  });

  setSort(value: string): void {
    const [sort, dir] = value.split(':');
    this.list.update({ sort, dir: dir as SortDir }, { keepPage: true });
  }

  sortIcon(key: string): string {
    const { sort, dir } = this.query();
    if ((sort || 'placedAt') !== key) return 'reiconSortV';
    return dir === 'asc' ? 'reiconArrowUp' : 'reiconArrowDown';
  }

  ariaSort(key: string): 'ascending' | 'descending' | null {
    const { sort, dir } = this.query();
    if ((sort || 'placedAt') !== key) return null;
    return dir === 'asc' ? 'ascending' : 'descending';
  }

  sortTitle(key: string): string {
    const current = SORT_OPTIONS.find((option) => option.value === this.sortKey());
    return (this.query().sort || 'placedAt') === key && current
      ? `Đang sắp xếp: ${current.label}. Bấm để đảo chiều.`
      : 'Bấm để sắp xếp theo cột này';
  }

  sortBy(sort: string): void {
    const query = this.query();
    this.list.update(
      { sort, dir: query.sort === sort && query.dir === 'desc' ? 'asc' : 'desc' },
      { keepPage: true },
    );
  }

  open(order: AdminOrderSummary, event: MouseEvent): void {
    if ((event.target as HTMLElement).closest('input, a, button')) return;
    void this.router.navigate(['/admin/orders', order.id]);
  }

  /** Header "Xuất file": asks which rows, defaulting to everything that matches the filters. */
  openExport(): void {
    const page = this.page();
    if (!page) return;
    this.dialogs
      .modal<ExportDialogData, ExportScope>(ExportDialog, {
        noun: 'đơn hàng',
        pageCount: page.items.length,
        total: page.total,
        selectedCount: this.selection.count(),
      })
      .closed.subscribe((scope) => {
        if (scope === 'page') this.exportCsv(page.items);
        else if (scope === 'selected') this.exportCsv(this.selectedOrders());
        else if (scope === 'all') {
          fetchAllPages((index, pageSize) =>
            this.api.list({ ...this.apiQuery(), page: index, pageSize }),
          ).subscribe({
            next: (rows) => this.exportCsv(rows),
            error: (error: unknown) => this.toast.error(errorMessage(error)),
          });
        }
      });
  }

  exportCsv(rows: AdminOrderSummary[]): void {
    downloadCsv(
      `don-hang-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Mã đơn', 'Ngày đặt', 'Khách hàng', 'Thanh toán', 'Trạng thái', 'Số SP', 'Tổng tiền'],
      rows.map((order) => [
        order.id,
        dateTime(order.placedAt),
        order.customerName,
        paymentBadge(order.paymentState).label,
        orderBadge(order.status).label,
        order.itemCount,
        order.total,
      ]),
    );
    this.toast.show(`Đã xuất ${rows.length} đơn hàng`);
  }

  bulkShip(): void {
    const orders = this.selectedOrders();
    this.dialogs
      .modal<
        { ids: string[] },
        { carrier: string; estimatedAt: string; codes: Record<string, string> }
      >(ShipDialog, { ids: orders.map((order) => order.id) })
      .closed.subscribe((result) => {
        if (!result) return;
        this.bulk(
          orders,
          (order) =>
            this.api.ship(order.id, {
              carrier: result.carrier,
              trackingCode: result.codes[order.id],
              estimatedAt: result.estimatedAt,
            }),
          `bàn giao cho ${result.carrier}`,
        );
      });
  }

  /** COD orders confirmed by phone, in one go (Đợt 2). */
  bulkConfirm(): void {
    this.bulk(this.selectedOrders(), (order) => this.api.confirm(order.id), 'xác nhận');
  }

  bulkTag(): void {
    const orders = this.selectedOrders();
    this.dialogs
      .modal<{ count: number }, string>(TagDialog, { count: orders.length })
      .closed.subscribe((tag) => {
        if (!tag) return;
        this.bulk(
          orders,
          (order) =>
            this.api
              .get(order.id)
              .pipe(
                switchMap((full) =>
                  this.api.updateTags(order.id, [...new Set([...full.tags, tag])]),
                ),
              ),
          `gắn tag “${tag}”`,
        );
      });
  }

  printSelected(kind: PrintKind): void {
    openPrint(
      this.router,
      kind,
      this.selectedOrders().map((order) => order.id),
    );
  }

  /**
   * Runs one request per order, so one failure does not hide the others' success. Failed orders
   * stay ticked so they can be retried straight away.
   */
  private bulk(
    orders: AdminOrderSummary[],
    call: (order: AdminOrderSummary) => Observable<unknown>,
    verb: string,
  ): void {
    this.busy.set(true);
    forkJoin(
      orders.map((order) =>
        call(order).pipe(
          map(() => null),
          catchError((error: unknown) => of({ id: order.id, error: errorMessage(error) })),
        ),
      ),
    ).subscribe((outcomes) => {
      const failed = outcomes.filter((outcome) => outcome !== null);
      const done = orders.length - failed.length;
      this.busy.set(false);
      this.selection.clear();
      this.selection.setAll(
        failed.map((outcome) => outcome.id),
        true,
      );
      if (!failed.length) {
        this.toast.show(`Đã ${verb} ${done} đơn`);
      } else {
        this.toast.error(
          `Đã ${verb} ${done}/${orders.length} đơn. Chưa xong #${failed
            .map((outcome) => outcome.id)
            .join(', #')}: ${failed[0].error}`,
        );
      }
      this.view.reload();
      this.api.counts().subscribe((counts) => this.counts.set(counts));
    });
  }
}
