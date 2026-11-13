import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { Errors } from '../../lib/errors';
import { escapeLike } from '../../lib/like';
import type { Db } from '../../lib/sql';
import { parseSearchTokens } from '../../lib/text';
import { UUID_RE } from '../../lib/validate';
import type { ProductListQuery } from './catalog-admin.schemas';
import { ADMIN_PRODUCT_INCLUDE, SummaryRow, toAdminProduct, toAdminSummary } from './product.mapper';

/** Thoát `%`, `_`, `\` để dùng với `LIKE ... ESCAPE '\'`. */

/** Một hàm dựng WHERE dùng chung cho `list` và `counts` (không gồm `view`). */
function buildWhere(q: ProductListQuery): Prisma.Sql {
  const parts: Prisma.Sql[] = [Prisma.sql`TRUE`];
  for (const tok of parseSearchTokens(q.q ?? '')) {
    const like = `%${escapeLike(tok)}%`;
    parts.push(
      Prisma.sql`(p.search_text LIKE ${like} ESCAPE '\\' OR EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.product_id AND v.sku ILIKE ${like} ESCAPE '\\'))`,
    );
  }
  if (q.category) {
    parts.push(Prisma.sql`p.category_id = (SELECT category_id FROM categories WHERE slug = ${q.category})`);
  }
  return Prisma.join(parts, ' AND ');
}

const OUT_OF_STOCK = Prisma.sql`EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.product_id AND v.inventory_qty = 0)`;

function viewCond(view: ProductListQuery['view']): Prisma.Sql {
  switch (view) {
    case 'active':
      return Prisma.sql`p.status = 'ACTIVE'`;
    case 'draft':
      return Prisma.sql`p.status = 'DRAFT'`;
    case 'hidden':
      return Prisma.sql`p.status = 'ARCHIVED'`;
    case 'out-of-stock':
      return OUT_OF_STOCK;
    default:
      return Prisma.sql`TRUE`;
  }
}

export interface ProductCounts {
  all: number;
  active: number;
  draft: number;
  hidden: number;
  'out-of-stock': number;
}

export async function listProducts(q: ProductListQuery) {
  const where = buildWhere(q);
  const offset = (q.page - 1) * q.limit;
  const [rows, countRows] = await Promise.all([
    prisma.$queryRaw<SummaryRow[]>(Prisma.sql`
      SELECT p.product_id, p.slug, p.name, p.cover_media_id, p.status::text AS status,
             c.slug AS category, c.name AS category_name, p.price, p.compare_at_price, p.sale_price, p.sale_starts_at, p.sale_ends_at,
             COALESCE((SELECT SUM(v.inventory_qty) FROM product_variants v WHERE v.product_id = p.product_id), 0)::int AS inventory,
             (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.product_id)::int AS variant_count,
             floor(extract(epoch FROM p.updated_at) * 1000)::float8 AS updated_ms
      FROM products p JOIN categories c ON c.category_id = p.category_id
      WHERE ${where} AND ${viewCond(q.view)}
      ORDER BY p.updated_at DESC, p.product_id DESC
      LIMIT ${q.limit} OFFSET ${offset}`),
    prisma.$queryRaw<Array<Record<keyof ProductCounts, number>>>(Prisma.sql`
      SELECT COUNT(*)::int AS "all",
             (COUNT(*) FILTER (WHERE p.status = 'ACTIVE'))::int AS "active",
             (COUNT(*) FILTER (WHERE p.status = 'DRAFT'))::int AS "draft",
             (COUNT(*) FILTER (WHERE p.status = 'ARCHIVED'))::int AS "hidden",
             (COUNT(*) FILTER (WHERE ${OUT_OF_STOCK}))::int AS "out-of-stock"
      FROM products p WHERE ${where}`),
  ]);
  const c = countRows[0];
  const counts: ProductCounts = {
    all: Number(c.all),
    active: Number(c.active),
    draft: Number(c.draft),
    hidden: Number(c.hidden),
    'out-of-stock': Number(c['out-of-stock']),
  };
  return { items: rows.map((r) => toAdminSummary(r)), total: counts[q.view], page: q.page, limit: q.limit, counts };
}

/** Đọc AdminProduct trong `db` (cùng giao dịch khi gọi từ ghi). Không có / sai dạng id -> 404. */
export async function loadAdminProduct(db: Db, id: string) {
  if (!UUID_RE.test(id)) throw Errors.notFound('Không tìm thấy sản phẩm.');
  const p = await db.product.findUnique({ where: { product_id: id }, include: ADMIN_PRODUCT_INCLUDE });
  if (!p) throw Errors.notFound('Không tìm thấy sản phẩm.');
  const ids = p.variants.map((v) => v.variant_id);
  const [ordered, ms] = await Promise.all([
    ids.length
      ? db.$queryRaw<Array<{ variant_id: string }>>(
          Prisma.sql`SELECT DISTINCT variant_id FROM order_items WHERE variant_id = ANY(${ids}::uuid[])`,
        )
      : Promise.resolve([]),
    db.$queryRaw<Array<{ ms: number }>>(
      Prisma.sql`SELECT floor(extract(epoch FROM updated_at) * 1000)::float8 AS ms FROM products WHERE product_id = ${id}::uuid`,
    ),
  ]);
  return toAdminProduct(p, new Set(ordered.map((r) => r.variant_id)), Number(ms[0].ms));
}

export async function listCategories() {
  const rows = await prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }] });
  return rows.map((c) => ({ id: c.category_id, slug: c.slug, name: c.name }));
}
