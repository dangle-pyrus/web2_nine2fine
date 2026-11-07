import express, { Express, Request, Response, Router } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { getConfig } from './config/env';
import { originGuard, requireJsonBody } from './middleware/csrf';
import { errorHandler, notFound } from './middleware/error';
import { adminAuthRouter, authRouter } from './modules/auth/auth.routes';

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
      allowedHeaders: ['Content-Type', 'X-Requested-With'],
      maxAge: 600,
    }),
  );

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'success', message: 'Nine2Fine API is running smoothly!', timestamp: new Date().toISOString() });
  });

  const api = Router();
  api.use(originGuard);
  api.use(requireJsonBody);
  api.use(express.json({ limit: '16kb' }));
  api.use(cookieParser());
  api.use('/auth', authRouter);
  api.use('/admin/auth', adminAuthRouter);
  options.extraApiRoutes?.(api);
  app.use('/api', api);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
