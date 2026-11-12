import { INSIGHTS_ASSUMPTIONS } from '../../config/assumptions';
import { divRoundHalfUp, ratio4 } from '../../lib/money-math';
import { Db } from '../../lib/sql';
import { addCalendarDays } from '../../lib/vn-time';
import type { ReportSort } from './insights.schemas';
import { periodsOf } from './periods';
import {
  orderCounts, periodKpis, refundKpis, revenueByCategory, revenueByDay, revenueByPayment, topProducts, topVariants,
} from './revenue.sql';

/** Báo cáo bán hàng (BR-RPT-01..06). Mọi khối cùng một định nghĩa doanh thu (`revenue.sql.ts`) nên tổng khớp từng đồng (BR-INS-09). */

export interface Figure {
  value: number;
  previous: number | null;
}
const fig = (value: number, previous: number | null): Figure => ({ value, previous });
const aov = (revenue: number, orders: number): number => (orders > 0 ? divRoundHalfUp(revenue, orders) : 0);

export async function getSalesReport(db: Db, q: { from: string; to: string; days: number; sort: ReportSort }, now: Date) {
  const { cur, prev } = periodsOf({ from: q.from, to: q.to }, now);
  const topN = INSIGHTS_ASSUMPTIONS.topReport;
  const [[k, kp], [oc, ocp], dayMap, pay, cats, prods, vars, [rf, rfp]] = await Promise.all([
    periodKpis(db, cur, prev),
    orderCounts(db, cur, prev),
    revenueByDay(db, cur),
    revenueByPayment(db, cur),
    revenueByCategory(db, cur),
    topProducts(db, cur, q.sort, topN),
    topVariants(db, cur, q.sort, topN),
    refundKpis(db, cur, prev),
  ]);

  const hadRevenue = kp.orders > 0; // kỳ trước có đơn tính doanh thu?
  const hadOrders = ocp.placed + ocp.cancelled > 0;
  const rev = (v: number, p: number) => fig(v, hadRevenue ? p : null);
  const cnt = (v: number, p: number) => fig(v, hadOrders ? p : null);
  // Slice 9: `previous` của KPI hoàn = null khi kỳ trước không có đơn `completed` nào được giao (khác nhóm doanh thu).
  const hadDelivered = rfp.delivered > 0;
  const rfig = (v: number, p: number) => fig(v, hadDelivered ? p : null);
  const returnRate = (r: { refundedUnits: number }, units: number) => ratio4(r.refundedUnits, units + r.refundedUnits);
  const rate = (c: { placed: number; cancelled: number }) => ratio4(c.cancelled, c.placed + c.cancelled);

  const byDay = Array.from({ length: q.days }, (_, i) => {
    const date = addCalendarDays(q.from, i);
    const r = dayMap.get(date);
    return { date, revenue: r?.revenue ?? 0, completedOrders: r?.orders ?? 0, units: r?.units ?? 0 };
  });
  const payBy = (m: 'cod' | 'bank_transfer') => pay.find((p) => p.method === m) ?? { method: m, orders: 0, revenue: 0 };

  return {
    generatedAt: now.toISOString(),
    from: q.from,
    to: q.to,
    previousFrom: addCalendarDays(q.from, -q.days),
    previousTo: addCalendarDays(q.from, -1),
    days: q.days,
    sort: q.sort,
    kpis: {
      revenue: rev(k.revenue, kp.revenue),
      completedOrders: rev(k.orders, kp.orders),
      units: rev(k.units, kp.units),
      averageOrderValue: rev(aov(k.revenue, k.orders), aov(kp.revenue, kp.orders)),
      discountTotal: rev(k.discount, kp.discount),
      shippingCollected: rev(k.shipping, kp.shipping),
      placedOrders: cnt(oc.placed, ocp.placed),
      cancelledOrders: cnt(oc.cancelled, ocp.cancelled),
      cancelRate: cnt(rate(oc), rate(ocp)),
      refundedAmount: rfig(rf.refundedAmount, rfp.refundedAmount),
      refundedUnits: rfig(rf.refundedUnits, rfp.refundedUnits),
      returnedOrders: rfig(rf.returnedOrders, rfp.returnedOrders),
      returnRate: rfig(returnRate(rf, k.units), returnRate(rfp, kp.units)),
    },
    byDay,
    topProducts: prods.map((p) => ({ productId: p.productId, name: p.name, image: p.image, category: p.category, units: p.units, revenue: p.revenue })),
    topVariants: vars.map((v) => ({
      variantId: v.variantId, productId: v.productId, sku: v.sku, productName: v.productName, color: v.color, size: v.size, units: v.units, revenue: v.revenue,
    })),
    byCategory: cats.map((c) => ({ category: { slug: c.slug, name: c.name }, revenue: c.revenue, units: c.units, share: ratio4(c.revenue, k.revenue) })),
    byPayment: (['cod', 'bank_transfer'] as const).map((m) => {
      const p = payBy(m);
      return { method: m === 'cod' ? ('cod' as const) : ('bank-transfer' as const), completedOrders: p.orders, revenue: p.revenue, share: ratio4(p.revenue, k.revenue) };
    }),
  };
}
export type SalesReport = Awaited<ReturnType<typeof getSalesReport>>;
