import { Prisma } from '@prisma/client';
import type { order_actor } from '@prisma/client';
import { ASSUMPTIONS } from '../../config/assumptions';
import prisma from '../../config/prisma';
import { now as clockNow } from '../../lib/clock';
import { AppError } from '../../lib/errors';
import type { Db } from '../../lib/sql';
import { ts } from '../../lib/sql';
import { insertOrderEvent } from './order-event';
import { scheduleEventEmail } from './order-email.service';

/**
 * COMMON-01.9 / ORD-11: `to_receive` -> `completed` do khách bấm "Đã nhận hàng" hoặc hệ thống tự chuyển sau 7 ngày
 * (tính từ lúc bàn giao vận chuyển). Giống "Giao thành công" của admin: ghi `delivered_at`, COD chuyển `paid`.
 * Dòng đơn phải đã được khoá bởi người gọi (hoặc chọn bằng FOR UPDATE SKIP LOCKED). Trả `event_id`, null nếu đơn không còn `to_receive`.
 */
async function completeTx(
  tx: Db,
  orderId: string,
  at: Date,
  actor: Extract<order_actor, 'customer' | 'system'>,
): Promise<string | null> {
  const n = await tx.$executeRaw(Prisma.sql`
    UPDATE "orders" SET "status" = 'completed', "payment_status" = 'paid', "paid_at" = COALESCE("paid_at", ${ts(at)}),
      "delivered_at" = ${ts(at)}
    WHERE "order_id" = ${orderId}::uuid AND "status" = 'to_receive'`);
  if (n !== 1) return null;
  return insertOrderEvent(tx, {
    orderId,
    at,
    fromStatus: 'to_receive',
    toStatus: 'completed',
    paymentStatus: 'paid',
    actor,
    kind: 'delivered',
    detail: actor === 'customer' ? 'Bạn đã xác nhận đã nhận hàng.' : 'Hệ thống tự xác nhận đã giao sau 7 ngày.',
    // Khách tự bấm thì không cần thư; hệ thống tự hoàn thành thì gửi thư "giao thành công" như khi shop xác nhận.
    emailTemplate: actor === 'system' ? 'order-delivered' : null,
  });
}

export const NOT_IN_TRANSIT_MSG = 'Đơn hàng không ở trạng thái đang giao.';

/** Khách (chủ đơn hoặc người có quyền xem qua OTP) bấm "Đã nhận hàng". Đơn không còn `to_receive` -> 409 với câu của ORD-11. */
export async function confirmReceivedByCustomer(orderId: string, at: Date = clockNow()): Promise<void> {
  const done = await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT 1 FROM "orders" WHERE "order_id" = ${orderId}::uuid FOR UPDATE`);
      return completeTx(tx, orderId, at, 'customer');
    },
    { timeout: 10_000, maxWait: 5_000 },
  );
  if (!done) throw new AppError('invalid-transition', NOT_IN_TRANSIT_MSG);
}

const BATCH = 50;

/** Việc nền: đơn ở `to_receive` đã bàn giao quá `autoCompleteAfterMs` thì tự hoàn thành. Idempotent, nhiều instance an toàn. */
export async function autoCompleteDelivered(at: Date = clockNow()): Promise<number> {
  const cutoff = new Date(at.getTime() - ASSUMPTIONS.autoCompleteAfterMs);
  let total = 0;
  for (;;) {
    const r = await prisma.$transaction(
      async (tx) => {
        const due = await tx.$queryRaw<Array<{ order_id: string }>>(Prisma.sql`
          SELECT "order_id" FROM "orders"
          WHERE "status" = 'to_receive' AND "handed_over_at" IS NOT NULL AND "handed_over_at" <= ${ts(cutoff)}
          ORDER BY "handed_over_at" LIMIT ${BATCH} FOR UPDATE SKIP LOCKED`);
        const events: string[] = [];
        for (const d of due) {
          const eventId = await completeTx(tx, d.order_id, at, 'system');
          if (eventId) events.push(eventId);
        }
        return { picked: due.length, events };
      },
      { timeout: 20_000, maxWait: 5_000 },
    );
    for (const id of r.events) scheduleEventEmail(id);
    total += r.events.length;
    if (r.picked < BATCH) return total;
  }
}
