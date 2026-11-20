import { NextFunction, Request, Response, Router } from 'express';
import { parseBody, parseIdempotencyKey, parseOptionalBody } from '../../lib/validate';
import { requireAuth } from '../../middleware/auth';
import { guestReturnsRouter } from '../returns/guest-returns.routes';
import { memberIdOf, optionalAuth } from '../../middleware/optional-auth';
import { cartQuoteLimit, orderCreateLimit, orderLookupLimit } from '../../middleware/rate-limit';
import { cancelByCustomer } from './cancel-order.service';
import { requestLookupCode, verifyLookup } from './lookup.service';
import { ORDER_INCLUDE, toOrderDto } from './order.mapper';
import { cancelReasonText, cancelSchema, listQuerySchema, lookupCodesSchema, lookupVerifySchema, placeOrderSchema } from './order.schemas';
import { getOrderDto, listMyOrders, loadAccessibleOrder } from './order.service';
import { getPaymentSession } from './payment.service';
import { placeOrder } from './place-order.service';
import { confirmReceivedByCustomer } from './receive-order.service';
import prisma from '../../config/prisma';

type Handler = (req: Request, res: Response) => Promise<void>;
const wrap =
  (fn: Handler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };
const noStore = (res: Response): Response => res.set('Cache-Control', 'no-store');
const ip = (req: Request) => req.ip ?? 'unknown';

/**
 * /api/orders/**. Thứ tự đăng ký quan trọng: `lookup/*` và `POST /` trước `:orderCode` để không bị nuốt.
 * Đặt hàng + tra cứu công khai (phiên sai = khách, không 401); danh sách đơn cần phiên storefront.
 */
export const orderRouter = Router();

orderRouter.post(
  '/lookup/codes',
  orderLookupLimit,
  wrap(async (req, res) => {
    const b = parseBody(lookupCodesSchema, req.body);
    noStore(res).json(await requestLookupCode(b.orderCode, b.email, ip(req)));
  }),
);

orderRouter.post(
  '/lookup/verify',
  orderLookupLimit,
  wrap(async (req, res) => {
    const b = parseBody(lookupVerifySchema, req.body);
    const order = await verifyLookup(b.orderCode, b.email, b.code, ip(req), res);
    noStore(res).json(order);
  }),
);

orderRouter.post(
  '/',
  orderCreateLimit,
  optionalAuth,
  wrap(async (req, res) => {
    const key = parseIdempotencyKey(req);
    const body = parseBody(placeOrderSchema, req.body);
    const { order, replayed } = await placeOrder(body, { key, userId: memberIdOf(req) });
    if (replayed) res.set('Idempotency-Replayed', 'true');
    noStore(res).status(replayed ? 200 : 201).json({ order });
  }),
);

orderRouter.get(
  '/',
  cartQuoteLimit,
  requireAuth('storefront'),
  wrap(async (req, res) => {
    const q = parseBody(listQuerySchema, { ...req.query });
    noStore(res).json(await listMyOrders(req.auth!.user.user_id, q.page, q.limit, { status: q.status, q: q.q || undefined }));
  }),
);

orderRouter.get(
  '/:orderCode/payment',
  cartQuoteLimit,
  optionalAuth,
  wrap(async (req, res) => {
    noStore(res).json(await getPaymentSession(req, String(req.params.orderCode)));
  }),
);

// Slice 10.2: trả hàng vãng lai (`/:orderCode/return`, `/return/cancel`, `/return/estimate`); ảnh ở app.ts (byte thô).
orderRouter.use('/:orderCode/return', guestReturnsRouter);

orderRouter.post(
  '/:orderCode/cancel',
  cartQuoteLimit,
  optionalAuth,
  wrap(async (req, res) => {
    const order = await loadAccessibleOrder(req, String(req.params.orderCode));
    const body = parseOptionalBody(cancelSchema, req.body && Object.keys(req.body).length ? req.body : undefined);
    // COMMON-01.5: yêu cầu huỷ đơn `to_ship` bắt buộc chọn lý do; huỷ `to_pay` thì lý do tuỳ chọn.
    const reason = cancelReasonText(body, order.status === 'to_ship');
    await cancelByCustomer(order.order_id, reason);
    const after = await prisma.order.findUniqueOrThrow({ where: { order_id: order.order_id }, include: ORDER_INCLUDE });
    noStore(res).json(toOrderDto(after));
  }),
);

/** COMMON-01.9 / ORD-11: khách bấm "Đã nhận hàng" (chỉ khi đơn đang `to_receive`; máy chủ kiểm lại). */
orderRouter.post(
  '/:orderCode/received',
  cartQuoteLimit,
  optionalAuth,
  wrap(async (req, res) => {
    const order = await loadAccessibleOrder(req, String(req.params.orderCode));
    await confirmReceivedByCustomer(order.order_id);
    noStore(res).json(await getOrderDto(req, String(req.params.orderCode)));
  }),
);

orderRouter.get(
  '/:orderCode',
  cartQuoteLimit,
  optionalAuth,
  wrap(async (req, res) => {
    noStore(res).json(await getOrderDto(req, String(req.params.orderCode)));
  }),
);
