import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { MoneyPipe, NumPipe, PercentPipe } from '../../core/format.pipes';
import { money, num, percent } from '../../core/format';
import { adminImageUrl } from '../../data-access/catalog-media';
import { ADMIN_INSIGHTS_REPORTS_API } from '../../data-access/insights-api';
import { InsightsExtraApi, type ExtraReport } from '../../data-access/insights-extra-api';
import { CANCEL_REASON_LABELS } from '../../core/order-desk-status';
import { RETURN_REASON_LABELS } from '../../data-access/returns-api';
import { of } from 'rxjs';
import { RouterLink } from '@angular/router';
import { insightsErrorMessage } from '../../data-access/insights-errors';
import type {
  ReportFigureKey,
  ReturnFigureKey,
  ReportSort,
  SalesReportQuery,
} from '../../data-access/insights-models';
import { AdmChart } from '../../ui/chart';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { loader } from '../../ui/list-state';
import { AdmPageHeader } from '../../ui/page-header';
import { AdminToastService } from '../../ui/toast';
import {
  clockTime,
  deltaText,
  longDay,
  ratioChange,
  shiftDay,
  shortDay,
  shortMoney,
  todayVn,
  validateDayRange,
  type RangeErrors,
} from './insights-format';

const QUICK_RANGES = [
  { days: 7, label: '7 ngày' },
  { days: 30, label: '30 ngày' },
  { days: 90, label: '90 ngày' },
  { days: 365, label: '365 ngày' },
] as const;

/** The server refuses longer ranges (BR-RPT-01); the screen says so without calling it. */
export const MAX_REPORT_DAYS = 366;

/** Same rules as `GET /admin/reports/sales` (BR-RPT-01), checked before any request. */
export function validateRange(from: string, to: string, today: string): RangeErrors {
  return validateDayRange(from, to, today, MAX_REPORT_DAYS);
}

interface KpiCard {
  key: ReportFigureKey | ReturnFigureKey;
  label: string;
  hint?: string;
  format: (value: number) => string;
}

const KPI_CARDS: KpiCard[] = [
  { key: 'revenue', label: 'Doanh thu', format: money, hint: 'Không gồm phí vận chuyển' },
  { key: 'completedOrders', label: 'Đơn hoàn tất', format: num },
  { key: 'units', label: 'Số sản phẩm bán ra', format: num },
  { key: 'averageOrderValue', label: 'Giá trị trung bình mỗi đơn', format: money },
  { key: 'discountTotal', label: 'Giảm giá', format: money, hint: 'Tổng giảm trên dòng hàng' },
  {
    key: 'shippingCollected',
    label: 'Phí vận chuyển thu',
    format: money,
    hint: 'Chỉ để tham khảo, không nằm trong doanh thu',
  },
  { key: 'placedOrders', label: 'Đơn đặt', format: num },
  { key: 'cancelledOrders', label: 'Đơn huỷ', format: num },
  { key: 'cancelRate', label: 'Tỉ lệ huỷ', format: percent },
  // Slice 9 (BR-RET-52): present once the server sends them; revenue above is already net.
  {
    key: 'refundedAmount',
    label: 'Tiền hàng đã hoàn',
    format: money,
    hint: 'Doanh thu đã trừ hàng trả',
  },
  { key: 'refundedUnits', label: 'Sản phẩm đã hoàn', format: num },
  { key: 'returnedOrders', label: 'Đơn có trả hàng', format: num },
  { key: 'returnRate', label: 'Tỉ lệ trả hàng', format: percent },
];

/** Tabs of Báo cáo (2026-11-15); `?tab=` in the URL, `sales` when absent. */
export type ReportTab = 'sales' | 'products' | 'customers' | 'operations' | 'promotions';
const TABS: { value: ReportTab; label: string }[] = [
  { value: 'sales', label: 'Bán hàng' },
  { value: 'products', label: 'Sản phẩm & tồn kho' },
  { value: 'customers', label: 'Khách hàng' },
  { value: 'operations', label: 'Vận hành & đổi trả' },
  { value: 'promotions', label: 'Khuyến mãi' },
];
const EXTRA_TABS: readonly ReportTab[] = ['customers', 'operations', 'promotions'];

const CUSTOMER_CANCEL_LABELS: Record<string, string> = {
  changed_mind: 'Khách không còn nhu cầu',
  change_variant: 'Khách muốn đổi size, màu, sản phẩm',
  change_address: 'Khách muốn đổi địa chỉ',
  better_price: 'Khách tìm được giá tốt hơn',
  slow_delivery: 'Giao hàng dự kiến quá lâu',
};
const DAY_NAMES = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
/** Neutral ramp for the donut slices (one hue family, distinct steps). */
const SLICE_COLORS = ['#111111', '#4b5563', '#9ca3af', '#c7cdd4', '#e5e7eb', '#d6d3d1'];

const PAYMENT_LABELS: Record<string, string> = {
  cod: 'Thanh toán khi nhận hàng (COD)',
  'bank-transfer': 'Chuyển khoản',
};

/**
 * Báo cáo on the real API (Slice 8, BR-RPT-01..09; split into tabs 2026-11-15). `from`, `to`, `sort`
 * and `tab` live in the URL; a range the server would refuse is reported next to the date field and
 * never requested. Bán hàng and Sản phẩm read `/admin/reports/sales`; Khách hàng, Vận hành & đổi trả
 * and Khuyến mãi read `/admin/reports-extra` (real figures only: an error state, never sample data).
 */
@Component({
  selector: 'adm-insights-reports-page',
  imports: [
    FormsModule,
    RouterLink,
    AdmPageHeader,
    AdmChart,
    AdmIcon,
    AdmEmptyState,
    MoneyPipe,
    NumPipe,
    PercentPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './insights-reports-page.html',
  styleUrls: ['../reports/reports-page.scss', './insights-reports-page.scss'],
  styles: `
    .range-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 24px;
    }
    .range-bar .field {
      width: 180px;
    }
    .range-bar > .adm-btn {
      align-self: flex-end;
    }
  `,
})
export class InsightsReportsPage {
  private readonly api = inject(ADMIN_INSIGHTS_REPORTS_API);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(AdminToastService);
  private readonly extraApi = inject(InsightsExtraApi);
  protected readonly tabs = TABS;
  protected readonly tab = signal<ReportTab>('sales');
  protected readonly dayNames = DAY_NAMES;
  protected readonly quick = QUICK_RANGES;
  protected readonly cards = KPI_CARDS;
  protected readonly paymentLabels = PAYMENT_LABELS;
  protected readonly today = todayVn();

  private readonly defaults = (): { from: string; to: string } => ({
    from: shiftDay(todayVn(), -29),
    to: todayVn(),
  });

  /** What the URL asks for; the date fields start from it and the loader reads `applied`. */
  protected readonly fromDraft = signal(this.defaults().from);
  protected readonly toDraft = signal(this.defaults().to);
  protected readonly errors = signal<RangeErrors>({});
  protected readonly applied = signal<SalesReportQuery>({ ...this.defaults(), sort: 'units' });
  protected readonly exporting = signal(false);

  constructor() {
    // Runs for the first URL too, and again for "back", so URL and screen cannot drift apart.
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const fallback = this.defaults();
      const from = params.get('from') ?? fallback.from;
      const to = params.get('to') ?? (params.get('from') ? todayVn() : fallback.to);
      const sort: ReportSort = params.get('sort') === 'revenue' ? 'revenue' : 'units';
      const tab = params.get('tab');
      this.tab.set(TABS.some((item) => item.value === tab) ? (tab as ReportTab) : 'sales');
      this.fromDraft.set(from);
      this.toDraft.set(to);
      const problems = validateRange(from, to, todayVn());
      this.errors.set(problems);
      this.applied.set(problems.from || problems.to ? { ...fallback, sort } : { from, to, sort });
    });
  }

  protected readonly view = loader(
    this.applied,
    (query) => this.api.sales(query),
    insightsErrorMessage,
  );
  protected readonly report = computed(() => (this.view.state().error ? null : this.view.data()));

  /** Customers / operations / promotions: read only when one of these tabs is open. */
  protected readonly extraView = loader(
    computed(() => {
      const { from, to } = this.applied();
      return EXTRA_TABS.includes(this.tab()) ? { from, to } : null;
    }),
    (query) => (query ? this.extraApi.get(query) : of(null)),
    insightsErrorMessage,
  );
  protected readonly extra = computed<ExtraReport | null>(() =>
    this.extraView.state().error ? null : this.extraView.data(),
  );

  // ---------- Bán hàng ----------

  /** Gross goods, discounts, shipping, refunds, what was collected (from the KPI figures). */
  protected readonly waterfall = computed(() => {
    const k = this.report()?.kpis;
    if (!k) return null;
    const refunded = k.refundedAmount?.value ?? 0;
    const discount = k.discountTotal.value;
    const shipping = k.shippingCollected.value;
    const gross = k.revenue.value + discount + refunded;
    const net = gross - discount + shipping - refunded;
    const steps = [
      { key: 'gross', label: 'Tiền hàng', value: gross, kind: 'total' as const },
      { key: 'discount', label: 'Giảm giá', value: -discount, kind: 'minus' as const },
      { key: 'shipping', label: 'Phí ship thu', value: shipping, kind: 'plus' as const },
      { key: 'refund', label: 'Hoàn tiền', value: -refunded, kind: 'minus' as const },
      { key: 'net', label: 'Thực thu', value: net, kind: 'total' as const },
    ];
    const max = Math.max(gross, net, gross - discount + shipping, 1);
    let running = 0;
    const bars = steps.map((step) => {
      let start: number;
      let end: number;
      if (step.kind === 'total') {
        start = 0;
        end = step.value;
        running = step.value;
      } else {
        start = running;
        end = running + step.value;
        running = end;
      }
      const lo = Math.min(start, end);
      const hi = Math.max(start, end);
      return {
        ...step,
        bottom: (lo / max) * 100,
        height: Math.max(((hi - lo) / max) * 100, step.value ? 0.8 : 0),
      };
    });
    return { bars, revenue: k.revenue.value };
  });

  /** Donut of revenue share per category (SVG arcs). */
  protected readonly donut = computed(() => {
    const rows = this.report()?.byCategory ?? [];
    const total = rows.reduce((sum, row) => sum + row.revenue, 0);
    if (!total) return [];
    let offset = 0;
    return rows.map((row, index) => {
      const share = row.revenue / total;
      const slice = {
        key: row.category.slug,
        name: row.category.name,
        share,
        color: SLICE_COLORS[index % SLICE_COLORS.length],
        dash: `${(share * 100).toFixed(3)} ${(100 - share * 100).toFixed(3)}`,
        offset: (25 - offset * 100).toFixed(3),
      };
      offset += share;
      return slice;
    });
  });

  protected readonly paymentBars = computed(() => {
    const rows = this.report()?.byPayment ?? [];
    return rows.map((row) => ({ ...row, width: row.share * 100 }));
  });

  // ---------- Sản phẩm & tồn kho ----------

  /** Units and revenue per colour and per size, added up from the top variants. */
  protected readonly byAttribute = computed(() => {
    const variants = this.report()?.topVariants ?? [];
    const group = (key: (row: (typeof variants)[number]) => string) => {
      const map = new Map<string, { label: string; units: number; revenue: number }>();
      for (const row of variants) {
        const label = key(row) || '—';
        const entry = map.get(label) ?? { label, units: 0, revenue: 0 };
        entry.units += row.units;
        entry.revenue += row.revenue;
        map.set(label, entry);
      }
      const list = [...map.values()].sort((a, b) => b.revenue - a.revenue);
      const max = Math.max(...list.map((item) => item.revenue), 1);
      return list.map((item) => ({ ...item, width: (item.revenue / max) * 100 }));
    };
    return { colors: group((row) => row.color), sizes: group((row) => row.size) };
  });

  // ---------- Khách hàng / Vận hành / Khuyến mãi (reports-extra) ----------

  protected readonly customerSplit = computed(() => {
    const c = this.extra()?.customers;
    if (!c) return null;
    const orders = c.newOrders + c.returningOrders || 1;
    const spend = c.newSpend + c.returningSpend || 1;
    return {
      newOrdersPct: (c.newOrders / orders) * 100,
      newSpendPct: (c.newSpend / spend) * 100,
      memberPct: c.buyers ? (c.members / c.buyers) * 100 : 0,
    };
  });

  protected readonly provinceRows = computed(() => {
    const rows = this.extra()?.provinces ?? [];
    const max = Math.max(...rows.map((row) => row.orderValue), 1);
    return rows.map((row) => ({ ...row, width: (row.orderValue / max) * 100 }));
  });

  protected readonly cancelRows = computed(() => {
    const rows = this.extra()?.operations.cancelReasons ?? [];
    const merged = new Map<string, number>();
    for (const row of rows) {
      const label =
        row.actor === 'system'
          ? 'Hệ thống huỷ (quá hạn thanh toán)'
          : ((CANCEL_REASON_LABELS as Record<string, string>)[row.code] ??
            CUSTOMER_CANCEL_LABELS[row.code] ??
            'Lý do khác');
      merged.set(label, (merged.get(label) ?? 0) + row.orders);
    }
    const list = [...merged.entries()]
      .map(([label, orders]) => ({ label, orders }))
      .sort((a, b) => b.orders - a.orders);
    const total = list.reduce((sum, row) => sum + row.orders, 0) || 1;
    return list.map((row) => ({
      ...row,
      share: row.orders / total,
      width: (row.orders / total) * 100,
    }));
  });

  protected readonly returnRows = computed(() =>
    (this.extra()?.returns ?? []).map((row) => ({
      ...row,
      label: (RETURN_REASON_LABELS as Record<string, string>)[row.reason] ?? row.reason,
      faultLabel: row.fault === 'shop' ? 'Lỗi shop' : 'Phía khách',
    })),
  );

  protected readonly heat = computed(() => {
    const grid = this.extra()?.heatmap ?? [];
    const max = Math.max(...grid.flat(), 0);
    const peak = { day: 0, hour: 0, orders: 0 };
    grid.forEach((row, day) =>
      row.forEach((orders, hour) => {
        if (orders > peak.orders) Object.assign(peak, { day, hour, orders });
      }),
    );
    return {
      rows: grid.map((row, day) => ({
        day: DAY_NAMES[day],
        cells: row.map((orders, hour) => ({
          hour,
          orders,
          level: max ? Math.ceil((orders / max) * 4) : 0,
        })),
      })),
      peak: peak.orders
        ? `${DAY_NAMES[peak.day]} khoảng ${peak.hour}h–${peak.hour + 1}h (${peak.orders} đơn)`
        : '',
    };
  });

  protected minutes(value: number | null): string {
    if (value === null) return '—';
    if (value < 60) return `${value} phút`;
    const hours = Math.floor(value / 60);
    if (hours < 48) return `${hours} giờ${value % 60 ? ' ' + (value % 60) + ' phút' : ''}`;
    return `${Math.round(value / 1440)} ngày`;
  }

  protected setTab(tab: ReportTab): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: tab === 'sales' ? null : tab },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
  protected readonly updatedAt = computed(() => clockTime(this.report()?.generatedAt));

  /** Nothing placed, completed or cancelled: the tables say so and the chart stays flat. */
  protected readonly isEmpty = computed(() => {
    const kpis = this.report()?.kpis;
    return (
      !!kpis &&
      kpis.completedOrders.value === 0 &&
      kpis.placedOrders.value === 0 &&
      kpis.cancelledOrders.value === 0
    );
  });

  protected readonly kpiRows = computed(() => {
    const kpis = this.report()?.kpis;
    if (!kpis) return [];
    return KPI_CARDS.flatMap((card) => {
      const figure = kpis[card.key];
      if (!figure) return [];
      return [
        {
          ...card,
          value: card.format(figure.value),
          previous: figure.previous === null ? '—' : card.format(figure.previous),
          delta: deltaText(ratioChange(figure.value, figure.previous), 'so với kỳ trước'),
        },
      ];
    });
  });

  protected readonly chart = computed(() => {
    const days = this.report()?.byDay ?? [];
    return {
      labels: days.map((day) => shortDay(day.date)),
      series: [{ label: 'Doanh thu', data: days.map((day) => day.revenue) }],
    };
  });

  protected readonly activeQuick = computed(() => {
    const { from, to } = this.applied();
    return QUICK_RANGES.find((item) => to === todayVn() && from === shiftDay(to, -(item.days - 1)))
      ?.days;
  });

  protected readonly periodText = computed(() => {
    const r = this.report();
    return r
      ? `${longDay(r.from)} – ${longDay(r.to)} (${r.days} ngày), so với ${longDay(r.previousFrom)} – ${longDay(r.previousTo)}.`
      : '';
  });

  protected readonly shortMoney = shortMoney;
  protected readonly percent = percent;
  protected readonly imageUrl = adminImageUrl;

  protected go(patch: Partial<SalesReportQuery>): void {
    const next = { ...this.applied(), ...patch };
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        from: next.from,
        to: next.to,
        sort: next.sort === 'units' ? null : next.sort,
        tab: this.tab() === 'sales' ? null : this.tab(),
      },
      replaceUrl: true,
    });
  }

  protected pickQuick(days: number): void {
    const to = todayVn();
    this.go({ from: shiftDay(to, -(days - 1)), to });
  }

  protected apply(): void {
    const from = this.fromDraft();
    const to = this.toDraft();
    const problems = validateRange(from, to, todayVn());
    this.errors.set(problems);
    if (problems.from || problems.to) return;
    this.go({ from, to });
    // Same range again: the URL does not change, so ask for fresh numbers.
    if (from === this.applied().from && to === this.applied().to) this.view.reload();
  }

  protected setSort(sort: ReportSort): void {
    this.go({ sort });
  }

  protected exportCsv(): void {
    const { from, to } = this.applied();
    this.exporting.set(true);
    this.api.exportCsv({ from, to }).subscribe({
      next: ({ blob, filename }) => {
        this.exporting.set(false);
        const url = URL.createObjectURL(blob);
        const link = Object.assign(document.createElement('a'), { href: url, download: filename });
        link.click();
        URL.revokeObjectURL(url);
        this.toast.show('Đã tải báo cáo CSV');
      },
      error: (error: unknown) => {
        this.exporting.set(false);
        this.toast.error(insightsErrorMessage(error));
      },
    });
  }

  protected reload(): void {
    this.view.reload();
    this.extraView.reload();
  }
}
