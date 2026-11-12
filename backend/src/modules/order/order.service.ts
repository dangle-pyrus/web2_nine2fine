import type { Request } from 'express';
import prisma from '../../config/prisma';
import { ASSUMPTIONS } from '../../config/assumptions';
import { now as clockNow } from '../../lib/clock';
import { Errors } from '../../lib/errors';
import { cancelOrderTx, scheduleCancelEmail } from './cancel-order.service';
import { GRANT_COOKIE, grantedOrderId } from './lookup.service';
import { normalizeOrderCode } from './order-code';
import { toReturnRequest } from '../returns/return.mapper';
import { loadReturnsForOrders } from '../returns/return.query';
import { isLive, type ReturnState } from '../returns/return-rules';
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

/**
 * Slice 9: ghép `return` (yêu cầu sống mới nhất, không có thì `cancelled` mới nhất) và chỉnh `canReturn` (không có yêu cầu sống).
 * MỘT truy vấn theo mảng id (danh sách đơn không N+1). Chỉ dùng cho CHỦ đơn: người xem khác (khách tra cứu bằng OTP) không có
 * `return` và `canReturn = false` (trả hàng của khách vãng lai là lát 9.6, hoãn).
 */
export async function toOrderDtosWithReturn(rows: OrderRow[], viewerIsOwner: boolean): Promise<OrderDto[]> {
  if (!viewerIsOwner) return rows.map((r) => ({ ...toOrderDto(r), canReturn: false }));
  const returns = await loadReturnsForOrders(prisma, rows.map((r) => r.order_id));
  return Promise.all(
    rows.map(async (r) => {
      const dto = toOrderDto(r);
      const ret = returns.get(r.order_id);
      if (!ret) return dto;
      if (isLive(ret.state as ReturnState)) dto.canReturn = false;
      dto.return = await toReturnRequest(prisma, ret, r.paymentMethod);
      return dto;
    }),
  );
}

export async function getOrderDto(req: Request, rawCode: string): Promise<OrderDto> {
  const order = await expireIfDue(await loadAccessibleOrder(req, rawCode));
  const owner = !!req.auth && req.auth.user.user_id === order.userId;
  return (await toOrderDtosWithReturn([order], owner))[0];
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
  return { items: await toOrderDtosWithReturn(rows, true), total, page, limit };
}
