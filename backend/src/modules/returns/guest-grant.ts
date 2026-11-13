import type { NextFunction, Request, Response } from 'express';
import prisma from '../../config/prisma';
import { now as clockNow } from '../../lib/clock';
import { hashSessionToken } from '../../lib/crypto';
import { Errors } from '../../lib/errors';
import { GRANT_COOKIE } from '../order/lookup.service';
import { normalizeOrderCode } from '../order/order-code';
import type { GuestPrincipal } from './create-return.service';

/**
 * Quyền của khách vãng lai ở `/orders/{orderCode}/return*` (BR-RET-60, plan 10.2 mục 5.1).
 * CHỈ cookie `n2f_oa` (SHA-256 -> `order_access_grants.token_hash`), còn hạn. Phiên `n2f_sid` KHÔNG mở được endpoint.
 * Thiếu / hết hạn -> 401. Việc grant có gắn đúng đơn `{orderCode}` (và đơn không thuộc thành viên) do service kiểm
 * (`findOwnedOrder` / `cancelByCustomer`) để thứ tự 422 -> 404 đúng contract; đơn lạ / của người khác / của thành viên -> 404 cùng một phản hồi.
 */

export interface GuestGrant {
  hash: string;
  orderId: string;
}

export async function readGuestGrant(req: Request, at: Date = clockNow()): Promise<GuestGrant | null> {
  const cookie = req.cookies?.[GRANT_COOKIE];
  if (typeof cookie !== 'string' || cookie.length === 0 || cookie.length > 200) return null;
  const hash = hashSessionToken(cookie);
  const g = await prisma.orderAccessGrant.findUnique({ where: { tokenHash: hash } });
  return g && g.expiresAt > at ? { hash, orderId: g.orderId } : null;
}

/** Middleware: 401 khi không có grant hợp lệ; còn lại gắn `res.locals.guestGrant` (bộ đếm tần suất đọc `guestGrantHash` ở đó). */
export async function guestGrantAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const g = await readGuestGrant(req);
    if (!g) throw Errors.unauthenticated();
    res.locals.guestGrant = g;
    res.locals.guestGrantHash = g.hash;
    next();
  } catch (err) {
    next(err);
  }
}

export const guestPrincipalOf = (res: Response): GuestPrincipal => {
  const g = res.locals.guestGrant as GuestGrant | undefined;
  if (!g) throw Errors.unauthenticated();
  return { kind: 'guest', grantHash: g.hash, orderId: g.orderId };
};

/** Đơn của grant theo mã trong đường dẫn; sai dạng / không có / khác đơn của grant / thuộc tài khoản thành viên -> `404` (cùng một phản hồi). */
export async function guestOrderOr404(p: GuestPrincipal, rawCode: string): Promise<{ order_id: string; code: string }> {
  const code = normalizeOrderCode(rawCode);
  if (!code) throw Errors.notFound();
  const o = await prisma.order.findUnique({ where: { code }, select: { order_id: true, code: true, userId: true } });
  if (!o || o.userId !== null || o.order_id !== p.orderId) throw Errors.notFound();
  return { order_id: o.order_id, code: o.code };
}
