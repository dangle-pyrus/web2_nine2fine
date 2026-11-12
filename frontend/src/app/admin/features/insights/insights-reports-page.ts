import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { MoneyPipe, NumPipe, PercentPipe } from '../../core/format.pipes';
import { money, num, percent } from '../../core/format';
import { adminImageUrl } from '../../data-access/catalog-media';
import { ADMIN_INSIGHTS_REPORTS_API } from '../../data-access/insights-api';
import { insightsErrorMessage } from '../../data-access/insights-errors';
import type {
  ReportFigureKey,
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
  key: ReportFigureKey;
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
];

const PAYMENT_LABELS: Record<string, string> = {
  cod: 'Thanh toán khi nhận hàng (COD)',
  'bank-transfer': 'Chuyển khoản',
};

/**
 * Báo cáo bán hàng on the real API (Slice 8, BR-RPT-01..09). `from`, `to` and `sort` live in the
 * URL; a range the server would refuse is reported next to the date field and never requested.
 * Only the blocks of the contract are drawn: no gross profit, returns, ABC, regions or heatmap.
 */
@Component({
  selector: 'adm-insights-reports-page',
  imports: [
    FormsModule,
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
  styleUrls: ['../reports/reports-page.scss'],
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
    return KPI_CARDS.map((card) => {
      const figure = kpis[card.key];
      return {
        ...card,
        value: card.format(figure.value),
        previous: figure.previous === null ? '—' : card.format(figure.previous),
        delta: deltaText(ratioChange(figure.value, figure.previous), 'so với kỳ trước'),
      };
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
  }
}
