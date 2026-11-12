import type { SalesReport } from './report.service';

/**
 * CSV báo cáo bán hàng (BR-RPT-09, S8-Q6): hàm thuần trên chính `SalesReport` đã dựng (số bằng đúng màn).
 * UTF-8 có BOM, CRLF, năm khối cách nhau một dòng trống, chống công thức (CSV injection).
 */

const BOM = '﻿';
const EOL = '\r\n';

/** Ô văn bản: ký tự đầu `= + - @ TAB CR` thêm `'` đầu (không chạy như công thức); chứa `, " CR LF` thì bọc `"` và nhân đôi `"`. */
export function csvCell(s: string): string {
  let v = s;
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const num = (n: number | null): string => (n === null ? '' : String(n)); // số nguyên không phân cách nghìn; tỉ lệ dùng dấu chấm
const row = (cells: Array<string | number | null>): string =>
  cells.map((c) => (typeof c === 'number' ? num(c) : c === null ? '' : csvCell(c))).join(',');

const PAYMENT_LABEL: Record<string, string> = { cod: 'Thanh toán khi nhận hàng (COD)', 'bank-transfer': 'Chuyển khoản' };

const KPI_ROWS: Array<[keyof SalesReport['kpis'], string]> = [
  ['revenue', 'Doanh thu (đồng)'],
  ['completedOrders', 'Đơn hoàn thành'],
  ['units', 'Số lượng bán'],
  ['averageOrderValue', 'Giá trị trung bình mỗi đơn (đồng)'],
  ['discountTotal', 'Tổng giảm giá (đồng)'],
  ['shippingCollected', 'Phí vận chuyển thu (đồng)'],
  ['placedOrders', 'Đơn đặt'],
  ['cancelledOrders', 'Đơn huỷ'],
  ['cancelRate', 'Tỉ lệ huỷ'],
  ['refundedAmount', 'Tiền hàng đã hoàn (đồng)'],
  ['refundedUnits', 'Số lượng đã hoàn'],
  ['returnedOrders', 'Đơn có trả hàng'],
  ['returnRate', 'Tỉ lệ trả hàng'],
];

export function toSalesCsv(r: SalesReport): string {
  const blocks: string[][] = [
    [
      'KPI',
      row(['Chỉ số', `Kỳ này (${r.from} đến ${r.to})`, `Kỳ trước (${r.previousFrom} đến ${r.previousTo})`]),
      ...KPI_ROWS.map(([k, label]) => row([label, r.kpis[k].value, r.kpis[k].previous])),
    ],
    ['Theo ngày', row(['Ngày', 'Doanh thu (đồng)', 'Đơn hoàn thành', 'Số lượng bán']), ...r.byDay.map((d) => row([d.date, d.revenue, d.completedOrders, d.units]))],
    [
      'Top sản phẩm',
      row(['Hạng', 'Sản phẩm', 'Danh mục', 'Số lượng bán', 'Doanh thu (đồng)']),
      ...r.topProducts.map((p, i) => row([i + 1, p.name, p.category.name, p.units, p.revenue])),
    ],
    ['Theo danh mục', row(['Danh mục', 'Doanh thu (đồng)', 'Số lượng bán', 'Tỉ trọng']), ...r.byCategory.map((c) => row([c.category.name, c.revenue, c.units, c.share]))],
    [
      'Theo phương thức thanh toán',
      row(['Phương thức', 'Đơn hoàn thành', 'Doanh thu (đồng)', 'Tỉ trọng']),
      ...r.byPayment.map((p) => row([PAYMENT_LABEL[p.method] ?? p.method, p.completedOrders, p.revenue, p.share])),
    ],
  ];
  return BOM + blocks.map((b) => [...b, ''].join(EOL)).join(EOL) + EOL;
}
