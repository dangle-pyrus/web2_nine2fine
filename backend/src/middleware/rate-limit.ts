import type { NextFunction, Request, Response } from 'express';
import { Errors } from '../lib/errors';
import { now } from '../lib/clock';

/**
 * Giới hạn tần suất theo IP, cửa sổ cố định, bộ đếm RAM riêng từng nhóm (BR-CHK-30).
 * Cùng cơ chế với catalog-rate-limit.ts; mỗi nhóm có bộ đếm riêng nên không ảnh hưởng auth / catalog.
 */
interface Bucket {
  count: number;
  windowStart: number;
}

const IDLE_MS = 5 * 60_000;
const registry: Array<() => void> = [];

export function createRateLimit(opts: { name: string; windowMs: number; max: number; key?: (req: Request) => string }) {
  const buckets = new Map<string, Bucket>();
  let lastSweep = 0;
  registry.push(() => {
    buckets.clear();
    lastSweep = 0;
  });
  return function rateLimit(req: Request, _res: Response, next: NextFunction): void {
    const t = now().getTime();
    if (t - lastSweep > IDLE_MS || t < lastSweep) {
      for (const [k, b] of buckets) if (t - b.windowStart > Math.max(IDLE_MS, opts.windowMs) || t < b.windowStart) buckets.delete(k);
      lastSweep = t;
    }
    const key = opts.key ? opts.key(req) : (req.ip ?? 'unknown');
    let b = buckets.get(key);
    if (!b || t - b.windowStart >= opts.windowMs || t < b.windowStart) {
      b = { count: 0, windowStart: t };
      buckets.set(key, b);
    }
    b.count++;
    if (b.count > opts.max) {
      const left = Math.max(1, Math.ceil((b.windowStart + opts.windowMs - t) / 1000));
      return next(Errors.rateLimited(left));
    }
    next();
  };
}

/** Giỏ + báo giá + kiểm mã: 120 / 60 giây / IP. */
export const cartQuoteLimit = createRateLimit({ name: 'cart-quote', windowMs: 60_000, max: 120 });
/** Đặt hàng: 10 / 10 phút / IP. */
export const orderCreateLimit = createRateLimit({ name: 'order-create', windowMs: 10 * 60_000, max: 10 });
/** Tra cứu đơn khách (codes + verify chung): 10 / 15 phút / IP. */
export const orderLookupLimit = createRateLimit({ name: 'order-lookup', windowMs: 15 * 60_000, max: 10 });
/** Địa giới: cùng mức với catalog (công khai, chỉ đọc). */
export const locationLimit = createRateLimit({ name: 'location', windowMs: 60_000, max: 120 });

const byAdminUser = (req: Request): string => req.auth?.user.user_id ?? req.ip ?? 'unknown';
/** Admin đơn hàng (BR-ADM-41): theo tài khoản; đọc 120 / 60 giây, ghi 60 / 60 giây. Đặt SAU requireAuth. */
export const adminReadLimit = createRateLimit({ name: 'admin-read', windowMs: 60_000, max: 120, key: byAdminUser });
export const adminWriteLimit = createRateLimit({ name: 'admin-write', windowMs: 60_000, max: 60, key: byAdminUser });
export function adminRateLimit(req: Request, res: Response, next: NextFunction): void {
  (req.method === 'GET' || req.method === 'HEAD' ? adminReadLimit : adminWriteLimit)(req, res, next);
}

/** Chỉ cho test. */
export function resetCheckoutRateLimits(): void {
  for (const r of registry) r();
}
