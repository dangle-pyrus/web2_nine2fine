import { NextFunction, Request, Response, Router } from 'express';
import { Errors } from '../../lib/errors';
import { mediaRateLimit } from '../../middleware/catalog-rate-limit';
import { resolveMedia } from '../catalog-admin/media.service';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * GET /api/media/:mediaId — công khai, không phiên (BR-INV-27). Gắn TRƯỚC originGuard như catalogRouter:
 * phương thức ghi -> 404 not-found. Tên tệp ngẫu nhiên, nội dung không đổi -> cache immutable.
 */
export const mediaRouter = Router();
mediaRouter.use('/media', mediaRateLimit, (req: Request, _res: Response, next: NextFunction) =>
  SAFE.has(req.method) ? next() : next(Errors.notFound()),
);

mediaRouter.get('/media/:mediaId', (req: Request, res: Response, next: NextFunction): void => {
  resolveMedia(String(req.params.mediaId))
    .then((r) => {
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
      if (r.kind === 'redirect') {
        res.redirect(302, r.url);
        return;
      }
      res.set('Content-Type', r.contentType);
      res.status(200).send(r.data);
    })
    .catch(next);
});
