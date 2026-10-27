import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { date, money, num, percent } from '../../core/format';
import { DatePipe, MoneyPipe, NumPipe } from '../../core/format.pipes';
import { tierBadge } from '../../core/status';
import { ADMIN_REPORTS_API } from '../../data-access/admin-apis';
import type { PageQuery, ReportFigure, ReportRange, SalesReport } from '../../data-access/models';
import { AdmBadge } from '../../ui/badge';
import { AdmChart, ChartSeries } from '../../ui/chart';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { downloadCsv, loader, urlQuery } from '../../ui/list-state';
import { AdmPageHeader } from '../../ui/page-header';

type Tab = 'overview' | 'products' | 'customers' | 'operations' | 'promotions';
type Format = 'money' | 'num' | 'ratio' | 'decimal';
type ProductSort = 'revenue' | 'profit' | 'units' | 'margin' | 'returnRate' | 'daysOfCover';

const RANGES: { value: ReportRange; label: string }[] = [
  { value: '7d', label: '7 ngày' },
  { value: '30d', label: '30 ngày' },
  { value: '90d', label: '90 ngày' },
  { value: '365d', label: '12 tháng' },
];

const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Tổng quan' },
  { value: 'products', label: 'Sản phẩm' },
  { value: 'customers', label: 'Khách hàng' },
  { value: 'operations', label: 'Vận hành và tồn kho' },
  { value: 'promotions', label: 'Khuyến mãi' },
];

const PRODUCT_SORTS: { value: ProductSort; label: string }[] = [
  { value: 'revenue', label: 'Doanh thu: cao đến thấp' },
  { value: 'profit', label: 'Lợi nhuận gộp: cao đến thấp' },
  { value: 'units', label: 'Số lượng bán: nhiều đến ít' },
  { value: 'margin', label: 'Biên lợi nhuận: thấp đến cao' },
  { value: 'returnRate', label: 'Tỷ lệ trả: cao đến thấp' },
  { value: 'daysOfCover', label: 'Tồn đủ bán: ít ngày nhất' },
];

const WEEKDAYS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
const BLOCKS = ['0–4h', '4–8h', '8–12h', '12–16h', '16–20h', '20–24h'];

interface Kpi {
  label: string;
  hint: string;
  figure: ReportFigure;
  format: Format;
  /** False for figures where going down is good (refunds, cancellations, discounts). */
  upIsGood: boolean;
}

interface Insight {
  tone: 'good' | 'warn' | 'info';
  text: string;
  link?: { label: string; path: string; query?: Record<string, string> };
}

/**
 * Báo cáo kinh doanh: where money comes from (products, customers, channels), what it costs
 * (discounts, returns, stock tied up) and what to do next. Every figure compares with the
 * period of the same length just before it.
 */
@Component({
  selector: 'adm-reports-page',
  imports: [
    RouterLink,
    AdmPageHeader,
    AdmEmptyState,
    AdmIcon,
    AdmBadge,
    AdmChart,
    MoneyPipe,
    NumPipe,
    DatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reports-page.html',
  styleUrl: './reports-page.scss',
})
export class ReportsPage {
  private readonly api = inject(ADMIN_REPORTS_API);
  protected readonly ranges = RANGES;
  protected readonly tabs = TABS;
  protected readonly productSorts = PRODUCT_SORTS;
  protected readonly weekdays = WEEKDAYS;
  protected readonly blocks = BLOCKS;
  protected readonly tierBadge = tierBadge;

  protected readonly list = urlQuery<PageQuery & { range: string; tab: string; psort: string }>({
    range: '30d',
    tab: 'overview',
    psort: 'revenue',
  });
  protected readonly query = this.list.query;
  protected readonly range = computed(
    () => (RANGES.find((item) => item.value === this.query().range)?.value ?? '30d') as ReportRange,
  );
  protected readonly tab = computed(
    () => (TABS.find((item) => item.value === this.query().tab)?.value ?? 'overview') as Tab,
  );
  protected readonly view = loader(this.range, (range) => this.api.sales(range));
  protected readonly report = this.view.data;

  protected readonly period = computed(() => {
    const report = this.report();
    if (!report) return '';
    const end = new Date(Date.parse(report.from) - 1).toISOString();
    return `Từ ${date(report.from)} đến ${date(report.to)}, so với kỳ trước từ ${date(report.previousFrom)} đến ${date(end)}`;
  });

  protected readonly kpis = computed<Kpi[]>(() => {
    const k = this.report()?.kpis;
    if (!k) return [];
    return [
      {
        label: 'Doanh thu thuần',
        hint: 'Tiền hàng khách trả, trừ phí giao và tiền hoàn',
        figure: k.netRevenue,
        format: 'money',
        upIsGood: true,
      },
      {
        label: 'Lợi nhuận gộp',
        hint: 'Doanh thu thuần trừ giá vốn hàng đã bán',
        figure: k.grossProfit,
        format: 'money',
        upIsGood: true,
      },
      {
        label: 'Biên lợi nhuận gộp',
        hint: 'Lợi nhuận gộp trên doanh thu thuần',
        figure: k.grossMargin,
        format: 'ratio',
        upIsGood: true,
      },
      {
        label: 'Số đơn',
        hint: 'Đơn đã xác nhận, không gồm đơn hủy',
        figure: k.orders,
        format: 'num',
        upIsGood: true,
      },
      {
        label: 'Giá trị đơn trung bình',
        hint: 'Doanh thu thuần trên số đơn',
        figure: k.averageOrder,
        format: 'money',
        upIsGood: true,
      },
      {
        label: 'Sản phẩm mỗi đơn',
        hint: 'Số món trung bình trong một đơn',
        figure: k.unitsPerOrder,
        format: 'decimal',
        upIsGood: true,
      },
      {
        label: 'Khách mua hàng',
        hint: 'Số khách khác nhau đã đặt đơn',
        figure: k.customers,
        format: 'num',
        upIsGood: true,
      },
      {
        label: 'Tỷ lệ giảm giá',
        hint: 'Tiền giảm bằng mã trên giá trị hàng',
        figure: k.discountRate,
        format: 'ratio',
        upIsGood: false,
      },
      {
        label: 'Tỷ lệ hoàn tiền',
        hint: 'Tiền hoàn do trả hàng trên doanh thu',
        figure: k.refundRate,
        format: 'ratio',
        upIsGood: false,
      },
      {
        label: 'Tỷ lệ hủy đơn',
        hint: 'Đơn bị hủy trên tổng đơn đã đặt',
        figure: k.cancelRate,
        format: 'ratio',
        upIsGood: false,
      },
    ];
  });

  protected readonly trendSeries = computed<ChartSeries[]>(() => {
    const points = this.report()?.trend.points ?? [];
    return [
      { label: 'Kỳ này', data: points.map((point) => point.revenue) },
      { label: 'Kỳ trước', data: points.map((point) => point.previous), comparison: true },
    ];
  });
  protected readonly trendLabels = computed(() =>
    (this.report()?.trend.points ?? []).map((point) => point.label),
  );
  protected readonly bucketLabel = computed(() => {
    const bucket = this.report()?.trend.bucket;
    return bucket === 'month' ? 'theo tháng' : bucket === 'week' ? 'theo tuần' : 'theo ngày';
  });

  protected readonly products = computed(() => {
    const rows = [...(this.report()?.products ?? [])];
    const sort = this.query().psort as ProductSort;
    const by: Record<ProductSort, (row: SalesReport['products'][number]) => number> = {
      revenue: (row) => -row.revenue,
      profit: (row) => -row.profit,
      units: (row) => -row.units,
      margin: (row) => (row.units ? row.margin : 2),
      returnRate: (row) => -row.returnRate,
      daysOfCover: (row) => row.daysOfCover ?? 1e9,
    };
    return rows.sort((a, b) => (by[sort] ?? by.revenue)(a) - (by[sort] ?? by.revenue)(b));
  });
  protected readonly abcSummary = computed(() => {
    const rows = this.report()?.products ?? [];
    return (['A', 'B', 'C'] as const).map((abc) => {
      const group = rows.filter((row) => row.abc === abc);
      return {
        abc,
        count: group.length,
        revenue: group.reduce((sum, row) => sum + row.revenue, 0),
      };
    });
  });

  protected readonly maxSize = computed(() =>
    Math.max(1, ...(this.report()?.bySize.map((row) => row.units) ?? [])),
  );
  protected readonly maxColor = computed(() =>
    Math.max(1, ...(this.report()?.byColor.map((row) => row.units) ?? [])),
  );
  protected readonly maxHeat = computed(() =>
    Math.max(1, ...(this.report()?.heatmap.flat() ?? [])),
  );
  protected readonly peak = computed(() => {
    const heatmap = this.report()?.heatmap;
    if (!heatmap) return null;
    let best = { day: 0, block: 0, count: -1 };
    heatmap.forEach((row, day) =>
      row.forEach((count, block) => {
        if (count > best.count) best = { day, block, count };
      }),
    );
    return best.count > 0 ? `${WEEKDAYS[best.day]}, ${BLOCKS[best.block]}` : null;
  });

  protected readonly insights = computed<Record<Tab, Insight[]>>(() => {
    const r = this.report();
    const empty = { overview: [], products: [], customers: [], operations: [], promotions: [] };
    if (!r) return empty;
    const result: Record<Tab, Insight[]> = {
      ...empty,
      overview: [],
      products: [],
      customers: [],
      operations: [],
      promotions: [],
    };
    const change = (figure: ReportFigure) =>
      figure.previous ? (figure.value - figure.previous) / figure.previous : null;

    const revenueChange = change(r.kpis.netRevenue);
    if (revenueChange !== null)
      result.overview.push({
        tone: revenueChange >= 0 ? 'good' : 'warn',
        text: `Doanh thu thuần ${revenueChange >= 0 ? 'tăng' : 'giảm'} ${percent(Math.abs(revenueChange))} so với kỳ trước.`,
      });
    const aovChange = change(r.kpis.averageOrder);
    const ordersChange = change(r.kpis.orders);
    if (aovChange !== null && ordersChange !== null)
      result.overview.push({
        tone: 'info',
        text:
          Math.abs(ordersChange) >= Math.abs(aovChange)
            ? `Biến động doanh thu chủ yếu đến từ số đơn (${signed(ordersChange)}), giá trị mỗi đơn đổi ít hơn (${signed(aovChange)}).`
            : `Biến động doanh thu chủ yếu đến từ giá trị mỗi đơn (${signed(aovChange)}), số đơn đổi ít hơn (${signed(ordersChange)}).`,
      });
    const topCategory = r.categories[0];
    if (topCategory)
      result.overview.push({
        tone: 'info',
        text: `${topCategory.label} đóng góp ${percent(topCategory.share)} doanh thu, nhiều nhất trong các danh mục.`,
      });
    const cod = r.payments.find((item) => item.method === 'cod');
    if (cod && cod.failureRate > 0.05)
      result.overview.push({
        tone: 'warn',
        text: `${percent(cod.failureRate)} đơn COD đã giao không thành công. Gọi xác nhận trước khi đóng gói giúp giảm số này.`,
        link: {
          label: 'Xem đơn chờ xác nhận',
          path: '/admin/orders',
          query: { view: 'to-confirm' },
        },
      });

    const a = this.abcSummary()[0];
    if (a.count)
      result.products.push({
        tone: 'info',
        text: `${a.count} sản phẩm nhóm A tạo ra khoảng 80% doanh thu. Ưu tiên giữ đủ size cho các mẫu này.`,
      });
    const lowMargin = r.products.filter((row) => row.margin < 0.4 && row.units >= 3);
    if (lowMargin.length)
      result.products.push({
        tone: 'warn',
        text: `${lowMargin.length} sản phẩm có biên lợi nhuận dưới 40%, ví dụ ${lowMargin[0].name} (${percent(lowMargin[0].margin)}). Xem lại giá vốn hoặc mức giảm giá.`,
      });
    const highReturn = r.products.filter((row) => row.returnRate >= 0.15 && row.units >= 3);
    if (highReturn.length)
      result.products.push({
        tone: 'warn',
        text: `${highReturn[0].name} bị trả ${percent(highReturn[0].returnRate)} số đã bán. Nếu lý do là size, hãy kiểm tra lại bảng size.`,
        link: { label: 'Mở bảng size', path: '/admin/size-charts' },
      });
    const topSize = [...r.bySize].sort((x, y) => y.units - x.units)[0];
    const sizeUnits = r.bySize.reduce((sum, row) => sum + row.units, 0);
    if (topSize && sizeUnits)
      result.products.push({
        tone: 'info',
        text: `Size ${topSize.size} chiếm ${percent(topSize.units / sizeUnits)} số lượng bán. Nên nhập size này nhiều hơn khi đặt hàng mới.`,
      });

    const c = r.customers;
    const known = c.newRevenue + c.returningRevenue;
    if (known)
      result.customers.push({
        tone: 'info',
        text: `Khách quay lại mang về ${percent(c.returningRevenue / known)} doanh thu từ khách có tài khoản.`,
      });
    if (c.repeatRate)
      result.customers.push({
        tone: c.repeatRate >= 0.3 ? 'good' : 'warn',
        text: `${percent(c.repeatRate)} khách mua trong kỳ đã mua từ 2 lần trở lên.${c.repeatRate < 0.3 ? ' Một mã ưu đãi cho lần mua thứ hai có thể giúp tăng số này.' : ''}`,
      });
    const gold = c.byTier.find((row) => row.tier === 'gold');
    const member = c.byTier.find((row) => row.tier === 'member');
    if (gold?.averageOrder && member?.averageOrder)
      result.customers.push({
        tone: 'info',
        text: `Đơn trung bình của hạng Vàng là ${money(gold.averageOrder)}, gấp ${num(Math.round((gold.averageOrder / member.averageOrder) * 10) / 10)} lần hạng Đồng.`,
      });
    const peak = this.peak();
    if (peak)
      result.customers.push({
        tone: 'info',
        text: `Khách đặt nhiều nhất vào ${peak.toLowerCase()}. Đây là khung giờ tốt để chạy quảng cáo hoặc đăng sản phẩm mới.`,
      });

    const o = r.operations;
    if (o.hoursToShip !== null)
      result.operations.push({
        tone: o.shippedWithinDay >= 0.7 ? 'good' : 'warn',
        text: `${percent(o.shippedWithinDay)} đơn được bàn giao cho vận chuyển trong 24 giờ. Thời gian xử lý ở giữa là ${o.hoursToShip} giờ.`,
      });
    if (r.inventory.stockoutRisks.length)
      result.operations.push({
        tone: 'warn',
        text: `${r.inventory.stockoutRisks.length} biến thể của sản phẩm bán chạy còn 3 cái trở xuống. Hết size bán chạy là mất doanh thu trực tiếp.`,
        link: { label: 'Mở tồn kho', path: '/admin/inventory', query: { view: 'low' } },
      });
    const aging = r.agingStock.reduce((sum, row) => sum + row.stockValue, 0);
    if (aging)
      result.operations.push({
        tone: 'info',
        text: `${money(aging)} tiền vốn đang nằm ở hàng không bán được trong hơn 30 ngày. Cân nhắc giảm giá hoặc đưa vào bộ sưu tập.`,
      });

    const lift = r.promotionLift;
    if (lift.ordersWithCode && lift.withoutCode)
      result.promotions.push({
        tone: lift.withCode > lift.withoutCode ? 'good' : 'warn',
        text:
          lift.withCode > lift.withoutCode
            ? `Đơn có mã cao hơn đơn không mã ${percent(lift.withCode / lift.withoutCode - 1)}. Mã đang giúp khách mua nhiều hơn.`
            : `Đơn có mã thấp hơn đơn không mã ${percent(1 - lift.withCode / lift.withoutCode)}. Thử đặt giá trị đơn tối thiểu cao hơn.`,
      });
    const costly = r.promotions.filter((row) => row.cost > 0.15);
    if (costly.length)
      result.promotions.push({
        tone: 'warn',
        text: `Mã ${costly[0].code} giảm ${percent(costly[0].cost)} doanh thu nó mang lại. Kiểm tra lại mức giảm tối đa.`,
        link: { label: 'Xem khuyến mãi', path: '/admin/promotions' },
      });
    return result;
  });

  setRange(range: ReportRange): void {
    this.list.update({ range });
  }

  setTab(tab: Tab): void {
    this.list.update({ tab });
  }

  setProductSort(value: string): void {
    this.list.update({ psort: value });
  }

  show(value: number, format: Format): string {
    switch (format) {
      case 'money':
        return money(value);
      case 'ratio':
        return percent(value);
      case 'decimal':
        return num(Math.round(value * 100) / 100);
      default:
        return num(value);
    }
  }

  delta(kpi: Kpi): { text: string; tone: 'good' | 'bad' | '' } {
    const { value, previous } = kpi.figure;
    if (previous === null) return { text: 'Chưa có số kỳ trước', tone: '' };
    const diff = value - previous;
    if (Math.abs(diff) < 1e-9) return { text: 'Không đổi so với kỳ trước', tone: '' };
    const up = diff > 0;
    const tone = up === kpi.upIsGood ? 'good' : 'bad';
    if (kpi.format === 'ratio')
      return {
        text: `${up ? 'Tăng' : 'Giảm'} ${num(Math.round(Math.abs(diff) * 1000) / 10)} điểm % so với kỳ trước`,
        tone,
      };
    if (!previous) return { text: `Kỳ trước bằng 0`, tone };
    return {
      text: `${up ? 'Tăng' : 'Giảm'} ${percent(Math.abs(diff / previous))} so với kỳ trước`,
      tone,
    };
  }

  pct(part: number, whole: number): string {
    return whole ? percent(part / whole) : '–';
  }

  heat(count: number): number {
    return count ? 0.12 + (count / this.maxHeat()) * 0.88 : 0;
  }

  protected readonly percent = percent;
  protected readonly shortMoney = (value: number) =>
    value >= 1_000_000
      ? `${num(Math.round(value / 100_000) / 10)}tr`
      : value >= 1000
        ? `${num(Math.round(value / 1000))}k`
        : num(value);

  exportCsv(): void {
    const report = this.report();
    if (!report) return;
    downloadCsv(
      `bao-cao-san-pham-${report.range}-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'Sản phẩm',
        'Danh mục',
        'Nhóm ABC',
        'Đã bán',
        'Doanh thu',
        'Lợi nhuận gộp',
        'Biên lợi nhuận',
        'Tỷ lệ trả',
        'Tồn kho',
        'Tồn đủ bán (ngày)',
        'Tỷ lệ bán hết',
      ],
      report.products.map((row) => [
        row.name,
        row.category,
        row.abc,
        row.units,
        row.revenue,
        row.profit,
        percent(row.margin),
        percent(row.returnRate),
        row.onHand,
        row.daysOfCover ?? '',
        percent(row.sellThrough),
      ]),
    );
  }
}

function signed(ratio: number): string {
  return `${ratio >= 0 ? 'tăng' : 'giảm'} ${percent(Math.abs(ratio))}`;
}
