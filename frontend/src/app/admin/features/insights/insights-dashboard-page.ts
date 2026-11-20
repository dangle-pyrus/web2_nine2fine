import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { API_CONFIG } from '../../../core/api-config';
import { AdminSession } from '../../core/admin-session';
import { dateTime, money as formatMoney, num, percent } from '../../core/format';
import { MoneyPipe, NumPipe } from '../../core/format.pipes';
import { statusBadge } from '../../core/order-desk-status';
import { adminImageUrl } from '../../data-access/catalog-media';
import { ADMIN_INSIGHTS_DASHBOARD_API } from '../../data-access/insights-api';
import { insightsErrorMessage } from '../../data-access/insights-errors';
import type {
  DashboardKpi,
  DashboardRecentOrder,
  InsightsRange,
} from '../../data-access/insights-models';
import { channelOf } from '../../data-access/marketplace-demo';
import { AdmBadge } from '../../ui/badge';
import { AdmChart } from '../../ui/chart';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { loader } from '../../ui/list-state';
import { shortMoney } from './insights-format';

/**
 * DASH-03/06: `current` names the selected period, `compare` the one the API compares it with
 * (docs/api/openapi.yaml adminGetDashboard: today vs all of yesterday, 7 / 30 days vs the 7 / 30
 * days right before them). The exact dates come from `period` / `comparePeriod` of the answer, so
 * the labels never claim a period the numbers are not about.
 */
const RANGES: { value: InsightsRange; label: string; current: string; compare: string }[] = [
  { value: 'today', label: 'Hôm nay', current: 'Hôm nay', compare: 'hôm qua' },
  { value: '7d', label: '7 ngày', current: '7 ngày qua', compare: '7 ngày trước đó' },
  { value: '30d', label: '30 ngày', current: '30 ngày qua', compare: '30 ngày trước đó' },
];

const VN_TIME = 'Asia/Ho_Chi_Minh';

/** "14/11 – 20/11" of a half-open `[from, to)` period, in Vietnam time; '' when unknown. */
function periodDays(period: { from: string; to: string } | undefined): string {
  const from = Date.parse(period?.from ?? '');
  const to = Date.parse(period?.to ?? '') - 1;
  if (!Number.isFinite(from) || !Number.isFinite(to)) return '';
  const day = (ms: number) =>
    new Date(ms).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', timeZone: VN_TIME });
  const first = day(from);
  const last = day(Math.max(from, to));
  return first === last ? first : `${first} – ${last}`;
}

/** DASH-08: "20/11/2026 15:44 (giờ Việt Nam)". */
function vnStamp(iso: string | undefined): string {
  const value = Date.parse(iso ?? '');
  if (!Number.isFinite(value)) return '';
  const text = new Date(value).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: VN_TIME,
  });
  return `${text} (giờ Việt Nam)`;
}

type ChartMetric = 'revenue' | 'orders';

interface KpiCard {
  key: string;
  label: string;
  /** DASH-01/02: what the figure counts, as the API defines it. */
  hint: string;
  icon: string;
  kpi: DashboardKpi;
  text: string;
  /** Higher is worse (return rate): green when it goes down. */
  inverted?: boolean;
}

interface TodoTile {
  key: string;
  label: string;
  count: number;
  link: string;
  params: Record<string, string>;
  urgent?: boolean;
}

/**
 * Tổng quan (Slice 8; v2 2026-11-15, GET /admin/dashboard in docs/api/openapi.yaml). The range
 * (Hôm nay / 7 ngày / 30 ngày, `?range=`) drives every block except "Cần xử lý", which is the
 * current state. Staff (no `dashboard.revenue`) never see a money figure: no revenue KPIs, chart
 * metric, order totals or product revenue (DASH-07). "Đơn hàng gần đây" lists only the API's
 * website orders (DASH-04). KPI names follow the API's definitions (DASH-01/02), every label names
 * the period and compare period with their dates (DASH-03/06), "Giao trễ" opens only the late
 * orders (DASH-05) and the update time is shown in Vietnam time, never on another range's numbers
 * (DASH-08).
 */
@Component({
  selector: 'adm-insights-dashboard-page',
  imports: [RouterLink, AdmBadge, AdmChart, AdmIcon, AdmEmptyState, MoneyPipe, NumPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './insights-dashboard-page.html',
  styleUrl: './insights-dashboard-page.scss',
})
export class InsightsDashboardPage {
  protected readonly session = inject(AdminSession);
  private readonly api = inject(ADMIN_INSIGHTS_DASHBOARD_API);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly catalogLive = inject(API_CONFIG).adminCatalogMode === 'http';
  protected readonly ranges = RANGES;
  protected readonly isAdmin = computed(() => this.session.can('dashboard.revenue'));
  protected readonly chartMetric = signal<ChartMetric>('revenue');
  /** The chart's metric: staff (no `dashboard.revenue`) only ever see the order count (DASH-07). */
  protected readonly metric = computed<ChartMetric>(() =>
    this.isAdmin() ? this.chartMetric() : 'orders',
  );

  /** `?range=` of the URL; Hôm nay when absent. */
  protected readonly range = toSignal(
    this.route.queryParamMap.pipe(
      map((params): InsightsRange => {
        const value = params.get('range');
        return value === '7d' || value === '30d' ? value : 'today';
      }),
    ),
    { initialValue: 'today' as InsightsRange },
  );
  protected readonly view = loader(
    this.range,
    (range) => this.api.get(range),
    insightsErrorMessage,
  );
  /**
   * DASH-08: numbers are shown only for the range they were computed for. While another range
   * loads, or after an error, the blocks fall back to their skeletons instead of the old figures.
   * (A plain "Làm mới" of the same range keeps them, dimmed.)
   */
  protected readonly data = computed(() => {
    const state = this.view.state();
    const data = state.data;
    if (state.error || !data) return null;
    return data.range && data.range !== this.range() ? null : data;
  });
  private readonly rangeInfo = computed(() => RANGES.find((item) => item.value === this.range())!);
  /** "7 ngày qua (14/11 – 20/11)". */
  protected readonly currentName = computed(() => {
    const days = periodDays(this.data()?.period);
    return `${this.rangeInfo().current}${days ? ` (${days})` : ''}`;
  });
  /** "tuần trước (03/11 – 09/11)". */
  protected readonly compareName = computed(() => {
    const days = periodDays(this.data()?.comparePeriod);
    return `${this.rangeInfo().compare}${days ? ` (${days})` : ''}`;
  });
  /** DASH-08: when the figures were computed, in Vietnam time. */
  protected readonly updatedAt = computed(() => vnStamp(this.data()?.generatedAt));

  protected readonly greeting = computed(() => {
    const hour = Number(
      new Date().toLocaleString('en-GB', {
        hour: '2-digit',
        hour12: false,
        timeZone: 'Asia/Ho_Chi_Minh',
      }),
    );
    const part = hour < 11 ? 'sáng' : hour < 18 ? 'chiều' : 'tối';
    const name = (this.session.user()?.name ?? '').trim().split(/\s+/).at(-1) ?? '';
    return `Chào buổi ${part}${name ? ', ' + name : ''}`;
  });

  protected readonly kpis = computed((): KpiCard[] => {
    const k = this.data()?.kpis;
    if (!k) return [];
    // DASH-07: money figures only for roles with `dashboard.revenue`, whatever the payload holds.
    const money = this.isAdmin();
    const cards: KpiCard[] = [];
    // DASH-01/02: names and hints follow the API's definitions (docs/api/openapi.yaml
    // adminGetDashboard): revenue and AOV count completed orders, "Đơn đặt" counts placed ones.
    if (money && k.netRevenue)
      cards.push({
        key: 'netRevenue',
        label: 'Doanh thu thuần',
        hint: 'Đơn hoàn thành trong kỳ, trừ tiền hoàn, không gồm phí giao hàng',
        icon: 'reiconGraphUp',
        kpi: k.netRevenue,
        text: formatMoney(k.netRevenue.value),
      });
    if (k.orders)
      cards.push({
        key: 'orders',
        label: 'Đơn đặt trong kỳ',
        hint: 'Đơn khách đặt trong kỳ, không tính đơn đã huỷ',
        icon: 'reiconBill',
        kpi: k.orders,
        text: num(k.orders.value),
      });
    if (money && k.averageOrderValue)
      cards.push({
        key: 'averageOrderValue',
        label: 'Giá trị TB / đơn hoàn thành',
        hint: 'Doanh thu thuần chia số đơn hoàn thành trong kỳ',
        icon: 'reiconTicketSale',
        kpi: k.averageOrderValue,
        text: formatMoney(k.averageOrderValue.value),
      });
    if (k.returnRate)
      cards.push({
        key: 'returnRate',
        label: 'Tỷ lệ trả/đổi',
        hint: 'Yêu cầu trả/đổi trong kỳ chia số đơn đã giao trong kỳ',
        icon: 'reiconUndo',
        kpi: k.returnRate,
        text: percent(k.returnRate.value),
        inverted: true,
      });
    return cards;
  });

  /** "▲ +2,5%": direction for the arrow, tone for the colour (inverted KPIs swap the colours). */
  protected delta(kpi: DashboardKpi, inverted = false) {
    const change = kpi.change;
    if (change === null || !Number.isFinite(change))
      return { dir: '', icon: '', tone: '', text: '—' };
    const dir = change > 0 ? 'up' : change < 0 ? 'down' : '';
    const good = inverted ? change < 0 : change > 0;
    return {
      dir,
      icon: change > 0 ? 'reiconArrowUpCircleFill' : 'reiconArrowDownCircleFill',
      tone: change === 0 ? '' : good ? 'good' : 'bad',
      text: `${change > 0 ? '+' : change < 0 ? '−' : ''}${percent(Math.abs(change))}`,
    };
  }

  protected readonly chart = computed(() => {
    const data = this.data();
    const series = data?.series;
    if (!data || !series?.points) return null;
    const metric = this.metric();
    const kpi = metric === 'revenue' ? data.kpis.netRevenue : data.kpis.orders;
    if (!kpi) return null;
    const previous = series.previous ?? [];
    const format = metric === 'revenue' ? shortMoney : (value: number) => num(value);
    const show = (value: number) =>
      metric === 'revenue' ? formatMoney(value) : `${num(value)} đơn`;
    return {
      labels: series.points.map((point) => point.label),
      title: `${metric === 'revenue' ? 'Doanh thu thuần' : 'Đơn đặt'} · ${this.currentName()}`,
      series: [
        { label: this.currentName(), data: series.points.map((point) => point[metric]) },
        {
          label: `So với ${this.compareName()}`,
          data: previous.map((point) => point[metric]),
          comparison: true,
        },
      ],
      total: show(kpi.value),
      previous: show(kpi.previous),
      delta: this.delta(kpi),
      format,
    };
  });

  protected readonly todoGroups = computed(() => {
    const t = this.data()?.todo;
    if (!t) return [];
    const groups: { key: string; title: string; tiles: TodoTile[] }[] = [
      {
        key: 'orders',
        title: 'Đơn hàng',
        tiles: [
          {
            key: 'toConfirm',
            label: 'Chờ xác nhận',
            count: t.toConfirm,
            link: '/admin/orders',
            params: { view: 'to-confirm' },
          },
          {
            key: 'pendingPayment',
            label: 'Chờ thanh toán',
            count: t.pendingPayment,
            link: '/admin/orders',
            params: { view: 'pending-payment' },
          },
          {
            key: 'toFulfil',
            label: 'Cần đóng gói',
            count: t.toFulfil,
            link: '/admin/orders',
            params: { view: 'to-fulfil' },
          },
          {
            key: 'cancelRequests',
            label: 'Yêu cầu huỷ',
            count: t.cancelRequests,
            link: '/admin/orders',
            params: { view: 'cancel-requests' },
            urgent: true,
          },
          {
            key: 'lateDelivery',
            label: 'Giao trễ',
            count: t.lateDelivery,
            link: '/admin/orders',
            // DASH-05: only the in-transit orders past their estimated delivery day.
            params: { view: 'in-transit', late: '1' },
            urgent: true,
          },
        ],
      },
      {
        key: 'returns',
        title: 'Đổi trả',
        tiles: [
          {
            key: 'returnRequested',
            label: 'Chờ duyệt',
            count: t.returnRequested,
            link: '/admin/returns',
            params: { state: 'requested' },
          },
          {
            key: 'returnApproved',
            label: 'Chờ nhận hàng',
            count: t.returnApproved,
            link: '/admin/returns',
            params: { state: 'approved' },
          },
          {
            key: 'returnReceived',
            label: 'Chờ hoàn tiền',
            count: t.returnReceived,
            link: '/admin/returns',
            params: { state: 'received' },
          },
        ],
      },
      {
        key: 'inventory',
        title: 'Kho',
        tiles: [
          {
            key: 'lowStock',
            label: 'Sắp hết',
            count: t.lowStock,
            link: '/admin/inventory',
            params: { view: 'low' },
          },
          {
            key: 'outOfStock',
            label: 'Hết hàng',
            count: t.outOfStock,
            link: '/admin/inventory',
            params: { view: 'out' },
            urgent: true,
          },
        ],
      },
    ];
    return groups;
  });
  protected readonly todoTotal = computed(() =>
    this.todoGroups().reduce((sum, group) => sum + group.tiles.reduce((s, t) => s + t.count, 0), 0),
  );

  /**
   * DASH-04: only the orders the API returns (real website orders), newest first, ten at most.
   * Demo marketplace rows are no longer mixed in. Staff rows carry no total (DASH-07).
   */
  protected readonly recentOrders = computed(() => {
    const data = this.data();
    if (!data) return [];
    const money = this.isAdmin();
    return [...(data.recentOrders ?? [])]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 10)
      .map((order: DashboardRecentOrder) => ({
        ...order,
        total: money ? order.total : null,
        badge: statusBadge({ status: order.status, tab: 'to-fulfil' }),
        logo: channelOf(order.channel ?? 'website') ?? channelOf('website'),
        when: dateTime(order.createdAt),
      }));
  });

  /**
   * "Sản phẩm nổi bật". Admin: the API's ranking with revenue. Staff (DASH-07): ranked by units
   * sold, revenue and share dropped; the card shows only when the API sends the list.
   */
  protected readonly showTopProducts = computed(
    () => this.isAdmin() || !!this.data()?.topProducts?.length,
  );
  protected readonly topProducts = computed(() => {
    const rows = this.data()?.topProducts ?? [];
    if (!this.isAdmin()) {
      return [...rows]
        .sort((a, b) => b.units - a.units)
        .map((row, index) => ({
          ...row,
          rank: index + 1,
          revenue: 0,
          share: 0,
          move: { dir: '', text: '', title: '' },
        }));
    }
    return rows.map((row) => ({
      ...row,
      move:
        row.previousRank === null
          ? { dir: 'new', text: 'Mới', title: 'Chưa có hạng ở kỳ so sánh' }
          : row.previousRank > row.rank
            ? {
                dir: 'up',
                text: String(row.previousRank - row.rank),
                title: `Từ hạng ${row.previousRank}`,
              }
            : row.previousRank < row.rank
              ? {
                  dir: 'down',
                  text: String(row.rank - row.previousRank),
                  title: `Từ hạng ${row.previousRank}`,
                }
              : { dir: '', text: '—', title: 'Giữ hạng' },
    }));
  });

  protected readonly imageUrl = adminImageUrl;

  setRange(range: InsightsRange): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { range: range === 'today' ? null : range },
      replaceUrl: true,
    });
  }

  reload(): void {
    this.view.reload();
  }
}
