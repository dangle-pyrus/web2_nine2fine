import { NextFunction, Request, Response, Router } from 'express';
import { ADMIN_ASSUMPTIONS } from '../../config/assumptions';
import prisma from '../../config/prisma';
import { Errors } from '../../lib/errors';
import { parseBody } from '../../lib/validate';
import { adminRateLimit } from '../../middleware/rate-limit';
import { normalizeOrderCode } from '../order/order-code';
import { ADMIN_ORDER_INCLUDE, toAdminOrder, toAdminSummary } from './order-admin.mapper';
import { countOrders, listOrders } from './order-admin.query';
import { ActionInput, Actor, runAction } from './order-admin.service';
import {
  callAttemptSchema, cancelSchema, countsQuerySchema, expectedStatusSchema, listQuerySchema, rejectCancelSchema, returnedStockSchema, shipSchema,
} from './order-admin.schemas';

type Handler = (req: Request, res: Response) => Promise<void>;
const wrap =
  (fn: Handler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };

/**
 * /api/admin/orders/**. Gắn ở app.ts SAU `noStore`, `requireAuth('admin')`, `requireRole('staff', 'admin')`
 * (vai trò và `is_active` đọc lại từ `users` ở mỗi yêu cầu, BR-ADM-01, 03).
 */
export const orderAdminRouter = Router();
orderAdminRouter.use(adminRateLimit);

orderAdminRouter.get(
  '/counts',
  wrap(async (req, res) => {
    const f = parseBody(countsQuerySchema, { ...req.query });
    res.json(await countOrders(f));
  }),
);

orderAdminRouter.get(
  '/',
  wrap(async (req, res) => {
    const f = parseBody(listQuerySchema, { ...req.query });
    const { rows, total } = await listOrders(f);
    res.json({ items: rows.map(toAdminSummary), total, page: f.page, limit: f.limit });
  }),
);

orderAdminRouter.get(
  '/:orderCode',
  wrap(async (req, res) => {
    const code = normalizeOrderCode(String(req.params.orderCode));
    if (!code) throw Errors.notFound();
    const order = await prisma.order.findUnique({ where: { code }, include: ADMIN_ORDER_INCLUDE });
    if (!order) throw Errors.notFound();
    res.json(toAdminOrder(order, req.auth!.user.role));
  }),
);

/* ---------------- Hành động (lát 4.3, 4.4). Thứ tự kiểm: 403 theo reason -> 422 -> 404 -> khoá đơn -> 409 -> 200. ---------------- */

const KEY_RE = /^[A-Za-z0-9-]{16,64}$/;
/** `Idempotency-Key` tuỳ chọn ở admin; có mà sai dạng -> 422. */
function optionalIdempotencyKey(req: Request): string | undefined {
  const v = req.get('idempotency-key');
  if (v === undefined) return undefined;
  if (!KEY_RE.test(v)) throw Errors.validation('Idempotency-Key sai dạng.', 'Idempotency-Key');
  return v;
}

const actorOf = (req: Request): Actor => {
  const u = req.auth!.user;
  return { id: u.user_id, role: u.role, firstName: u.firstName, lastName: u.lastName };
};

async function respond(req: Request, res: Response, input: ActionInput): Promise<void> {
  const key = optionalIdempotencyKey(req);
  const code = normalizeOrderCode(String(req.params.orderCode));
  if (!code) throw Errors.notFound('Không tìm thấy đơn hàng.');
  // Đường dẫn sau mã đơn (vd. `cancel`, `cancel-request/approve`) vào request_hash.
  const action = req.path.split('/').slice(2).join('/');
  const r = await runAction({ code, actor: actorOf(req), input, key, path: `${req.baseUrl}/${code}/${action}` });
  if (r.replayed) res.set('Idempotency-Replayed', 'true');
  res.json(r.order);
}

orderAdminRouter.post(
  '/:orderCode/call-attempts',
  wrap(async (req, res) => respond(req, res, { kind: 'call-attempt', body: parseBody(callAttemptSchema, req.body) })),
);

orderAdminRouter.post(
  '/:orderCode/confirm',
  wrap(async (req, res) => respond(req, res, { kind: 'confirm', body: parseBody(expectedStatusSchema, req.body) })),
);

orderAdminRouter.post(
  '/:orderCode/ship',
  wrap(async (req, res) => respond(req, res, { kind: 'ship', body: parseBody(shipSchema, req.body) })),
);

orderAdminRouter.post(
  '/:orderCode/deliver',
  wrap(async (req, res) => respond(req, res, { kind: 'deliver', body: parseBody(expectedStatusSchema, req.body) })),
);

/** Quyền theo `reason` kiểm TRƯỚC Zod và trước khi đọc đơn (BR-ADM-02, AC-ADM-02/03); lặp lại trong máy trạng thái. */
orderAdminRouter.post(
  '/:orderCode/cancel',
  wrap(async (req, res) => {
    const reason = (req.body as { reason?: unknown } | undefined)?.reason;
    if (typeof reason === 'string' && ADMIN_ASSUMPTIONS.adminOnlyCancelReasons.includes(reason) && req.auth!.user.role !== 'admin') {
      throw Errors.forbidden();
    }
    await respond(req, res, { kind: 'cancel', body: parseBody(cancelSchema, req.body) });
  }),
);

orderAdminRouter.post(
  '/:orderCode/returned-stock',
  wrap(async (req, res) => respond(req, res, { kind: 'returned-stock', body: parseBody(returnedStockSchema, req.body) })),
);

/**
 * Lát 4.5 (T13, T14; S4-Q1): duyệt / từ chối yêu cầu huỷ của khách. Staff + admin. Giữ gắn cả khi `toShipCancelMode = 'direct'`
 * (khi đó không có đơn `cancel_requested` mới nên chỉ trả 409; đơn còn treo từ trước khi lật vẫn xử lý được).
 */
orderAdminRouter.post(
  '/:orderCode/cancel-request/approve',
  wrap(async (req, res) => respond(req, res, { kind: 'approve-cancel', body: parseBody(expectedStatusSchema, req.body) })),
);

orderAdminRouter.post(
  '/:orderCode/cancel-request/reject',
  wrap(async (req, res) => respond(req, res, { kind: 'reject-cancel', body: parseBody(rejectCancelSchema, req.body) })),
);
