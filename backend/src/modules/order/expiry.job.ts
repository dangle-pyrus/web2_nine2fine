import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { ASSUMPTIONS } from '../../config/assumptions';
import { DAY, now as clockNow } from '../../lib/clock';
import { ts } from '../../lib/sql';
import { cancelOrderTx, scheduleCancelEmail } from './cancel-order.service';

/**
 * Việc nền (BR-CHK-21): huỷ đơn chờ thanh toán quá hạn, hoàn tồn + lượt; dọn dữ liệu hết hạn.
 * Nhiều instance an toàn nhờ `FOR UPDATE SKIP LOCKED` và dấu `stock_restored_at`. Mọi thao tác idempotent.
 */

const BATCH = 50;

export async function expireDueOrders(at: Date = clockNow()): Promise<number> {
  let total = 0;
  for (;;) {
    const cancelled = await prisma.$transaction(
      async (tx) => {
        const due = await tx.$queryRaw<Array<{ order_id: string }>>(Prisma.sql`
          SELECT "order_id" FROM "orders" WHERE "status" = 'to_pay' AND "payment_due_at" <= ${ts(at)}
          ORDER BY "payment_due_at" LIMIT ${BATCH} FOR UPDATE SKIP LOCKED`);
        const done: string[] = [];
        for (const d of due) {
          const r = await cancelOrderTx(tx, d.order_id, 'system', 'Hết thời gian thanh toán', ASSUMPTIONS.systemCancellableFrom, at);
          if (r) done.push(d.order_id);
        }
        return { picked: due.length, done };
      },
      { timeout: 20_000, maxWait: 5_000 },
    );
    for (const id of cancelled.done) scheduleCancelEmail(id);
    total += cancelled.done.length;
    if (cancelled.picked < BATCH) return total;
  }
}

/** Xoá khoá idempotency, quyền xem đơn, OTP tra cứu hết hạn và giỏ quá hạn lưu giữ. */
export async function purgeExpired(at: Date = clockNow()): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`DELETE FROM "idempotency_keys" WHERE "expires_at" <= ${ts(at)}`);
  await prisma.$executeRaw(Prisma.sql`DELETE FROM "order_access_grants" WHERE "expires_at" <= ${ts(at)}`);
  await prisma.$executeRaw(
    Prisma.sql`DELETE FROM "auth_action_tokens" WHERE "purpose" = 'guest_order_lookup' AND "expires_at" <= ${ts(at)}`,
  );
  const s = await prisma.storeSetting.findUnique({ where: { id: 1 }, select: { cartRetentionDays: true } });
  if (s) {
    await prisma.$executeRaw(
      Prisma.sql`DELETE FROM "carts" WHERE "updated_at" < ${ts(new Date(at.getTime() - s.cartRetentionDays * DAY))}`,
    );
  }
}
