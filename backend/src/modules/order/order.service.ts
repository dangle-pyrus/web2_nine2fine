import type { Request } from 'express';
import type { order_status, Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import type { OrderListTab } from './order.schemas';
import { ASSUMPTIONS } from '../../config/assumptions';
import { now as clockNow } from '../../lib/clock';
import { Errors } from '../../lib/errors';
import { cancelOrderTx, scheduleCancelEmail } from './cancel-order.service';
import { GRANT_COOKIE, grantedOrderId } from './lookup.service';
import { normalizeOrderCode } from './order-code';
import { ORDER_INCLUDE, OrderDto, OrderRow } from './order.mapper';
import { toOrderDtosWithReturn, viewerOf } from './order-return';

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
  const owner = !!req.auth && req.auth.user.user_id === order.userId;
  return (await toOrderDtosWithReturn([order], viewerOf(order, owner)))[0];
}

/** ORD-02: tab Lịch sử mua hàng -> trạng thái đơn (COMMON-01.1). */
const TAB_STATUSES: Record<OrderListTab, order_status[]> = {
  'pending-payment': ['to_pay'],
  processing: ['to_ship', 'cancel_requested'],
  shipping: ['to_receive'],
  completed: ['completed'],
  cancelled: ['cancelled'],
};

/** ORD-04: mã đơn (có / không `#`, không phân biệt hoa thường, khớp một phần) hoặc tên sản phẩm trong đơn. */
function searchWhere(q: string | undefined): Prisma.OrderWhereInput | undefined {
  const text = (q ?? '').trim();
  if (!text) return undefined;
  const code = text.replace(/^#/, '').toUpperCase();
  return {
    OR: [
      { code: { contains: code } },
      { items: { some: { name: { contains: text, mode: 'insensitive' } } } },
    ],
  };
}

export interface MyOrderPage {
  items: OrderDto[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  /** Số đơn mỗi tab theo cùng từ khoá `q` (không theo tab đang chọn). */
  counts: Record<OrderListTab, number>;
}

export async function listMyOrders(
  userId: string,
  page: number,
  limit: number,
  filter: { status?: OrderListTab; q?: string } = {},
): Promise<MyOrderPage> {
  const search = searchWhere(filter.q);
  const base: Prisma.OrderWhereInput = { userId, ...(search ? { AND: [search] } : {}) };
  const where: Prisma.OrderWhereInput = filter.status ? { ...base, status: { in: TAB_STATUSES[filter.status] } } : base;
  const [total, rows, grouped] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      include: ORDER_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { code: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.order.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
  ]);
  const byStatus = new Map(grouped.map((g) => [g.status, g._count._all]));
  const counts = Object.fromEntries(
    (Object.keys(TAB_STATUSES) as OrderListTab[]).map((tab) => [tab, TAB_STATUSES[tab].reduce((n, s) => n + (byStatus.get(s) ?? 0), 0)]),
  ) as Record<OrderListTab, number>;
  return { items: await toOrderDtosWithReturn(rows, 'owner'), total, page, limit, hasMore: page * limit < total, counts };
}
