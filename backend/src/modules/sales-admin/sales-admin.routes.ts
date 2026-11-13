import { Router } from 'express';

/**
 * Slice 10, lát 10.7 (BR-PROMO-07, Should, plan mục 6.6). Khung gắn sẵn ở `app.ts` (lát 10.1); chưa có endpoint.
 * `/api/admin/sales`: `POST /bulk/preview`, `POST /bulk` (`promotions.write`, chỉ admin).
 * Đợt giảm theo từng sản phẩm nằm trong `PUT /admin/products/{id}` (module `catalog-admin`), không ở đây.
 */
export const adminSalesRouter = Router();
