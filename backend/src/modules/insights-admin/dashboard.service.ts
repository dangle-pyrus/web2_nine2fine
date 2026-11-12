import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { INSIGHT_PERMISSIONS, INSIGHTS_ASSUMPTIONS } from '../../config/assumptions';
import { changeRatio, divRoundHalfUp } from '../../lib/money-math';
import { Db, ts } from '../../lib/sql';
import { addCalendarDays, vnDateISO, vnStartOfDay } from '../../lib/vn-time';
import { inventoryCounts } from '../catalog-admin/inventory.query';
import { countOrders } from '../order-admin/order-admin.query';
import { DashboardRange, periodsOf, Span } from './periods';
import { orderCounts, periodKpis, revenueByDay, topProducts } from './revenue.sql';

/**
 * Tổng quan (BR-DSH-01..08). `todo` và `orders` cho mọi vai trò; phần tiền chỉ khi vai trò có `dashboard.revenue`.
 * DTO dựng bằng hai nhánh đối tượng: staff KHÔNG có khoá tiền (không phải `null`, BR-DSH-07).
 */

interface Kpi {
  value: number;
  change: number | null;
}
const kpi = (cur: number, prev: number): Kpi => ({ value: cur, change: changeRatio(cur, prev) });
const aov = (revenue: number, orders: number): number => (orders > 0 ? divRoundHalfUp(revenue, orders) : 0);

async function newCustomers(db: Db, s: Span): Promise<number> {
  const [r] = await db.$queryRaw<Array<{ n: number }>>(Prisma.sql`
    SELECT COUNT(*)::int AS n FROM users WHERE role = 'member' AND created_at >= ${ts(s.from)} AND created_at < ${ts(s.to)}`);
  return Number(r.n);
}

async function lateDelivery(db: Db, now: Date): Promise<number> {
  const [r] = await db.$queryRaw<Array<{ n: number }>>(Prisma.sql`
    SELECT COUNT(*)::int AS n FROM orders WHERE status = 'to_receive' AND estimated_to < ${vnDateISO(now)}::date`);
  return Number(r.n);
}

/** 30 điểm D-29..D (cũ trước), `previous` = cùng vị trí 30 ngày trước đó; một truy vấn trên 60 ngày. */
async function revenueSeries(db: Db, now: Date) {
  const days = INSIGHTS_ASSUMPTIONS.seriesDays;
  const today = vnDateISO(now);
  const byDay = await revenueByDay(db, { from: vnStartOfDay(addCalendarDays(today, -(2 * days - 1))), to: vnStartOfDay(addCalendarDays(today, 1)) });
  const at = (d: string) => byDay.get(d)?.revenue ?? 0;
  return Array.from({ length: days }, (_, i) => {
    const date = addCalendarDays(today, -(days - 1) + i);
    return { date, revenue: at(date), previous: at(addCalendarDays(date, -days)) };
  });
}

export async function getDashboard(role: 'staff' | 'admin', range: DashboardRange, now: Date) {
  const { cur, prev } = periodsOf(range, now);
  const withMoney = INSIGHT_PERMISSIONS[role].includes('dashboard.revenue');

  const [oc, counts, inv, late] = await Promise.all([
    orderCounts(prisma, cur, prev),
    countOrders({}),
    inventoryCounts(prisma),
    lateDelivery(prisma, now),
  ]);
  const base = {
    generatedAt: now.toISOString(),
    orders: kpi(oc[0].placed, oc[1].placed),
    todo: {
      toConfirm: counts['to-confirm'],
      pendingPayment: counts['pending-payment'],
      toFulfil: counts['to-fulfil'],
      inTransit: counts['in-transit'],
      cancelRequests: counts['cancel-requests'],
      returning: counts.returning,
      lateDelivery: late,
      lowStock: inv.low,
      outOfStock: inv.out,
    },
  };
  if (!withMoney) return base;

  const [[k, kp], nc, ncPrev, series, top] = await Promise.all([
    periodKpis(prisma, cur, prev),
    newCustomers(prisma, cur),
    newCustomers(prisma, prev),
    revenueSeries(prisma, now),
    topProducts(prisma, cur, 'units', INSIGHTS_ASSUMPTIONS.topDashboard),
  ]);
  return {
    ...base,
    range,
    period: { from: cur.from.toISOString(), to: cur.to.toISOString(), previousFrom: prev.from.toISOString(), previousTo: prev.to.toISOString() },
    revenue: kpi(k.revenue, kp.revenue),
    completedOrders: kpi(k.orders, kp.orders),
    averageOrderValue: kpi(aov(k.revenue, k.orders), aov(kp.revenue, kp.orders)),
    newCustomers: kpi(nc, ncPrev),
    revenueSeries: series,
    topProducts: top.map((t) => ({ productId: t.productId, name: t.name, image: t.image, units: t.units, revenue: t.revenue })),
  };
}
