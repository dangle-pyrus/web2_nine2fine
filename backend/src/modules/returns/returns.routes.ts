import express, { Request, Response, Router } from 'express';
import { RETURNS_ASSUMPTIONS } from '../../config/assumptions';
import { Errors } from '../../lib/errors';
import prisma from '../../config/prisma';
import { now as clockNow } from '../../lib/clock';
import { parseBodyAll, parseIdempotencyKey, UUID_RE } from '../../lib/validate';
import { requirePermission } from '../../middleware/require-permission';
import { staffDisplayName } from '../order/order-event';
import { cartQuoteLimit, returnCreateLimit, returnPhotoLimit } from '../../middleware/rate-limit';
import { normalizeOrderCode } from '../order/order-code';
import { createReturn, estimateReturn, type MemberPrincipal } from './create-return.service';
import { readReturnPhoto, uploadReturnPhoto } from './photo.service';
import { approveReturn, cancelByCustomer, receiveReturn, refundReturn, rejectReturn, type ReturnActor } from './process-return.service';
import { isOverdue, loadAdminReturnOr404 } from './return.mapper';
import { countReturns, listReturns } from './return.query';
import { approveSchema, listQuerySchema, receiveSchema, refundSchema, rejectSchema } from './returns.schemas';

/**
 * Thành viên (Slice 9). Gắn ở app.ts SAU `noStore` + `requireAuth('storefront')`: mọi phản hồi (kể cả 401) `no-store`.
 * Thứ tự kiểm: 401 -> 403 origin (originGuard toàn cục) -> 429 -> Idempotency-Key 422 -> thân 422 -> 404 -> giao dịch.
 */

/** Chỉ thành viên (staff / admin đăng nhập storefront không gửi yêu cầu trả hàng). */
const memberOf = (req: Request): MemberPrincipal => {
  const u = req.auth?.user;
  if (!u) throw Errors.unauthenticated();
  if (u.role !== 'member') throw Errors.forbidden();
  return { kind: 'member', userId: u.user_id };
};

export const accountReturnsRouter = Router();

accountReturnsRouter.post('/:orderCode/return', returnCreateLimit, async (req: Request, res: Response) => {
  const p = memberOf(req);
  const key = parseIdempotencyKey(req);
  const code = normalizeOrderCode(String(req.params.orderCode)) ?? String(req.params.orderCode);
  const r = await createReturn(p, code, req.body, key, `${req.baseUrl}/${code}/return`);
  if (r.replayed) res.set('Idempotency-Replayed', 'true');
  res.status(r.replayed ? 200 : 201).json(r.dto);
});

accountReturnsRouter.post('/:orderCode/return/estimate', cartQuoteLimit, async (req: Request, res: Response) => {
  res.json(await estimateReturn(memberOf(req), String(req.params.orderCode), req.body));
});

accountReturnsRouter.post('/:orderCode/return/cancel', cartQuoteLimit, async (req: Request, res: Response) => {
  const p = memberOf(req);
  res.json(await cancelByCustomer(p.userId, String(req.params.orderCode)));
});

/** Gửi byte ảnh đã kiểm quyền: `private, no-store`, `nosniff`, `inline`. */
function sendPhoto(res: Response, file: { data: Buffer; contentType: string }): void {
  res
    .status(200)
    .set({
      'Content-Type': file.contentType,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
      'Content-Length': String(file.data.length),
    })
    .end(file.data);
}

/** `/account/return-photos`: thân byte thô (gắn TRƯỚC `requireJsonBody` ở app.ts). */
export const accountReturnPhotosRouter = Router();

accountReturnPhotosRouter.post(
  '/',
  returnPhotoLimit,
  // Thân là byte thô của đúng 1 tệp, mọi Content-Type; vượt giới hạn -> entity.too.large -> invalid-image size (error.ts).
  express.raw({ type: () => true, limit: RETURNS_ASSUMPTIONS.photo.maxBytes + 1 }),
  async (req: Request, res: Response) => {
    const p = memberOf(req);
    res.status(201).json(await uploadReturnPhoto(req.body, { kind: 'member', userId: p.userId }, { kind: 'member' }));
  },
);

accountReturnPhotosRouter.get('/:photoId', cartQuoteLimit, async (req: Request, res: Response) => {
  const p = memberOf(req);
  sendPhoto(res, await readReturnPhoto({ kind: 'member', userId: p.userId }, String(req.params.photoId)));
});

export { sendPhoto };

/* ------------------------------ Admin (staff + admin) ------------------------------ */

const actorOf = (req: Request): ReturnActor => {
  const u = req.auth!.user;
  return { id: u.user_id, role: u.role as 'staff' | 'admin', name: staffDisplayName(u) };
};
const idOf = (req: Request): string => String(req.params.returnId);

/**
 * Gắn ở app.ts SAU `noStore`, `requireAuth('admin')`, `requireRole('staff', 'admin')`, `adminRateLimit` (vai trò + is_active đọc lại từ DB mỗi yêu cầu).
 * `requirePermission` đứng TRƯỚC Zod và trước mọi truy cập DB.
 */
export const adminReturnsRouter = Router();

adminReturnsRouter.get('/', requirePermission('returns.process'), async (req: Request, res: Response) => {
  const q = parseBodyAll(listQuerySchema, { ...req.query });
  const f = { state: q.state, q: q.q || undefined, sort: q.sort, page: q.page, limit: q.limit };
  const [{ rows, total }, counts] = await Promise.all([listReturns(prisma, f), countReturns(prisma, f.q)]);
  const at = clockNow();
  res.json({
    items: rows.map((r) => ({
      id: r.return_id,
      orderCode: r.code,
      requestedAt: r.requested_at.toISOString(),
      recipientName: r.recipient_name,
      reason: r.reason,
      fault: r.fault,
      state: r.state,
      itemCount: r.item_count,
      source: r.source === 'guest' ? 'guest' : 'member',
      amount: r.amount,
      ...(r.handled_by ? { handledBy: { name: r.handled_by, role: r.handled_role === 'admin' ? 'admin' : 'staff' }, handledAt: r.handled_at!.toISOString() } : {}),
      overdue: isOverdue(r.state, r.requested_at, at),
    })),
    total, page: f.page, limit: f.limit, counts,
  });
});

adminReturnsRouter.get('/:returnId', requirePermission('returns.process'), async (req: Request, res: Response) => {
  const id = idOf(req);
  if (!UUID_RE.test(id)) throw Errors.notFound();
  res.json(await loadAdminReturnOr404(prisma, id, req.auth!.user.role as 'staff' | 'admin'));
});

adminReturnsRouter.post('/:returnId/approve', requirePermission('returns.process'), async (req: Request, res: Response) => {
  const id = idOf(req);
  if (!UUID_RE.test(id)) throw Errors.notFound();
  res.json(await approveReturn(actorOf(req), id, parseBodyAll(approveSchema, req.body ?? {})));
});

adminReturnsRouter.post('/:returnId/reject', requirePermission('returns.process'), async (req: Request, res: Response) => {
  const id = idOf(req);
  if (!UUID_RE.test(id)) throw Errors.notFound();
  res.json(await rejectReturn(actorOf(req), id, parseBodyAll(rejectSchema, req.body ?? {})));
});

adminReturnsRouter.post('/:returnId/receive', requirePermission('returns.process'), async (req: Request, res: Response) => {
  const id = idOf(req);
  if (!UUID_RE.test(id)) throw Errors.notFound();
  res.json(await receiveReturn(actorOf(req), id, parseBodyAll(receiveSchema, req.body ?? {})));
});

adminReturnsRouter.post('/:returnId/refund', requirePermission('returns.refund'), async (req: Request, res: Response) => {
  const id = idOf(req);
  if (!UUID_RE.test(id)) throw Errors.notFound();
  res.json(await refundReturn(actorOf(req), id, parseBodyAll(refundSchema, req.body ?? {})));
});

export const adminReturnPhotosRouter = Router();
adminReturnPhotosRouter.get('/:photoId', requirePermission('returns.process'), async (req: Request, res: Response) => {
  sendPhoto(res, await readReturnPhoto({ kind: 'admin' }, String(req.params.photoId)));
});
