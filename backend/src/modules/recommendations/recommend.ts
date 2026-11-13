import { Prisma } from '@prisma/client';
import { P1_ASSUMPTIONS } from '../../config/assumptions';
import prisma from '../../config/prisma';
import { DAY } from '../../lib/clock';
import type { Db } from '../../lib/sql';
import { UUID_RE } from '../../lib/validate';
import { ts } from '../../lib/sql';

/**
 * Gợi ý sản phẩm (Slice 10.6, BR-REC-01..03, 05). MỘT hàm xác định, KHÔNG dùng dữ liệu người dùng, chỉ ĐỌC catalog.
 * Ứng viên = sản phẩm `ACTIVE` còn hàng ở ÍT NHẤT một biến thể (loại `ARCHIVED` / `DRAFT` / hết hàng mọi biến thể).
 * Cùng dữ liệu + cùng tham số -> cùng kết quả và thứ tự (mọi sắp xếp hoà bằng `sales_rank` tăng rồi `slug` tăng).
 */

export interface RecProduct {
  id: string;
  slug: string;
  categoryId: string;
  moments: readonly string[];
  salesRank: number;
}

const bySalesThenSlug = (a: RecProduct, b: RecProduct): number => a.salesRank - b.salesRank || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);

/** Số Moment chung. */
const commonMoments = (a: RecProduct, b: RecProduct): number => a.moments.filter((m) => b.moments.includes(m)).length;

/** Ứng viên: ACTIVE + còn hàng (một truy vấn, cả catalog nhỏ). */
export async function loadCandidates(db: Db = prisma): Promise<RecProduct[]> {
  const rows = await db.product.findMany({
    where: { status: 'ACTIVE', variants: { some: { inventoryQty: { gt: 0 } } } },
    select: { product_id: true, slug: true, categoryId: true, moments: true, salesRank: true },
  });
  return rows.map((r) => ({ id: r.product_id, slug: r.slug, categoryId: r.categoryId, moments: r.moments, salesRank: r.salesRank }));
}

/** Đầu vào: sản phẩm `ACTIVE` theo id (UUID) HOẶC slug, giữ thứ tự đầu vào, bỏ trùng; id / slug lạ bị bỏ (đầu vào KHÔNG cần còn hàng). */
export async function resolveInputs(tokens: readonly string[], db: Db = prisma): Promise<RecProduct[]> {
  if (tokens.length === 0) return [];
  const uuids = tokens.filter((t) => UUID_RE.test(t));
  const rows = await db.product.findMany({
    where: { status: 'ACTIVE', OR: [{ product_id: { in: uuids } }, { slug: { in: tokens as string[] } }] },
    select: { product_id: true, slug: true, categoryId: true, moments: true, salesRank: true },
  });
  const found = new Map<string, RecProduct>();
  for (const r of rows) {
    const p = { id: r.product_id, slug: r.slug, categoryId: r.categoryId, moments: r.moments, salesRank: r.salesRank };
    found.set(p.id, p);
    found.set(p.slug, p);
  }
  const out: RecProduct[] = [];
  const seen = new Set<string>();
  for (const t of tokens) {
    const p = found.get(t);
    if (p && !seen.has(p.id)) {
      seen.add(p.id);
      out.push(p);
    }
  }
  return out;
}

/** BR-REC-05 (Should): sản phẩm có >= N đơn `completed` chung với X trong 365 ngày, số đơn chung giảm. */
export async function loadCoPurchase(productId: string, now: Date, db: Db = prisma): Promise<Map<string, number>> {
  const cfg = P1_ASSUMPTIONS.recommendations;
  const since = new Date(now.getTime() - cfg.coPurchaseDays * DAY);
  const rows = await db.$queryRaw<Array<{ product_id: string; n: number }>>(Prisma.sql`
    SELECT b."product_id"::text AS "product_id", COUNT(DISTINCT a."order_id")::int AS "n"
    FROM "order_items" a
    JOIN "orders" o ON o."order_id" = a."order_id"
    JOIN "order_items" b ON b."order_id" = a."order_id" AND b."product_id" <> a."product_id"
    WHERE a."product_id" = ${productId}::uuid AND o."status" = 'completed'
      AND COALESCE(o."delivered_at", o."created_at") >= ${ts(since)}
    GROUP BY b."product_id" HAVING COUNT(DISTINCT a."order_id") >= ${cfg.coPurchaseMinOrders}`);
  return new Map(rows.map((r) => [r.product_id, r.n]));
}

/** (A) Danh sách cho MỘT sản phẩm X: bước 0 (mua cùng, Should), 1 (cùng danh mục + Moment chung), 2 (cùng danh mục), 3 (cùng Moment khác danh mục), 4 (bán chạy). */
export function listFor(x: RecProduct, cands: readonly RecProduct[], limit: number, coPurchase?: ReadonlyMap<string, number>): RecProduct[] {
  const pool = cands.filter((c) => c.id !== x.id);
  const used = new Set<string>();
  const out: RecProduct[] = [];
  const take = (list: RecProduct[]): void => {
    for (const c of list) {
      if (used.has(c.id)) continue;
      used.add(c.id);
      out.push(c);
    }
  };
  if (coPurchase && coPurchase.size > 0) {
    take(pool.filter((c) => coPurchase.has(c.id)).sort((a, b) => (coPurchase.get(b.id)! - coPurchase.get(a.id)!) || bySalesThenSlug(a, b)));
  }
  const sameCat = pool.filter((c) => c.categoryId === x.categoryId);
  take(
    sameCat
      .filter((c) => commonMoments(x, c) >= 1)
      .sort((a, b) => commonMoments(x, b) - commonMoments(x, a) || bySalesThenSlug(a, b)),
  );
  take([...sameCat].sort(bySalesThenSlug));
  take(pool.filter((c) => c.categoryId !== x.categoryId && commonMoments(x, c) >= 1).sort(bySalesThenSlug));
  take([...pool].sort(bySalesThenSlug));
  return out.slice(0, limit);
}

/**
 * Hàm gợi ý chung. `inputs` đã giải mã (0..10 sản phẩm `ACTIVE`): 0 -> bán chạy; 1 -> (A) cho sản phẩm đó (như PDP);
 * >= 2 -> (B) giỏ: mỗi sản phẩm sinh danh sách (A) 8 mục, điểm = số danh sách chứa sản phẩm, xếp điểm giảm, `sales_rank` tăng, `slug`;
 * loại mọi sản phẩm đầu vào. Ít hơn `limit` thì trả ít hơn (không bù sai điều kiện).
 */
export async function recommend(inputs: readonly RecProduct[], limit: number, now: Date, db: Db = prisma): Promise<string[]> {
  const cands = await loadCandidates(db);
  if (inputs.length === 0) return [...cands].sort(bySalesThenSlug).slice(0, limit).map((c) => c.id);

  const useCo = P1_ASSUMPTIONS.recommendations.coPurchaseMinOrders > 0;
  const listOf = async (x: RecProduct, n: number): Promise<RecProduct[]> => listFor(x, cands, n, useCo ? await loadCoPurchase(x.id, now, db) : undefined);

  if (inputs.length === 1) return (await listOf(inputs[0], limit)).map((c) => c.id);

  const per = P1_ASSUMPTIONS.recommendations.limit.max;
  const score = new Map<string, { p: RecProduct; n: number }>();
  const inputIds = new Set(inputs.map((i) => i.id));
  for (const x of inputs) {
    for (const c of await listOf(x, per)) {
      if (inputIds.has(c.id)) continue;
      const cur = score.get(c.id);
      if (cur) cur.n++;
      else score.set(c.id, { p: c, n: 1 });
    }
  }
  return [...score.values()]
    .sort((a, b) => b.n - a.n || bySalesThenSlug(a.p, b.p))
    .slice(0, limit)
    .map((s) => s.p.id);
}
