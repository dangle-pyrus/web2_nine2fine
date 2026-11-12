import { Prisma } from '@prisma/client';
import { Db, ts } from '../../lib/sql';
import { mediaUrlOf } from '../catalog-admin/media.service';
import type { Span } from './periods';

/**
 * MỘT nguồn định nghĩa doanh thu (S8-Q1 / BR-INS-09, plan mục 5). Tổng quan, Báo cáo, CSV đều gọi file này; điều kiện
 * `payment_status = 'paid'` chỉ xuất hiện ở đây (T-INS-30 quét tĩnh). Lật S8-Q1 = đổi `WHERE` của `ro` + test AC-INS-12/13.
 *
 * Đơn tính doanh thu = `completed` + `paid`, theo `delivered_at` (completed thiếu delivered_at tự loại vì so sánh NULL),
 * tiền hàng sau giảm của từng dòng, không gồm phí ship. Quy tắc thời gian (plan mục 4): ranh giới tính ở JS rồi qua `ts()`;
 * ngày VN = `(col + INTERVAL '7 hours')::date` (không đọc `timezone` của phiên); không dùng hàm thời gian của CSDL hay múi giờ theo tên vùng.
 */

const bound = (col: string, s: Span) => Prisma.sql`(${Prisma.raw(col)} >= ${ts(s.from)} AND ${Prisma.raw(col)} < ${ts(s.to)})`;
const anyOf = (col: string, spans: readonly Span[]) => Prisma.join(spans.map((s) => bound(col, s)), ' OR ');

/** `ro` (đơn tính doanh thu trong hợp các khoảng; `period` = chỉ số khoảng) và `li` (một dòng / order_item). */
function revenueCte(spans: readonly Span[]): Prisma.Sql {
  const period = Prisma.join(spans.map((s, i) => Prisma.sql`WHEN ${bound('o.delivered_at', s)} THEN ${Prisma.raw(String(i))}`), ' ');
  return Prisma.sql`
    ro AS (
      SELECT o.order_id, o.payment_method, o.shipping_fee, o.shipping_discount, o.delivered_at,
             (o.delivered_at + INTERVAL '7 hours')::date AS vn_day,
             (CASE ${period} END) AS period
      FROM orders o
      WHERE o.status = 'completed' AND o.payment_status = 'paid' AND (${anyOf('o.delivered_at', spans)})
    ), li AS (
      SELECT ro.vn_day, ro.period, ro.order_id, ro.payment_method, ro.delivered_at,
             oi.product_id, oi.variant_id, oi.name, oi.color_name, oi.size, oi.sku, oi.media_id,
             oi.quantity::int AS qty,
             (oi.unit_price::bigint * oi.quantity - oi.line_discount) AS amount,
             oi.line_discount::bigint AS discount
      FROM ro JOIN order_items oi ON oi.order_id = ro.order_id
    )`;
}

const n = (v: unknown): number => Number(v ?? 0);

export interface RevenueKpi {
  revenue: number;
  units: number;
  discount: number;
  orders: number;
  shipping: number;
}
const ZERO: RevenueKpi = { revenue: 0, units: 0, discount: 0, orders: 0, shipping: 0 };

/** KPI của hai kỳ trong cùng một định nghĩa. `[cur, prev]`; kỳ không có đơn = toàn 0 (orders = 0 nghĩa là "không có đơn"). */
export async function periodKpis(db: Db, cur: Span, prev: Span): Promise<[RevenueKpi, RevenueKpi]> {
  const spans = [cur, prev];
  const [items, ships] = await Promise.all([
    db.$queryRaw<Array<{ period: number; revenue: bigint; units: bigint; discount: bigint; orders: number }>>(Prisma.sql`
      WITH ${revenueCte(spans)}
      SELECT l.period, SUM(l.amount)::bigint AS revenue, SUM(l.qty)::bigint AS units, SUM(l.discount)::bigint AS discount,
             COUNT(DISTINCT l.order_id)::int AS orders
      FROM li l GROUP BY l.period`),
    db.$queryRaw<Array<{ period: number; shipping: bigint }>>(Prisma.sql`
      WITH ${revenueCte(spans)}
      SELECT ro.period, SUM(ro.shipping_fee - ro.shipping_discount)::bigint AS shipping FROM ro GROUP BY ro.period`),
  ]);
  const out: [RevenueKpi, RevenueKpi] = [{ ...ZERO }, { ...ZERO }];
  for (const r of items) out[r.period] = { ...out[r.period], revenue: n(r.revenue), units: n(r.units), discount: n(r.discount), orders: n(r.orders) };
  for (const r of ships) out[r.period].shipping = n(r.shipping);
  return out;
}

export interface DayRow {
  date: string;
  revenue: number;
  orders: number;
  units: number;
}
/** Theo ngày VN trong một khoảng; chỉ ngày có đơn (JS điền 0 cho ngày thiếu). */
export async function revenueByDay(db: Db, span: Span): Promise<Map<string, DayRow>> {
  const rows = await db.$queryRaw<Array<{ d: string; revenue: bigint; orders: number; units: bigint }>>(Prisma.sql`
    WITH ${revenueCte([span])}
    SELECT to_char(l.vn_day, 'YYYY-MM-DD') AS d, SUM(l.amount)::bigint AS revenue, COUNT(DISTINCT l.order_id)::int AS orders, SUM(l.qty)::bigint AS units
    FROM li l GROUP BY l.vn_day`);
  return new Map(rows.map((r) => [r.d, { date: r.d, revenue: n(r.revenue), orders: n(r.orders), units: n(r.units) }]));
}

export interface PaymentRow {
  method: 'cod' | 'bank_transfer';
  orders: number;
  revenue: number;
}
export async function revenueByPayment(db: Db, span: Span): Promise<PaymentRow[]> {
  const rows = await db.$queryRaw<Array<{ method: 'cod' | 'bank_transfer'; orders: number; revenue: bigint }>>(Prisma.sql`
    WITH ${revenueCte([span])}
    SELECT l.payment_method::text AS method, COUNT(DISTINCT l.order_id)::int AS orders, SUM(l.amount)::bigint AS revenue
    FROM li l GROUP BY l.payment_method`);
  return rows.map((r) => ({ method: r.method, orders: n(r.orders), revenue: n(r.revenue) }));
}

export interface CategoryRow {
  slug: string;
  name: string;
  revenue: number;
  units: number;
}
/** Theo danh mục HIỆN TẠI của sản phẩm (BR-RPT-05). */
export async function revenueByCategory(db: Db, span: Span): Promise<CategoryRow[]> {
  const rows = await db.$queryRaw<Array<{ slug: string; name: string; revenue: bigint; units: bigint }>>(Prisma.sql`
    WITH ${revenueCte([span])}
    SELECT c.slug, c.name, SUM(l.amount)::bigint AS revenue, SUM(l.qty)::bigint AS units
    FROM li l
    JOIN products p ON p.product_id = l.product_id
    JOIN categories c ON c.category_id = p.category_id
    GROUP BY c.category_id, c.slug, c.name
    ORDER BY revenue DESC, c.slug ASC`);
  return rows.map((r) => ({ slug: r.slug, name: r.name, revenue: n(r.revenue), units: n(r.units) }));
}

export type TopSort = 'units' | 'revenue';
const orderBy = (sort: TopSort, idCol: string): Prisma.Sql =>
  sort === 'units'
    ? Prisma.sql`units DESC, revenue DESC, ${Prisma.raw(idCol)} ASC`
    : Prisma.sql`revenue DESC, units DESC, ${Prisma.raw(idCol)} ASC`;

export interface TopProductRow {
  productId: string;
  name: string;
  image: { id: string; url: string | null } | null;
  category: { slug: string; name: string };
  units: number;
  revenue: number;
}
/** Tên chụp trên dòng đơn mới nhất; ảnh = ảnh bìa hiện tại, thiếu thì `media_id` của dòng đơn. Hoà: chỉ tiêu còn lại giảm rồi `product_id` tăng. */
export async function topProducts(db: Db, span: Span, sort: TopSort, limit: number): Promise<TopProductRow[]> {
  const rows = await db.$queryRaw<
    Array<{ product_id: string; name: string; media_id: string; cover_media_id: string; slug: string; category_name: string; units: bigint; revenue: bigint }>
  >(Prisma.sql`
    WITH ${revenueCte([span])}
    SELECT l.product_id,
           (ARRAY_AGG(l.name ORDER BY l.delivered_at DESC, l.order_id DESC))[1] AS name,
           (ARRAY_AGG(l.media_id ORDER BY l.delivered_at DESC, l.order_id DESC))[1] AS media_id,
           p.cover_media_id, c.slug, c.name AS category_name,
           SUM(l.qty)::bigint AS units, SUM(l.amount)::bigint AS revenue
    FROM li l
    JOIN products p ON p.product_id = l.product_id
    JOIN categories c ON c.category_id = p.category_id
    GROUP BY l.product_id, p.cover_media_id, c.slug, c.name
    ORDER BY ${orderBy(sort, 'l.product_id')}
    LIMIT ${limit}`);
  return rows.map((r) => {
    const imageId = r.cover_media_id || r.media_id;
    return {
      productId: r.product_id,
      name: r.name,
      image: imageId ? { id: imageId, url: mediaUrlOf(imageId) } : null,
      category: { slug: r.slug, name: r.category_name },
      units: n(r.units),
      revenue: n(r.revenue),
    };
  });
}

export interface TopVariantRow {
  variantId: string;
  productId: string;
  sku: string;
  productName: string;
  color: string;
  size: string;
  units: number;
  revenue: number;
}
export async function topVariants(db: Db, span: Span, sort: TopSort, limit: number): Promise<TopVariantRow[]> {
  const rows = await db.$queryRaw<
    Array<{ variant_id: string; product_id: string; sku: string; name: string; color_name: string; size: string; units: bigint; revenue: bigint }>
  >(Prisma.sql`
    WITH ${revenueCte([span])}
    SELECT l.variant_id, l.product_id,
           (ARRAY_AGG(l.sku ORDER BY l.delivered_at DESC, l.order_id DESC))[1] AS sku,
           (ARRAY_AGG(l.name ORDER BY l.delivered_at DESC, l.order_id DESC))[1] AS name,
           (ARRAY_AGG(l.color_name ORDER BY l.delivered_at DESC, l.order_id DESC))[1] AS color_name,
           (ARRAY_AGG(l.size ORDER BY l.delivered_at DESC, l.order_id DESC))[1] AS size,
           SUM(l.qty)::bigint AS units, SUM(l.amount)::bigint AS revenue
    FROM li l
    GROUP BY l.variant_id, l.product_id
    ORDER BY ${orderBy(sort, 'l.variant_id')}
    LIMIT ${limit}`);
  return rows.map((r) => ({
    variantId: r.variant_id,
    productId: r.product_id,
    sku: r.sku,
    productName: r.name,
    color: r.color_name,
    size: r.size,
    units: n(r.units),
    revenue: n(r.revenue),
  }));
}

export interface OrderCounts {
  placed: number;
  cancelled: number;
}
/** Đơn đặt = `created_at` trong kỳ và không `cancelled`; đơn huỷ = `created_at` trong kỳ và `cancelled` (BR-INS-09). `[cur, prev]`. */
export async function orderCounts(db: Db, cur: Span, prev: Span): Promise<[OrderCounts, OrderCounts]> {
  const [r] = await db.$queryRaw<Array<Record<'cp' | 'cc' | 'pp' | 'pc', number>>>(Prisma.sql`
    SELECT
      (COUNT(*) FILTER (WHERE ${bound('o.created_at', cur)} AND o.status <> 'cancelled'))::int AS cp,
      (COUNT(*) FILTER (WHERE ${bound('o.created_at', cur)} AND o.status = 'cancelled'))::int AS cc,
      (COUNT(*) FILTER (WHERE ${bound('o.created_at', prev)} AND o.status <> 'cancelled'))::int AS pp,
      (COUNT(*) FILTER (WHERE ${bound('o.created_at', prev)} AND o.status = 'cancelled'))::int AS pc
    FROM orders o
    WHERE ${anyOf('o.created_at', [cur, prev])}`);
  return [
    { placed: n(r.cp), cancelled: n(r.cc) },
    { placed: n(r.pp), cancelled: n(r.pc) },
  ];
}
