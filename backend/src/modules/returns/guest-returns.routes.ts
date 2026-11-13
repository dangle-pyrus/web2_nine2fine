import express, { type NextFunction, type Request, type RequestHandler, type Response, Router } from 'express';
import { RETURNS_ASSUMPTIONS } from '../../config/assumptions';
import { parseIdempotencyKey } from '../../lib/validate';
import {
  cartQuoteLimit, guestReturnCreateGrantLimit, guestReturnCreateIpLimit, guestReturnPhotoGrantLimit, guestReturnPhotoIpLimit,
} from '../../middleware/rate-limit';
import { normalizeOrderCode } from '../order/order-code';
import { createReturn, estimateReturn } from './create-return.service';
import { guestGrantAuth, guestOrderOr404, guestPrincipalOf } from './guest-grant';
import { readReturnPhoto, uploadReturnPhoto } from './photo.service';
import { cancelByCustomer } from './process-return.service';
import { sendPhoto } from './returns.routes';

/**
 * Trả hàng của khách vãng lai (Slice 10.2, BR-RET-60..64). Quyền CHỈ cookie `n2f_oa` (`guestGrantAuth`); không phụ thuộc phiên `n2f_sid`.
 * Thứ tự: 401 (grant) -> 403 origin (originGuard toàn cục) -> 429 (đặt SAU grant) -> Idempotency-Key 422 -> thân 422 -> 404 -> giao dịch.
 * Mọi phản hồi (kể cả 401 / 429) `no-store`.
 */

const noStore: RequestHandler = (_req: Request, res: Response, next: NextFunction) => {
  res.set('Cache-Control', 'no-store');
  next();
};

/** `/api/orders/:orderCode/return` (JSON). Gắn trong `orderRouter` SAU khi parser JSON toàn cục đã chạy. */
export const guestReturnsRouter = Router({ mergeParams: true });
guestReturnsRouter.use(noStore, guestGrantAuth);

guestReturnsRouter.post('/', guestReturnCreateGrantLimit, guestReturnCreateIpLimit, async (req: Request, res: Response) => {
  const p = guestPrincipalOf(res);
  const key = parseIdempotencyKey(req);
  const code = normalizeOrderCode(String(req.params.orderCode)) ?? String(req.params.orderCode);
  const r = await createReturn(p, code, req.body, key, `/api/orders/${code}/return`);
  if (r.replayed) res.set('Idempotency-Replayed', 'true');
  res.status(r.replayed ? 200 : 201).json(r.dto);
});

guestReturnsRouter.post('/estimate', cartQuoteLimit, async (req: Request, res: Response) => {
  res.json(await estimateReturn(guestPrincipalOf(res), String(req.params.orderCode), req.body));
});

guestReturnsRouter.post('/cancel', cartQuoteLimit, async (req: Request, res: Response) => {
  res.json(await cancelByCustomer(guestPrincipalOf(res), String(req.params.orderCode)));
});

/**
 * `/api/orders/:orderCode/return/photos`: thân byte thô (gắn ở app.ts TRƯỚC `requireJsonBody`, cần `cookieParser` riêng).
 * Tải: 30 / giờ / grant + 60 / giờ / IP. Xem: grant còn hạn của CHÍNH đơn (ảnh chưa gắn hoặc đã gắn yêu cầu của đơn này).
 */
export const guestReturnPhotosRouter = Router({ mergeParams: true });
guestReturnPhotosRouter.use(noStore, guestGrantAuth);

guestReturnPhotosRouter.post(
  '/',
  guestReturnPhotoGrantLimit,
  guestReturnPhotoIpLimit,
  express.raw({ type: () => true, limit: RETURNS_ASSUMPTIONS.photo.maxBytes + 1 }),
  async (req: Request, res: Response) => {
    const p = guestPrincipalOf(res);
    const order = await guestOrderOr404(p, String(req.params.orderCode));
    res.status(201).json(
      await uploadReturnPhoto(req.body, { kind: 'guest', orderId: order.order_id, grantHash: p.grantHash }, { kind: 'guest', orderCode: order.code }),
    );
  },
);

guestReturnPhotosRouter.get('/:photoId', cartQuoteLimit, async (req: Request, res: Response) => {
  const p = guestPrincipalOf(res);
  const order = await guestOrderOr404(p, String(req.params.orderCode));
  sendPhoto(res, await readReturnPhoto({ kind: 'guest', orderId: order.order_id }, String(req.params.photoId)));
});
