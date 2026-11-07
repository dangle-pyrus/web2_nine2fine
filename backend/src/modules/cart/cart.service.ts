import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { addMs, DAY, now as clockNow } from '../../lib/clock';
import { Errors } from '../../lib/errors';
import type { Db } from '../../lib/sql';
import { ts } from '../../lib/sql';
import { LineCtx, loadVariantRows, refreshLines, RefreshedLine, toRefreshedDto, VariantRow } from '../checkout/lines.service';
import { acquireIdempotency, completeIdempotency, requestHash } from '../order/idempotency';
import { getSettings, PolicyDto, Settings, toPolicy } from '../store/settings.service';

/** Giỏ thành viên lưu máy chủ (BR-CART-09..12, plan mục 4.9). */

export type CartLineDto = RefreshedLine & { updatedAt: string };
export interface CartViewDto {
  lines: CartLineDto[];
  policy: PolicyDto;
  expiresAt: string | null;
}
export interface CartNoticeDto {
  code: 'stock-limit' | 'per-variant-limit' | 'merged';
  variantId?: string;
  adjustedTo?: number;
}
export interface MergeResultDto {
  cart: CartViewDto;
  mergedVariantIds: string[];
  skippedVariantIds: string[];
  addedCount: number;
  evicted: Array<{ variantId: string; productId: string; quantity: number }>;
}

const LINES_MSG = 'Giỏ hàng tối đa 30 sản phẩm khác nhau.';

const isSellable = (r: VariantRow | undefined): r is VariantRow => !!r && r.status === 'ACTIVE';
const capOf = (r: VariantRow, s: Settings): number => Math.min(s.maxPerVariant, Math.max(0, r.inventory_qty));
const limitCode = (r: VariantRow, wanted: number, s: Settings): 'stock-limit' | 'per-variant-limit' =>
  r.inventory_qty < Math.min(wanted, s.maxPerVariant) ? 'stock-limit' : 'per-variant-limit';

/** Mở đầu mọi thao tác ghi: tạo giỏ nếu chưa có, khoá dòng giỏ, xoá dòng nếu giỏ đã quá hạn (coi như rỗng). */
async function lockCart(tx: Db, userId: string, settings: Settings, at: Date): Promise<string> {
  const [c] = await tx.$queryRaw<Array<{ cart_id: string; updated_at: Date }>>(Prisma.sql`
    INSERT INTO "carts" ("user_id", "updated_at") VALUES (${userId}::uuid, ${ts(at)})
    ON CONFLICT ("user_id") DO UPDATE SET "user_id" = "carts"."user_id"
    RETURNING "cart_id", "updated_at"`);
  await tx.$queryRaw(Prisma.sql`SELECT 1 FROM "carts" WHERE "cart_id" = ${c.cart_id}::uuid FOR UPDATE`);
  if (c.updated_at.getTime() < at.getTime() - settings.cartRetentionDays * DAY) {
    await tx.$executeRaw(Prisma.sql`DELETE FROM "cart_lines" WHERE "cart_id" = ${c.cart_id}::uuid`);
  }
  return c.cart_id;
}

const touch = (tx: Db, cartId: string, at: Date) =>
  tx.$executeRaw(Prisma.sql`UPDATE "carts" SET "updated_at" = ${ts(at)} WHERE "cart_id" = ${cartId}::uuid`);

async function buildView(db: Db, cartId: string | null, settings: Settings): Promise<CartViewDto> {
  const lines = cartId
    ? await db.cartLine.findMany({ where: { cartId }, orderBy: [{ updatedAt: 'desc' }, { variantId: 'asc' }] })
    : [];
  const cart = cartId ? await db.cart.findUnique({ where: { cart_id: cartId } }) : null;
  const rows = await loadVariantRows(
    db,
    lines.map((l) => l.variantId),
  );
  const refreshed = refreshLines(
    lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
    rows,
    settings,
  );
  const dto: CartLineDto[] = refreshed.map((l: LineCtx, i) => ({ ...toRefreshedDto(l), updatedAt: lines[i].updatedAt.toISOString() }));
  return {
    lines: dto,
    policy: toPolicy(settings),
    expiresAt: cart && lines.length > 0 ? addMs(cart.updatedAt, settings.cartRetentionDays * DAY).toISOString() : null,
  };
}

/** GET /cart: chỉ đọc, không sửa số lượng. Giỏ quá 30 ngày bị coi như rỗng và xoá lười. */
export async function getCart(userId: string, at: Date = clockNow()): Promise<CartViewDto> {
  const settings = await getSettings(prisma);
  const cart = await prisma.cart.findUnique({ where: { userId } });
  if (!cart) return buildView(prisma, null, settings);
  if (cart.updatedAt.getTime() < at.getTime() - settings.cartRetentionDays * DAY) {
    await prisma.cartLine.deleteMany({ where: { cartId: cart.cart_id } });
    return buildView(prisma, null, settings);
  }
  return buildView(prisma, cart.cart_id, settings);
}

const upsertLine = (tx: Db, cartId: string, variantId: string, quantity: number, at: Date) =>
  tx.$executeRaw(Prisma.sql`
    INSERT INTO "cart_lines" ("cart_id", "variant_id", "quantity", "updated_at")
    VALUES (${cartId}::uuid, ${variantId}::uuid, ${quantity}, ${ts(at)})
    ON CONFLICT ("cart_id", "variant_id") DO UPDATE SET "quantity" = EXCLUDED."quantity", "updated_at" = EXCLUDED."updated_at"`);

export async function addLine(
  userId: string,
  variantId: string,
  quantity: number,
  at: Date = clockNow(),
): Promise<{ cart: CartViewDto; notice: CartNoticeDto | null }> {
  return prisma.$transaction(async (tx) => {
    const settings = await getSettings(tx);
    const row = (await loadVariantRows(tx, [variantId])).get(variantId);
    if (!isSellable(row) || row.inventory_qty <= 0) throw Errors.stockChanged([{ variantId, available: 0 }]);

    const cartId = await lockCart(tx, userId, settings, at);
    const existing = await tx.cartLine.findUnique({ where: { cartId_variantId: { cartId, variantId } } });
    if (!existing) {
      const count = await tx.cartLine.count({ where: { cartId } });
      if (count >= settings.maxCartLines) throw Errors.validation(LINES_MSG, 'variantId');
    }
    const wanted = (existing?.quantity ?? 0) + quantity;
    const qty = Math.min(wanted, capOf(row, settings));
    await upsertLine(tx, cartId, variantId, qty, at);
    await touch(tx, cartId, at);
    const notice: CartNoticeDto | null =
      qty < wanted ? { code: limitCode(row, wanted, settings), variantId, adjustedTo: qty } : null;
    return { cart: await buildView(tx, cartId, settings), notice };
  });
}

export async function setLineQuantity(
  userId: string,
  variantId: string,
  quantity: number,
  at: Date = clockNow(),
): Promise<{ cart: CartViewDto; notice: CartNoticeDto | null }> {
  return prisma.$transaction(async (tx) => {
    const settings = await getSettings(tx);
    const cartId = await lockCart(tx, userId, settings, at);
    const existing = await tx.cartLine.findUnique({ where: { cartId_variantId: { cartId, variantId } } });
    if (!existing) throw Errors.notFound('Sản phẩm không có trong giỏ hàng.');
    const row = (await loadVariantRows(tx, [variantId])).get(variantId);
    if (!isSellable(row) || row.inventory_qty <= 0) throw Errors.stockChanged([{ variantId, available: 0 }]);
    const qty = Math.min(quantity, capOf(row, settings));
    await upsertLine(tx, cartId, variantId, qty, at);
    await touch(tx, cartId, at);
    const notice: CartNoticeDto | null =
      qty < quantity ? { code: limitCode(row, quantity, settings), variantId, adjustedTo: qty } : null;
    return { cart: await buildView(tx, cartId, settings), notice };
  });
}

export async function removeLine(
  userId: string,
  variantId: string,
  at: Date = clockNow(),
): Promise<{ cart: CartViewDto; notice: null }> {
  return prisma.$transaction(async (tx) => {
    const settings = await getSettings(tx);
    const cartId = await lockCart(tx, userId, settings, at);
    await tx.cartLine.deleteMany({ where: { cartId, variantId } });
    await touch(tx, cartId, at);
    return { cart: await buildView(tx, cartId, settings), notice: null };
  });
}

export async function changeVariant(
  userId: string,
  fromVariantId: string,
  toVariantId: string,
  at: Date = clockNow(),
): Promise<{ cart: CartViewDto; notice: CartNoticeDto | null }> {
  return prisma.$transaction(async (tx) => {
    const settings = await getSettings(tx);
    const cartId = await lockCart(tx, userId, settings, at);
    const source = await tx.cartLine.findUnique({ where: { cartId_variantId: { cartId, variantId: fromVariantId } } });
    if (!source) throw Errors.notFound('Sản phẩm không có trong giỏ hàng.');
    if (toVariantId === fromVariantId) throw Errors.validation('Chọn màu hoặc size khác.', 'toVariantId');

    const rows = await loadVariantRows(tx, [fromVariantId, toVariantId]);
    const from = rows.get(fromVariantId);
    const to = rows.get(toVariantId);
    // Đích phải cùng sản phẩm với dòng hiện tại.
    if (!to || !from || from.product_id !== to.product_id) {
      throw Errors.validation('Phiên bản muốn đổi không thuộc sản phẩm này.', 'toVariantId');
    }
    if (!isSellable(to) || to.inventory_qty <= 0) throw Errors.stockChanged([{ variantId: toVariantId, available: 0 }]);

    const target = await tx.cartLine.findUnique({ where: { cartId_variantId: { cartId, variantId: toVariantId } } });
    const wanted = source.quantity + (target?.quantity ?? 0);
    const qty = Math.min(wanted, capOf(to, settings));
    await tx.cartLine.delete({ where: { cartId_variantId: { cartId, variantId: fromVariantId } } });
    await upsertLine(tx, cartId, toVariantId, qty, at);
    await touch(tx, cartId, at);

    let notice: CartNoticeDto | null = null;
    if (target) {
      notice = { code: 'merged', variantId: toVariantId, ...(qty < wanted ? { adjustedTo: qty } : {}) };
    } else if (qty < wanted) {
      notice = { code: limitCode(to, wanted, settings), variantId: toVariantId, adjustedTo: qty };
    }
    return { cart: await buildView(tx, cartId, settings), notice };
  });
}

/**
 * Gộp giỏ khách vào giỏ tài khoản (BR-CART-10). `lines` là phần CẦN CỘNG THÊM. Idempotent theo `Idempotency-Key`:
 * gửi lại trả snapshot đầu tiên + giỏ hiện tại.
 */
export async function mergeGuestCart(
  userId: string,
  key: string,
  body: { lines: Array<{ variantId: string; quantity: number }> },
  at: Date = clockNow(),
): Promise<{ result: MergeResultDto; replayed: boolean }> {
  const hash = requestHash(body, userId);
  return prisma.$transaction(async (tx) => {
    const settings = await getSettings(tx);
    const acquired = await acquireIdempotency(tx, 'cart-merge', key, hash, at);
    if (acquired.kind === 'replay') {
      const snap = acquired.snapshot as Omit<MergeResultDto, 'cart'>;
      const cart = await tx.cart.findUnique({ where: { userId } });
      return { result: { ...snap, cart: await buildView(tx, cart?.cart_id ?? null, settings) }, replayed: true };
    }

    const cartId = await lockCart(tx, userId, settings, at);
    const sorted = [...body.lines].sort((a, b) => (a.variantId < b.variantId ? -1 : 1));
    const rows = await loadVariantRows(
      tx,
      sorted.map((l) => l.variantId),
    );
    const merged: string[] = [];
    const skipped: string[] = [];
    for (const l of sorted) {
      if (!isSellable(rows.get(l.variantId))) {
        skipped.push(l.variantId);
        continue;
      }
      // Cộng dồn, cắt theo hạn mức mỗi phiên bản; KHÔNG cắt theo tồn: dòng hết hàng vẫn mang sang (CART-10).
      const existing = await tx.cartLine.findUnique({ where: { cartId_variantId: { cartId, variantId: l.variantId } } });
      await upsertLine(tx, cartId, l.variantId, Math.min(settings.maxPerVariant, (existing?.quantity ?? 0) + l.quantity), at);
      merged.push(l.variantId);
    }

    // Vượt 30 dòng: bỏ các dòng cũ nhất (không phải dòng vừa gộp), trả ở `evicted`.
    const evicted: MergeResultDto['evicted'] = [];
    const count = await tx.cartLine.count({ where: { cartId } });
    if (count > settings.maxCartLines) {
      const old = await tx.$queryRaw<Array<{ variant_id: string; product_id: string; quantity: number }>>(Prisma.sql`
        SELECT cl."variant_id", v."product_id", cl."quantity"
        FROM "cart_lines" cl JOIN "product_variants" v ON v."variant_id" = cl."variant_id"
        WHERE cl."cart_id" = ${cartId}::uuid AND cl."variant_id" <> ALL(${merged}::uuid[])
        ORDER BY cl."updated_at" ASC, cl."variant_id" ASC
        LIMIT ${count - settings.maxCartLines}`);
      if (old.length) {
        await tx.cartLine.deleteMany({ where: { cartId, variantId: { in: old.map((o) => o.variant_id) } } });
        evicted.push(...old.map((o) => ({ variantId: o.variant_id, productId: o.product_id, quantity: o.quantity })));
      }
    }
    await touch(tx, cartId, at);

    const snapshot = { mergedVariantIds: merged, skippedVariantIds: skipped, addedCount: merged.length, evicted };
    await completeIdempotency(tx, 'cart-merge', key, { snapshot });
    return { result: { cart: await buildView(tx, cartId, settings), ...snapshot }, replayed: false };
  });
}
