import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { INSIGHT_PERMISSIONS, INSIGHTS_ASSUMPTIONS } from '../../config/assumptions';
import { changeRatio, divRoundHalfUp, ratio4 } from '../../lib/money-math';
import { Db, ts } from '../../lib/sql';
import { addCalendarDays, vnDateISO, vnHour } from '../../lib/vn-time';
import { inventoryCounts } from '../catalog-admin/inventory.query';
import { countOrders } from '../order-admin/order-admin.query';
import { DashboardRange, periodsOf, Span } from './periods';
import { countReturns } from '../returns/return.query';
import { orderCounts, periodKpis, revenueByDay, revenueByHour, topProducts } from './revenue.sql';

/**
 * Tổng quan v2 (nâng cấp 2026-11-15, contract: docs/api/openapi.yaml, tag admin-dashboard). Mọi vai trò: kỳ, `kpis.orders`, `todo`,
 * `recentOrders`; phần tiền (`netRevenue`, `averageOrderValue`, `returnRate`, `series`, `topProducts`) chỉ khi vai trò có
 * `dashboard.revenue` (staff không nhận khoá, không phải `null`). Kỳ so sánh: xem `periodsOf`.
 */

interface Kpi {
  value: number;
  previous: number;
  change: number | null;
}
const kpi = (value: number, previous: number): Kpi => ({ value, previous, change: changeRatio(value, previous) });
/** Tỉ lệ: `change` là thay đổi tương đối của tỉ lệ; `null` khi kỳ trước bằng 0. */
const rateKpi = (value: number, previous: number): Kpi => ({
  value,
  previous,
  change: previous > 0 ? Math.round(((value - previous) / previous) * 10_000) / 10_000 : null,
});
const aov = (revenue: number, orders: number): number => (orders > 0 ? divRoundHalfUp(revenue, orders) : 0);
const n = (v: unknown): number => Number(v ?? 0);
const inSpan = (col: string, s: Span) => Prisma.sql`(${Prisma.raw(col)} >= ${ts(s.from)} AND ${Prisma.raw(col)} < ${ts(s.to)})`;

async function lateDelivery(db: Db, now: Date): Promise<number> {
  const [r] = await db.$queryRaw<Array<{ n: number }>>(Prisma.sql`
    SELECT COUNT(*)::int AS n FROM orders WHERE status = 'to_receive' AND estimated_to < ${vnDateISO(now)}::date`);
  return Number(r.n);
}

/** Tỉ lệ hoàn/đổi = yêu cầu trả hàng tạo trong kỳ (trừ đã huỷ) / đơn đã giao trong kỳ. */
async function returnRates(db: Db, cur: Span, prev: Span): Promise<[number, number]> {
  const [r] = await db.$queryRaw<Array<{ rc: number; rp: number; dc: number; dp: number }>>(Prisma.sql`
    SELECT
      (SELECT COUNT(*) FROM order_returns WHERE state <> 'cancelled' AND ${inSpan('requested_at', cur)})::int AS rc,
      (SELECT COUNT(*) FROM order_returns WHERE state <> 'cancelled' AND ${inSpan('requested_at', prev)})::int AS rp,
      (SELECT COUNT(*) FROM orders WHERE status = 'completed' AND delivered_at IS NOT NULL AND ${inSpan('delivered_at', cur)})::int AS dc,
      (SELECT COUNT(*) FROM orders WHERE status = 'completed' AND delivered_at IS NOT NULL AND ${inSpan('delivered_at', prev)})::int AS dp`);
  return [ratio4(n(r.rc), n(r.dc)), ratio4(n(r.rp), n(r.dp))];
}

/** Đơn đặt (không huỷ) theo giờ VN (`hour`) hoặc ngày VN (`day`, YYYY-MM-DD). */
async function placedBuckets(db: Db, span: Span, unit: 'hour' | 'day'): Promise<Map<string, number>> {
  const bucket =
    unit === 'hour'
      ? Prisma.sql`EXTRACT(HOUR FROM created_at + INTERVAL '7 hours')::int::text`
      : Prisma.sql`to_char((created_at + INTERVAL '7 hours')::date, 'YYYY-MM-DD')`;
  const rows = await db.$queryRaw<Array<{ k: string; n: number }>>(Prisma.sql`
    SELECT ${bucket} AS k, COUNT(*)::int AS n FROM orders WHERE status <> 'cancelled' AND ${inSpan('created_at', span)} GROUP BY 1`);
  return new Map(rows.map((r) => [r.k, n(r.n)]));
}

const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

interface Point {
  key: string;
  label: string;
  revenue: number | null;
  orders: number | null;
}

/**
 * Biểu đồ: `points` (kỳ này) và `previous` (kỳ so sánh) cùng độ dài, khớp theo CHỈ SỐ.
 * - today: 24 giờ 0h..23h; giờ chưa tới của hôm nay = null; previous = cùng giờ của hôm qua.
 * - 7d: 7 ngày theo thời gian; previous = ngày CÙNG THỨ của tuần lịch trước.
 * - 30d: 30 ngày theo thời gian; previous = ngày CÙNG NGÀY TRONG THÁNG của tháng trước (không có ngày đó = null).
 */
async function series(db: Db, range: DashboardRange, cur: Span, prev: Span, now: Date) {
  if (range === 'today') {
    const [rc, rp, oc, op] = await Promise.all([revenueByHour(db, cur), revenueByHour(db, prev), placedBuckets(db, cur, 'hour'), placedBuckets(db, prev, 'hour')]);
    const nowHour = vnHour(now);
    const hours = Array.from({ length: 24 }, (_, h) => h);
    return {
      unit: 'hour' as const,
      points: hours.map((h): Point => ({
        key: String(h), label: `${h}h`,
        revenue: h > nowHour ? null : (rc.get(h) ?? 0), orders: h > nowHour ? null : (oc.get(String(h)) ?? 0),
      })),
      previous: hours.map((h): Point => ({ key: String(h), label: `${h}h`, revenue: rp.get(h) ?? 0, orders: op.get(String(h)) ?? 0 })),
    };
  }
  const today = vnDateISO(now);
  const days = range === '7d' ? 7 : 30;
  const curDays = Array.from({ length: days }, (_, i) => addCalendarDays(today, -(days - 1) + i));
  // DASH-03/06: `previous[i]` = ngày cùng vị trí của N ngày liền trước (ngày `i` của kỳ này lùi N ngày).
  const prevOf = (iso: string): string | null => addCalendarDays(iso, -days);
  const [rc, rp, oc, op] = await Promise.all([revenueByDay(db, cur), revenueByDay(db, prev), placedBuckets(db, cur, 'day'), placedBuckets(db, prev, 'day')]);
  const label = (iso: string) => (range === '7d' ? `${WEEKDAY[weekdayOf(iso)]} ${dm(iso)}` : dm(iso));
  return {
    unit: 'day' as const,
    points: curDays.map((d): Point => ({ key: d, label: label(d), revenue: rc.get(d)?.revenue ?? 0, orders: oc.get(d) ?? 0 })),
    previous: curDays.map((d): Point => {
      const p = prevOf(d);
      return p
        ? { key: p, label: label(p), revenue: rp.get(p)?.revenue ?? 0, orders: op.get(p) ?? 0 }
        : { key: '', label: '', revenue: null, orders: null };
    }),
  };
}

async function recentOrders(db: Db, span: Span) {
  const rows = await db.$queryRaw<
    Array<{ order_id: string; code: string; created_at: Date; recipient_name: string; total: number; status: string; payment_status: string }>
  >(Prisma.sql`
    SELECT order_id, code, created_at, recipient_name, total, status::text AS status, payment_status::text AS payment_status
    FROM orders WHERE ${inSpan('created_at', span)} ORDER BY created_at DESC, order_id DESC LIMIT 10`);
  return rows.map((r) => ({
    id: r.order_id,
    code: r.code,
    createdAt: new Date(r.created_at).toISOString(),
    customerName: r.recipient_name,
    total: n(r.total),
    status: r.status,
    paymentStatus: r.payment_status,
    channel: 'website' as const,
  }));
}

export async function getDashboard(role: 'staff' | 'admin', range: DashboardRange, now: Date) {
  const { cur, prev } = periodsOf(range, now);
  const withMoney = INSIGHT_PERMISSIONS[role].includes('dashboard.revenue');

  const [oc, counts, inv, late, rc, recent] = await Promise.all([
    orderCounts(prisma, cur, prev),
    countOrders({}),
    inventoryCounts(prisma),
    lateDelivery(prisma, now),
    countReturns(prisma),
    recentOrders(prisma, cur),
  ]);
  const orders = kpi(oc[0].placed, oc[1].placed);
  const base = {
    generatedAt: now.toISOString(),
    range,
    period: { from: cur.from.toISOString(), to: cur.to.toISOString() },
    comparePeriod: { from: prev.from.toISOString(), to: prev.to.toISOString() },
    todo: {
      toConfirm: counts['to-confirm'],
      pendingPayment: counts['pending-payment'],
      toFulfil: counts['to-fulfil'],
      cancelRequests: counts['cancel-requests'],
      lateDelivery: late,
      // Cùng hàm đếm với `counts` của danh sách yêu cầu trả hàng.
      returnRequested: rc.requested,
      returnApproved: rc.approved,
      returnReceived: rc.received,
      lowStock: inv.low,
      outOfStock: inv.out,
    },
    recentOrders: recent,
  };
  if (!withMoney) {
    // DASH-07 (2026-11-20): staff thấy sản phẩm bán chạy xếp theo SỐ LƯỢNG, không có tiền (revenue / share / hạng kỳ trước).
    const byUnits = await topProducts(prisma, cur, 'units', INSIGHTS_ASSUMPTIONS.topDashboard);
    return {
      ...base,
      kpis: { orders },
      topProducts: byUnits.map((t, i) => ({
        rank: i + 1,
        productId: t.productId,
        name: t.name,
        image: t.image,
        category: t.category,
        units: t.units,
      })),
    };
  }

  const [[k, kp], [rr, rrPrev], chart, top, prevTop] = await Promise.all([
    periodKpis(prisma, cur, prev),
    returnRates(prisma, cur, prev),
    series(prisma, range, cur, prev, now),
    topProducts(prisma, cur, 'revenue', INSIGHTS_ASSUMPTIONS.topDashboard),
    topProducts(prisma, prev, 'revenue', 100),
  ]);
  const prevRank = new Map(prevTop.map((t, i) => [t.productId, i + 1]));
  return {
    ...base,
    kpis: {
      netRevenue: kpi(k.revenue, kp.revenue),
      orders,
      averageOrderValue: kpi(aov(k.revenue, k.orders), aov(kp.revenue, kp.orders)),
      returnRate: rateKpi(rr, rrPrev),
    },
    series: chart,
    topProducts: top.map((t, i) => ({
      rank: i + 1,
      previousRank: prevRank.get(t.productId) ?? null,
      productId: t.productId,
      name: t.name,
      image: t.image,
      category: t.category,
      units: t.units,
      revenue: t.revenue,
      share: ratio4(t.revenue, k.revenue),
    })),
  };
}
