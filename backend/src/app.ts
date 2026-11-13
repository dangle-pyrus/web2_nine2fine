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
import { accountReturnPhotosRouter, accountReturnsRouter, adminReturnPhotosRouter, adminReturnsRouter } from './modules/returns/returns.routes';
import { storeRouter } from './modules/store/store.routes';
import { reviewsRouter, adminReviewsRouter } from './modules/reviews/reviews.routes';
import { guestReturnPhotosRouter } from './modules/returns/guest-returns.routes';
import { wishlistRouter } from './modules/wishlist/wishlist.routes';
import { recommendationsRouter } from './modules/recommendations/recommendations.routes';
import { adminCollectionsRouter, adminContentRouter, adminSizeChartsRouter, contentPublicRouter } from './modules/content/content.routes';
import { adminSalesRouter } from './modules/sales-admin/sales-admin.routes';
import { sepayWebhookRouter } from './modules/payment/sepay.routes';
import { paymentSimulatorRouter } from './modules/payment/simulator.routes';
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
  // Slice 10: gợi ý + nội dung trang chủ / bộ sưu tập công khai, chỉ đọc như catalog (router tự chặn phương thức ghi -> 404).
  api.use(recommendationsRouter);
  api.use(contentPublicRouter);
  // Webhook SePay: máy chủ gọi máy chủ (không Origin, không cookie) nên đứng TRƯỚC originGuard; tự xác thực bằng API key.
  api.use('/payments/sepay', sepayWebhookRouter);
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
  // Slice 9: ảnh trả hàng (thành viên) cũng là byte thô nên đứng TRƯỚC requireJsonBody; kho riêng tư, kiểm quyền mỗi lần đọc.
  api.use('/account/return-photos', cookieParser(), noStore, requireAuth('storefront'), accountReturnPhotosRouter);
  // Slice 10.2: ảnh trả hàng của khách vãng lai (byte thô, quyền = grant n2f_oa); cũng TRƯỚC requireJsonBody.
  api.use('/orders/:orderCode/return/photos', cookieParser(), guestReturnPhotosRouter);
  api.use(requireJsonBody);
  // 16 KB toàn cục; POST / PUT /admin/products dùng parser 64 KB riêng trong router của nó (mô tả dài + 32 biến thể).
  const json16 = express.json({ limit: '16kb' });
  api.use((req, res, next) => {
    if (req.path.startsWith('/admin/products') && (req.method === 'POST' || req.method === 'PUT')) return next();
    // Slice 10: nội dung trang chủ (<= 16 khối) và bảng size dùng parser 64 KB riêng trong router (sau `requirePermission`).
    if ((req.path.startsWith('/admin/content') || req.path.startsWith('/admin/size-charts')) && (req.method === 'POST' || req.method === 'PUT')) return next();
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
  // Slice 9: cùng khuôn; quyền theo hành động (`requirePermission`) ở router, trước Zod và trước DB.
  const adminReturns = [noStore, requireAuth('admin'), requireRole('staff', 'admin'), adminRateLimit];
  api.use('/admin/returns', ...adminReturns, adminReturnsRouter);
  api.use('/admin/return-photos', ...adminReturns, adminReturnPhotosRouter);
  // Slice 10: cùng khuôn; quyền theo hành động (`requirePermission`) ở router, trước Zod và trước DB.
  const adminP1 = [noStore, requireAuth('admin'), requireRole('staff', 'admin'), adminRateLimit];
  api.use('/admin/reviews', ...adminP1, adminReviewsRouter);
  api.use('/admin/content', ...adminP1, adminContentRouter);
  api.use('/admin/size-charts', ...adminP1, adminSizeChartsRouter);
  api.use('/admin/collections', ...adminP1, adminCollectionsRouter);
  api.use('/admin/sales', ...adminP1, adminSalesRouter);
  // Slice 10: đánh giá của thành viên (eligibility dùng optionalAuth, ghi dùng requireAuth); khung ở reviews.routes.ts.
  api.use('/reviews', reviewsRouter);
  api.use('/checkout', checkoutRouter);
  api.use('/vouchers', voucherRouter);
  api.use('/cart', cartRouter);
  // Giả lập chuyển khoản (PAYMENT_SIMULATOR); tắt thì router tự trả 404.
  api.use('/orders', paymentSimulatorRouter);
  api.use('/orders', orderRouter);
  // Slice 5: noStore TRƯỚC requireAuth để cả 401 có Cache-Control: no-store (BR-ACC-01).
  // Slice 9: chỉ `/:orderCode/return*`; đứng TRƯỚC accountRouter (path khác rơi xuống tiếp).
  // Slice 10: wishlist theo tài khoản; đứng TRƯỚC accountRouter (path khác rơi xuống tiếp).
  api.use('/account/wishlist', noStore, requireAuth('storefront'), wishlistRouter);
  api.use('/account/orders', noStore, requireAuth('storefront'), accountReturnsRouter);
  api.use('/account', noStore, requireAuth('storefront'), accountRouter);
  options.extraApiRoutes?.(api);
  app.use('/api', api);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
