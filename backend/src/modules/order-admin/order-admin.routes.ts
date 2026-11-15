import { NextFunction, Request, Response, Router } from 'express';
import { ADMIN_ASSUMPTIONS } from '../../config/assumptions';
import prisma from '../../config/prisma';
import { now as clockNow } from '../../lib/clock';
import { Errors } from '../../lib/errors';
import { csvCell } from '../insights-admin/csv';
import { parseBody } from '../../lib/validate';
import { adminRateLimit } from '../../middleware/rate-limit';
import { normalizeOrderCode } from '../order/order-code';
import { ADMIN_ORDER_INCLUDE, toAdminOrder, toAdminSummary, withAdminReturn } from './order-admin.mapper';
import { countOrders, listOrders } from './order-admin.query';
import { ActionInput, Actor, runAction } from './order-admin.service';
import {
  callAttemptSchema, cancelSchema, confirmRefundSchema, exportQuerySchema, countsQuerySchema, expectedStatusSchema, listQuerySchema, noteSchema, rejectCancelSchema, returnedStockSchema, shipSchema,
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

const STATUS_LABEL: Record<string, string> = {
  to_pay: 'Chờ thanh toán', to_ship: 'Chờ giao hàng', to_receive: 'Đang giao', completed: 'Hoàn thành',
  cancel_requested: 'Chờ duyệt huỷ', cancelled: 'Đã huỷ',
};
const PAYMENT_LABEL: Record<string, string> = { cod: 'COD', bank_transfer: 'Chuyển khoản' };
const EXPORT_MAX = 5000;
/** Giờ VN (UTC+7, không có giờ mùa hè): `dd/MM/yyyy HH:mm` và `yyyy-MM-dd`. */
const vnParts = (d: Date) => {
  const v = new Date(d.getTime() + 7 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return { day: `${v.getUTCFullYear()}-${p(v.getUTCMonth() + 1)}-${p(v.getUTCDate())}`, text: `${p(v.getUTCDate())}/${p(v.getUTCMonth() + 1)}/${v.getUTCFullYear()} ${p(v.getUTCHours())}:${p(v.getUTCMinutes())}` };
};

/**
 * ADM-ORD-18: chỉ admin xuất CSV (staff 403). Phạm vi: `codes` (trang hiện tại / đơn đã chọn) hoặc mọi đơn khớp bộ lọc
 * (tối đa 5.000). Tên tệp `don-hang-YYYY-MM-DD.csv` (ngày VN); UTF-8 BOM, chống công thức như CSV báo cáo.
 */
orderAdminRouter.get(
  '/export',
  wrap(async (req, res) => {
    if (req.auth!.user.role !== 'admin') throw Errors.forbidden();
    const f = parseBody(exportQuerySchema, { ...req.query });
    const { rows } = await listOrders({ ...f, page: 1, limit: EXPORT_MAX });
    const head = ['Mã đơn', 'Ngày đặt', 'Khách hàng', 'Thanh toán', 'Trạng thái', 'Số SP', 'Tổng tiền'];
    const lines = [head.map(csvCell).join(',')];
    for (const r of rows) {
      lines.push(
        [
          csvCell(r.code),
          csvCell(vnParts(r.created_at).text),
          csvCell(r.recipient_name),
          csvCell(PAYMENT_LABEL[r.payment_method] ?? r.payment_method),
          csvCell(STATUS_LABEL[r.status] ?? r.status),
          String(r.item_count),
          String(r.total),
        ].join(','),
      );
    }
    const day = vnParts(clockNow()).day;
    res
      .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="don-hang-${day}.csv"`,
        'Cache-Control': 'no-store',
      })
      .send('\uFEFF' + lines.join('\r\n') + '\r\n');
  }),
);

orderAdminRouter.get(
  '/:orderCode',
  wrap(async (req, res) => {
    const code = normalizeOrderCode(String(req.params.orderCode));
    if (!code) throw Errors.notFound();
    const order = await prisma.order.findUnique({ where: { code }, include: ADMIN_ORDER_INCLUDE });
    if (!order) throw Errors.notFound();
    res.json(await withAdminReturn(prisma, toAdminOrder(order, req.auth!.user.role), order.order_id, req.auth!.user.role));
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

/** COMMON-02.4: chỉ admin (máy trạng thái kiểm `who: 'admin'`). */
orderAdminRouter.post(
  '/:orderCode/refund-confirmed',
  wrap(async (req, res) => respond(req, res, { kind: 'confirm-refund', body: parseBody(confirmRefundSchema, req.body) })),
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

/** Lát 4.6 (BR-ADM-38): ghi chú nội bộ, mọi trạng thái, không `expectedStatus`, không đổi trạng thái, không email. Staff + admin. */
orderAdminRouter.post(
  '/:orderCode/notes',
  wrap(async (req, res) => respond(req, res, { kind: 'note', body: parseBody(noteSchema, req.body) })),
);
