import express, { Request, Router } from 'express';
import { CATALOG_ASSUMPTIONS } from '../../config/assumptions';
import prisma from '../../config/prisma';
import { adminUploadLimit } from '../../middleware/rate-limit';
import { requirePermission } from '../../middleware/require-permission';
import { staffDisplayName } from '../order/order-event';
import { bulkStatusSchema, parseStrict, productCreateSchema, productListQuerySchema, productUpdateSchema } from './catalog-admin.schemas';
import {
  adjustmentSchema, inventoryFacetsQuerySchema, inventoryListQuerySchema, promotionCreateSchema, promotionEnabledSchema,
  promotionListQuerySchema, promotionUpdateSchema, requiredIdempotencyKey, thresholdsSchema,
} from './inventory-promotion.schemas';
import { inventoryFacets, listInventory, listMovements } from './inventory.query';
import { adjustStock, setThresholds } from './inventory.service';
import { uploadProductImage } from './media.service';
import { listPromotions, loadPromotion } from './promotion.query';
import { createPromotion, deletePromotion, setPromotionEnabled, updatePromotion } from './promotion.service';
import { listCategories, listProducts, loadAdminProduct } from './product.query';
import { hasSaleKey } from './sale-input';
import { Actor, createProduct, deleteProduct, setStatusBulk, updateProduct } from './product.write';

/**
 * Router Slice 6. Gắn ở app.ts SAU `noStore`, `requireAuth('admin')`, `requireRole('staff','admin')`, `adminRateLimit`
 * (vai trò / is_active đọc lại từ DB mỗi yêu cầu, BR-INV-01). Quyền theo hành động kiểm ở từng route TRƯỚC khi đọc body / mở giao dịch.
 */

export const actorOf = (req: Request): Actor => {
  const u = req.auth!.user;
  return { id: u.user_id, role: u.role as 'staff' | 'admin', name: staffDisplayName(u) };
};

/* ---------------- /admin/categories ---------------- */
export const adminCategoriesRouter = Router();
adminCategoriesRouter.get('/', requirePermission('catalog.read'), async (_req, res) => {
  res.json(await listCategories());
});

/** Slice 10 (BR-PROMO-01): đặt / gỡ đợt giảm giá cần thêm `promotions.write`; kiểm TRƯỚC Zod. */
function requireSalePermission(req: Request): void {
  requirePermission('promotions.write')(req, undefined as never, (err?: unknown) => {
    if (err) throw err;
  });
}

/* ---------------- /admin/products ---------------- */
export const adminProductsRouter = Router();
// 64 KB cho POST / PUT (mô tả 5.000 ký tự tiếng Việt + 32 biến thể + 12 ảnh); app.ts bỏ qua parser 16 KB cho các route này.
const productJson = express.json({ limit: '64kb' });

adminProductsRouter.get('/', requirePermission('catalog.read'), async (req, res) => {
  res.json(await listProducts(parseStrict(productListQuerySchema, { ...req.query })));
});

adminProductsRouter.post('/', requirePermission('products.write'), productJson, async (req, res) => {
  if (hasSaleKey(req.body)) requireSalePermission(req);
  const input = parseStrict(productCreateSchema, req.body);
  res.status(201).json(await createProduct(actorOf(req), input));
});

adminProductsRouter.post('/bulk-status', requirePermission('products.write'), productJson, async (req, res) => {
  const { ids, status } = parseStrict(bulkStatusSchema, req.body);
  res.json(await setStatusBulk(actorOf(req), ids, status));
});

adminProductsRouter.get('/:productId', requirePermission('catalog.read'), async (req, res) => {
  res.json(await loadAdminProduct(prisma, String(req.params.productId)));
});

adminProductsRouter.put('/:productId', requirePermission('products.write'), productJson, async (req, res) => {
  if (hasSaleKey(req.body)) requireSalePermission(req);
  const input = parseStrict(productUpdateSchema, req.body);
  res.json(await updateProduct(actorOf(req), String(req.params.productId), input));
});

adminProductsRouter.delete('/:productId', requirePermission('products.write'), async (req, res) => {
  await deleteProduct(String(req.params.productId));
  res.status(204).end();
});

/* ---------------- /admin/uploads ---------------- */
export const adminUploadsRouter = Router();
adminUploadsRouter.post(
  '/product-images',
  requirePermission('media.upload'),
  adminUploadLimit,
  // Thân là byte thô của đúng 1 tệp, mọi Content-Type; vượt giới hạn -> entity.too.large -> invalid-image size (error.ts).
  express.raw({ type: () => true, limit: CATALOG_ASSUMPTIONS.image.maxBytes + 1 }),
  async (req, res) => {
    res.status(201).json(await uploadProductImage(req.body, req.auth!.user.user_id));
  },
);

/* ---------------- /admin/inventory (lát 6.5 - 6.7) ---------------- */
export const adminInventoryRouter = Router();

adminInventoryRouter.get('/', requirePermission('catalog.read'), async (req, res) => {
  res.json(await listInventory(parseStrict(inventoryListQuerySchema, { ...req.query })));
});

adminInventoryRouter.get('/facets', requirePermission('catalog.read'), async (req, res) => {
  res.json(await inventoryFacets(parseStrict(inventoryFacetsQuerySchema, { ...req.query })));
});

adminInventoryRouter.put('/thresholds', requirePermission('stock.thresholds'), async (req, res) => {
  res.json(await setThresholds(parseStrict(thresholdsSchema, req.body)));
});

adminInventoryRouter.post('/:variantId/adjustments', requirePermission('stock.adjust'), async (req, res) => {
  // Thứ tự: quyền 403 -> Idempotency-Key 422 -> body 422 -> (giao dịch) 404 / 409 / 422.
  const key = requiredIdempotencyKey(req.get('idempotency-key'));
  const input = parseStrict(adjustmentSchema, req.body);
  const variantId = String(req.params.variantId);
  const r = await adjustStock({ actor: actorOf(req), variantId, input, key, path: `${req.baseUrl}/${variantId}/adjustments` });
  if (r.replayed) res.set('Idempotency-Replayed', 'true');
  res.json(r.item);
});

adminInventoryRouter.get('/:variantId/movements', requirePermission('catalog.read'), async (req, res) => {
  res.json(await listMovements(String(req.params.variantId)));
});

/* ---------------- /admin/promotions (lát 6.6) ---------------- */
export const adminPromotionsRouter = Router();

adminPromotionsRouter.get('/', requirePermission('catalog.read'), async (req, res) => {
  res.json(await listPromotions(parseStrict(promotionListQuerySchema, { ...req.query })));
});

adminPromotionsRouter.post('/', requirePermission('promotions.write'), async (req, res) => {
  res.status(201).json(await createPromotion(actorOf(req), parseStrict(promotionCreateSchema, req.body)));
});

adminPromotionsRouter.get('/:promotionId', requirePermission('catalog.read'), async (req, res) => {
  res.json(await loadPromotion(prisma, String(req.params.promotionId)));
});

adminPromotionsRouter.put('/:promotionId', requirePermission('promotions.write'), async (req, res) => {
  const input = parseStrict(promotionUpdateSchema, req.body);
  res.json(await updatePromotion(actorOf(req), String(req.params.promotionId), input));
});

adminPromotionsRouter.patch('/:promotionId', requirePermission('promotions.write'), async (req, res) => {
  const { enabled, updatedAt } = parseStrict(promotionEnabledSchema, req.body);
  res.json(await setPromotionEnabled(actorOf(req), String(req.params.promotionId), enabled, updatedAt));
});

adminPromotionsRouter.delete('/:promotionId', requirePermission('promotions.write'), async (req, res) => {
  await deletePromotion(String(req.params.promotionId));
  res.status(204).end();
});

