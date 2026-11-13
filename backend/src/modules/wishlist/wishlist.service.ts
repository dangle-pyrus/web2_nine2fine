import { Prisma } from '@prisma/client';
import { P1_ASSUMPTIONS } from '../../config/assumptions';
import prisma from '../../config/prisma';
import { AppError, Errors } from '../../lib/errors';
import { isRetryable } from '../../lib/retry';
import { now as clockNow } from '../../lib/clock';
import type { Db } from '../../lib/sql';
import { UUID_RE } from '../../lib/validate';

/**
 * Wishlist (Slice 10.4, BR-WISH-01..05). Lưu theo SẢN PHẨM, tối đa 100 mục `ACTIVE` mỗi tài khoản; mục của sản phẩm không `ACTIVE`
 * giữ trong DB nhưng không trả, không tính vào 100. Mọi ghi chạy trong MỘT giao dịch có khoá dòng tài khoản (`FOR UPDATE`):
 * `PUT` và `merge` của cùng tài khoản tuần tự hoá nên không vượt giới hạn dưới đua. Đọc không khoá.
 */

const MAX = P1_ASSUMPTIONS.wishlist.max;
const TX = { timeout: 10_000, maxWait: 5_000 } as const;

export interface WishlistEntryDto {
  productId: string;
  addedAt: string;
}
export interface WishlistDto {
  items: WishlistEntryDto[];
  total: number;
}

interface Row {
  product_id: string;
  added_at: Date;
}
const toEntry = (r: Row): WishlistEntryDto => ({ productId: r.product_id, addedAt: r.added_at.toISOString() });

/** Mục `ACTIVE` mới thêm trước (hoà `productId` giảm dần), tối đa 100. `added_at` là UTC không múi giờ: cộng nhãn UTC khi đọc. */
async function listActive(db: Db, userId: string): Promise<WishlistEntryDto[]> {
  const rows = await db.$queryRaw<Row[]>(Prisma.sql`
    SELECT w."product_id"::text AS "product_id", (w."added_at" AT TIME ZONE 'UTC') AS "added_at"
    FROM "wishlist_items" w JOIN "products" p ON p."product_id" = w."product_id"
    WHERE w."user_id" = ${userId}::uuid AND p."status" = 'ACTIVE'
    ORDER BY w."added_at" DESC, w."product_id" DESC LIMIT ${MAX}`);
  return rows.map(toEntry);
}

export async function getWishlist(userId: string): Promise<WishlistDto> {
  const items = await listActive(prisma, userId);
  return { items, total: items.length };
}

async function lockUser(tx: Db, userId: string): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ user_id: string }>>(Prisma.sql`SELECT "user_id" FROM "users" WHERE "user_id" = ${userId}::uuid FOR UPDATE`);
  if (rows.length === 0) throw Errors.unauthenticated();
}

async function activeCount(tx: Db, userId: string): Promise<number> {
  const [r] = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`
    SELECT COUNT(*)::int AS "n" FROM "wishlist_items" w JOIN "products" p ON p."product_id" = w."product_id"
    WHERE w."user_id" = ${userId}::uuid AND p."status" = 'ACTIVE'`);
  return r.n;
}

async function runTx<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction((tx) => fn(tx), TX);
    } catch (err) {
      if (!(err instanceof AppError) && attempt < 3 && isRetryable(err)) continue;
      throw err;
    }
  }
}

/** Thêm một sản phẩm. Có sẵn -> trả mục cũ (`addedAt` giữ nguyên); id sai dạng / không có / không `ACTIVE` -> 404; đủ 100 -> 409. */
export async function addItem(userId: string, rawProductId: string): Promise<WishlistEntryDto> {
  if (!UUID_RE.test(rawProductId)) throw Errors.notFound();
  const productId = rawProductId.toLowerCase();
  return runTx(async (tx) => {
    await lockUser(tx, userId);
    const [p] = await tx.$queryRaw<Array<{ status: string }>>(Prisma.sql`SELECT "status"::text AS "status" FROM "products" WHERE "product_id" = ${productId}::uuid`);
    if (!p || p.status !== 'ACTIVE') throw Errors.notFound();
    const existing = await tx.wishlistItem.findUnique({ where: { userId_productId: { userId, productId } } });
    if (existing) return { productId, addedAt: existing.addedAt.toISOString() };
    if ((await activeCount(tx, userId)) >= MAX) throw Errors.wishlistFull(MAX);
    const row = await tx.wishlistItem.create({ data: { userId, productId, addedAt: clockNow() } });
    return { productId, addedAt: row.addedAt.toISOString() };
  });
}

/** Xoá một mục (idempotent): id sai dạng / không có / đã ẩn đều không lỗi. */
export async function removeItem(userId: string, rawProductId: string): Promise<void> {
  if (!UUID_RE.test(rawProductId)) return;
  await prisma.wishlistItem.deleteMany({ where: { userId, productId: rawProductId.toLowerCase() } });
}

export interface MergeResultDto extends WishlistDto {
  skipped: number;
}

/**
 * Gộp các id CHƯA ĐỒNG BỘ (`productIds` đã qua kiểm dạng): bỏ trùng giữ thứ tự gửi, bỏ id không phải UUID / không `ACTIVE`,
 * thêm theo thứ tự gửi tới khi đủ 100 (mục đã có không bao giờ bị bỏ). `skipped` = id không hợp lệ + id vượt 100
 * (id đã có sẵn trên máy chủ và id trùng trong lần gửi không tính). `addedAt` của mục gộp tăng dần theo thứ tự gửi (+1 ms mỗi mục).
 */
export async function mergeItems(userId: string, productIds: string[]): Promise<MergeResultDto> {
  const seen = new Set<string>();
  const ordered: string[] = [];
  let invalid = 0;
  for (const raw of productIds) {
    const id = raw.trim().toLowerCase();
    if (!UUID_RE.test(id)) {
      invalid++;
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  return runTx(async (tx) => {
    await lockUser(tx, userId);
    const active = ordered.length
      ? new Set(
          (
            await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
              SELECT "product_id"::text AS "id" FROM "products" WHERE "product_id" = ANY(${ordered}::uuid[]) AND "status" = 'ACTIVE'`)
          ).map((r) => r.id),
        )
      : new Set<string>();
    const have = new Set((await listActive(tx, userId)).map((e) => e.productId));
    let free = Math.max(0, MAX - (await activeCount(tx, userId)));
    let skipped = invalid;
    const base = clockNow().getTime();
    const data: Array<{ userId: string; productId: string; addedAt: Date }> = [];
    for (const id of ordered) {
      if (!active.has(id)) {
        skipped++;
        continue;
      }
      if (have.has(id)) continue;
      if (free <= 0) {
        skipped++;
        continue;
      }
      free--;
      data.push({ userId, productId: id, addedAt: new Date(base + data.length) });
    }
    if (data.length > 0) await tx.wishlistItem.createMany({ data, skipDuplicates: true });
    const items = await listActive(tx, userId);
    return { items, total: items.length, skipped };
  });
}
