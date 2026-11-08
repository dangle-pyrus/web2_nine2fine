import { NextFunction, Request, Response, Router } from 'express';
import { ADMIN_ASSUMPTIONS } from '../../config/assumptions';
import prisma from '../../config/prisma';
import { Errors } from '../../lib/errors';
import { parseBody } from '../../lib/validate';
import { adminRateLimit } from '../../middleware/rate-limit';
import { normalizeOrderCode } from '../order/order-code';
import { ADMIN_ORDER_INCLUDE, toAdminOrder, toAdminSummary } from './order-admin.mapper';
import { countOrders, listOrders } from './order-admin.query';
import { countsQuerySchema, listQuerySchema } from './order-admin.schemas';

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

/**
 * Lát 4.1: chỉ có cổng phân quyền theo `reason` (BR-ADM-02, AC-ADM-02/03): lý do chỉ admin mà người gọi không phải admin
 * -> 403 TRƯỚC khi đọc đơn. Thực thi huỷ thuộc lát 4.3 (tới đó trả 404 not-found).
 */
orderAdminRouter.post(
  '/:orderCode/cancel',
  wrap(async (req, _res) => {
    const reason = (req.body as { reason?: unknown } | undefined)?.reason;
    if (typeof reason === 'string' && ADMIN_ASSUMPTIONS.adminOnlyCancelReasons.includes(reason) && req.auth!.user.role !== 'admin') {
      throw Errors.forbidden();
    }
    throw Errors.notFound();
  }),
);
