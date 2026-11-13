import { Request, Router } from 'express';
import { now } from '../../lib/clock';
import { requirePermission } from '../../middleware/require-permission';
import { Actor } from '../catalog-admin/product.write';
import { staffDisplayName } from '../order/order-event';
import { applyBulkSale, previewBulkSale } from './bulk-sale.service';

/**
 * Slice 10, lát 10.7 (BR-PROMO-07, Should, plan mục 6.6). Khung gắn sẵn ở `app.ts` (lát 10.1).
 * `/api/admin/sales`: `POST /bulk/preview`, `POST /bulk` (`promotions.write`, chỉ admin; kiểm TRƯỚC khi đọc thân).
 * Đợt giảm theo từng sản phẩm nằm trong `PUT /admin/products/{id}` (module `catalog-admin`), không ở đây.
 */
export const adminSalesRouter = Router();

const actorOf = (req: Request): Actor => {
  const u = req.auth!.user;
  return { id: u.user_id, role: u.role as 'staff' | 'admin', name: staffDisplayName(u) };
};

adminSalesRouter.post('/bulk/preview', requirePermission('promotions.write'), async (req, res) => {
  res.json(await previewBulkSale(req.body, now()));
});
adminSalesRouter.post('/bulk', requirePermission('promotions.write'), async (req, res) => {
  res.json(await applyBulkSale(actorOf(req), req.body, now()));
});
