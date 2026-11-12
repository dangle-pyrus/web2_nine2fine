import { NextFunction, Request, Response, Router } from 'express';
import prisma from '../../config/prisma';
import { INSIGHTS_ASSUMPTIONS } from '../../config/assumptions';
import { Errors } from '../../lib/errors';
import { catalogRateLimit } from '../../middleware/catalog-rate-limit';
import { getPublicSettings } from './settings.service';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Công khai chỉ đọc như catalog: phương thức ghi -> 404 not-found. Không đọc cookie, không requireAuth. */
function methodGate(req: Request, _res: Response, next: NextFunction): void {
  if (!SAFE.has(req.method)) return next(Errors.notFound());
  next();
}

export const storeRouter = Router();
storeRouter.use('/store', catalogRateLimit, methodGate);

/** BR-SET-10: chỉ whitelist `info` + `policy`; `public, max-age=60` (S8-Q9). Cookie phiên gửi kèm bị bỏ qua. */
storeRouter.get('/store/settings', async (_req, res) => {
  res.set('Cache-Control', `public, max-age=${INSIGHTS_ASSUMPTIONS.publicSettingsMaxAge}`).json(await getPublicSettings(prisma));
});
