import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { P1_ASSUMPTIONS } from '../../config/assumptions';
import prisma from '../../config/prisma';
import { Errors } from '../../lib/errors';
import type { Db } from '../../lib/sql';
import { addCalendarDays, daysBetween, isRealDate, vnStartOfDay } from '../../lib/vn-time';
import { parseBodyAll } from '../../lib/validate';
import { Actor, writeBulkSale } from '../catalog-admin/product.write';
import { saleState } from '../pricing/effective-price';

const B = P1_ASSUMPTIONS.promo;
const MAX_LIST = 200;

const dateField = (msg: string) => z.string({ error: msg }).refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && isRealDate(v), { error: msg });
const PCT_MSG = `Phần trăm giảm là số nguyên từ ${B.bulkPercent.min} đến ${B.bulkPercent.max}.`;

export const bulkSaleSchema = z
  .object({
    category: z.string({ error: 'Chọn danh mục.' }).transform((v) => v.trim().toLowerCase()),
    percent: z
      .number({ error: PCT_MSG })
      .int({ error: PCT_MSG })
      .min(B.bulkPercent.min, { error: PCT_MSG })
      .max(B.bulkPercent.max, { error: PCT_MSG }),
    startsOn: dateField('Ngày bắt đầu dạng YYYY-MM-DD.'),
    endsOn: dateField('Ngày kết thúc dạng YYYY-MM-DD.'),
  })
  .superRefine((v, ctx) => {
    if (!isRealDate(v.startsOn) || !isRealDate(v.endsOn)) return;
    const d = daysBetween(v.startsOn, v.endsOn);
    if (d < 0) ctx.addIssue({ code: 'custom', path: ['endsOn'], message: 'Ngày kết thúc không được trước ngày bắt đầu.' });
    else if (d > B.maxDays - 1) ctx.addIssue({ code: 'custom', path: ['endsOn'], message: `Đợt giảm giá tối đa ${B.maxDays} ngày.` });
  });
export type BulkSaleInput = z.output<typeof bulkSaleSchema>;

interface Item {
  productId: string;
  name: string;
  slug: string;
  price: number;
  salePrice: number | null;
  reason?: 'sale-running' | 'below-minimum' | 'not-reduced';
}

interface Plan {
  applicable: Item[];
  skipped: Item[];
  rows: Array<{ id: string; salePrice: number; updatedMs: number }>;
}

/** Đọc + tính (xem trước và áp dùng CHUNG; áp thì `lock` để khoá dòng). Sản phẩm `ACTIVE` của danh mục, sắp `slug`. */
async function plan(db: Db, categoryId: string, percent: number, at: Date, lock: boolean): Promise<Plan> {
  const rows = await db.$queryRaw<
    Array<{ product_id: string; name: string; slug: string; price: number; sale_price: number | null; sale_starts_at: Date | null; sale_ends_at: Date | null; ms: number }>
  >(Prisma.sql`
    SELECT "product_id", "name", "slug", "price"::int AS price, "sale_price"::int AS sale_price, "sale_starts_at", "sale_ends_at",
           floor(extract(epoch FROM "updated_at") * 1000)::float8 AS ms
    FROM "products" WHERE "category_id" = ${categoryId}::uuid AND "status" = 'ACTIVE' ORDER BY "slug" ASC
    ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}`);
  const out: Plan = { applicable: [], skipped: [], rows: [] };
  for (const r of rows) {
    const calc = Math.floor((r.price * (100 - percent)) / 100 / B.bulkRoundStep) * B.bulkRoundStep;
    const valid = calc >= B.minSalePrice && calc < r.price;
    const base: Item = { productId: r.product_id, name: r.name, slug: r.slug, price: r.price, salePrice: valid ? calc : null };
    const running =
      saleState({ price: r.price, compareAtPrice: null, salePrice: r.sale_price, saleStartsAt: r.sale_starts_at, saleEndsAt: r.sale_ends_at }, at) === 'running';
    if (running) out.skipped.push({ ...base, reason: 'sale-running' });
    else if (calc < B.minSalePrice) out.skipped.push({ ...base, reason: 'below-minimum' });
    else if (calc >= r.price) out.skipped.push({ ...base, reason: 'not-reduced' });
    else {
      out.applicable.push(base);
      out.rows.push({ id: r.product_id, salePrice: calc, updatedMs: Number(r.ms) });
    }
  }
  return out;
}

async function parse(raw: unknown): Promise<{ input: BulkSaleInput; categoryId: string }> {
  const input = parseBodyAll(bulkSaleSchema, raw);
  const cat = await prisma.category.findUnique({ where: { slug: input.category } });
  if (!cat) throw Errors.validation('Danh mục không tồn tại.', 'category');
  return { input, categoryId: cat.category_id };
}

const bounds = (i: BulkSaleInput) => ({
  startsAt: vnStartOfDay(i.startsOn),
  endsAt: new Date(vnStartOfDay(addCalendarDays(i.endsOn, 1)).getTime() - 1000),
});

const view = (p: Plan, applied: number) => ({
  applicable: p.applicable.slice(0, MAX_LIST),
  skipped: p.skipped.slice(0, MAX_LIST),
  applied,
});

export async function previewBulkSale(raw: unknown, at: Date) {
  const { input, categoryId } = await parse(raw);
  return view(await plan(prisma, categoryId, input.percent, at, false), 0);
}

/** Áp trong MỘT giao dịch: khoá các dòng, tính LẠI, ghi tất cả hoặc không. */
export async function applyBulkSale(actor: Actor, raw: unknown, at: Date) {
  const { input, categoryId } = await parse(raw);
  const { startsAt, endsAt } = bounds(input);
  return prisma.$transaction(
    async (tx) => {
      const p = await plan(tx, categoryId, input.percent, at, true);
      await writeBulkSale(tx, p.rows, startsAt, endsAt, actor, at);
      return view(p, p.rows.length);
    },
    { timeout: 20_000, maxWait: 5_000 },
  );
}
