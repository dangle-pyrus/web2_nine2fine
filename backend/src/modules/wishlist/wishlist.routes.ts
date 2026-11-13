import { Request, Response, Router } from 'express';
import { Errors } from '../../lib/errors';
import { createRateLimit, wishlistWriteLimit } from '../../middleware/rate-limit';
import { addItem, getWishlist, mergeItems, removeItem } from './wishlist.service';
import { parseMergeBody } from './wishlist.schemas';

/**
 * Slice 10, lát 10.4 (BR-WISH, plan mục 5.3). `/api/account/wishlist`: đọc, `PUT /{productId}`, `DELETE /{productId}`, `POST /merge`.
 * Gắn ở `app.ts` sau noStore + requireAuth('storefront') (mọi phản hồi, kể cả 401, `no-store`), TRƯỚC `accountRouter`.
 * Thứ tự: 401 -> 403 origin (originGuard toàn cục) -> 429 -> thân 422 -> 404 / 409 -> giao dịch. Ghi 60 / phút / tài khoản; đọc 120 / 60 giây / tài khoản.
 */
const uid = (req: Request): string => {
  const u = req.auth?.user;
  if (!u) throw Errors.unauthenticated();
  return u.user_id;
};
const wishlistReadLimit = createRateLimit({
  name: 'wishlist-read', windowMs: 60_000, max: 120, key: (req) => req.auth?.user.user_id ?? req.ip ?? 'unknown',
});

export const wishlistRouter = Router();

wishlistRouter.get('/', wishlistReadLimit, async (req: Request, res: Response) => {
  res.json(await getWishlist(uid(req)));
});

// `/merge` đứng TRƯỚC `/:productId` để không bị nuốt.
wishlistRouter.post('/merge', wishlistWriteLimit, async (req: Request, res: Response) => {
  res.json(await mergeItems(uid(req), parseMergeBody(req.body)));
});

wishlistRouter.put('/:productId', wishlistWriteLimit, async (req: Request, res: Response) => {
  res.json(await addItem(uid(req), String(req.params.productId)));
});

wishlistRouter.delete('/:productId', wishlistWriteLimit, async (req: Request, res: Response) => {
  await removeItem(uid(req), String(req.params.productId));
  res.status(204).end();
});
