import type { NextFunction, Request, Response } from 'express';
import { Errors } from '../lib/errors';
import { now } from '../lib/clock';

const WINDOW_MS = 60_000;
const MAX = 120;
const IDLE_MS = 5 * 60_000;

interface Bucket {
  count: number;
  windowStart: number;
}
const buckets = new Map<string, Bucket>();
let lastSweep = 0;

/** Chỉ cho test. */
export function resetCatalogRateLimit(): void {
  buckets.clear();
  lastSweep = 0;
}

/** BR-CAT-19: 120 yêu cầu / 60 giây / IP, cửa sổ cố định, bộ đếm RAM riêng khỏi auth. */
export function catalogRateLimit(req: Request, _res: Response, next: NextFunction): void {
  const t = now().getTime();
  if (t - lastSweep > IDLE_MS || t < lastSweep) {
    for (const [k, b] of buckets) if (t - b.windowStart > IDLE_MS || t < b.windowStart) buckets.delete(k);
    lastSweep = t;
  }
  const key = req.ip ?? 'unknown';
  let b = buckets.get(key);
  if (!b || t - b.windowStart >= WINDOW_MS || t < b.windowStart) {
    b = { count: 0, windowStart: t };
    buckets.set(key, b);
  }
  b.count++;
  if (b.count > MAX) {
    const left = Math.min(60, Math.max(1, Math.ceil((b.windowStart + WINDOW_MS - t) / 1000)));
    return next(Errors.rateLimited(left));
  }
  next();
}
