import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { Errors } from '../../lib/errors';
import { parseBody, parseIdempotencyKey, uuidField, UUID_RE } from '../../lib/validate';
import { requireAuth } from '../../middleware/auth';
import { cartQuoteLimit } from '../../middleware/rate-limit';
import * as service from './cart.service';

const QTY_MSG = 'Số lượng phải từ 1 đến 5.';
const qty = z.number({ error: QTY_MSG }).int({ error: QTY_MSG }).min(1, { error: QTY_MSG }).max(5, { error: QTY_MSG });

const addSchema = z.object({ variantId: uuidField('Phiên bản sản phẩm chưa hợp lệ.'), quantity: qty });
const setSchema = z.object({ quantity: qty });
const changeSchema = z.object({ toVariantId: uuidField('Phiên bản sản phẩm chưa hợp lệ.') });
const mergeSchema = z.object({
  lines: z
    .array(z.object({ variantId: uuidField('Danh sách giỏ hàng chưa hợp lệ.'), quantity: qty }), { error: 'Danh sách giỏ hàng chưa hợp lệ.' })
    .min(1, { error: 'Danh sách giỏ hàng chưa hợp lệ.' })
    .max(30, { error: 'Danh sách giỏ hàng chưa hợp lệ.' })
    .refine((a) => new Set(a.map((l) => l.variantId.toLowerCase())).size === a.length, { error: 'Danh sách giỏ hàng chưa hợp lệ.' })
    .transform((a) => a.map((l) => ({ variantId: l.variantId.toLowerCase(), quantity: l.quantity }))),
});

type Handler = (req: Request, res: Response) => Promise<void>;
const wrap =
  (fn: Handler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };

const userId = (req: Request): string => req.auth!.user.user_id;
const variantParam = (req: Request): string => {
  const v = String(req.params.variantId ?? '');
  if (!UUID_RE.test(v)) throw Errors.validation('Phiên bản sản phẩm chưa hợp lệ.', 'variantId');
  return v.toLowerCase();
};
const send = (res: Response, body: unknown): void => void res.set('Cache-Control', 'no-store').json(body);

/** /api/cart/**: bắt buộc phiên storefront (401 unauthenticated). Giỏ khách ở trình duyệt, không gọi các route này. */
export const cartRouter = Router();
cartRouter.use(cartQuoteLimit, requireAuth('storefront'));

cartRouter.get('/', wrap(async (req, res) => { send(res, await service.getCart(userId(req))); }));
cartRouter.post(
  '/lines',
  wrap(async (req, res) => {
    const b = parseBody(addSchema, req.body);
    send(res, await service.addLine(userId(req), b.variantId.toLowerCase(), b.quantity));
  }),
);
cartRouter.post(
  '/merge',
  wrap(async (req, res) => {
    const key = parseIdempotencyKey(req);
    const b = parseBody(mergeSchema, req.body);
    const { result, replayed } = await service.mergeGuestCart(userId(req), key, b);
    if (replayed) res.set('Idempotency-Replayed', 'true');
    send(res, result);
  }),
);
cartRouter.post(
  '/lines/:variantId/change-variant',
  wrap(async (req, res) => {
    const from = variantParam(req);
    const b = parseBody(changeSchema, req.body);
    send(res, await service.changeVariant(userId(req), from, b.toVariantId.toLowerCase()));
  }),
);
cartRouter.put(
  '/lines/:variantId',
  wrap(async (req, res) => {
    const id = variantParam(req);
    const b = parseBody(setSchema, req.body);
    send(res, await service.setLineQuantity(userId(req), id, b.quantity));
  }),
);
cartRouter.delete(
  '/lines/:variantId',
  wrap(async (req, res) => { send(res, await service.removeLine(userId(req), variantParam(req))); }),
);
