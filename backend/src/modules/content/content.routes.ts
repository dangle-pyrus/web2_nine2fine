import express, { NextFunction, Request, Response, Router } from 'express';
import { P1_ASSUMPTIONS } from '../../config/assumptions';
import { now } from '../../lib/clock';
import { Errors } from '../../lib/errors';
import { catalogRateLimit } from '../../middleware/catalog-rate-limit';
import { requirePermission } from '../../middleware/require-permission';
import { staffDisplayName } from '../order/order-event';
import { createCollection, deleteCollection, getAdminCollection, getPublicCollection, listAdminCollections, listPublicCollections, updateCollection } from './collections.service';
import { ContentActor, getAdminHome, getPublicHome, resetHome, saveHome } from './home-content.service';
import { listAdminSizeCharts, saveSizeChart } from './size-chart-admin.service';

/**
 * Slice 10, lát 10.3 + 10.8 (BR-MOM, BR-CMS). Khung gắn sẵn ở `app.ts` (lát 10.1).
 */

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Công khai chỉ đọc như catalog: phương thức ghi -> 404 not-found. Không đọc cookie, không requireAuth. */
function methodGate(req: Request, _res: Response, next: NextFunction): void {
  if (!SAFE.has(req.method)) return next(Errors.notFound());
  next();
}

const actorOf = (req: Request): ContentActor => ({ id: req.auth!.user.user_id, name: staffDisplayName(req.auth!.user) });
/** 64 KB cho thân nội dung / bảng size; `app.ts` bỏ qua parser 16 KB cho các đường dẫn này. Chạy SAU `requirePermission`. */
const bigJson = express.json({ limit: '64kb' });

/** Công khai chỉ đọc (gắn TRƯỚC originGuard như catalog): `GET /api/content/home`; 10.8: `GET /api/collections`, `GET /api/collections/{slug}`. */
export const contentPublicRouter = Router();
contentPublicRouter.use(['/content', '/collections'], catalogRateLimit, methodGate);

/** BR-CMS-01: `public, max-age=60`. Cookie phiên gửi kèm bị bỏ qua. */
contentPublicRouter.get('/content/home', async (_req, res) => {
  res.set('Cache-Control', `public, max-age=${P1_ASSUMPTIONS.content.homeMaxAge}`).json(await getPublicHome());
});

/** 10.8 (Should): bộ sưu tập công khai, `public, max-age=60`. */
contentPublicRouter.get('/collections', async (_req, res) => {
  res.set('Cache-Control', `public, max-age=${P1_ASSUMPTIONS.content.homeMaxAge}`).json(await listPublicCollections());
});
contentPublicRouter.get('/collections/:slug', async (req, res) => {
  res.set('Cache-Control', `public, max-age=${P1_ASSUMPTIONS.content.homeMaxAge}`).json(await getPublicCollection(String(req.params.slug)));
});

/** `/api/admin/content`: `GET|PUT /home`, 10.8 `POST /home/reset` (`content.view` / `content.edit`). */
export const adminContentRouter = Router();
adminContentRouter.get('/home', requirePermission('content.view'), async (_req, res) => {
  res.json(await getAdminHome());
});
adminContentRouter.put('/home', requirePermission('content.edit'), bigJson, async (req, res) => {
  res.json(await saveHome(actorOf(req), req.body, now()));
});
adminContentRouter.post('/home/reset', requirePermission('content.edit'), bigJson, async (req, res) => {
  res.json(await resetHome(actorOf(req), req.body, now()));
});

/** `/api/admin/size-charts`: `GET /`, `PUT /{category}` (`content.view` / `content.edit`). */
export const adminSizeChartsRouter = Router();
adminSizeChartsRouter.get('/', requirePermission('content.view'), async (_req, res) => {
  res.json(await listAdminSizeCharts());
});
adminSizeChartsRouter.put('/:category', requirePermission('content.edit'), bigJson, async (req, res) => {
  res.json(await saveSizeChart(actorOf(req), String(req.params.category), req.body, now()));
});

/** `/api/admin/collections` (10.8, Should): CRUD (`content.edit`; đọc `content.view`). */
export const adminCollectionsRouter = Router();
adminCollectionsRouter.get('/', requirePermission('content.view'), async (_req, res) => {
  res.json(await listAdminCollections());
});
adminCollectionsRouter.post('/', requirePermission('content.edit'), async (req, res) => {
  res.status(201).json(await createCollection(actorOf(req), req.body, now()));
});
adminCollectionsRouter.get('/:collectionId', requirePermission('content.view'), async (req, res) => {
  res.json(await getAdminCollection(String(req.params.collectionId)));
});
adminCollectionsRouter.put('/:collectionId', requirePermission('content.edit'), async (req, res) => {
  res.json(await updateCollection(actorOf(req), String(req.params.collectionId), req.body, now()));
});
adminCollectionsRouter.delete('/:collectionId', requirePermission('content.edit'), async (req, res) => {
  await deleteCollection(String(req.params.collectionId));
  res.status(204).end();
});

