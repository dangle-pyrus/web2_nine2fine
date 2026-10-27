import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminSession } from '../../core/admin-session';
import { money, num, percent } from '../../core/format';
import { MoneyPipe, NumPipe, RelativePipe } from '../../core/format.pipes';
import { ADMIN_DASHBOARD_API } from '../../data-access/admin-apis';
import type { DashboardRange, KpiValue } from '../../data-access/models';
import { AdmChart } from '../../ui/chart';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { loader } from '../../ui/list-state';
import { AdmPageHeader } from '../../ui/page-header';

/**
 * Operations dashboard (4.5, 6.1): "what do I need to handle today?". Every KPI and to-do row links
 * to a pre-filtered list. It always shows today: longer periods and comparisons live in Báo cáo.
 */
@Component({
  selector: 'adm-dashboard-page',
  imports: [
    RouterLink,
    AdmPageHeader,
    AdmChart,
    AdmIcon,
    AdmEmptyState,
    MoneyPipe,
    NumPipe,
    RelativePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage {
  protected readonly session = inject(AdminSession);
  private readonly api = inject(ADMIN_DASHBOARD_API);
  private readonly range = signal<DashboardRange>('today');
  protected readonly view = loader(this.range, (range) => this.api.summary(range));
  protected readonly summary = this.view.data;

  protected readonly greeting = computed(() => {
    const hour = Number(
      new Date().toLocaleString('en-US', {
        hour: 'numeric',
        hour12: false,
        timeZone: 'Asia/Ho_Chi_Minh',
      }),
    );
    const part =
      hour < 11
        ? 'Chào buổi sáng'
        : hour < 14
          ? 'Chào buổi trưa'
          : hour < 18
            ? 'Chào buổi chiều'
            : 'Chào buổi tối';
    const name = this.session.user()?.name.split(' ').at(-1) ?? '';
    return `${part}, ${name}`;
  });

  protected readonly todo = computed(() => {
    const todo = this.summary()?.todo;
    if (!todo) return [];
    return [
      {
        label: 'Đơn COD chờ xác nhận',
        hint: 'Gọi khách xác nhận trước khi đóng gói',
        count: todo.toConfirm,
        link: '/admin/orders',
        params: { view: 'to-confirm' },
        show: true,
      },
      {
        label: 'Đơn giao không thành công',
        hint: 'Liên hệ khách để giao lại hoặc hoàn về kho',
        count: todo.deliveryFailed,
        link: '/admin/orders',
        params: { view: 'failed' },
        show: true,
      },
      {
        label: 'Đơn cần chuẩn bị và giao',
        hint: 'Đã xác nhận, chưa bàn giao vận chuyển',
        count: todo.toFulfil,
        link: '/admin/orders',
        params: { view: 'to-fulfil' },
        show: true,
      },
      {
        label: 'Đơn chờ thanh toán',
        hint: 'Chuyển khoản chưa đối soát',
        count: todo.pendingPayment,
        link: '/admin/orders',
        params: { view: 'pending-payment' },
        show: true,
      },
      {
        label: 'Yêu cầu trả hàng chờ duyệt',
        hint: 'Khách đang chờ phản hồi',
        count: todo.returnRequests,
        link: '/admin/returns',
        params: { state: 'pending' },
        show: this.session.can('returns.process'),
      },
      {
        label: 'Biến thể sắp hết hoặc hết hàng',
        hint: 'Khả dụng dưới ngưỡng cảnh báo',
        count: todo.lowStock,
        link: '/admin/inventory',
        params: { view: 'low' },
        show: this.session.can('inventory.view'),
      },
      {
        label: 'Đơn giao trễ',
        hint: 'Quá ngày dự kiến giao, nên hỏi hãng vận chuyển',
        count: todo.lateDelivery,
        link: '/admin/orders',
        params: { view: 'late' },
        show: true,
      },
      {
        label: 'Đơn đang vận chuyển',
        hint: 'Theo dõi giao hàng',
        count: todo.inTransit,
        link: '/admin/orders',
        params: { view: 'in-transit' },
        show: true,
      },
      // Rows with nothing to do are left out; an empty list shows "all done" instead.
    ].filter((item) => item.show && item.count > 0);
  });

  protected readonly chart = computed(() => {
    const series = this.summary()?.revenueSeries ?? [];
    return {
      labels: series.map((point) => point.date.slice(8, 10) + '/' + point.date.slice(5, 7)),
      series: [
        { label: '30 ngày qua', data: series.map((point) => point.revenue) },
        {
          label: '30 ngày trước đó',
          data: series.map((point) => point.previous),
          comparison: true,
        },
      ],
      total: series.reduce((sum, point) => sum + point.revenue, 0),
      previous: series.reduce((sum, point) => sum + point.previous, 0),
    };
  });

  protected readonly shortMoney = (value: number) =>
    value >= 1_000_000
      ? `${num(Math.round(value / 100_000) / 10)}tr`
      : value >= 1000
        ? `${num(Math.round(value / 1000))}k`
        : num(value);
  protected readonly fullMoney = money;

  delta(kpi: KpiValue | undefined): {
    text: string;
    title: string;
    dir: 'up' | 'down' | '';
  } {
    if (!kpi || kpi.change === null)
      return {
        text: 'Chưa có số so sánh',
        title: 'Kỳ trước chưa có dữ liệu',
        dir: '',
      };
    const arrow = kpi.change > 0 ? '▲' : kpi.change < 0 ? '▼' : '';
    const value = `${arrow} ${percent(Math.abs(kpi.change))}`;
    return {
      text: `${value} so với cùng thứ tuần trước`,
      title: `${value} so với cùng thứ tuần trước`,
      dir: kpi.change > 0 ? 'up' : kpi.change < 0 ? 'down' : '',
    };
  }

  rangeChange(): string {
    const { total, previous } = this.chart();
    if (!previous) return '';
    const change = (total - previous) / previous;
    return `${change >= 0 ? 'Tăng' : 'Giảm'} ${percent(Math.abs(change))} so với 30 ngày trước đó`;
  }

  protected readonly percent = percent;

  reload(): void {
    this.view.reload();
  }
}
