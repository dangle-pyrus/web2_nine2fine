import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { CATALOG_ASSUMPTIONS } from '../../config/assumptions';
import { Errors } from '../../lib/errors';
import { escapeLike } from '../../lib/like';
import type { Db } from '../../lib/sql';
import { parseSearchTokens } from '../../lib/text';
import { UUID_RE } from '../../lib/validate';
import type { InventoryFilter, InventoryListQuery } from './inventory-promotion.schemas';
import { mediaUrlOf } from './media.service';
import { toAdminStatus } from './product.mapper';

/** Thoát `%`, `_`, `\` để dùng với `LIKE ... ESCAPE '\'`. */

/** Đang giữ = tổng số lượng dòng đơn chưa giao (BR-INV-29): `to_pay`, `to_ship`, `cancel_requested`. */
export const RESERVED_SQL = Prisma.sql`COALESCE((
  SELECT SUM(oi.quantity) FROM order_items oi JOIN orders o ON o.order_id = oi.order_id
  WHERE oi.variant_id = v.variant_id AND o.status IN ('to_pay', 'to_ship', 'cancel_requested')), 0)::int`;

/** Ngưỡng hiệu lực t = ngưỡng riêng hoặc mặc định ở `store_settings` (mặc định cứng 5 khi chưa có dòng, BR-INV-35). */
const THRESHOLD_SQL = Prisma.sql`COALESCE(v.low_stock_threshold, (SELECT low_stock_default FROM store_settings WHERE id = 1), ${CATALOG_ASSUMPTIONS.defaultLowStockThreshold})`;

const STATUS_SQL = Prisma.sql`(CASE WHEN v.inventory_qty = 0 THEN 'out' WHEN v.inventory_qty <= ${THRESHOLD_SQL} THEN 'low' ELSE 'in' END)`;

/** Tên màu khớp `color` không phân biệt hoa thường: so bằng JS (`lower()` của Postgres phụ thuộc locale với chữ Đ). */
async function matchColors(color: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ color_name: string }>>(Prisma.sql`SELECT DISTINCT color_name FROM product_variants`);
  const want = color.toLowerCase();
  return rows.map((r) => r.color_name).filter((n) => n.toLowerCase() === want);
}

async function buildWhere(f: InventoryFilter): Promise<Prisma.Sql> {
  const parts: Prisma.Sql[] = [Prisma.sql`TRUE`];
  for (const tok of parseSearchTokens(f.q ?? '')) {
    const like = `%${escapeLike(tok)}%`;
    parts.push(Prisma.sql`(v.sku ILIKE ${like} ESCAPE '\\' OR p.search_text LIKE ${like} ESCAPE '\\')`);
  }
  if (f.category) parts.push(Prisma.sql`c.slug = ${f.category}`);
  if (f.color) parts.push(Prisma.sql`v.color_name = ANY(${await matchColors(f.color)}::text[])`);
  if (f.size) parts.push(Prisma.sql`v.size = ${f.size}`);
  return Prisma.join(parts, ' AND ');
}

interface ItemRow {
  variant_id: string;
  product_id: string;
  product_name: string;
  product_status: string;
  cover_media_id: string;
  color_media_id: string | null;
  color_name: string;
  color_hex: string;
  size: string;
  sku: string;
  qty: number;
  reserved: number;
  custom_threshold: number | null;
  threshold: number;
  category: string;
  status: 'in' | 'low' | 'out';
}

const ITEM_SELECT = Prisma.sql`
  SELECT v.variant_id, p.product_id, p.name AS product_name, p.status::text AS product_status, p.cover_media_id,
         (p.color_media ->> v.color_name) AS color_media_id, v.color_name, v.color_hex, v.size, v.sku,
         v.inventory_qty AS qty, ${RESERVED_SQL} AS reserved, v.low_stock_threshold AS custom_threshold,
         (${THRESHOLD_SQL})::int AS threshold, c.slug AS category, ${STATUS_SQL} AS status
  FROM product_variants v
  JOIN products p ON p.product_id = v.product_id
  JOIN categories c ON c.category_id = p.category_id`;

function toItem(r: ItemRow) {
  const imageId = r.color_media_id || r.cover_media_id;
  const available = Number(r.qty);
  const reserved = Number(r.reserved);
  return {
    variantId: r.variant_id,
    productId: r.product_id,
    productName: r.product_name,
    productStatus: toAdminStatus(r.product_status),
    image: imageId ? { id: imageId, url: mediaUrlOf(imageId) } : null,
    color: { name: r.color_name, hex: r.color_hex.toUpperCase() },
    size: r.size,
    sku: r.sku,
    onHand: available + reserved,
    reserved,
    available,
    lowStockThreshold: Number(r.threshold),
    thresholdCustom: r.custom_threshold !== null,
    category: r.category,
    status: r.status,
  };
}
export type AdminInventoryItemDto = ReturnType<typeof toItem>;

export async function listInventory(q: InventoryListQuery) {
  const where = await buildWhere(q);
  const view = q.view === 'all' ? Prisma.sql`TRUE` : Prisma.sql`${STATUS_SQL} = ${q.view}`;
  const offset = (q.page - 1) * q.limit;
  const [rows, counts] = await Promise.all([
    prisma.$queryRaw<ItemRow[]>(Prisma.sql`
      ${ITEM_SELECT}
      WHERE ${where} AND ${view}
      ORDER BY v.inventory_qty ASC, v.sku ASC
      LIMIT ${q.limit} OFFSET ${offset}`),
    countStatuses(where),
  ]);
  return { items: rows.map(toItem), total: counts[q.view], page: q.page, limit: q.limit };
}

async function countStatuses(where: Prisma.Sql): Promise<{ all: number; in: number; low: number; out: number }> {
  const [c] = await prisma.$queryRaw<Array<{ all: number; in: number; low: number; out: number }>>(Prisma.sql`
    SELECT COUNT(*)::int AS "all",
           (COUNT(*) FILTER (WHERE ${STATUS_SQL} = 'in'))::int AS "in",
           (COUNT(*) FILTER (WHERE ${STATUS_SQL} = 'low'))::int AS "low",
           (COUNT(*) FILTER (WHERE ${STATUS_SQL} = 'out'))::int AS "out"
    FROM product_variants v
    JOIN products p ON p.product_id = v.product_id
    JOIN categories c ON c.category_id = p.category_id
    WHERE ${where}`);
  return { all: Number(c.all), in: Number(c.in), low: Number(c.low), out: Number(c.out) };
}

/** Một màu mỗi tên (không phân biệt hoa thường), giữ bản đầu theo thứ tự tên. */
function distinctColors(rows: Array<{ color_name: string; color_hex: string }>) {
  const seen = new Set<string>();
  const out: Array<{ name: string; hex: string }> = [];
  for (const r of rows) {
    const k = r.color_name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ name: r.color_name, hex: r.color_hex.toUpperCase() });
  }
  return out;
}

export async function inventoryFacets(f: InventoryFilter) {
  const [categories, colors, counts, settings, custom] = await Promise.all([
    prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }] }),
    prisma.$queryRaw<Array<{ color_name: string; color_hex: string }>>(Prisma.sql`
      SELECT DISTINCT color_name, color_hex FROM product_variants ORDER BY color_name, color_hex`),
    buildWhere(f).then(countStatuses),
    defaultThreshold(prisma),
    prisma.productVariant.count({ where: { lowStockThreshold: { not: null } } }),
  ]);
  return {
    categories: categories.map((c) => ({ value: c.slug, label: c.name })),
    colors: distinctColors(colors),
    sizes: [...CATALOG_ASSUMPTIONS.variant.sizes],
    counts,
    defaultThreshold: settings,
    customCount: custom,
  };
}

export async function defaultThreshold(db: Db): Promise<number> {
  const r = await db.$queryRaw<Array<{ t: number }>>(Prisma.sql`SELECT low_stock_default::int AS t FROM store_settings WHERE id = 1`);
  return r[0] ? Number(r[0].t) : CATALOG_ASSUMPTIONS.defaultLowStockThreshold;
}

/** Một dòng tồn kho trong `db` (cùng giao dịch khi gọi từ ghi). id sai dạng / không có -> 404. */
export async function loadInventoryItem(db: Db, variantId: string): Promise<AdminInventoryItemDto> {
  if (!UUID_RE.test(variantId)) throw Errors.notFound('Không tìm thấy biến thể.');
  const rows = await db.$queryRaw<ItemRow[]>(Prisma.sql`${ITEM_SELECT} WHERE v.variant_id = ${variantId}::uuid`);
  if (!rows[0]) throw Errors.notFound('Không tìm thấy biến thể.');
  return toItem(rows[0]);
}

interface MovementRow {
  id: string;
  at_ms: number;
  change: number;
  after: number | null;
  reason: string;
  note: string;
  author: string;
  author_role: string | null;
}

/**
 * 50 dòng mới nhất, mới trước (BR-INV-34, 37). Nguồn 1: nhật ký điều chỉnh (gồm "Tồn ban đầu"). Nguồn 2: biến động do đơn,
 * SUY từ `order_items` / `orders.stock_restored_at`, không ghi thêm gì ở checkout. `after` null cho nguồn 2.
 */
export async function listMovements(variantId: string) {
  if (!UUID_RE.test(variantId)) throw Errors.notFound('Không tìm thấy biến thể.');
  const exists = await prisma.productVariant.findUnique({ where: { variant_id: variantId }, select: { variant_id: true } });
  if (!exists) throw Errors.notFound('Không tìm thấy biến thể.');
  const rows = await prisma.$queryRaw<MovementRow[]>(Prisma.sql`
    SELECT id, at_ms, change, after, reason, note, author, author_role FROM (
      SELECT 'a-' || a.adjustment_id::text AS id, floor(extract(epoch FROM a.at) * 1000)::float8 AS at_ms, a.at AS at,
             a.delta AS change, a.available_after AS after, a.reason::text AS reason, a.note AS note,
             a.actor_name AS author, a.actor_role::text AS author_role
      FROM inventory_adjustments a WHERE a.variant_id = ${variantId}::uuid
      UNION ALL
      SELECT 'o-' || o.order_id::text || '-' || oi.variant_id::text, floor(extract(epoch FROM o.created_at) * 1000)::float8, o.created_at,
             -oi.quantity, NULL::int, 'order', 'Bán theo đơn ' || o.code, 'Khách', NULL::text
      FROM order_items oi JOIN orders o ON o.order_id = oi.order_id WHERE oi.variant_id = ${variantId}::uuid
      UNION ALL
      SELECT 'c-' || o.order_id::text || '-' || oi.variant_id::text, floor(extract(epoch FROM o.stock_restored_at) * 1000)::float8, o.stock_restored_at,
             oi.quantity, NULL::int, 'cancel', 'Đơn huỷ, hoàn kho ' || o.code, 'Hệ thống', NULL::text
      FROM order_items oi JOIN orders o ON o.order_id = oi.order_id
      WHERE oi.variant_id = ${variantId}::uuid AND o.stock_restored_at IS NOT NULL
    ) m
    ORDER BY m.at DESC, m.id DESC
    LIMIT 50`);
  return rows.map((r) => ({
    id: r.id,
    at: new Date(Number(r.at_ms)).toISOString(),
    change: Number(r.change),
    after: r.after === null ? null : Number(r.after),
    reason: r.reason,
    note: r.note,
    author: r.author,
    authorRole: r.author_role === 'staff' || r.author_role === 'admin' ? r.author_role : null,
  }));
}
