import { Prisma } from '@prisma/client';
import { ratio4 } from '../../lib/money-math';
import { Db, ts } from '../../lib/sql';
import { addCalendarDays } from '../../lib/vn-time';
import { periodsOf, type Span } from '../insights-admin/periods';

/**
 * Báo cáo mở rộng (nâng cấp admin 2026-11-15): CHỈ ĐỌC, chỉ quản trị viên. Bổ sung cho `/admin/reports/sales` các tab
 * Khách hàng, Vận hành & trả hàng, Khuyến mãi của trang Báo cáo. Không đổi định nghĩa doanh thu của Slice 8 (file đó
 * vẫn là `insights-admin/revenue.sql.ts`); các khối ở đây đếm theo ĐƠN ĐẶT trong khoảng (created_at), trừ khi ghi khác.
 *
 * Quy tắc thời gian giống Slice 8: ranh giới tính ở JS rồi qua `ts()`; giờ / ngày VN = `col + INTERVAL '7 hours'`.
 * "Khách" = `user_id` nếu có, không thì email viết thường (khách vãng lai mua lại bằng cùng email được tính là một người).
 */

const n = (v: unknown): number => Number(v ?? 0);
const inSpan = (col: string, s: Span) =>
  Prisma.sql`(${Prisma.raw(col)} >= ${ts(s.from)} AND ${Prisma.raw(col)} < ${ts(s.to)})`;

export interface ExtraQuery {
  from: string;
  to: string;
  days: number;
}

async function customers(db: Db, s: Span) {
  const [row] = await db.$queryRaw<
    Array<{ buyers: number; new_buyers: number; repeat_buyers: number; new_orders: number; returning_orders: number; new_spend: bigint; returning_spend: bigint; members: number }>
  >(Prisma.sql`
    WITH o AS (
      SELECT COALESCE(user_id::text, lower(email)) AS ck, user_id, created_at, total
      FROM orders WHERE status <> 'cancelled'
    ), f AS (
      SELECT ck, MIN(created_at) AS first_at FROM o GROUP BY ck
    ), c AS (
      SELECT ck, COUNT(*)::int AS orders, SUM(total)::bigint AS spend, BOOL_OR(user_id IS NOT NULL) AS member
      FROM o WHERE ${inSpan('o.created_at', s)} GROUP BY ck
    )
    SELECT COUNT(*)::int AS buyers,
           COUNT(*) FILTER (WHERE f.first_at >= ${ts(s.from)})::int AS new_buyers,
           COUNT(*) FILTER (WHERE c.orders >= 2)::int AS repeat_buyers,
           COALESCE(SUM(c.orders) FILTER (WHERE f.first_at >= ${ts(s.from)}), 0)::int AS new_orders,
           COALESCE(SUM(c.orders) FILTER (WHERE f.first_at < ${ts(s.from)}), 0)::int AS returning_orders,
           COALESCE(SUM(c.spend) FILTER (WHERE f.first_at >= ${ts(s.from)}), 0)::bigint AS new_spend,
           COALESCE(SUM(c.spend) FILTER (WHERE f.first_at < ${ts(s.from)}), 0)::bigint AS returning_spend,
           COUNT(*) FILTER (WHERE c.member)::int AS members
    FROM c JOIN f USING (ck)`);
  const buyers = n(row?.buyers);
  const newBuyers = n(row?.new_buyers);
  return {
    buyers,
    newBuyers,
    returningBuyers: buyers - newBuyers,
    repeatBuyers: n(row?.repeat_buyers),
    /** Khách đặt từ 2 đơn trở lên trong khoảng / khách có đơn (0..1). */
    repeatRate: ratio4(n(row?.repeat_buyers), buyers),
    newOrders: n(row?.new_orders),
    returningOrders: n(row?.returning_orders),
    newSpend: n(row?.new_spend),
    returningSpend: n(row?.returning_spend),
    members: n(row?.members),
    guests: buyers - n(row?.members),
  };
}

async function operations(db: Db, s: Span) {
  const [times] = await db.$queryRaw<
    Array<{ confirm: number | null; handover: number | null; deliver: number | null; confirmed: number; handed: number; delivered: number }>
  >(Prisma.sql`
    SELECT
      percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (confirmed_at - created_at)) / 60) AS confirm,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (handed_over_at - COALESCE(confirmed_at, created_at))) / 60) AS handover,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (delivered_at - handed_over_at)) / 60) AS deliver,
      COUNT(confirmed_at)::int AS confirmed, COUNT(handed_over_at)::int AS handed, COUNT(delivered_at)::int AS delivered
    FROM orders
    WHERE ${inSpan('created_at', s)}`);
  // Đúng hẹn: đơn GIAO trong khoảng, ngày giao (VN) <= ngày dự kiến cuối.
  const [onTime] = await db.$queryRaw<Array<{ delivered: number; on_time: number }>>(Prisma.sql`
    SELECT COUNT(*)::int AS delivered,
           COUNT(*) FILTER (WHERE (delivered_at + INTERVAL '7 hours')::date <= estimated_to)::int AS on_time
    FROM orders WHERE delivered_at IS NOT NULL AND ${inSpan('delivered_at', s)}`);
  const cancels = await db.$queryRaw<Array<{ code: string; actor: string | null; orders: number }>>(Prisma.sql`
    SELECT COALESCE(cancel_reason_code, 'other') AS code, cancelled_by::text AS actor, COUNT(*)::int AS orders
    FROM orders WHERE status = 'cancelled' AND cancelled_at IS NOT NULL AND ${inSpan('cancelled_at', s)}
    GROUP BY 1, 2 ORDER BY 3 DESC, 1`);
  const [placed] = await db.$queryRaw<Array<{ placed: number; cancelled: number }>>(Prisma.sql`
    SELECT COUNT(*)::int AS placed, COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled
    FROM orders WHERE ${inSpan('created_at', s)}`);
  const minutes = (v: number | null) => (v === null || v === undefined ? null : Math.round(Number(v)));
  return {
    /** Trung vị, phút; null khi chưa có đơn nào qua bước đó. */
    medianMinutes: { confirm: minutes(times?.confirm ?? null), handover: minutes(times?.handover ?? null), deliver: minutes(times?.deliver ?? null) },
    counts: { placed: n(placed?.placed), cancelled: n(placed?.cancelled), confirmed: n(times?.confirmed), handedOver: n(times?.handed), delivered: n(times?.delivered) },
    onTime: { delivered: n(onTime?.delivered), onTime: n(onTime?.on_time), rate: ratio4(n(onTime?.on_time), n(onTime?.delivered)) },
    cancelReasons: cancels.map((r) => ({ code: r.code, actor: r.actor ?? 'unknown', orders: n(r.orders) })),
  };
}

async function returns(db: Db, s: Span) {
  const rows = await db.$queryRaw<Array<{ reason: string; fault: string; requests: number; amount: bigint; refunded: number }>>(Prisma.sql`
    SELECT reason, fault, COUNT(*)::int AS requests, COALESCE(SUM(amount) FILTER (WHERE state = 'refunded'), 0)::bigint AS amount,
           COUNT(*) FILTER (WHERE state = 'refunded')::int AS refunded
    FROM order_returns WHERE ${inSpan('requested_at', s)}
    GROUP BY reason, fault ORDER BY requests DESC, reason, fault`);
  return rows.map((r) => ({ reason: r.reason, fault: r.fault, requests: n(r.requests), refunded: n(r.refunded), refundedAmount: n(r.amount) }));
}

async function vouchers(db: Db, s: Span) {
  const rows = await db.$queryRaw<Array<{ code: string; kind: string; orders: number; discount: bigint; revenue: bigint }>>(Prisma.sql`
    SELECT v.code, v.kind, COUNT(*)::int AS orders, SUM(v.discount)::bigint AS discount, SUM(v.total)::bigint AS revenue
    FROM (
      SELECT discount_voucher_code AS code, 'discount' AS kind, discount AS discount, total, created_at
      FROM orders WHERE discount_voucher_code IS NOT NULL AND status <> 'cancelled' AND ${inSpan('created_at', s)}
      UNION ALL
      SELECT shipping_voucher_code AS code, 'shipping' AS kind, shipping_discount AS discount, total, created_at
      FROM orders WHERE shipping_voucher_code IS NOT NULL AND status <> 'cancelled' AND ${inSpan('created_at', s)}
    ) v
    GROUP BY v.code, v.kind ORDER BY orders DESC, v.code`);
  const [all] = await db.$queryRaw<Array<{ orders: number; with_voucher: number; revenue: bigint; voucher_revenue: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::int AS orders,
           COUNT(*) FILTER (WHERE discount_voucher_code IS NOT NULL OR shipping_voucher_code IS NOT NULL)::int AS with_voucher,
           COALESCE(SUM(total), 0)::bigint AS revenue,
           COALESCE(SUM(total) FILTER (WHERE discount_voucher_code IS NOT NULL OR shipping_voucher_code IS NOT NULL), 0)::bigint AS voucher_revenue
    FROM orders WHERE status <> 'cancelled' AND ${inSpan('created_at', s)}`);
  return {
    orders: n(all?.orders),
    ordersWithVoucher: n(all?.with_voucher),
    share: ratio4(n(all?.with_voucher), n(all?.orders)),
    orderValue: n(all?.revenue),
    voucherOrderValue: n(all?.voucher_revenue),
    totalDiscount: rows.reduce((sum, r) => sum + n(r.discount), 0),
    codes: rows.map((r) => ({ code: r.code, kind: r.kind as 'discount' | 'shipping', orders: n(r.orders), discount: n(r.discount), orderValue: n(r.revenue) })),
  };
}

async function provinces(db: Db, s: Span) {
  const rows = await db.$queryRaw<Array<{ code: string; name: string; orders: number; value: bigint }>>(Prisma.sql`
    SELECT province_code AS code, MIN(province_name) AS name, COUNT(*)::int AS orders, SUM(total)::bigint AS value
    FROM orders WHERE status <> 'cancelled' AND ${inSpan('created_at', s)}
    GROUP BY province_code ORDER BY value DESC, orders DESC, code LIMIT 10`);
  return rows.map((r) => ({ code: r.code, name: r.name, orders: n(r.orders), orderValue: n(r.value) }));
}

async function heatmap(db: Db, s: Span) {
  const rows = await db.$queryRaw<Array<{ dow: number; hour: number; orders: number }>>(Prisma.sql`
    SELECT EXTRACT(ISODOW FROM created_at + INTERVAL '7 hours')::int AS dow,
           EXTRACT(HOUR FROM created_at + INTERVAL '7 hours')::int AS hour,
           COUNT(*)::int AS orders
    FROM orders WHERE ${inSpan('created_at', s)}
    GROUP BY 1, 2`);
  // 7 hàng (Thứ Hai = 0 .. Chủ nhật = 6) x 24 cột giờ VN.
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const r of rows) grid[n(r.dow) - 1][n(r.hour)] = n(r.orders);
  return grid;
}

export async function getExtraReport(db: Db, q: ExtraQuery, now: Date) {
  const { cur } = periodsOf({ from: q.from, to: q.to }, now);
  const [c, o, r, v, p, h] = await Promise.all([
    customers(db, cur),
    operations(db, cur),
    returns(db, cur),
    vouchers(db, cur),
    provinces(db, cur),
    heatmap(db, cur),
  ]);
  return {
    generatedAt: now.toISOString(),
    from: q.from,
    to: q.to,
    days: q.days,
    previousFrom: addCalendarDays(q.from, -q.days),
    customers: c,
    operations: o,
    returns: r,
    promotions: v,
    provinces: p,
    heatmap: h,
  };
}
