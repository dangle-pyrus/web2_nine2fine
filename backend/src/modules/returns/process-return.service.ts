import { Prisma } from '@prisma/client';
import type { order_status, payment_status } from '@prisma/client';
import prisma from '../../config/prisma';
import { now as clockNow } from '../../lib/clock';
import { AppError, Errors } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { isRetryable } from '../../lib/retry';
import type { Db } from '../../lib/sql';
import { ts } from '../../lib/sql';
import { normalizeOrderCode } from '../order/order-code';
import { emitReturnEvent } from './return-events';
import { toReturnRequest, type ReturnRequestDto } from './return.mapper';
import { loadReturn } from './return.query';

/** Chuyển trạng thái yêu cầu trả hàng. Mọi chuyển là so-sánh-rồi-đổi nguyên tử (plan mục 4); thua cuộc đua -> `invalid-transition`. */

export const TX = { timeout: 10_000, maxWait: 5_000 } as const;

/** Chạy giao dịch, thử lại lỗi xung đột (như `adjustStock`), không thử lại lỗi nghiệp vụ. */
export async function runTx<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction((tx) => fn(tx), TX);
    } catch (err) {
      if (!(err instanceof AppError) && attempt < 3 && isRetryable(err)) continue;
      throw err;
    }
  }
}

/** Trạng thái hiện tại (đọc lại sau khi CAS thua) -> `409 invalid-transition` kèm `currentReturnState`. */
export async function conflictOf(tx: Db, returnId: string): Promise<AppError> {
  const [r] = await tx.$queryRaw<Array<{ state: string }>>(Prisma.sql`SELECT "state" FROM "order_returns" WHERE "return_id" = ${returnId}::uuid`);
  return r ? Errors.invalidReturnTransition(r.state) : Errors.notFound();
}

/**
 * Khách huỷ (plan mục 6.2): `requested -> cancelled` + xoá số tài khoản + mở lại quyền tạo (`active_order_id = NULL`).
 * Không có yêu cầu nào của đơn -> 404; có nhưng không còn `requested` (đã duyệt / đã cancelled / ...) -> 409 `invalid-transition`.
 */
export async function cancelByCustomer(userId: string, rawCode: string): Promise<ReturnRequestDto> {
  const code = normalizeOrderCode(rawCode);
  const order = code ? await prisma.order.findUnique({ where: { code }, select: { order_id: true, userId: true } }) : null;
  if (!order || order.userId !== userId) throw Errors.notFound();

  const result = await runTx(async (tx) => {
    const at = clockNow();
    // Yêu cầu mới nhất của đơn (sống trước); khoá dòng để các bước sau thấy trạng thái thật.
    const [cur] = await tx.$queryRaw<Array<{ return_id: string; state: string }>>(Prisma.sql`
      SELECT "return_id", "state" FROM "order_returns" WHERE "order_id" = ${order.order_id}::uuid
      ORDER BY ("active_order_id" IS NOT NULL) DESC, "requested_at" DESC, "return_id" DESC LIMIT 1 FOR UPDATE`);
    if (!cur) throw Errors.notFound();
    const [done] = await tx.$queryRaw<Array<{ return_id: string }>>(Prisma.sql`
      UPDATE "order_returns" SET "state" = 'cancelled', "cancelled_at" = ${ts(at)}, "active_order_id" = NULL, "account_number_enc" = NULL
      WHERE "return_id" = ${cur.return_id}::uuid AND "state" = 'requested'
      RETURNING "return_id"`);
    if (!done) throw Errors.invalidReturnTransition(cur.state);
    const [o] = await tx.$queryRaw<Array<{ status: string; payment_status: string; payment_method: string }>>(Prisma.sql`
      SELECT "status"::text AS status, "payment_status"::text AS payment_status, "payment_method"::text AS payment_method FROM "orders" WHERE "order_id" = ${order.order_id}::uuid`);
    await emitReturnEvent(tx, {
      orderId: order.order_id, returnId: cur.return_id, orderStatus: o.status as order_status, paymentStatus: o.payment_status as payment_status, kind: 'return_cancelled', actor: 'customer', at,
    });
    const row = await loadReturn(tx, cur.return_id);
    return toReturnRequest(tx, row!, o.payment_method as 'cod' | 'bank_transfer');
  });
  logger.info('return-cancelled', { returnId: result.id, orderCode: code!, userId, action: 'cancel' });
  return result;
}
