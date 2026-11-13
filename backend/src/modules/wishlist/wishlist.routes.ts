import { Router } from 'express';

/**
 * Slice 10, lát 10.4 (BR-WISH, plan mục 6.3). Khung gắn sẵn ở `app.ts` (lát 10.1); chưa có endpoint.
 * `/api/account/wishlist`: đọc, `PUT /{productId}`, `DELETE /{productId}`, `POST /merge`. Gắn sau noStore + requireAuth('storefront'),
 * TRƯỚC `accountRouter`; ghi dùng `wishlistWriteLimit`.
 */
export const wishlistRouter = Router();
