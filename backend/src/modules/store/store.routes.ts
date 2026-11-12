import { NextFunction, Request, Response, Router } from 'express';
import { Errors } from '../../lib/errors';
import { catalogRateLimit } from '../../middleware/catalog-rate-limit';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Công khai chỉ đọc như catalog: phương thức ghi -> 404 not-found. Không đọc cookie, không requireAuth. */
function methodGate(req: Request, _res: Response, next: NextFunction): void {
  if (!SAFE.has(req.method)) return next(Errors.notFound());
  next();
}

export const storeRouter = Router();
storeRouter.use('/store', catalogRateLimit, methodGate);
