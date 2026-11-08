import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { ASSUMPTIONS } from '../../config/assumptions';
import { now as clockNow } from '../../lib/clock';
import { Errors } from '../../lib/errors';
import type { Db } from '../../lib/sql';
import { ts } from '../../lib/sql';
import { runInBackground, sendMail } from '../../mail/mailer';
import { orderCancelledMail } from '../../mail/order-templates';
import { ORDER_INCLUDE, toOrderDto } from './order.mapper';

/**
 * Huỷ đơn / hết hạn: hoàn tồn đúng số đã trừ và trả lượt voucher còn hạn, đúng MỘT lần (BR-CHK-14, 23; BR-VOU-12).
 * Thứ tự khoá toàn hệ thống: dòng `orders` đích -> `vouchers` (theo voucher_id) -> `product_variants` (theo variant_id).
 */

export type CancelActor = 'customer' | 'shop' | 'system';

export interface CancelledInfo {
  orderId: string;
}

/**
 * Trong giao dịch `tx`. Trả `null` nếu đơn không ở trạng thái cho phép (đã huỷ, `to_receive`, ...): không hoàn gì thêm.
 */
export async function cancelOrderTx(
  tx: Db,
  orderId: string,
  actor: CancelActor,
  reason: string | null,
  allowedFrom: readonly string[],
  at: Date,
): Promise<CancelledInfo | null> {
  const [row] = await tx.$queryRaw<Array<{ status: string; stock_restored_at: Date | null }>>(Prisma.sql`
    SELECT "status"::text AS "status", "stock_restored_at" FROM "orders" WHERE "order_id" = ${orderId}::uuid FOR UPDATE`);
  if (!row || !allowedFrom.includes(row.status) || row.stock_restored_at !== null) return null;

  const [updated] = await tx.$queryRaw<Array<{ payment_status: string }>>(Prisma.sql`
    UPDATE "orders" SET "status" = 'cancelled', "cancelled_at" = ${ts(at)}, "cancelled_by" = ${actor}::"order_actor",
      "cancel_reason" = ${reason}, "stock_restored_at" = ${ts(at)}
    WHERE "order_id" = ${orderId}::uuid AND "status" = ANY(${allowedFrom as string[]}::"order_status"[]) AND "stock_restored_at" IS NULL
    RETURNING "payment_status"::text AS "payment_status"`);
  if (!updated) return null;

  // Voucher: khoá các dòng voucher của đơn theo voucher_id tăng dần, trả lượt cho mã còn hạn.
  const held = await tx.$queryRaw<Array<{ voucher_id: string }>>(Prisma.sql`
    SELECT "voucher_id" FROM "voucher_redemptions" WHERE "order_id" = ${orderId}::uuid AND "released_at" IS NULL ORDER BY "voucher_id"`);
  if (held.length > 0) {
    await tx.$queryRaw(Prisma.sql`
      SELECT 1 FROM "vouchers" WHERE "voucher_id" = ANY(${held.map((h) => h.voucher_id)}::uuid[]) ORDER BY "voucher_id" FOR UPDATE`);
    // Mã đã hết hạn lúc huỷ thì KHÔNG trả lượt (released_at giữ NULL, vẫn tính lượt riêng của khách).
    const released = await tx.$queryRaw<Array<{ voucher_id: string }>>(Prisma.sql`
      UPDATE "voucher_redemptions" r SET "released_at" = ${ts(at)}
      FROM "vouchers" v
      WHERE r."order_id" = ${orderId}::uuid AND r."released_at" IS NULL AND v."voucher_id" = r."voucher_id"
        AND (v."ends_at" IS NULL OR v."ends_at" > ${ts(at)})
      RETURNING r."voucher_id"`);
    for (const r of released.sort((a, b) => (a.voucher_id < b.voucher_id ? -1 : 1))) {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "vouchers" SET "used_count" = "used_count" - 1, "updated_at" = ${ts(at)} WHERE "voucher_id" = ${r.voucher_id}::uuid`);
    }
  }

  // Tồn: cộng lại đúng số đã trừ, từng dòng theo variant_id tăng dần.
  const items = await tx.$queryRaw<Array<{ variant_id: string; quantity: number }>>(Prisma.sql`
    SELECT "variant_id", "quantity" FROM "order_items" WHERE "order_id" = ${orderId}::uuid ORDER BY "variant_id"`);
  for (const i of items) {
    await tx.$executeRaw(Prisma.sql`
      UPDATE "product_variants" SET "inventory_qty" = "inventory_qty" + ${i.quantity}, "updated_at" = ${ts(at)}
      WHERE "variant_id" = ${i.variant_id}::uuid`);
  }

  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "order_events" ("order_id", "at", "from_status", "to_status", "payment_status", "actor", "detail")
    VALUES (${orderId}::uuid, ${ts(at)}, ${row.status}::"order_status", 'cancelled', ${updated.payment_status}::"payment_status",
            ${actor}::"order_actor", ${reason})`);
  return { orderId };
}

/** Email "đơn đã huỷ" gửi nền sau commit; lỗi chỉ log (không bảng theo dõi). */
export function scheduleCancelEmail(orderId: string): void {
  runInBackground('order-cancel-email', async () => {
    const o = await prisma.order.findUnique({ where: { order_id: orderId }, include: ORDER_INCLUDE });
    if (!o) return;
    await sendMail(orderCancelledMail(toOrderDto(o), o.userId !== null));
  });
}

/** Khách / chủ đơn huỷ (đã kiểm quyền). Trả `Errors.notCancellable()` nếu không huỷ được. */
export async function cancelByCustomer(orderId: string, reason: string | null, at: Date = clockNow()): Promise<void> {
  const done = await prisma.$transaction(
    (tx) => cancelOrderTx(tx, orderId, 'customer', reason, ASSUMPTIONS.customerCancellableFrom, at),
    { timeout: 10_000, maxWait: 5_000 },
  );
  if (!done) throw Errors.notCancellable();
  scheduleCancelEmail(orderId);
}
