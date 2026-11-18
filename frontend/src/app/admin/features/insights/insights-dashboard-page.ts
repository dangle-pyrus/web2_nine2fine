import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { API_CONFIG } from '../../../core/api-config';
import { AdminSession } from '../../core/admin-session';
import { dateTime, money, num, percent } from '../../core/format';
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
import { channelOf, SAMPLE_CHANNEL_ORDERS } from '../../data-access/marketplace-demo';
import { AdmBadge } from '../../ui/badge';
import { AdmChart } from '../../ui/chart';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { loader } from '../../ui/list-state';
import { shortMoney } from './insights-format';

const RANGES: { value: InsightsRange; label: string; compare: string }[] = [
  { value: 'today', label: 'Hôm nay', compare: 'hôm qua' },
  { value: '7d', label: '7 ngày', compare: 'tuần trước' },
  { value: '30d', label: '30 ngày', compare: 'tháng trước' },
];

type ChartMetric = 'revenue' | 'orders';

interface KpiCard {
  key: string;
  label: string;
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
 * current state. Staff get only the order count, the to-do and the recent orders. Marketplace rows
 * in "Đơn hàng gần đây" come from marketplace-demo.ts (the API only knows the website).
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
  /** Data is hidden while an error is shown, so a failed range change never labels old numbers. */
  protected readonly data = computed(() => (this.view.state().error ? null : this.view.data()));
  protected readonly compareName = computed(
    () => RANGES.find((item) => item.value === this.range())!.compare,
  );

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
    const cards: KpiCard[] = [];
    if (k.netRevenue)
      cards.push({
        key: 'netRevenue',
        label: 'Doanh thu thuần',
        icon: 'reiconGraphUp',
        kpi: k.netRevenue,
        text: money(k.netRevenue.value),
      });
    cards.push({
      key: 'orders',
      label: 'Đơn hàng',
      icon: 'reiconBill',
      kpi: k.orders,
      text: num(k.orders.value),
    });
    if (k.averageOrderValue)
      cards.push({
        key: 'averageOrderValue',
        label: 'Giá trị đơn TB',
        icon: 'reiconTicketSale',
        kpi: k.averageOrderValue,
        text: money(k.averageOrderValue.value),
      });
    if (k.returnRate)
      cards.push({
        key: 'returnRate',
        label: 'Tỷ lệ hoàn/đổi',
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
    const metric = this.chartMetric();
    const kpi = metric === 'revenue' ? data.kpis.netRevenue : data.kpis.orders;
    if (!kpi) return null;
    const previous = series.previous ?? [];
    const format = metric === 'revenue' ? shortMoney : (value: number) => num(value);
    const show = (value: number) => (metric === 'revenue' ? money(value) : `${num(value)} đơn`);
    return {
      labels: series.points.map((point) => point.label),
      series: [
        { label: 'Kỳ này', data: series.points.map((point) => point[metric]) },
        {
          label: `Kỳ trước (${this.compareName()})`,
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
            params: { view: 'in-transit' },
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

  /** API rows plus the demo marketplace rows of the same period, newest first, ten at most. */
  protected readonly recentOrders = computed(() => {
    const data = this.data();
    if (!data) return [];
    const from = Date.parse(data.period.from);
    const to = Date.parse(data.period.to);
    const now = Date.parse(data.generatedAt);
    const samples: DashboardRecentOrder[] = SAMPLE_CHANNEL_ORDERS.map((order) => ({
      id: order.code,
      code: order.code,
      createdAt: new Date(now - order.ago * 60_000).toISOString(),
      customerName: order.customerName,
      total: order.total,
      status: order.status,
      paymentStatus: order.status === 'completed' ? 'paid' : 'pending',
      channel: order.channel,
    })).filter((order) => {
      const at = Date.parse(order.createdAt);
      return at >= from && at < to;
    });
    return [...(data.recentOrders ?? []), ...samples]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 10)
      .map((order) => ({
        ...order,
        badge: statusBadge({ status: order.status, tab: 'to-fulfil' }),
        logo: channelOf(order.channel ?? 'website') ?? channelOf('website'),
        when: dateTime(order.createdAt),
      }));
  });

  protected readonly topProducts = computed(() =>
    (this.data()?.topProducts ?? []).map((row) => ({
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
    })),
  );

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
