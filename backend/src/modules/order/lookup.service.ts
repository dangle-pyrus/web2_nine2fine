import type { Response } from 'express';
import prisma from '../../config/prisma';
import { ASSUMPTIONS } from '../../config/assumptions';
import { getConfig } from '../../config/env';
import { addMs, MINUTE, now as clockNow, secondsUntil } from '../../lib/clock';
import { generateOtp, generateSessionToken, hashOtp, hashSessionToken } from '../../lib/crypto';
import { Errors } from '../../lib/errors';
import { runInBackground, sendMail } from '../../mail/mailer';
import { lookupCodeMail } from '../../mail/order-templates';
import { getLockSeconds, getStates, hitWindow, lockOf, recordFailure, setLock, windowOf } from '../auth/rate-limit.service';
import { normalizeOrderCode } from './order-code';
import { ORDER_INCLUDE, OrderDto, toOrderDto } from './order.mapper';

/**
 * Tra cứu đơn khách bằng mã đơn + email + OTP (BR-CHK-26). OTP lưu băm trong `auth_action_tokens`
 * (purpose `guest_order_lookup`), thông số như BR-AUTH-04..09 (Q1). Quyền xem sau OTP = cookie `n2f_oa` 30 phút.
 */

const PURPOSE = 'guest_order_lookup' as const;
export const GRANT_COOKIE = 'n2f_oa';
const OTP_TTL_MS = 10 * MINUTE;
const MAX_WRONG = 5;
const LOCK_MS = 15 * MINUTE;
const IP_FAIL_LIMIT = 30;

const K = {
  cooldown: (email: string, code: string) => `order-lookup:cooldown:${email}:${code}`,
  sendEmail: (email: string) => `order-lookup:send:email:${email}`,
  sendIp: (ip: string) => `order-lookup:send:ip:${ip}`,
  fail: (email: string) => `order-lookup:fail:${email}`,
  lock: (email: string) => `order-lookup:lock:${email}`,
  failIp: (ip: string) => `order-lookup:fail:ip:${ip}`,
};

/** Gắn mã OTP với đúng đơn: băm theo `email|orderCode`. */
const bind = (email: string, orderCode: string) => `${email}|${orderCode}`;

const NOT_FOUND_MSG = 'Không tìm thấy đơn hàng phù hợp.';

/** Luôn trả cùng phản hồi dù mã đơn / email có khớp hay không; chỉ gửi OTP khi khớp. Việc phụ thuộc "có khớp" chạy nền. */
export async function requestLookupCode(
  rawOrderCode: string,
  email: string,
  ip: string,
): Promise<{ resendAfterSeconds: number }> {
  const resend = ASSUMPTIONS.lookupOtpResendSeconds;
  const orderCode = normalizeOrderCode(rawOrderCode);
  const cooldownKey = K.cooldown(email, orderCode ?? rawOrderCode.trim().toUpperCase().slice(0, 20));

  const wait = await getLockSeconds(cooldownKey);
  if (wait > 0) return { resendAfterSeconds: Math.min(wait, resend) };

  const byIp = await hitWindow(K.sendIp(ip), 30, 60 * MINUTE);
  if (!byIp.allowed) throw Errors.rateLimited(byIp.retryAfterSeconds);
  const byEmail = await hitWindow(K.sendEmail(email), 5, 30 * MINUTE);
  if (!byEmail.allowed) throw Errors.rateLimited(byEmail.retryAfterSeconds);
  await setLock(cooldownKey, addMs(clockNow(), resend * 1000));

  if (orderCode) runInBackground('lookup-dispatch', () => dispatch(orderCode, email));
  return { resendAfterSeconds: resend };
}

async function dispatch(orderCode: string, email: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { code: orderCode }, select: { order_id: true, email: true } });
  if (!order || order.email !== email) return;
  const code = generateOtp();
  const t = clockNow();
  await prisma.$transaction([
    prisma.authActionToken.updateMany({
      where: { email, purpose: PURPOSE, used_at: null, invalidated_at: null },
      data: { invalidated_at: t },
    }),
    prisma.authActionToken.create({
      data: { email, user_id: null, purpose: PURPOSE, tokenHash: hashOtp(bind(email, orderCode), PURPOSE, code), expiresAt: addMs(t, OTP_TTL_MS) },
    }),
  ]);
  await sendMail(lookupCodeMail(email, orderCode, code));
}

/** Kiểm OTP; đúng cả ba -> tạo quyền xem (cookie `n2f_oa`) và trả đơn. Mọi sai khác -> cùng 404. */
export async function verifyLookup(
  rawOrderCode: string,
  email: string,
  code: string,
  ip: string,
  res: Response,
): Promise<OrderDto> {
  const t = clockNow();
  const states = await getStates([K.failIp(ip), K.lock(email)]);
  const ipFails = windowOf(states.get(K.failIp(ip)), 15 * MINUTE, t);
  if (ipFails.count >= IP_FAIL_LIMIT) throw Errors.rateLimited(ipFails.retryAfterSeconds);
  const lockSec = lockOf(states.get(K.lock(email)), t);
  if (lockSec > 0) throw Errors.codeLocked(lockSec);

  const orderCode = normalizeOrderCode(rawOrderCode);
  const order = orderCode
    ? await prisma.order.findUnique({ where: { code: orderCode }, include: ORDER_INCLUDE })
    : null;

  if (order && orderCode && order.email === email) {
    const token = await prisma.authActionToken.findFirst({
      where: {
        email,
        purpose: PURPOSE,
        tokenHash: hashOtp(bind(email, orderCode), PURPOSE, code),
        used_at: null,
        invalidated_at: null,
        expiresAt: { gt: t },
      },
    });
    if (token) {
      const used = await prisma.authActionToken.updateMany({
        where: { token_id: token.token_id, used_at: null, invalidated_at: null },
        data: { used_at: t },
      });
      if (used.count === 1) {
        const grant = generateSessionToken();
        await prisma.orderAccessGrant.create({
          data: { tokenHash: hashSessionToken(grant), orderId: order.order_id, createdAt: t, expiresAt: addMs(t, ASSUMPTIONS.orderAccessTtlMs) },
        });
        setGrantCookie(res, grant);
        return toOrderDto(order);
      }
    }
  }

  // Sai bất kỳ thứ gì: tính vào bộ đếm sai theo email + IP; đủ 5 lần thì khoá (BR-AUTH-08).
  const failure = await recordFailure(K.fail(email), { max: MAX_WRONG, gapMs: LOCK_MS, lockMs: LOCK_MS });
  await hitWindow(K.failIp(ip), IP_FAIL_LIMIT, 15 * MINUTE);
  if (failure.lockedUntil) {
    await setLock(K.lock(email), failure.lockedUntil);
    await prisma.authActionToken.updateMany({
      where: { email, purpose: PURPOSE, used_at: null, invalidated_at: null },
      data: { invalidated_at: t },
    });
    throw Errors.codeLocked(secondsUntil(failure.lockedUntil, t));
  }
  throw Errors.notFound(NOT_FOUND_MSG);
}

function setGrantCookie(res: Response, token: string): void {
  res.cookie(GRANT_COOKIE, token, {
    httpOnly: true,
    sameSite: getConfig().cookieSameSite,
    secure: getConfig().isProduction,
    path: '/api/orders',
    maxAge: ASSUMPTIONS.orderAccessTtlMs,
  });
}

/** Id đơn mà cookie `n2f_oa` hiện đang cho phép xem (hết hạn / không có / sai -> null). */
export async function grantedOrderId(token: string | undefined, at: Date = clockNow()): Promise<string | null> {
  if (!token || token.length > 200) return null;
  const g = await prisma.orderAccessGrant.findUnique({ where: { tokenHash: hashSessionToken(token) } });
  return g && g.expiresAt > at ? g.orderId : null;
}
