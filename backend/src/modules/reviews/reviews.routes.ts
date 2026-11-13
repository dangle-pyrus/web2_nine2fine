import { Router } from 'express';

/**
 * Slice 10, lát 10.5 (BR-REV, `docs/api/p1-bundle-implementation-plan.md` mục 6.2).
 * Khung gắn sẵn ở `app.ts` (lát 10.1) để các lát song song không đụng `app.ts`; chưa có endpoint.
 */

/** `/api/reviews`: `GET /eligibility` (optionalAuth), `POST /` (requireAuth + `reviewCreateLimit`). Gắn SAU originGuard, cookieParser. */
export const reviewsRouter = Router();

/** `/api/admin/reviews`: danh sách, `hide`, `show`, `reply` (`reviews.moderate`). Gắn sau noStore, requireAuth('admin'), requireRole, adminRateLimit. */
export const adminReviewsRouter = Router();
