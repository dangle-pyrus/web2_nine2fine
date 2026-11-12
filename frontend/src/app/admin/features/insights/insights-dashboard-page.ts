import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { API_CONFIG } from '../../../core/api-config';
import { AdminSession } from '../../core/admin-session';
import { MoneyPipe, NumPipe } from '../../core/format.pipes';
import { adminImageUrl } from '../../data-access/catalog-media';
import { ADMIN_INSIGHTS_DASHBOARD_API } from '../../data-access/insights-api';
import { insightsErrorMessage } from '../../data-access/insights-errors';
import type { InsightsRange, KpiValue } from '../../data-access/insights-models';
import { AdmChart } from '../../ui/chart';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { loader } from '../../ui/list-state';
import { AdmPageHeader } from '../../ui/page-header';
import { clockTime, deltaText, shortDay, shortMoney, weekdayName } from './insights-format';

const RANGES: { value: InsightsRange; label: string }[] = [
  { value: 'today', label: 'Hôm nay' },
  { value: '7d', label: '7 ngày' },
  { value: '30d', label: '30 ngày' },
];

interface TodoRow {
  key: string;
  label: string;
  hint: string;
  count: number;
  link: string;
  params: Record<string, string>;
}

/**
 * Tổng quan on the real API (Slice 8, BR-DSH-01..08). Staff get only `todo` and `orders` from the
 * server, so every money block is drawn only when its key is present. The range lives in the URL.
 */
@Component({
  selector: 'adm-insights-dashboard-page',
  imports: [RouterLink, AdmPageHeader, AdmChart, AdmIcon, AdmEmptyState, MoneyPipe, NumPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './insights-dashboard-page.html',
  styleUrl: '../dashboard/dashboard-page.scss',
})
export class InsightsDashboardPage {
  protected readonly session = inject(AdminSession);
  private readonly api = inject(ADMIN_INSIGHTS_DASHBOARD_API);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly catalogLive = inject(API_CONFIG).adminCatalogMode === 'http';
  protected readonly ranges = RANGES;
  protected readonly isAdmin = computed(() => this.session.can('dashboard.revenue'));

  /** `?range=` of the URL; a staff member has no range (the server sends only today's counts). */
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
    (range) => this.api.get(this.isAdmin() ? range : 'today'),
    insightsErrorMessage,
  );
  /** Data is hidden while an error is shown, so a failed range change never labels old numbers. */
  protected readonly data = computed(() => (this.view.state().error ? null : this.view.data()));

  protected readonly updatedAt = computed(() => clockTime(this.data()?.generatedAt));

  /** Which period the percentages compare with (BR-DSH-08). */
  protected readonly against = computed(() => {
    const data = this.data();
    const range = this.isAdmin() ? this.range() : 'today';
    if (range === '7d') return 'so với 7 ngày trước';
    if (range === '30d') return 'so với 30 ngày trước';
    return data ? `so với cùng giờ ${weekdayName(data.generatedAt)} tuần trước` : '';
  });

  protected readonly kpis = computed(() => {
    const data = this.data();
    if (!data) return [];
    const rows: { key: string; label: string; kpi: KpiValue; money: boolean; main?: boolean }[] =
      [];
    if (data.revenue)
      rows.push({
        key: 'revenue',
        label: 'Doanh thu',
        kpi: data.revenue,
        money: true,
        main: true,
      });
    rows.push({ key: 'orders', label: 'Đơn đặt', kpi: data.orders, money: false });
    if (data.completedOrders)
      rows.push({
        key: 'completedOrders',
        label: 'Đơn hoàn tất',
        kpi: data.completedOrders,
        money: false,
      });
    if (data.averageOrderValue)
      rows.push({
        key: 'averageOrderValue',
        label: 'Giá trị trung bình mỗi đơn',
        kpi: data.averageOrderValue,
        money: true,
      });
    if (data.newCustomers)
      rows.push({
        key: 'newCustomers',
        label: 'Khách mới',
        kpi: data.newCustomers,
        money: false,
      });
    return rows;
  });

  /** "Chưa có đơn trong khoảng này": nothing placed and nothing completed. */
  protected readonly noOrders = computed(() => {
    const data = this.data();
    return (
      !!data &&
      data.orders.value === 0 &&
      (data.completedOrders ? data.completedOrders.value === 0 : true)
    );
  });

  protected readonly todo = computed((): TodoRow[] => {
    const todo = this.data()?.todo;
    if (!todo) return [];
    return [
      {
        key: 'toConfirm',
        label: 'Đơn COD cần gọi xác nhận',
        hint: 'Gọi khách xác nhận trước khi đóng gói',
        count: todo.toConfirm,
        link: '/admin/orders',
        params: { view: 'to-confirm' },
      },
      {
        key: 'pendingPayment',
        label: 'Đơn chờ thanh toán',
        hint: 'Chuyển khoản chưa nhận được tiền',
        count: todo.pendingPayment,
        link: '/admin/orders',
        params: { view: 'pending-payment' },
      },
      {
        key: 'toFulfil',
        label: 'Đơn cần chuẩn bị và bàn giao',
        hint: 'Đã xác nhận, chưa giao cho vận chuyển',
        count: todo.toFulfil,
        link: '/admin/orders',
        params: { view: 'to-fulfil' },
      },
      {
        key: 'inTransit',
        label: 'Đơn đang giao',
        hint: 'Theo dõi giao hàng',
        count: todo.inTransit,
        link: '/admin/orders',
        params: { view: 'in-transit' },
      },
      {
        key: 'cancelRequests',
        label: 'Yêu cầu huỷ đơn',
        hint: 'Khách đang chờ phản hồi',
        count: todo.cancelRequests,
        link: '/admin/orders',
        params: { view: 'cancel-requests' },
      },
      {
        key: 'returning',
        label: 'Hàng hoàn chờ xử lý',
        hint: 'Kiểm hàng và nhập lại kho hoặc huỷ bỏ',
        count: todo.returning,
        link: '/admin/orders',
        params: { view: 'returning' },
      },
      {
        key: 'lateDelivery',
        label: 'Đơn giao trễ',
        hint: 'Quá ngày giao dự kiến cuối, nên hỏi hãng vận chuyển',
        count: todo.lateDelivery,
        link: '/admin/orders',
        params: { view: 'in-transit' },
      },
      {
        key: 'lowStock',
        label: 'Biến thể sắp hết hàng',
        hint: 'Còn dưới ngưỡng cảnh báo',
        count: todo.lowStock,
        link: '/admin/inventory',
        params: { view: 'low' },
      },
      {
        key: 'outOfStock',
        label: 'Biến thể hết hàng',
        hint: 'Không còn hàng để bán',
        count: todo.outOfStock,
        link: '/admin/inventory',
        params: { view: 'out' },
      },
    ];
  });

  protected readonly chart = computed(() => {
    const series = this.data()?.revenueSeries ?? [];
    return {
      labels: series.map((point) => shortDay(point.date)),
      series: [
        { label: '30 ngày qua', data: series.map((point) => point.revenue) },
        {
          label: '30 ngày trước đó',
          data: series.map((point) => point.previous),
          comparison: true,
        },
      ],
      total: series.reduce((sum, point) => sum + point.revenue, 0),
    };
  });

  protected readonly shortMoney = shortMoney;
  protected readonly imageUrl = adminImageUrl;
  protected readonly delta = (kpi: KpiValue) => deltaText(kpi.change, this.against());

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
