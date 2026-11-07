import type { Response } from 'express';
import type { Prisma, user_role } from '@prisma/client';
import prisma from '../../config/prisma';
import { getConfig } from '../../config/env';
import { addMs, DAY, HOUR, MINUTE, now } from '../../lib/clock';
import { generateSessionToken, hashSessionToken } from '../../lib/crypto';

export type Audience = 'storefront' | 'admin';
type AuthMethod = 'password' | 'otp' | 'register';

export const COOKIE = {
  storefront: { name: 'n2f_sid', path: '/api' },
  admin: { name: 'n2f_asid', path: '/api/admin' },
} as const;

export const MAX_ACTIVE_SESSIONS = 10;

/** BR-AUTH-24: member 30 ngày / 90 ngày; staff, admin 8 giờ / 24 giờ. */
export function sessionLimits(role: user_role): { idleMs: number; absoluteMs: number } {
  return role === 'member' ? { idleMs: 30 * DAY, absoluteMs: 90 * DAY } : { idleMs: 8 * HOUR, absoluteMs: 24 * HOUR };
}

export interface SessionUser {
  user_id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: user_role;
}

export interface CreatedSession {
  token: string;
  maxAgeSeconds: number;
}

export async function createSession(params: {
  user: { user_id: string; role: user_role };
  method: AuthMethod;
  audience: Audience;
  ip?: string;
  userAgent?: string;
  tx?: Prisma.TransactionClient;
}): Promise<CreatedSession> {
  const run = async (db: Prisma.TransactionClient) => {
    const t = now();
    const { idleMs, absoluteMs } = sessionLimits(params.user.role);
    const active = await db.session.findMany({
      where: { userId: params.user.user_id, revoked_at: null, expiresAt: { gt: t }, absoluteExpiresAt: { gt: t } },
      orderBy: { last_used_at: 'asc' },
      select: { session_id: true },
    });
    // BR-AUTH-28: tối đa 10 phiên còn hạn; đăng nhập thứ 11 thu hồi phiên dùng cuối cũ nhất.
    const excess = active.length - (MAX_ACTIVE_SESSIONS - 1);
    if (excess > 0) {
      await db.session.updateMany({
        where: { session_id: { in: active.slice(0, excess).map((s) => s.session_id) } },
        data: { revoked_at: t, revoke_reason: 'session-limit' },
      });
    }
    const token = generateSessionToken();
    const absoluteExpiresAt = addMs(t, absoluteMs);
    await db.session.create({
      data: {
        userId: params.user.user_id,
        tokenHash: hashSessionToken(token),
        login_method: params.method,
        audience: params.audience,
        userAgent: params.userAgent?.slice(0, 500),
        ipAddress: params.ip?.slice(0, 45),
        last_used_at: t,
        expiresAt: addMs(t, idleMs),
        absoluteExpiresAt,
      },
    });
    return { token, maxAgeSeconds: Math.floor(absoluteMs / 1000) };
  };
  return params.tx ? run(params.tx) : prisma.$transaction(run);
}

/** Tìm phiên hợp lệ + người dùng; null nếu không hợp lệ. Trượt hạn không-hoạt-động (ghi tối đa 1 lần / phút). */
export async function authenticate(
  token: string | undefined,
  audience: Audience,
): Promise<{ user: SessionUser; sessionId: string; absoluteExpiresAt: Date } | null> {
  if (!token || token.length > 200) return null;
  const t = now();
  const session = await prisma.session.findUnique({ where: { tokenHash: hashSessionToken(token) } });
  if (
    !session ||
    session.audience !== audience ||
    session.revoked_at ||
    session.expiresAt <= t ||
    session.absoluteExpiresAt <= t
  ) {
    return null;
  }
  // Vai trò đọc từ bảng users ở mỗi yêu cầu.
  const user = await prisma.user.findUnique({ where: { user_id: session.userId } });
  if (!user || !user.isActive) return null;
  if (audience === 'admin' && user.role === 'member') return null;

  if (t.getTime() - session.last_used_at.getTime() >= MINUTE) {
    const idleTo = addMs(t, sessionLimits(user.role).idleMs);
    await prisma.session.update({
      where: { session_id: session.session_id },
      data: {
        last_used_at: t,
        expiresAt: idleTo < session.absoluteExpiresAt ? idleTo : session.absoluteExpiresAt,
      },
    });
  }
  return {
    user: { user_id: user.user_id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role },
    sessionId: session.session_id,
    absoluteExpiresAt: session.absoluteExpiresAt,
  };
}

/** Thu hồi đúng phiên khớp token (và audience). Token giả / hết hạn: không làm gì. */
export async function revokeByToken(token: string | undefined, audience: Audience): Promise<void> {
  if (!token || token.length > 200) return;
  await prisma.session.updateMany({
    where: { tokenHash: hashSessionToken(token), audience, revoked_at: null },
    data: { revoked_at: now(), revoke_reason: 'logout' },
  });
}

/** BR-AUTH-29: dùng khi vô hiệu tài khoản, đổi vai trò, đặt lại mật khẩu. */
export async function revokeAllUserSessions(
  userId: string,
  reason: string,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<number> {
  const r = await db.session.updateMany({
    where: { userId, revoked_at: null },
    data: { revoked_at: now(), revoke_reason: reason },
  });
  return r.count;
}

function cookieBase(audience: Audience) {
  const cfg = getConfig();
  return {
    httpOnly: true,
    sameSite: cfg.cookieSameSite,
    secure: cfg.isProduction,
    path: COOKIE[audience].path,
  } as const;
}

export function setSessionCookie(res: Response, audience: Audience, session: CreatedSession): void {
  res.cookie(COOKIE[audience].name, session.token, { ...cookieBase(audience), maxAge: session.maxAgeSeconds * 1000 });
}

export function clearSessionCookie(res: Response, audience: Audience): void {
  res.cookie(COOKIE[audience].name, '', { ...cookieBase(audience), maxAge: 0 });
}
