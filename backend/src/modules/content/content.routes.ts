import { Router } from 'express';

/**
 * Slice 10, lát 10.3 + 10.8 (BR-MOM, BR-CMS, plan mục 6.5, 6.8). Khung gắn sẵn ở `app.ts` (lát 10.1); chưa có endpoint.
 */

/** Công khai chỉ đọc (gắn TRƯỚC originGuard như catalog): `GET /api/content/home`; 10.8: `GET /api/collections`, `GET /api/collections/{slug}`. */
export const contentPublicRouter = Router();

/** `/api/admin/content`: `GET|PUT /home`, 10.8 `POST /home/reset` (`content.view` / `content.edit`). */
export const adminContentRouter = Router();

/** `/api/admin/size-charts`: `GET /`, `PUT /{category}` (`content.view` / `content.edit`). */
export const adminSizeChartsRouter = Router();

/** `/api/admin/collections` (10.8, Should): CRUD (`content.edit`; đọc `content.view`). */
export const adminCollectionsRouter = Router();
