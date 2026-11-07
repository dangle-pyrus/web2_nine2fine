import type { NextFunction, Request, Response } from 'express';
import { authenticate } from '../modules/auth/session.service';
import { readSessionToken } from './auth';

/**
 * Như requireAuth('storefront') nhưng KHÔNG bao giờ ném lỗi: không phiên / phiên sai / hết hạn / thu hồi
 * -> coi như khách (req.auth = undefined), không Set-Cookie, không 401 (BR-CHK-02).
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = readSessionToken(req, 'storefront');
  if (token) {
    try {
      const ctx = await authenticate(token, 'storefront');
      if (ctx) req.auth = { user: ctx.user, sessionId: ctx.sessionId, audience: 'storefront' };
    } catch {
      req.auth = undefined;
    }
  }
  next();
}

/** Id thành viên để gắn đơn / tính lượt voucher. Staff / admin không gắn đơn (BR-CHK-02). */
export const memberIdOf = (req: Request): string | undefined =>
  req.auth && req.auth.user.role === 'member' ? req.auth.user.user_id : undefined;
