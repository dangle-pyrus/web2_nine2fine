import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { ASSUMPTIONS } from '../../config/assumptions';
import { addMs } from '../../lib/clock';
import { Errors } from '../../lib/errors';
import type { Db } from '../../lib/sql';
import { ts } from '../../lib/sql';

/** Idempotency-Key (BR-CHK-15, plan mục 4.4 bước 1). Khoá chỉ tồn tại khi giao dịch commit, nên lỗi 4xx/5xx không "đốt" khoá. */

export type IdempotencyScope = 'order-create' | 'cart-merge';

/** JSON chuẩn hoá (khoá đối tượng được sắp) để băm ổn định. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export const requestHash = (body: unknown, userId: string | undefined): string =>
  createHash('sha256').update(`${canonicalJson(body)}|${userId ?? 'guest'}`).digest('hex');

export type Acquired =
  | { kind: 'new' }
  | { kind: 'replay'; orderId: string | null; snapshot: unknown };

/**
 * Trong giao dịch `tx`: giành khoá. Hai yêu cầu cùng khoá đồng thời: yêu cầu sau chờ chỉ mục duy nhất tới khi yêu cầu
 * trước commit (-> phát lại) hoặc rollback (-> xử lý như mới).
 */
export async function acquireIdempotency(
  tx: Db,
  scope: IdempotencyScope,
  key: string,
  hash: string,
  at: Date,
): Promise<Acquired> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const inserted = await tx.$queryRaw<Array<{ x: number }>>(Prisma.sql`
      INSERT INTO "idempotency_keys" ("scope", "key", "request_hash", "created_at", "expires_at")
      VALUES (${scope}, ${key}, ${hash}, ${ts(at)}, ${ts(addMs(at, ASSUMPTIONS.idempotencyTtlMs))})
      ON CONFLICT ("scope", "key") DO UPDATE SET
        "request_hash" = EXCLUDED."request_hash", "order_id" = NULL, "response_snapshot" = NULL,
        "created_at" = EXCLUDED."created_at", "expires_at" = EXCLUDED."expires_at"
      WHERE "idempotency_keys"."expires_at" <= ${ts(at)}
      RETURNING 1 AS x`);
    if (inserted.length > 0) return { kind: 'new' };

    const rows = await tx.$queryRaw<Array<{ request_hash: string; order_id: string | null; response_snapshot: unknown }>>(
      Prisma.sql`SELECT "request_hash", "order_id", "response_snapshot" FROM "idempotency_keys"
                 WHERE "scope" = ${scope} AND "key" = ${key}`,
    );
    const row = rows[0];
    if (!row) continue; // bị dọn giữa hai câu lệnh: thử lại
    if (row.request_hash !== hash) throw Errors.idempotencyConflict();
    if (row.order_id === null && row.response_snapshot === null) return { kind: 'new' };
    return { kind: 'replay', orderId: row.order_id, snapshot: row.response_snapshot };
  }
  throw Errors.unavailable();
}

export async function completeIdempotency(
  tx: Db,
  scope: IdempotencyScope,
  key: string,
  result: { orderId?: string; snapshot?: unknown },
): Promise<void> {
  await tx.$executeRaw(Prisma.sql`
    UPDATE "idempotency_keys"
    SET "order_id" = ${result.orderId ?? null}::uuid,
        "response_snapshot" = ${result.snapshot === undefined ? null : JSON.stringify(result.snapshot)}::jsonb
    WHERE "scope" = ${scope} AND "key" = ${key}`);
}
