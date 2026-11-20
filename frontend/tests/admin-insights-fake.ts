import { Page, Route } from '@playwright/test';

/**
 * A small stand-in for `/api/admin/{dashboard,reports/sales,settings/store,audit-log}` and
 * `/api/store/settings` (docs/api/openapi.yaml, Slice 8) for the Playwright specs. The e2e build
 * keeps the earlier mock back office by default; `useInsightsApi` switches it to the real HTTP
 * adapters (`adminInsightsMode = http`) and answers the requests here, so the specs exercise the
 * adapters, the mapping and the error handling. Like the server it sends staff no money on the
 * dashboard (DASH-07), refuses staff on everything else, validates the way the contract says and
 * keeps every total equal (BR-INS-09).
 */
export const INSIGHTS_MODE_KEY = 'n2f.e2e.adminInsightsMode';
export const ORDERS_MODE_KEY = 'n2f.e2e.adminOrdersMode';

type Json = Record<string, unknown>;

export interface Failure {
  status: number;
  code: string;
  message?: string;
  extra?: Json;
  headers?: Record<string, string>;
}

const TZ = 'Asia/Ho_Chi_Minh';
export const todayVn = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
export function shift(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
const isRealDay = (value: string | null) =>
  !!value &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

const CATEGORY = {
  ao: { slug: 'ao', name: 'Áo' },
  quan: { slug: 'quan', name: 'Quần' },
};

const PRODUCTS = {
  p1: { id: '10000000-0000-4000-8000-000000000001', name: 'Áo thun cotton', cat: CATEGORY.ao },
  p2: { id: '10000000-0000-4000-8000-000000000002', name: 'Áo sơ mi linen', cat: CATEGORY.ao },
  p3: { id: '10000000-0000-4000-8000-000000000003', name: 'Quần kaki', cat: CATEGORY.quan },
};

interface Line {
  /** Days before today of the delivery. */
  ago: number;
  order: string;
  product: keyof typeof PRODUCTS;
  sku: string;
  color: string;
  size: string;
  qty: number;
  revenue: number;
  method: 'cod' | 'bank-transfer';
  discount: number;
  shipping: number;
}

/** The reference orders of the PRD (O1, O3 today, O2 yesterday, O8 eight days ago). */
const LINES: Line[] = [
  {
    ago: 0,
    order: 'O1',
    product: 'p1',
    sku: 'AT-TR-M',
    color: 'Trắng',
    size: 'M',
    qty: 2,
    revenue: 600_000,
    method: 'cod',
    discount: 100_000,
    shipping: 30_000,
  },
  {
    ago: 0,
    order: 'O1',
    product: 'p2',
    sku: 'SM-XA-M',
    color: 'Xanh',
    size: 'M',
    qty: 1,
    revenue: 300_000,
    method: 'cod',
    discount: 0,
    shipping: 0,
  },
  {
    ago: 0,
    order: 'O3',
    product: 'p3',
    sku: 'QK-BE-30',
    color: 'Be',
    size: '30',
    qty: 1,
    revenue: 300_000,
    method: 'cod',
    discount: 0,
    shipping: 30_000,
  },
  {
    ago: 1,
    order: 'O2',
    product: 'p2',
    sku: 'SM-XA-M',
    color: 'Xanh',
    size: 'M',
    qty: 4,
    revenue: 1_000_000,
    method: 'bank-transfer',
    discount: 0,
    shipping: 0,
  },
  {
    ago: 8,
    order: 'O8',
    product: 'p1',
    sku: 'AT-TR-M',
    color: 'Trắng',
    size: 'M',
    qty: 3,
    revenue: 2_000_000,
    method: 'cod',
    discount: 0,
    shipping: 0,
  },
];

/** `todo` of Tổng quan v2 (docs/api/openapi.yaml AdminDashboardTodo): the current state, not the range. */
const TODO = {
  toConfirm: 1,
  pendingPayment: 1,
  toFulfil: 1,
  cancelRequests: 1,
  lateDelivery: 1,
  returnRequested: 0,
  returnApproved: 0,
  returnReceived: 0,
  lowStock: 2,
  outOfStock: 1,
};

/** Start of a Vietnam day (`YYYY-MM-DD`) as an ISO instant. */
const vnStart = (day: string) => new Date(`${day}T00:00:00+07:00`).toISOString();
const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

const INITIAL_SETTINGS = {
  info: {
    legalName: 'Công ty TNHH Thời trang Nine2Fine',
    registrationNumber: '0319245768',
    registrationIssuer: 'Sở Tài chính TP. Hồ Chí Minh',
    registrationDate: '2025-08-15',
    address: 'Tầng 5, 172 Hai Bà Trưng, Phường Tân Định, TP. Hồ Chí Minh',
    hotline: '1900 6868 29',
    hotlineHref: 'tel:1900686829',
    email: 'cskh@nine2fine.vn',
    privacyEmail: 'dulieu@nine2fine.vn',
    hours: '9:00 – 21:00, tất cả các ngày trong tuần',
    notificationUrl: '',
    social: { facebook: '', instagram: '', tiktok: '', youtube: '' },
  },
  operations: {
    shippingFee: 30_000,
    freeShippingThreshold: 1_000_000,
    bankHoldMinutes: 30,
    codMaxTotal: 5_000_000,
    deliveryDaysMin: 2,
    deliveryDaysMax: 4,
    cutoffHour: 16,
  },
  cart: {
    maxPerVariant: 10,
    maxItemsPerOrder: 30,
    maxCartLines: 20,
    cartRetentionDays: 30,
    codRefusalLimit: 2,
    codRefusalMonths: 6,
    codOpenOrderLimit: 3,
  },
};

type Settings = typeof INITIAL_SETTINGS;

interface AuditRow {
  id: string;
  at: string;
  actor: { id: string | null; name: string; role: 'staff' | 'admin' };
  action: { code: string; label: string };
  target: { type: string; id: string | null; label: string };
  [key: string]: unknown;
}

function auditRows(): AuditRow[] {
  const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
  return [
    {
      id: 'order:1',
      at: at(1),
      actor: { id: 's2', name: 'Nine2fine Staff', role: 'staff' },
      action: { code: 'order.confirmed', label: 'Xác nhận đơn' },
      target: { type: 'order', id: 'N2F2611081801', label: '#N2F2611081801' },
    },
    {
      id: 'inventory:1',
      at: at(2),
      actor: { id: 's2', name: 'Nine2fine Staff', role: 'staff' },
      action: { code: 'inventory.adjusted', label: 'Điều chỉnh tồn kho +5 (Nhập hàng)' },
      target: { type: 'inventory', id: 'v-1', label: 'AT-TR-M - Áo thun cotton' },
      reason: 'Nhập hàng',
    },
    {
      id: 'account:1',
      at: at(3),
      actor: { id: 's1', name: 'Nine2fine Admin', role: 'admin' },
      action: { code: 'account.locked', label: 'Khoá tài khoản khách' },
      target: { type: 'customer', id: 'c-minh', label: 'Nguyễn Văn Minh' },
      reason: 'Nghi ngờ gian lận',
    },
    {
      id: 'account:2',
      at: at(4),
      actor: { id: 's1', name: 'Nine2fine Admin', role: 'admin' },
      action: { code: 'account.role-changed', label: 'Đổi vai trò nhân viên' },
      target: { type: 'staff', id: 's2', label: 'Nine2fine Staff' },
      roleBefore: 'staff',
      roleAfter: 'admin',
    },
    {
      id: 'settings:0',
      at: at(5),
      actor: { id: 's1', name: 'Nine2fine Admin', role: 'admin' },
      action: { code: 'settings.updated', label: 'Cập nhật cài đặt cửa hàng' },
      target: { type: 'settings', id: 'store', label: 'Cài đặt cửa hàng' },
      changes: [
        {
          field: 'operations.shippingFee',
          label: 'Phí vận chuyển',
          before: '30000',
          after: '40000',
        },
      ],
    },
  ];
}

const FIELD_LABELS: Record<string, string> = {
  'operations.shippingFee': 'Phí vận chuyển',
  'info.hotline': 'Hotline',
  'info.address': 'Địa chỉ',
  'operations.freeShippingThreshold': 'Miễn phí vận chuyển từ',
  'operations.bankHoldMinutes': 'Giữ chuyển khoản',
};

export class InsightsApi {
  constructor(readonly role: 'admin' | 'staff' = 'admin') {}

  requests: { method: string; url: URL; body: Json; headers: Record<string, string> }[] = [];
  /** `METHOD /path` (without `/api/admin`) → fail the next call with this error. */
  failures = new Map<string, Failure>();
  /** `METHOD /path`: drop the next call like a lost connection. */
  aborts = new Set<string>();
  delayMs = 0;
  settings: Settings = structuredClone(INITIAL_SETTINGS);
  updatedAt = '2026-11-10T03:00:00.000Z';
  audit = auditRows();
  /** Dashboard answer overrides, e.g. no orders at all. */
  empty = false;

  find(method: string, pattern: RegExp) {
    return this.requests.filter((r) => r.method === method && pattern.test(r.url.pathname));
  }

  /** What another administrator saving first would do. */
  changeElsewhere(patch: (settings: Settings) => void): void {
    patch(this.settings);
    this.updatedAt = new Date(Date.now() + 1000).toISOString();
  }

  private reply(
    route: Route,
    status: number,
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    return route.fulfill({
      status,
      contentType: 'application/json',
      headers: { 'Cache-Control': 'no-store', ...headers },
      body: body === undefined ? '' : JSON.stringify(body),
    });
  }

  private error(route: Route, status: number, code: string, message: string, extra: Json = {}) {
    return this.reply(route, status, { error: { code, message, ...extra } });
  }

  // ---------- Dashboard ----------

  /**
   * Tổng quan v2 (docs/api/openapi.yaml adminGetDashboard, 2026-11-20): the period and the period
   * right before it (yesterday / the 7 or 30 days before), `kpis`, `series`, `todo`,
   * `recentOrders`, `topProducts` by revenue. Staff get no money: `kpis.orders`, `todo`,
   * `recentOrders` and `topProducts` by units without `revenue` / `share` / `previousRank`.
   */
  private dashboard(route: Route, url: URL) {
    const range = url.searchParams.get('range') ?? 'today';
    if (!['today', '7d', '30d'].includes(range))
      return this.error(route, 422, 'validation', 'range', { field: 'range' });
    const now = new Date();
    const generatedAt = now.toISOString();
    const today = todayVn();
    const days = range === 'today' ? 1 : range === '7d' ? 7 : 30;
    const all = this.empty ? [] : LINES;
    const cur = all.filter((line) => line.ago < days);
    const prev = all.filter((line) => line.ago >= days && line.ago < 2 * days);
    const sum = (lines: Line[]) => lines.reduce((total, line) => total + line.revenue, 0);
    const count = (lines: Line[]) => new Set(lines.map((line) => line.order)).size;
    const kpi = (value: number, previous: number) => ({
      value,
      previous,
      change: previous ? round4((value - previous) / previous) : null,
    });
    const aov = (lines: Line[]) => (count(lines) ? Math.round(sum(lines) / count(lines)) : 0);
    const first = shift(today, -(days - 1));
    const period = {
      from: vnStart(first),
      to: range === 'today' ? generatedAt : vnStart(shift(today, 1)),
    };
    const comparePeriod = { from: vnStart(shift(first, -days)), to: vnStart(first) };
    const orders = kpi(count(cur), count(prev));
    const recentOrders = this.empty
      ? []
      : [
          {
            id: '20000000-0000-4000-8000-000000000001',
            code: 'N2F2611200001',
            createdAt: generatedAt,
            customerName: 'Nguyễn An',
            total: 930_000,
            status: 'to_ship',
            paymentStatus: 'pending',
            channel: 'website',
          },
        ];
    const products = (lines: Line[]) =>
      Object.entries(PRODUCTS)
        .map(([key, product]) => {
          const own = lines.filter((line) => line.product === key);
          return {
            productId: product.id,
            name: product.name,
            image: null,
            category: product.cat,
            units: own.reduce((total, line) => total + line.qty, 0),
            revenue: sum(own),
          };
        })
        .filter((row) => row.units > 0);
    const base = {
      generatedAt,
      range,
      period,
      comparePeriod,
      todo: { ...TODO },
      recentOrders,
    };
    if (this.role === 'staff') {
      const byUnits = products(cur).sort((a, b) => b.units - a.units);
      return this.reply(route, 200, {
        ...base,
        kpis: { orders },
        topProducts: byUnits.map((row, index) => ({
          rank: index + 1,
          productId: row.productId,
          name: row.name,
          image: row.image,
          category: row.category,
          units: row.units,
        })),
      });
    }
    const revenue = sum(cur);
    const ranked = products(cur).sort((a, b) => b.revenue - a.revenue || b.units - a.units);
    const prevRanked = products(prev).sort((a, b) => b.revenue - a.revenue);
    const point = (key: string, label: string, lines: Line[]) => ({
      key,
      label,
      revenue: sum(lines),
      orders: count(lines),
    });
    const series =
      range === 'today'
        ? {
            unit: 'hour',
            points: Array.from({ length: 24 }, (_, h) =>
              point(String(h), `${h}h`, h === 9 ? cur : []),
            ),
            previous: Array.from({ length: 24 }, (_, h) =>
              point(String(h), `${h}h`, h === 9 ? prev : []),
            ),
          }
        : {
            unit: 'day',
            points: Array.from({ length: days }, (_, i) => {
              const ago = days - 1 - i;
              const day = shift(today, -ago);
              return point(day, day.slice(5), cur.filter((line) => line.ago === ago));
            }),
            previous: Array.from({ length: days }, (_, i) => {
              const ago = 2 * days - 1 - i;
              const day = shift(today, -ago);
              return point(day, day.slice(5), prev.filter((line) => line.ago === ago));
            }),
          };
    return this.reply(route, 200, {
      ...base,
      kpis: {
        netRevenue: kpi(revenue, sum(prev)),
        orders,
        averageOrderValue: kpi(aov(cur), aov(prev)),
        returnRate: { value: 0, previous: 0, change: null },
      },
      series,
      topProducts: ranked.slice(0, 5).map((row, index) => {
        const before = prevRanked.findIndex((item) => item.productId === row.productId);
        return {
          rank: index + 1,
          previousRank: before < 0 ? null : before + 1,
          ...row,
          share: revenue ? round4(row.revenue / revenue) : 0,
        };
      }),
    });
  }

  // ---------- Reports ----------

  private resolveRange(url: URL, maxDays: number, field = 'to') {
    const today = todayVn();
    const rawFrom = url.searchParams.get('from');
    const rawTo = url.searchParams.get('to');
    const to = rawTo ?? today;
    const from = rawFrom ?? shift(to, -29);
    if (!isRealDay(from)) return { problem: { field: 'from', message: 'from' } };
    if (!isRealDay(to)) return { problem: { field: 'to', message: 'to' } };
    if (from > to) return { problem: { field: 'from', message: 'from > to' } };
    if (to > today) return { problem: { field: 'to', message: 'to > today' } };
    if (daysBetween(from, to) > maxDays) return { problem: { field, message: 'too long' } };
    return { from, to };
  }

  private figures(from: string, to: string) {
    const today = todayVn();
    const lines = LINES.filter((line) => {
      const day = shift(today, -line.ago);
      return day >= from && day <= to;
    });
    const completedIds = new Set(lines.map((line) => line.order));
    const revenue = lines.reduce((sum, line) => sum + line.revenue, 0);
    const containsToday = to >= today && from <= today;
    const placed = completedIds.size + (containsToday ? 2 : 0);
    const cancelled = containsToday ? 1 : 0;
    const orderShipping = new Map<string, number>();
    const orderDiscount = new Map<string, number>();
    for (const line of lines) {
      orderShipping.set(line.order, Math.max(orderShipping.get(line.order) ?? 0, line.shipping));
      orderDiscount.set(line.order, (orderDiscount.get(line.order) ?? 0) + line.discount);
    }
    return {
      lines,
      revenue,
      completed: completedIds.size,
      units: lines.reduce((sum, line) => sum + line.qty, 0),
      discount: [...orderDiscount.values()].reduce((a, b) => a + b, 0),
      shipping: [...orderShipping.values()].reduce((a, b) => a + b, 0),
      placed,
      cancelled,
      cancelRate:
        placed + cancelled ? Math.round((cancelled / (placed + cancelled)) * 10_000) / 10_000 : 0,
    };
  }

  private report(route: Route, url: URL) {
    const sort = url.searchParams.get('sort') ?? 'units';
    if (!['units', 'revenue'].includes(sort))
      return this.error(route, 422, 'validation', 'sort', { field: 'sort' });
    const range = this.resolveRange(url, 366);
    if ('problem' in range && range.problem)
      return this.error(route, 422, 'validation', range.problem.message, {
        field: range.problem.field,
      });
    const { from, to } = range as { from: string; to: string };
    const days = daysBetween(from, to);
    const previousTo = shift(from, -1);
    const previousFrom = shift(previousTo, -(days - 1));
    const now = this.figures(from, to);
    const before = this.figures(previousFrom, previousTo);
    const figure = (value: number, previous: number, has: boolean) => ({
      value,
      previous: has ? previous : null,
    });
    const hasBefore = before.completed > 0;
    const byProduct = Object.entries(PRODUCTS)
      .map(([key, product]) => {
        const own = now.lines.filter((line) => line.product === key);
        return {
          productId: product.id,
          name: product.name,
          image: null,
          category: product.cat,
          units: own.reduce((sum, line) => sum + line.qty, 0),
          revenue: own.reduce((sum, line) => sum + line.revenue, 0),
        };
      })
      .filter((row) => row.units > 0)
      .sort((a, b) =>
        sort === 'units'
          ? b.units - a.units || b.revenue - a.revenue
          : b.revenue - a.revenue || b.units - a.units,
      );
    const variants = new Map<
      string,
      {
        sku: string;
        color: string;
        size: string;
        product: string;
        productId: string;
        units: number;
        revenue: number;
      }
    >();
    for (const line of now.lines) {
      const entry = variants.get(line.sku) ?? {
        sku: line.sku,
        color: line.color,
        size: line.size,
        product: PRODUCTS[line.product].name,
        productId: PRODUCTS[line.product].id,
        units: 0,
        revenue: 0,
      };
      entry.units += line.qty;
      entry.revenue += line.revenue;
      variants.set(line.sku, entry);
    }
    const categories = Object.values(CATEGORY)
      .map((category) => {
        const own = byProduct.filter((row) => row.category.slug === category.slug);
        const revenue = own.reduce((sum, row) => sum + row.revenue, 0);
        return {
          category,
          revenue,
          units: own.reduce((sum, row) => sum + row.units, 0),
          share: now.revenue ? Math.round((revenue / now.revenue) * 10_000) / 10_000 : 0,
        };
      })
      .filter((row) => row.units > 0)
      .sort((a, b) => b.revenue - a.revenue);
    const byPayment = (['cod', 'bank-transfer'] as const).map((method) => {
      const own = now.lines.filter((line) => line.method === method);
      const revenue = own.reduce((sum, line) => sum + line.revenue, 0);
      return {
        method,
        completedOrders: new Set(own.map((line) => line.order)).size,
        revenue,
        share: now.revenue ? Math.round((revenue / now.revenue) * 10_000) / 10_000 : 0,
      };
    });
    const byDay = Array.from({ length: days }, (_, index) => {
      const date = shift(from, index);
      const own = now.lines.filter((line) => shift(todayVn(), -line.ago) === date);
      return {
        date,
        revenue: own.reduce((sum, line) => sum + line.revenue, 0),
        completedOrders: new Set(own.map((line) => line.order)).size,
        units: own.reduce((sum, line) => sum + line.qty, 0),
      };
    });
    const avg = (f: { revenue: number; completed: number }) =>
      f.completed ? Math.round(f.revenue / f.completed) : 0;
    return this.reply(route, 200, {
      generatedAt: new Date().toISOString(),
      from,
      to,
      previousFrom,
      previousTo,
      days,
      sort,
      kpis: {
        revenue: figure(now.revenue, before.revenue, hasBefore),
        completedOrders: figure(now.completed, before.completed, hasBefore),
        units: figure(now.units, before.units, hasBefore),
        averageOrderValue: figure(avg(now), avg(before), hasBefore),
        discountTotal: figure(now.discount, before.discount, hasBefore),
        shippingCollected: figure(now.shipping, before.shipping, hasBefore),
        placedOrders: figure(now.placed, before.placed, before.placed > 0),
        cancelledOrders: figure(now.cancelled, before.cancelled, before.cancelled > 0),
        cancelRate: figure(now.cancelRate, before.cancelRate, before.placed + before.cancelled > 0),
      },
      byDay,
      topProducts: byProduct.slice(0, 10),
      topVariants: [...variants.values()]
        .map((v) => ({
          variantId: `v-${v.sku}`,
          productId: v.productId,
          sku: v.sku,
          productName: v.product,
          color: v.color,
          size: v.size,
          units: v.units,
          revenue: v.revenue,
        }))
        .sort((a, b) => b.units - a.units || b.revenue - a.revenue),
      byCategory: categories,
      byPayment,
    });
  }

  private csv(route: Route, url: URL) {
    const range = this.resolveRange(url, 366);
    if ('problem' in range && range.problem)
      return this.error(route, 422, 'validation', range.problem.message, {
        field: range.problem.field,
      });
    const { from, to } = range as { from: string; to: string };
    const figures = this.figures(from, to);
    const body =
      '﻿KPI\r\nChỉ số,Giá trị\r\n' +
      `Doanh thu,${figures.revenue}\r\n\r\nTheo ngày\r\nNgày,Doanh thu\r\n`;
    return route.fulfill({
      status: 200,
      contentType: 'text/csv; charset=utf-8',
      headers: {
        'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="nine2fine-bao-cao-${from}_${to}.csv"`,
      },
      body,
    });
  }

  // ---------- Store settings ----------

  private current() {
    return {
      ...structuredClone(this.settings),
      derived: {
        deliveryWindow: `${this.settings.operations.deliveryDaysMin}–${this.settings.operations.deliveryDaysMax} ngày`,
        lowStockDefault: 5,
      },
      updatedAt: this.updatedAt,
    };
  }

  private validate(body: Json): { field: string; message: string }[] {
    const errors: { field: string; message: string }[] = [];
    const info = (body['info'] ?? {}) as Record<string, unknown>;
    const ops = (body['operations'] ?? {}) as Record<string, unknown>;
    const add = (field: string) => errors.push({ field, message: `invalid ${field}` });
    const text = (key: string) => String(info[key] ?? '').trim();
    if (text('legalName').length < 2 || text('legalName').length > 120) add('info.legalName');
    if (!/^([0-9]{10}|[0-9]{13})$/.test(text('registrationNumber'))) add('info.registrationNumber');
    if (text('address').length < 10 || text('address').length > 200) add('info.address');
    if (text('hours').length > 100) add('info.hours');
    const digits = text('hotline').replace(/[\s.-]/g, '');
    if (!/^\d{8,11}$/.test(digits) || !/^(0|1800|1900)/.test(digits)) add('info.hotline');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text('email')) || text('email').length > 254)
      add('info.email');
    const int = (key: string) => ops[key] as number;
    const bad = (key: string, min: number, max: number, step = 1) =>
      !Number.isInteger(int(key)) || int(key) < min || int(key) > max || int(key) % step !== 0;
    if (bad('shippingFee', 0, 500_000, 1000)) add('operations.shippingFee');
    if (bad('freeShippingThreshold', 0, 50_000_000, 1000)) add('operations.freeShippingThreshold');
    if (bad('bankHoldMinutes', 10, 1440)) add('operations.bankHoldMinutes');
    if (bad('codMaxTotal', 100_000, 50_000_000)) add('operations.codMaxTotal');
    if (bad('deliveryDaysMin', 1, 30)) add('operations.deliveryDaysMin');
    if (bad('deliveryDaysMax', 1, 30)) add('operations.deliveryDaysMax');
    else if (int('deliveryDaysMin') > int('deliveryDaysMax')) add('operations.deliveryDaysMax');
    if (bad('cutoffHour', 0, 23)) add('operations.cutoffHour');
    return errors;
  }

  private save(route: Route, body: Json) {
    if (!body['updatedAt'])
      return this.error(route, 422, 'validation', 'updatedAt', { field: 'updatedAt' });
    const errors = this.validate(body);
    if (errors.length)
      return this.error(route, 422, 'validation', errors[0].message, {
        field: errors[0].field,
        fieldErrors: errors,
      });
    const info = body['info'] as Settings['info'];
    const nextInfo = {
      ...this.settings.info,
      legalName: info.legalName.trim(),
      registrationNumber: info.registrationNumber.trim(),
      registrationIssuer: info.registrationIssuer.trim(),
      registrationDate: info.registrationDate || null,
      address: info.address.trim(),
      hotline: info.hotline.trim(),
      hotlineHref: `tel:${info.hotline.replace(/\D/g, '')}`,
      email: info.email.trim().toLowerCase(),
      privacyEmail: info.privacyEmail.trim().toLowerCase(),
      hours: info.hours.trim(),
      notificationUrl: (info.notificationUrl ?? '').trim(),
      social: { ...this.settings.info.social, ...(info.social ?? {}) },
    } as Settings['info'];
    const next: Settings = {
      info: nextInfo,
      operations: body['operations'] as Settings['operations'],
      cart: (body['cart'] as Settings['cart'] | undefined) ?? this.settings.cart,
    };
    const flat = (settings: Settings) => {
      const out: Record<string, string> = {};
      const walk = (prefix: string, node: unknown) => {
        if (node && typeof node === 'object')
          for (const [key, value] of Object.entries(node)) walk(`${prefix}${key}.`, value);
        else out[prefix.slice(0, -1)] = node === null ? '' : String(node);
      };
      walk('', settings);
      delete out['info.hotlineHref'];
      return out;
    };
    const before = flat(this.settings);
    const after = flat(next);
    const changed = Object.keys(after).filter((key) => before[key] !== after[key]);
    if (!changed.length) return this.reply(route, 200, this.current());
    if (body['updatedAt'] !== this.updatedAt)
      return this.error(route, 409, 'version-conflict', 'Cài đặt vừa được cập nhật.');
    this.settings = next;
    this.updatedAt = new Date().toISOString();
    this.audit.unshift({
      id: `settings:${this.audit.length + 1}`,
      at: this.updatedAt,
      actor: { id: 's1', name: 'Nine2fine Admin', role: 'admin' },
      action: { code: 'settings.updated', label: 'Cập nhật cài đặt cửa hàng' },
      target: { type: 'settings', id: 'store', label: 'Cài đặt cửa hàng' },
      changes: changed.map((field) => ({
        field,
        label: FIELD_LABELS[field] ?? field,
        before: before[field],
        after: after[field],
      })),
    });
    return this.reply(route, 200, this.current());
  }

  /** Writes that changed something (one audit row each). */
  get saves(): number {
    return this.audit.filter((row) => row.id.startsWith('settings:') && row.id !== 'settings:0')
      .length;
  }

  // ---------- Audit log ----------

  private auditLog(route: Route, url: URL) {
    const range = this.resolveRange(url, 92);
    if ('problem' in range && range.problem)
      return this.error(route, 422, 'validation', range.problem.message, {
        field: range.problem.field,
      });
    const type = url.searchParams.get('targetType');
    if (type && !['order', 'inventory', 'customer', 'staff', 'settings'].includes(type))
      return this.error(route, 422, 'validation', 'targetType', { field: 'targetType' });
    const limit = Number(url.searchParams.get('limit') ?? 20);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      return this.error(route, 422, 'validation', 'limit', { field: 'limit' });
    const page = Number(url.searchParams.get('page') ?? 1);
    const { from, to } = range as { from: string; to: string };
    const rows = this.audit.filter((row) => {
      const day = new Date(row.at).toLocaleDateString('en-CA', { timeZone: TZ });
      return (!type || row.target.type === type) && day >= from && day <= to;
    });
    return this.reply(route, 200, {
      items: rows.slice((page - 1) * limit, page * limit),
      total: rows.length,
      page,
      limit,
    });
  }

  async handle(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const path = url.pathname.replace(/^\/api\/admin/, '');
    let body: Json = {};
    try {
      const raw = request.postDataBuffer();
      body = raw ? (JSON.parse(raw.toString('utf-8')) as Json) : {};
    } catch {
      body = {};
    }
    this.requests.push({ method, url, body, headers: request.headers() });
    const key = `${method} ${path}`;
    if (this.aborts.delete(key)) return route.abort('connectionreset');
    if (this.delayMs) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    const failure = this.failures.get(key);
    if (failure) {
      this.failures.delete(key);
      const headers = failure.headers ?? {};
      return this.reply(
        route,
        failure.status,
        { error: { code: failure.code, message: failure.message ?? 'Lỗi', ...failure.extra } },
        headers,
      );
    }
    if (url.pathname === '/api/store/settings') return this.publicSettings(route);
    if (path === '/dashboard' && method === 'GET') return this.dashboard(route, url);
    if (this.role !== 'admin') return this.error(route, 403, 'forbidden', 'Không đủ quyền');
    if (path === '/reports/sales' && method === 'GET') return this.report(route, url);
    if (path === '/reports/sales/export' && method === 'GET') return this.csv(route, url);
    if (path === '/reports-extra' && method === 'GET') return this.extra(route, url);
    if (path === '/settings/store' && method === 'GET')
      return this.reply(route, 200, this.current());
    if (path === '/settings/store' && method === 'PUT') return this.save(route, body);
    if (path === '/audit-log' && method === 'GET') return this.auditLog(route, url);
    return this.error(route, 404, 'not-found', 'Không tìm thấy.');
  }

  /**
   * `GET /api/admin/reports-extra` (admin upgrade 2026-11-15): fixed figures in the shape of
   * backend/src/modules/insights-extra; `empty` gives an all-zero answer like an empty range.
   */
  private extra(route: Route, url: URL) {
    const from = url.searchParams.get('from') ?? shift(todayVn(), -29);
    const to = url.searchParams.get('to') ?? todayVn();
    const zero = this.empty;
    const heatmap = Array.from({ length: 7 }, (_, d) =>
      Array.from({ length: 24 }, (_, h) => (zero ? 0 : d === 4 && h === 20 ? 3 : h === 9 ? 1 : 0)),
    );
    return this.reply(route, 200, {
      generatedAt: new Date().toISOString(),
      from,
      to,
      days: 30,
      customers: {
        buyers: zero ? 0 : 5,
        newBuyers: zero ? 0 : 3,
        returningBuyers: zero ? 0 : 2,
        repeatBuyers: zero ? 0 : 1,
        repeatRate: zero ? 0 : 0.2,
        newOrders: zero ? 0 : 3,
        returningOrders: zero ? 0 : 3,
        newSpend: zero ? 0 : 1_500_000,
        returningSpend: zero ? 0 : 2_100_000,
        members: zero ? 0 : 4,
        guests: zero ? 0 : 1,
      },
      operations: {
        medianMinutes: zero
          ? { confirm: null, handover: null, deliver: null }
          : { confirm: 45, handover: 1500, deliver: 2880 },
        counts: {
          placed: zero ? 0 : 7,
          cancelled: zero ? 0 : 1,
          confirmed: 5,
          handedOver: 4,
          delivered: 4,
        },
        onTime: zero
          ? { delivered: 0, onTime: 0, rate: 0 }
          : { delivered: 4, onTime: 3, rate: 0.75 },
        cancelReasons: zero ? [] : [{ code: 'unreachable', actor: 'staff', orders: 1 }],
      },
      returns: zero
        ? []
        : [
            {
              reason: 'not-fit',
              fault: 'customer',
              requests: 1,
              refunded: 1,
              refundedAmount: 300_000,
            },
          ],
      promotions: {
        orders: zero ? 0 : 6,
        ordersWithVoucher: zero ? 0 : 2,
        share: zero ? 0 : 0.3333,
        orderValue: zero ? 0 : 3_600_000,
        voucherOrderValue: zero ? 0 : 1_250_000,
        totalDiscount: zero ? 0 : 80_000,
        codes: zero
          ? []
          : [
              {
                code: 'GIAM50K',
                kind: 'discount',
                orders: 1,
                discount: 50_000,
                orderValue: 650_000,
              },
              {
                code: 'FREESHIP',
                kind: 'shipping',
                orders: 1,
                discount: 30_000,
                orderValue: 600_000,
              },
            ],
      },
      provinces: zero
        ? []
        : [
            { code: '79', name: 'TP. Hồ Chí Minh', orders: 4, orderValue: 2_400_000 },
            { code: '01', name: 'Hà Nội', orders: 2, orderValue: 1_200_000 },
          ],
      heatmap,
    });
  }

  /** `GET /api/store/settings`: the whitelist, no cookie needed. */
  private publicSettings(route: Route) {
    const { info, operations } = this.settings;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Cache-Control': 'public, max-age=60' },
      body: JSON.stringify({
        info: {
          ...info,
          notificationUrl: info.notificationUrl || null,
          social: {
            facebook: info.social.facebook || null,
            instagram: info.social.instagram || null,
            tiktok: info.social.tiktok || null,
            youtube: info.social.youtube || null,
          },
        },
        policy: {
          freeShippingFrom: operations.freeShippingThreshold,
          shippingFee: operations.shippingFee,
          deliveryWindow: `${operations.deliveryDaysMin}–${operations.deliveryDaysMax} ngày`,
          paymentHoldMinutes: operations.bankHoldMinutes,
        },
      }),
    });
  }
}

/** Switches the e2e build to the HTTP adapters of Slice 8 and routes the API to the fake. */
export async function useInsightsApi(page: Page, api = new InsightsApi()): Promise<InsightsApi> {
  await page.addInitScript(
    ([insightsKey, ordersKey]) => {
      localStorage.setItem(insightsKey, 'http');
      localStorage.setItem(ordersKey, 'contract-mock');
    },
    [INSIGHTS_MODE_KEY, ORDERS_MODE_KEY],
  );
  await page.route(/\/api\/admin\/(dashboard|reports|settings|audit-log)/, (route) =>
    api.handle(route),
  );
  await page.route(/\/api\/store\/settings/, (route) => api.handle(route));
  return api;
}
