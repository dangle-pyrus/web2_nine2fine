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
  api.use(originGuard);
  api.use(requireJsonBody);
  api.use(express.json({ limit: '16kb' }));
  api.use(cookieParser());
  api.use('/auth', authRouter);
  api.use('/admin/auth', adminAuthRouter);
  // noStore TRƯỚC requireAuth để cả 401 / 403 có Cache-Control: no-store (BR-ADM-01).
  api.use('/admin/orders', noStore, requireAuth('admin'), requireRole('staff', 'admin'), orderAdminRouter);
  api.use('/checkout', checkoutRouter);
  api.use('/vouchers', voucherRouter);
  api.use('/cart', cartRouter);
  api.use('/orders', orderRouter);
  options.extraApiRoutes?.(api);
  app.use('/api', api);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
