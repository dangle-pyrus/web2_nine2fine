import { Request, Router } from 'express';
import { now } from '../../lib/clock';
import { requireAuth } from '../../middleware/auth';
import { noStore } from '../../middleware/no-store';
import { optionalAuth } from '../../middleware/optional-auth';
import { createRateLimit, reviewCreateLimit } from '../../middleware/rate-limit';
import { requirePermission } from '../../middleware/require-permission';
import { staffDisplayName } from '../order/order-event';
import { hideReview, listAdminReviews, replyReview, ReviewActor, showReview } from './admin-review.service';
import { parseAdminQuery } from './review.schemas';
import { createReview, getEligibility } from './review.service';

/**
 * Slice 10, lát 10.5 (BR-REV, plan mục 5.4). Danh sách công khai `GET /products/{id}/reviews` nằm ở `catalog.routes.ts` (vùng công khai)
 * nhưng gọi `review.service.listPublicReviews`.
 */

const byUserOrIp = (req: Request): string => req.auth?.user.user_id ?? req.ip ?? 'unknown';
/** Đọc điều kiện: 120 / 60 giây / tài khoản (khách: IP). */
const eligibilityLimit = createRateLimit({ name: 'review-eligibility', windowMs: 60_000, max: 120, key: byUserOrIp });

/** `/api/reviews`: sau originGuard + cookieParser. */
export const reviewsRouter = Router();

reviewsRouter.get('/eligibility', noStore, optionalAuth, eligibilityLimit, async (req, res) => {
  const memberId = req.auth?.user.user_id;
  res.json(await getEligibility(memberId, req.query.productId, now()));
});

reviewsRouter.post('/', noStore, requireAuth('storefront'), reviewCreateLimit, async (req, res) => {
  const u = req.auth!.user;
  res.status(201).json(await createReview(u, req.body, now()));
});

/** `/api/admin/reviews`: quyền `reviews.moderate` (staff + admin) kiểm TRƯỚC khi đọc tham số / thân. */
export const adminReviewsRouter = Router();
const actorOf = (req: Request): ReviewActor => ({ id: req.auth!.user.user_id, name: staffDisplayName(req.auth!.user) });

adminReviewsRouter.get('/', requirePermission('reviews.moderate'), async (req, res) => {
  res.json(await listAdminReviews(parseAdminQuery({ ...req.query })));
});
adminReviewsRouter.post('/:reviewId/hide', requirePermission('reviews.moderate'), async (req, res) => {
  res.json(await hideReview(actorOf(req), String(req.params.reviewId), req.body, now()));
});
adminReviewsRouter.post('/:reviewId/show', requirePermission('reviews.moderate'), async (req, res) => {
  res.json(await showReview(actorOf(req), String(req.params.reviewId), req.body, now()));
});
adminReviewsRouter.put('/:reviewId/reply', requirePermission('reviews.moderate'), async (req, res) => {
  res.json(await replyReview(actorOf(req), String(req.params.reviewId), req.body, now()));
});
