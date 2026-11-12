import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { CATALOG_ASSUMPTIONS } from '../../config/assumptions';
import { now as clockNow } from '../../lib/clock';
import { AppError, Errors } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { isRetryable } from '../../lib/retry';
import type { Db } from '../../lib/sql';
import { ts } from '../../lib/sql';
import { UUID_RE } from '../../lib/validate';
import { acquireIdempotency, completeIdempotency, requestHash } from '../order/idempotency';
import type { AdjustmentInput, ThresholdsInput } from './inventory-promotion.schemas';
import { AdminInventoryItemDto, defaultThreshold, loadInventoryItem, RESERVED_SQL } from './inventory.query';
import type { Actor } from './product.write';

/**
 * Điều chỉnh tồn an toàn khi đua với đặt hàng (plan mục 7, BR-INV-31..34).
 * Khoá và cập nhật TRÊN CHÍNH dòng `product_variants` mà `placeOrder` / `cancelOrderTx` / `restockReturnedTx` cập nhật,
 * nên Postgres tuần tự hoá ba bên bằng khoá dòng. Thứ tự khoá toàn hệ thống (plan 6.1): chỉ một dòng biến thể + INSERT.
 */

const TX = { timeout: 10_000, maxWait: 5_000 } as const;
const { stock: STOCK } = CATALOG_ASSUMPTIONS;


export interface AdjustResult {
  item: AdminInventoryItemDto;
  replayed: boolean;
}

export async function adjustStock(p: { actor: Actor; variantId: string; input: AdjustmentInput; key: string; path: string }): Promise<AdjustResult> {
  if (!UUID_RE.test(p.variantId)) throw Errors.notFound('Không tìm thấy biến thể.');
  const hash = requestHash({ method: 'POST', path: p.path, body: p.input }, p.actor.id);

  for (let attempt = 1; ; attempt++) {
    try {
      const out = await prisma.$transaction(async (tx) => {
        const at = clockNow();
        // 0. Idempotency (yêu cầu cùng khoá chạy tuần tự trên chỉ mục duy nhất).
        const acq = await acquireIdempotency(tx, 'admin-action', p.key, hash, at);
        if (acq.kind === 'replay') return { item: acq.snapshot as AdminInventoryItemDto, replayed: true };

        // 1-3. Đổi tồn + đúng 1 dòng nhật ký.
        const after = p.input.mode === 'delta' ? await applyDelta(tx, p.variantId, p.input.quantity, at) : await applySet(tx, p.variantId, p.input, at);
        await tx.inventoryAdjustment.create({
          data: {
            variantId: p.variantId,
            at,
            delta: after.delta,
            availableAfter: after.available,
            reason: p.input.reason,
            note: p.input.note,
            actorUserId: p.actor.id,
            actorName: p.actor.name.slice(0, 100),
            actorRole: p.actor.role,
          },
        });
        // 4-5. Đọc lại cùng giao dịch, lưu khoá.
        const item = await loadInventoryItem(tx, p.variantId);
        await completeIdempotency(tx, 'admin-action', p.key, { snapshot: item });
        return { item, replayed: false };
      }, TX);
      if (!out.replayed) logger.info('admin-stock-adjust', { variantId: p.variantId, reason: p.input.reason, userId: p.actor.id });
      return out;
    } catch (err) {
      if (!(err instanceof AppError) && attempt < 3 && isRetryable(err)) continue;
      throw err;
    }
  }
}

/** `delta`: một phép cộng NGUYÊN TỬ có điều kiện (không có khoảng "đọc rồi ghi"; CHECK `inventory_qty >= 0` là đai thứ hai). */
async function applyDelta(tx: Db, variantId: string, d: number, at: Date): Promise<{ delta: number; available: number }> {
  for (let i = 0; i < 3; i++) {
    const rows = await tx.$queryRaw<Array<{ inventory_qty: number }>>(Prisma.sql`
      UPDATE product_variants SET inventory_qty = inventory_qty + ${d}, updated_at = ${ts(at)}
      WHERE variant_id = ${variantId}::uuid AND inventory_qty + ${d} BETWEEN 0 AND ${STOCK.maxQty}
      RETURNING inventory_qty`);
    if (rows[0]) return { delta: d, available: Number(rows[0].inventory_qty) };
    const cur = await tx.$queryRaw<Array<{ inventory_qty: number }>>(
      Prisma.sql`SELECT inventory_qty FROM product_variants WHERE variant_id = ${variantId}::uuid`,
    );
    if (!cur[0]) throw Errors.notFound('Không tìm thấy biến thể.');
    const qty = Number(cur[0].inventory_qty);
    if (qty + d < 0) throw Errors.validation(`Chỉ còn ${qty} có thể bán.`, 'quantity');
    if (qty + d > STOCK.maxQty) throw Errors.validation('Tối đa 100.000.', 'quantity');
    // Có người đổi tồn giữa UPDATE và SELECT làm điều kiện nay thoả: thử lại.
  }
  throw Errors.unavailable();
}

/** `set`: khoá dòng, đọc Đang giữ trong cùng giao dịch, so `expectedAvailable`. */
async function applySet(tx: Db, variantId: string, input: AdjustmentInput, at: Date): Promise<{ delta: number; available: number }> {
  const locked = await tx.$queryRaw<Array<{ inventory_qty: number }>>(
    Prisma.sql`SELECT inventory_qty FROM product_variants WHERE variant_id = ${variantId}::uuid FOR UPDATE`,
  );
  if (!locked[0]) throw Errors.notFound('Không tìm thấy biến thể.');
  const before = Number(locked[0].inventory_qty);
  const [r] = await tx.$queryRaw<Array<{ reserved: number }>>(
    Prisma.sql`SELECT ${RESERVED_SQL} AS reserved FROM product_variants v WHERE v.variant_id = ${variantId}::uuid`,
  );
  const reserved = Number(r.reserved);
  if (input.expectedAvailable !== before) throw Errors.stockChangedAdmin(before, reserved);
  const next = input.quantity - reserved;
  if (next < 0) throw Errors.validation(`Không thể thấp hơn ${reserved} đang giữ cho đơn chưa giao.`, 'quantity');
  if (next === before) throw Errors.validation('Số lượng không thay đổi.', 'quantity');
  await tx.$executeRaw(Prisma.sql`UPDATE product_variants SET inventory_qty = ${next}, updated_at = ${ts(at)} WHERE variant_id = ${variantId}::uuid`);
  return { delta: next - before, available: next };
}

/* ---------------------------------- Ngưỡng sắp hết (BR-INV-35, 36) ---------------------------------- */

export async function setThresholds(input: ThresholdsInput): Promise<{ defaultThreshold: number; customCount: number }> {
  // Thuần: trùng variantId -> mục cuối thắng; id sai dạng -> 422 trước khi mở giao dịch.
  const items = new Map<string, number | null>();
  (input.items ?? []).forEach((it, i) => {
    if (!UUID_RE.test(it.variantId)) throw Errors.validation('Biến thể không tồn tại.', `items[${i}].variantId`);
    items.set(it.variantId, it.threshold);
  });
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        if (items.size > 0) {
          const ids = [...items.keys()];
          const found = await tx.$queryRaw<Array<{ variant_id: string }>>(
            Prisma.sql`SELECT variant_id FROM product_variants WHERE variant_id = ANY(${ids}::uuid[])`,
          );
          const have = new Set(found.map((f) => f.variant_id));
          const missing = (input.items ?? []).findIndex((it) => !have.has(it.variantId));
          if (missing >= 0) throw Errors.validation('Biến thể không tồn tại.', `items[${missing}].variantId`);
        }
        // Khoá các biến thể sẽ đổi theo variant_id tăng dần (tránh chu trình với đặt hàng), rồi mới UPDATE.
        const ids = [...items.keys()];
        await tx.$queryRaw(Prisma.sql`
          SELECT variant_id FROM product_variants
          WHERE ${input.clearCustom ? Prisma.sql`low_stock_threshold IS NOT NULL OR` : Prisma.empty} variant_id = ANY(${ids}::uuid[])
          ORDER BY variant_id FOR UPDATE`);
        if (input.defaultThreshold !== undefined) {
          const n = await tx.$executeRaw(Prisma.sql`UPDATE store_settings SET low_stock_default = ${input.defaultThreshold} WHERE id = 1`);
          if (n === 0) await tx.$executeRaw(Prisma.sql`INSERT INTO store_settings (id, low_stock_default) VALUES (1, ${input.defaultThreshold})`);
        }
        if (input.clearCustom) {
          await tx.$executeRaw(Prisma.sql`UPDATE product_variants SET low_stock_threshold = NULL WHERE low_stock_threshold IS NOT NULL`);
        }
        for (const [id, t] of items) {
          await tx.$executeRaw(Prisma.sql`UPDATE product_variants SET low_stock_threshold = ${t} WHERE variant_id = ${id}::uuid`);
        }
        const customCount = await tx.productVariant.count({ where: { lowStockThreshold: { not: null } } });
        return { defaultThreshold: await defaultThreshold(tx), customCount };
      }, TX);
    } catch (err) {
      if (!(err instanceof AppError) && attempt < 3 && isRetryable(err)) continue;
      throw err;
    }
  }
}

/**
 * Slice 9: cộng tồn do khách trả hàng (hàng đạt, nhập lại kho bán) trong giao dịch của người gọi. Cùng cách cộng nguyên tử có điều kiện
 * như `applyDelta` (kể cả biến thể ẩn / sản phẩm lưu trữ) và đúng 1 dòng `inventory_adjustments` (`reason = return`, `delta = +qty`).
 * Vượt tồn tối đa -> `422 lines`. KHÔNG đổi hành vi `adjustStock`.
 */
export async function restockVariantTx(tx: Db, p: { variantId: string; qty: number; at: Date; actor: Actor; note: string }): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ inventory_qty: number }>>(Prisma.sql`
    UPDATE product_variants SET inventory_qty = inventory_qty + ${p.qty}, updated_at = ${ts(p.at)}
    WHERE variant_id = ${p.variantId}::uuid AND inventory_qty + ${p.qty} <= ${STOCK.maxQty}
    RETURNING inventory_qty`);
  if (!rows[0]) throw Errors.validation('Số lượng nhập lại kho vượt mức tối đa cho phép.', 'lines');
  await tx.inventoryAdjustment.create({
    data: {
      variantId: p.variantId, at: p.at, delta: p.qty, availableAfter: Number(rows[0].inventory_qty), reason: 'return', note: p.note.slice(0, 200),
      actorUserId: p.actor.id, actorName: p.actor.name.slice(0, 100), actorRole: p.actor.role,
    },
  });
}
