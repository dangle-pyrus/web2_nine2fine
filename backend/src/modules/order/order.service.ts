import type { Request } from 'express';
import prisma from '../../config/prisma';
import { ASSUMPTIONS } from '../../config/assumptions';
import { now as clockNow } from '../../lib/clock';
import { Errors } from '../../lib/errors';
import { cancelOrderTx, scheduleCancelEmail } from './cancel-order.service';
import { GRANT_COOKIE, grantedOrderId } from './lookup.service';
import { normalizeOrderCode } from './order-code';
import { ORDER_INCLUDE, OrderDto, OrderRow, toOrderDto } from './order.mapper';

/**
 * Quyền xem / huỷ một đơn: (a) phiên storefront là chủ đơn, hoặc (b) cookie `n2f_oa` gắn đúng đơn này, còn hạn.
 * Không có (a) lẫn (b) hợp lệ -> 401; có nhưng không đúng đơn (hoặc đơn không tồn tại, mã sai dạng) -> 404.
 */
export async function loadAccessibleOrder(req: Request, rawCode: string, at: Date = clockNow()): Promise<OrderRow> {
  const userId = req.auth?.user.user_id;
  const cookie = req.cookies?.[GRANT_COOKIE];
  const grantId = await grantedOrderId(typeof cookie === 'string' ? cookie : undefined, at);
  if (!userId && !grantId) throw Errors.unauthenticated();

  const code = normalizeOrderCode(rawCode);
  if (!code) throw Errors.notFound();
  const order = await prisma.order.findUnique({ where: { code }, include: ORDER_INCLUDE });
  if (!order) throw Errors.notFound();
  const owns = !!userId && order.userId === userId;
  if (!owns && grantId !== order.order_id) throw Errors.notFound();
  return order;
}

/** Đơn `to_pay` quá `payment_due_at` bị huỷ ngay khi đọc (không chờ job nền), rồi trả bản `cancelled`. */
export async function expireIfDue(order: OrderRow, at: Date = clockNow()): Promise<OrderRow> {
  if (order.status !== 'to_pay' || !order.paymentDueAt || order.paymentDueAt > at) return order;
  const done = await prisma.$transaction(
    (tx) => cancelOrderTx(tx, order.order_id, 'system', 'Hết thời gian thanh toán', ASSUMPTIONS.systemCancellableFrom, at),
    { timeout: 10_000, maxWait: 5_000 },
  );
  if (done) scheduleCancelEmail(order.order_id);
  return prisma.order.findUniqueOrThrow({ where: { order_id: order.order_id }, include: ORDER_INCLUDE });
}

export async function getOrderDto(req: Request, rawCode: string): Promise<OrderDto> {
  const order = await expireIfDue(await loadAccessibleOrder(req, rawCode));
  return toOrderDto(order);
}

export async function listMyOrders(
  userId: string,
  page: number,
  limit: number,
): Promise<{ items: OrderDto[]; total: number; page: number; limit: number }> {
  const [total, rows] = await Promise.all([
    prisma.order.count({ where: { userId } }),
    prisma.order.findMany({
      where: { userId },
      include: ORDER_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { code: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return { items: rows.map(toOrderDto), total, page, limit };
}
