import express, { Express, Request, Response, Router } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { getConfig } from './config/env';
import { originGuard, requireJsonBody } from './middleware/csrf';
import { errorHandler, notFound } from './middleware/error';
import { catalogRouter } from './modules/catalog/catalog.routes';
import { adminAuthRouter, authRouter } from './modules/auth/auth.routes';
import { cartRouter } from './modules/cart/cart.routes';
import { locationRouter } from './modules/location/location.routes';
import { orderRouter } from './modules/order/order.routes';
import { noStore } from './middleware/no-store';
import { requireAuth, requireRole } from './middleware/auth';
import { orderAdminRouter } from './modules/order-admin/order-admin.routes';
import { checkoutRouter, voucherRouter } from './modules/checkout/checkout.routes';
import { accountRouter } from './modules/account/account.routes';
import { adminRateLimit } from './middleware/rate-limit';
import { adminAccountsRouter, adminCustomersRouter, adminStaffRouter } from './modules/users-admin/users-admin.routes';
import { mediaRouter } from './modules/media/media.routes';
import { storeRouter } from './modules/store/store.routes';
import {
  adminAuditRouter, adminDashboardRouter, adminReportsRouter, adminSettingsRouter,
} from './modules/insights-admin/insights-admin.routes';
import {
  adminCategoriesRouter,
  adminInventoryRouter,
  adminProductsRouter,
  adminPromotionsRouter,
  adminUploadsRouter,
} from './modules/catalog-admin/catalog-admin.routes';

export interface CreateAppOptions {
  /** Cho module khác (và test) gắn thêm route dưới /api, trước middleware 404 / lỗi. */
  extraApiRoutes?: (router: Router) => void;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const config = getConfig();
  const app = express();

  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  app.use(helmet());

  app.use(
    cors({
      origin: (origin, cb) => cb(null, !!origin && config.corsAllowedOrigins.includes(origin.replace(/\/$/, ''))),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'X-Requested-With', 'Idempotency-Key'],
      exposedHeaders: ['Idempotency-Replayed', 'Retry-After'],
      maxAge: 600,
    }),
  );

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'success', message: 'Nine2Fine API is running smoothly!', timestamp: new Date().toISOString() });
  });

  const api = Router();
  // Catalog trước originGuard: POST/PUT/DELETE không Origin vẫn trả 404 not-found (AC-CAT-46).
  api.use(catalogRouter);
  // Địa giới công khai, chỉ đọc (như catalog).
  api.use(locationRouter);
  // Slice 6: ảnh tải lên công khai (GET), như catalog: phương thức ghi -> 404.
  api.use(mediaRouter);
  // Slice 8: thông tin người bán công khai (GET), như catalog: phương thức ghi -> 404.
  api.use(storeRouter);
  api.use(originGuard);
  // Slice 6: tải ảnh là byte thô nên đứng TRƯỚC requireJsonBody / express.json (cần cookieParser riêng).
  api.use(
    '/admin/uploads',
    cookieParser(),
    noStore,
    requireAuth('admin'),
    requireRole('staff', 'admin'),
    adminRateLimit,
    adminUploadsRouter,
  );
  api.use(requireJsonBody);
  // 16 KB toàn cục; POST / PUT /admin/products dùng parser 64 KB riêng trong router của nó (mô tả dài + 32 biến thể).
  const json16 = express.json({ limit: '16kb' });
  api.use((req, res, next) => {
    if (req.path.startsWith('/admin/products') && (req.method === 'POST' || req.method === 'PUT')) return next();
    json16(req, res, next);
  });
  api.use(cookieParser());
  api.use('/auth', authRouter);
  api.use('/admin/auth', adminAuthRouter);
  // noStore TRƯỚC requireAuth để cả 401 / 403 có Cache-Control: no-store (BR-ADM-01).
  api.use('/admin/orders', noStore, requireAuth('admin'), requireRole('staff', 'admin'), orderAdminRouter);
  // Slice 6: noStore TRƯỚC requireAuth để 401 / 403 có Cache-Control: no-store (BR-INV-01). Quyền theo hành động: requirePermission ở router.
  const adminCatalog = [noStore, requireAuth('admin'), requireRole('staff', 'admin'), adminRateLimit];
  api.use('/admin/categories', ...adminCatalog, adminCategoriesRouter);
  api.use('/admin/products', ...adminCatalog, adminProductsRouter);
  api.use('/admin/inventory', ...adminCatalog, adminInventoryRouter);
  api.use('/admin/promotions', ...adminCatalog, adminPromotionsRouter);
  // Slice 7: cùng khuôn; quyền theo hành động (`requirePermission`) ở router, trước Zod và giao dịch.
  const adminUsers = [noStore, requireAuth('admin'), requireRole('staff', 'admin'), adminRateLimit];
  api.use('/admin/customers', ...adminUsers, adminCustomersRouter);
  api.use('/admin/staff', ...adminUsers, adminStaffRouter);
  api.use('/admin/accounts', ...adminUsers, adminAccountsRouter);
  // Slice 8: cùng khuôn; quyền theo hành động (`requirePermission`) ở router, trước Zod và trước DB.
  const adminInsights = [noStore, requireAuth('admin'), requireRole('staff', 'admin'), adminRateLimit];
  api.use('/admin/dashboard', ...adminInsights, adminDashboardRouter);
  api.use('/admin/reports', ...adminInsights, adminReportsRouter);
  api.use('/admin/settings', ...adminInsights, adminSettingsRouter);
  api.use('/admin/audit-log', ...adminInsights, adminAuditRouter);
  api.use('/checkout', checkoutRouter);
  api.use('/vouchers', voucherRouter);
  api.use('/cart', cartRouter);
  api.use('/orders', orderRouter);
  // Slice 5: noStore TRƯỚC requireAuth để cả 401 có Cache-Control: no-store (BR-ACC-01).
  api.use('/account', noStore, requireAuth('storefront'), accountRouter);
  options.extraApiRoutes?.(api);
  app.use('/api', api);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
