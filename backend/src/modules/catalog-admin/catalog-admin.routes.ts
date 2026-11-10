import express, { Request, Router } from 'express';
import { CATALOG_ASSUMPTIONS } from '../../config/assumptions';
import prisma from '../../config/prisma';
import { adminUploadLimit } from '../../middleware/rate-limit';
import { requirePermission } from '../../middleware/require-permission';
import { staffDisplayName } from '../order/order-event';
import { bulkStatusSchema, parseStrict, productCreateSchema, productListQuerySchema, productUpdateSchema } from './catalog-admin.schemas';
import { uploadProductImage } from './media.service';
import { listCategories, listProducts, loadAdminProduct } from './product.query';
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

/* ---------------- /admin/products ---------------- */
export const adminProductsRouter = Router();
// 64 KB cho POST / PUT (mô tả 5.000 ký tự tiếng Việt + 32 biến thể + 12 ảnh); app.ts bỏ qua parser 16 KB cho các route này.
const productJson = express.json({ limit: '64kb' });

adminProductsRouter.get('/', requirePermission('catalog.read'), async (req, res) => {
  res.json(await listProducts(parseStrict(productListQuerySchema, { ...req.query })));
});

adminProductsRouter.post('/', requirePermission('products.write'), productJson, async (req, res) => {
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

/* ---------------- Lát 6.5 - 6.7 (chưa triển khai): router rỗng để 401 / 403 nhất quán ngay từ đầu ---------------- */
export const adminInventoryRouter = Router();
export const adminPromotionsRouter = Router();

