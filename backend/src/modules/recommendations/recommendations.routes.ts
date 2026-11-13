import { NextFunction, Request, Response, Router } from 'express';
import prisma from '../../config/prisma';
import { P1_ASSUMPTIONS } from '../../config/assumptions';
import { now as clockNow } from '../../lib/clock';
import { Errors } from '../../lib/errors';
import { catalogRateLimit } from '../../middleware/catalog-rate-limit';
import { getCategoryMaps } from '../catalog/catalog.cache';
import { toProductDto } from '../catalog/catalog.mapper';
import { loadRatings } from '../reviews/rating';
import { recommend, resolveInputs } from './recommend';
import { parseRecQuery } from './recommend.schemas';

/**
 * Slice 10, lát 10.6 (BR-REC, plan mục 5.5). `GET /api/recommendations?ids=&limit=`: công khai chỉ đọc như catalog
 * (gắn TRƯỚC originGuard; không cookie, không 401; phương thức ghi -> 404). `Cache-Control: public, max-age=30`. Giới hạn catalog 120 / 60 giây / IP.
 */
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
function methodGate(req: Request, _res: Response, next: NextFunction): void {
  if (!SAFE.has(req.method)) return next(Errors.notFound());
  next();
}

export const recommendationsRouter = Router();

recommendationsRouter.use('/recommendations', catalogRateLimit, methodGate);

recommendationsRouter.get('/recommendations', (req: Request, res: Response, next: NextFunction): void => {
  (async () => {
    const q = parseRecQuery({ ...req.query });
    const at = clockNow();
    const inputs = await resolveInputs(q.tokens);
    const ids = await recommend(inputs, q.limit, at);
    let items: ReturnType<typeof toProductDto>[] = [];
    if (ids.length > 0) {
      const rows = await prisma.product.findMany({ where: { product_id: { in: ids } }, include: { variants: { orderBy: { sortOrder: 'asc' } } } });
      let maps = await getCategoryMaps();
      if (rows.some((r) => !maps.byId.has(r.categoryId))) maps = await getCategoryMaps(true);
      const ratings = await loadRatings(prisma, ids);
      const byId = new Map(rows.map((r) => [r.product_id, r]));
      items = ids
        .map((id) => byId.get(id))
        .filter((r): r is NonNullable<typeof r> => !!r)
        .map((r) => toProductDto(r, maps.byId.get(r.categoryId) ?? '', { now: at, ratings }));
    }
    res.set('Cache-Control', `public, max-age=${P1_ASSUMPTIONS.recommendations.maxAge}`).json({ items });
  })().catch(next);
});
