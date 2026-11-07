import type { NextFunction, Request, Response } from 'express';
import type { user_role } from '@prisma/client';
import { Errors } from '../lib/errors';
import { Audience, authenticate, clearSessionCookie, COOKIE, SessionUser } from '../modules/auth/session.service';

export interface AuthContext {
  user: SessionUser;
  sessionId: string;
  audience: Audience;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}

export const readSessionToken = (req: Request, audience: Audience): string | undefined => {
  const v = req.cookies?.[COOKIE[audience].name];
  return typeof v === 'string' ? v : undefined;
};

/** Bắt buộc có phiên hợp lệ cho audience; không có -> 401 unauthenticated. Dùng cho mọi module cần đăng nhập. */
export const requireAuth =
  (audience: Audience) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token = readSessionToken(req, audience);
    const ctx = await authenticate(token, audience);
    if (!ctx) {
      if (token) clearSessionCookie(res, audience);
      throw Errors.unauthenticated();
    }
    req.auth = { user: ctx.user, sessionId: ctx.sessionId, audience };
    next();
  };

/** Dùng sau requireAuth: có phiên nhưng sai vai trò -> 403 forbidden (BR-AUTH-34). */
export const requireRole =
  (...roles: user_role[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) throw Errors.unauthenticated();
    if (!roles.includes(req.auth.user.role)) throw Errors.forbidden();
    next();
  };
