import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { addMs, now, secondsUntil } from '../../lib/clock';

/**
 * Bộ đếm giới hạn tần suất và khoá, lưu trong bảng auth_rate_limits (dùng được khi nhiều instance / khởi động lại).
 * Mọi thay đổi bộ đếm dùng một câu upsert nguyên tử. Thời điểm luôn truyền từ `now()` của ứng dụng
 * (không dùng now() của CSDL) để test dùng được đồng hồ giả; ép về UTC bằng AT TIME ZONE 'UTC'.
 */

const ts = (d: Date) => Prisma.sql`(${d}::timestamptz AT TIME ZONE 'UTC')`;
const secs = (ms: number) => Prisma.sql`make_interval(secs => ${ms / 1000}::double precision)`;

export interface WindowResult {
  allowed: boolean;
  count: number;
  retryAfterSeconds: number;
}

/** Cửa sổ cố định: tăng bộ đếm; allowed = count <= limit. */
export async function hitWindow(key: string, limit: number, windowMs: number): Promise<WindowResult> {
  const t = now();
  const rows = await prisma.$queryRaw<Array<{ count: number; window_start: Date }>>`
    INSERT INTO "auth_rate_limits" ("key", "count", "window_start")
    VALUES (${key}, 1, ${ts(t)})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "auth_rate_limits"."window_start" + ${secs(windowMs)} <= ${ts(t)}
                     THEN 1 ELSE "auth_rate_limits"."count" + 1 END,
      "window_start" = CASE WHEN "auth_rate_limits"."window_start" + ${secs(windowMs)} <= ${ts(t)}
                            THEN ${ts(t)} ELSE "auth_rate_limits"."window_start" END
    RETURNING "count", "window_start"`;
  const row = rows[0];
  const count = Number(row.count);
  const end = addMs(row.window_start, windowMs);
  return { allowed: count <= limit, count, retryAfterSeconds: secondsUntil(end, t) };
}

/** Số lần đã ghi trong cửa sổ hiện tại (không tăng). */
export async function peekWindow(key: string, windowMs: number): Promise<WindowResult & { count: number }> {
  const t = now();
  const row = await prisma.authRateLimit.findUnique({ where: { key } });
  if (!row || addMs(row.windowStart, windowMs) <= t) return { allowed: true, count: 0, retryAfterSeconds: 1 };
  return { allowed: true, count: row.count, retryAfterSeconds: secondsUntil(addMs(row.windowStart, windowMs), t) };
}

export type RateRow = { key: string; count: number; windowStart: Date; lockedUntil: Date | null };

/** Đọc nhiều bộ đếm bằng 1 truy vấn. */
export async function getStates(names: string[]): Promise<Map<string, RateRow>> {
  const rows = await prisma.authRateLimit.findMany({ where: { key: { in: names } } });
  return new Map(rows.map((r) => [r.key, r]));
}

/** Số lần trong cửa sổ cố định của một hàng đã đọc (0 nếu hết cửa sổ) + số giây còn lại. */
export function windowOf(
  row: RateRow | undefined,
  windowMs: number,
  t: Date = now(),
): { count: number; retryAfterSeconds: number } {
  if (!row || addMs(row.windowStart, windowMs) <= t) return { count: 0, retryAfterSeconds: 1 };
  return { count: row.count, retryAfterSeconds: secondsUntil(addMs(row.windowStart, windowMs), t) };
}

/** Số giây khoá còn lại của một hàng đã đọc (0 nếu không khoá). */
export function lockOf(row: RateRow | undefined, t: Date = now()): number {
  return row?.lockedUntil && row.lockedUntil > t ? secondsUntil(row.lockedUntil, t) : 0;
}

export interface FailureResult {
  count: number;
  lockedUntil: Date | null;
}

/**
 * Ghi một lần thất bại. Đếm liên tiếp: nếu lần trước cách quá `gapMs` thì đếm lại từ 1.
 * Đủ `max` lần -> đặt khoá `lockMs`.
 */
export async function recordFailure(
  key: string,
  opts: { max: number; gapMs: number; lockMs: number },
): Promise<FailureResult> {
  const t = now();
  const lockTo = addMs(t, opts.lockMs);
  const rows = await prisma.$queryRaw<Array<{ count: number; locked_until: Date | null }>>`
    INSERT INTO "auth_rate_limits" ("key", "count", "window_start", "locked_until")
    VALUES (${key}, 1, ${ts(t)}, ${opts.max <= 1 ? ts(lockTo) : Prisma.sql`NULL`})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "auth_rate_limits"."window_start" + ${secs(opts.gapMs)} <= ${ts(t)}
                     THEN 1 ELSE "auth_rate_limits"."count" + 1 END,
      "locked_until" = CASE WHEN (CASE WHEN "auth_rate_limits"."window_start" + ${secs(opts.gapMs)} <= ${ts(t)}
                                       THEN 1 ELSE "auth_rate_limits"."count" + 1 END) >= ${opts.max}::int
                            THEN ${ts(lockTo)} ELSE NULL END,
      "window_start" = ${ts(t)}
    RETURNING "count", "locked_until"`;
  const row = rows[0];
  return { count: Number(row.count), lockedUntil: row.locked_until };
}

/** Số giây còn lại của khoá, 0 nếu không khoá. */
export async function getLockSeconds(key: string): Promise<number> {
  const t = now();
  const row = await prisma.authRateLimit.findUnique({ where: { key } });
  if (!row?.lockedUntil || row.lockedUntil <= t) return 0;
  return secondsUntil(row.lockedUntil, t);
}

export async function setLock(key: string, until: Date): Promise<void> {
  const t = now();
  await prisma.authRateLimit.upsert({
    where: { key },
    create: { key, count: 0, windowStart: t, lockedUntil: until },
    update: { lockedUntil: until },
  });
}

export async function clearKeys(keys: string[]): Promise<void> {
  if (keys.length) await prisma.authRateLimit.deleteMany({ where: { key: { in: keys } } });
}

/** Dọn bộ đếm đã hết hiệu lực (chạy định kỳ). Không đụng bảng token / phiên. */
export async function purgeStaleBuckets(olderThanMs: number): Promise<number> {
  const cutoff = addMs(now(), -olderThanMs);
  const r = await prisma.authRateLimit.deleteMany({
    where: { windowStart: { lt: cutoff }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: cutoff } }] },
  });
  return r.count;
}

// Tên khoá tập trung để tránh gõ sai ở nơi khác.
export const keys = {
  lookupIp: (ip: string) => `lookup:ip:${ip}`,
  lookupEmail: (email: string) => `lookup:email:${email}`,
  codeSendCooldown: (email: string, purpose: string) => `codesend:cooldown:${email}:${purpose}`,
  codeSendEmail: (email: string, purpose: string) => `codesend:email:${email}:${purpose}`,
  codeSendIp: (ip: string) => `codesend:ip:${ip}`,
  codeVerify: (email: string, purpose: string) => `codeverify:${email}:${purpose}`,
  codeLock: (email: string) => `codelock:${email}`,
  codeVerifyFailIp: (ip: string) => `codeverify:fail:ip:${ip}`,
  pwFail: (email: string) => `pwfail:${email}`,
  pwFailIp: (ip: string) => `pwfail:ip:${ip}`,
  pwChangeFail: (userId: string) => `pwchange:${userId}`,
};
