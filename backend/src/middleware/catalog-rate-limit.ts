import type { NextFunction, Request, Response } from 'express';
import { Errors } from '../lib/errors';
import { CATALOG_ASSUMPTIONS } from '../config/assumptions';
import { now } from '../lib/clock';

const IDLE_MS = 5 * 60_000;

interface Bucket {
  count: number;
  windowStart: number;
}

/** Bộ đếm cửa sổ cố định theo IP, RAM, mỗi limiter một Map riêng. */
function makeLimiter(max: number, windowMs: number) {
  const buckets = new Map<string, Bucket>();
  let lastSweep = 0;
  return {
    reset(): void {
      buckets.clear();
      lastSweep = 0;
    },
    handler(req: Request, _res: Response, next: NextFunction): void {
      const t = now().getTime();
      if (t - lastSweep > IDLE_MS || t < lastSweep) {
        for (const [k, b] of buckets) if (t - b.windowStart > IDLE_MS || t < b.windowStart) buckets.delete(k);
        lastSweep = t;
      }
      const key = req.ip ?? 'unknown';
      let b = buckets.get(key);
      if (!b || t - b.windowStart >= windowMs || t < b.windowStart) {
        b = { count: 0, windowStart: t };
        buckets.set(key, b);
      }
      b.count++;
      if (b.count > max) {
        const left = Math.min(Math.ceil(windowMs / 1000), Math.max(1, Math.ceil((b.windowStart + windowMs - t) / 1000)));
        return next(Errors.rateLimited(left));
      }
      next();
    },
  };
}

const catalog = makeLimiter(120, 60_000);
const media = makeLimiter(CATALOG_ASSUMPTIONS.mediaRateLimit.max, CATALOG_ASSUMPTIONS.mediaRateLimit.windowMs);

/** Chỉ cho test. */
export function resetCatalogRateLimit(): void {
  catalog.reset();
  media.reset();
}

/** BR-CAT-19: 120 yêu cầu / 60 giây / IP, cửa sổ cố định, bộ đếm RAM riêng khỏi auth. */
export const catalogRateLimit = catalog.handler;

/** GET /api/media: bộ đếm riêng, ngưỡng cao hơn (CATALOG_ASSUMPTIONS.mediaRateLimit). */
export const mediaRateLimit = media.handler;
