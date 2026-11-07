import { NextFunction, Request, Response, Router } from 'express';
import { Errors } from '../../lib/errors';
import { catalogRateLimit } from '../../middleware/catalog-rate-limit';
import * as controller from './catalog.controller';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Catalog công khai chỉ đọc: phương thức ghi -> 404 not-found (AC-CAT-46). Không đọc cookie, không requireAuth. */
function methodGate(req: Request, _res: Response, next: NextFunction): void {
  if (!SAFE.has(req.method)) return next(Errors.notFound());
  next();
}

export const catalogRouter = Router();

catalogRouter.use(['/products', '/size-charts'], catalogRateLimit, methodGate);
catalogRouter.get('/size-charts/:category', controller.sizeChart);
catalogRouter.get('/products/:productId/reviews', controller.reviews);
catalogRouter.get('/products/:slug', controller.detail);
catalogRouter.get('/products', controller.list);

// Đường dẫn giải mã lỗi (ví dụ "%") -> 404 not-found thay vì 500.
catalogRouter.use((err: unknown, _req: Request, _res: Response, next: NextFunction): void => {
  if (err instanceof URIError) {
    return next(Errors.notFound());
  }
  next(err);
});
