import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, debounceTime, distinctUntilChanged, map, of, switchMap } from 'rxjs';
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
import {
  DESK_DEFAULT_LIMIT,
  DESK_LIMITS,
  DESK_MAX_SEARCH,
  type DeskOrderCounts,
  type DeskOrderQuery,
  type DeskPaymentMethod,
  type DeskTab,
} from '../../data-access/order-desk-models';
import { AdmBadge } from '../../ui/badge';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { loader } from '../../ui/list-state';
import { AdmPageHeader } from '../../ui/page-header';
import { AdmPager } from '../../ui/pager';
import { AdmSkeletonRows } from '../../ui/skeleton';

const TAB_VALUES = DESK_TABS.map((tab) => tab.value);

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
})
export class OrderDeskListPage {
  private readonly api = inject(ADMIN_ORDER_DESK_API);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly tabs = DESK_TABS;
  protected readonly methods = DESK_PAYMENT_METHODS;
  protected readonly limits = DESK_LIMITS;
  protected readonly maxSearch = DESK_MAX_SEARCH;
  protected readonly overdueLabels = OVERDUE_LABELS;
  protected readonly statusBadge = statusBadge;
  protected readonly paymentBadge = paymentBadge;
  protected readonly paymentState = paymentState;

  protected readonly query = toSignal(
    this.route.queryParamMap.pipe(
      map((params): DeskOrderQuery => {
        const view = params.get('view') as DeskTab;
        const payment = params.get('payment');
        const limit = Number(params.get('limit'));
        return {
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
  protected readonly view = loader(this.query, (query) => this.api.list(query));
  protected readonly page = this.view.data;
  protected readonly counts = signal<DeskOrderCounts | null>(null);
  protected readonly search = signal(this.query().q);

  protected readonly filtered = computed(() => {
    const query = this.query();
    return !!(query.q || query.payment || query.from || query.to);
  });
  protected readonly rangeInvalid = computed(() => {
    const { from, to } = this.query();
    return !!from && !!to && from > to;
  });

  constructor() {
    // Counts follow the same filters as the list but not the tab or the page (BR-ADM-07).
    const filter = computed(() => {
      const { q, payment, from, to } = this.query();
      return { q, payment, from, to };
    });
    toObservable(filter)
      .pipe(
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
        switchMap((value) => this.api.counts(value).pipe(catchError(() => of(null)))),
        takeUntilDestroyed(),
      )
      .subscribe((counts) => this.counts.set(counts));
    // Typing waits 300 ms before it asks the server (BR-ADM-06).
    toObservable(this.search)
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((value) => {
        const q = value.trim();
        if (q !== this.query().q) this.update({ q });
      });
  }

  setTab(view: DeskTab): void {
    this.update({ view });
  }

  update(patch: Partial<DeskOrderQuery>): void {
    const next = { ...this.query(), ...patch };
    if (!('page' in patch)) next.page = 1;
    void this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: {
        view: next.view === 'all' ? null : next.view,
        q: next.q || null,
        payment: next.payment || null,
        from: next.from || null,
        to: next.to || null,
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
    this.update({ q: '', payment: '', from: '', to: '', view: 'all' });
  }

  retry(): void {
    this.view.reload();
    this.api.counts(this.query()).subscribe({
      next: (counts) => this.counts.set(counts),
      error: () => undefined,
    });
  }
}
