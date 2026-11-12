import express, { Request, Response, Router } from 'express';
import { RETURNS_ASSUMPTIONS } from '../../config/assumptions';
import { Errors } from '../../lib/errors';
import { parseIdempotencyKey } from '../../lib/validate';
import { cartQuoteLimit, returnCreateLimit, returnPhotoLimit } from '../../middleware/rate-limit';
import { normalizeOrderCode } from '../order/order-code';
import { createReturn, estimateReturn, type MemberPrincipal } from './create-return.service';
import { readReturnPhoto, uploadReturnPhoto } from './photo.service';
import { cancelByCustomer } from './process-return.service';

/**
 * Thành viên (Slice 9). Gắn ở app.ts SAU `noStore` + `requireAuth('storefront')`: mọi phản hồi (kể cả 401) `no-store`.
 * Thứ tự kiểm: 401 -> 403 origin (originGuard toàn cục) -> 429 -> Idempotency-Key 422 -> thân 422 -> 404 -> giao dịch.
 */

/** Chỉ thành viên (staff / admin đăng nhập storefront không gửi yêu cầu trả hàng). */
const memberOf = (req: Request): MemberPrincipal => {
  const u = req.auth?.user;
  if (!u) throw Errors.unauthenticated();
  if (u.role !== 'member') throw Errors.forbidden();
  return { kind: 'member', userId: u.user_id };
};

export const accountReturnsRouter = Router();

accountReturnsRouter.post('/:orderCode/return', returnCreateLimit, async (req: Request, res: Response) => {
  const p = memberOf(req);
  const key = parseIdempotencyKey(req);
  const code = normalizeOrderCode(String(req.params.orderCode)) ?? String(req.params.orderCode);
  const r = await createReturn(p, code, req.body, key, `${req.baseUrl}/${code}/return`);
  if (r.replayed) res.set('Idempotency-Replayed', 'true');
  res.status(r.replayed ? 200 : 201).json(r.dto);
});

accountReturnsRouter.post('/:orderCode/return/estimate', cartQuoteLimit, async (req: Request, res: Response) => {
  res.json(await estimateReturn(memberOf(req), String(req.params.orderCode), req.body));
});

accountReturnsRouter.post('/:orderCode/return/cancel', cartQuoteLimit, async (req: Request, res: Response) => {
  const p = memberOf(req);
  res.json(await cancelByCustomer(p.userId, String(req.params.orderCode)));
});

/** Gửi byte ảnh đã kiểm quyền: `private, no-store`, `nosniff`, `inline`. */
function sendPhoto(res: Response, file: { data: Buffer; contentType: string }): void {
  res
    .status(200)
    .set({
      'Content-Type': file.contentType,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
      'Content-Length': String(file.data.length),
    })
    .end(file.data);
}

/** `/account/return-photos`: thân byte thô (gắn TRƯỚC `requireJsonBody` ở app.ts). */
export const accountReturnPhotosRouter = Router();

accountReturnPhotosRouter.post(
  '/',
  returnPhotoLimit,
  // Thân là byte thô của đúng 1 tệp, mọi Content-Type; vượt giới hạn -> entity.too.large -> invalid-image size (error.ts).
  express.raw({ type: () => true, limit: RETURNS_ASSUMPTIONS.photo.maxBytes + 1 }),
  async (req: Request, res: Response) => {
    const p = memberOf(req);
    res.status(201).json(await uploadReturnPhoto(req.body, { kind: 'member', userId: p.userId }, { kind: 'member' }));
  },
);

accountReturnPhotosRouter.get('/:photoId', cartQuoteLimit, async (req: Request, res: Response) => {
  const p = memberOf(req);
  sendPhoto(res, await readReturnPhoto({ kind: 'member', userId: p.userId }, String(req.params.photoId)));
});

export { sendPhoto };
