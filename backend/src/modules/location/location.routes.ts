import { NextFunction, Request, Response, Router } from 'express';
import { Errors } from '../../lib/errors';
import { locationLimit } from '../../middleware/rate-limit';
import * as service from './location.service';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
const LONG = 'public, max-age=86400';

type Handler = (req: Request, res: Response) => Promise<void>;
const wrap =
  (fn: Handler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };

/**
 * Địa giới công khai, chỉ đọc, không đọc cookie (như catalog): gắn TRƯỚC originGuard.
 * Phương thức ghi -> 404 not-found.
 */
export const locationRouter = Router();
locationRouter.use('/locations', locationLimit, (req: Request, _res: Response, next: NextFunction) => {
  if (!SAFE.has(req.method)) return next(Errors.notFound());
  next();
});
locationRouter.get(
  '/locations/provinces/:provinceCode/wards',
  wrap(async (req, res) => {
    const code = String(req.params.provinceCode ?? '').trim();
    if (!code || code.length > 10) throw Errors.notFound('Không tìm thấy tỉnh / thành.');
    res.set('Cache-Control', LONG).json(await service.listWards(code));
  }),
);
locationRouter.get(
  '/locations/provinces',
  wrap(async (_req, res) => {
    res.set('Cache-Control', LONG).json(await service.listProvinces());
  }),
);
