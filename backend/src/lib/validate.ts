import type { Request } from 'express';
import { z } from 'zod';
import { Errors } from './errors';

/** Validate đầu vào Slice 3: trường lạ bị loại, lỗi đầu tiên -> 422 validation kèm `field` (tên trường trong body). */

export const BODY_MSG = 'Dữ liệu gửi lên không hợp lệ.';
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const uuidField = (msg = BODY_MSG) => z.string({ error: msg }).regex(UUID_RE, { error: msg });

const PHONE_MSG = 'Số điện thoại chưa hợp lệ.';
/** Trim, bỏ khoảng trắng, `+84` -> `0`; di động VN 10 số đầu 03/05/07/08/09 (BR-CHK-04). */
export const normalizePhone = (v: string): string => v.replace(/\s+/g, '').replace(/^\+84/, '0');
export const phoneField = z
  .string({ error: PHONE_MSG })
  .transform(normalizePhone)
  .refine((v) => /^0(3|5|7|8|9)[0-9]{8}$/.test(v), { error: PHONE_MSG });

const EMAIL_MSG = 'Nhập địa chỉ email hợp lệ.';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const emailField = z
  .string({ error: EMAIL_MSG })
  .transform((v) => v.trim().toLowerCase())
  .refine((v) => v.length >= 6 && v.length <= 100 && EMAIL_RE.test(v), { error: EMAIL_MSG });

/** `items` -> "items"; còn lại nối đường dẫn bỏ chỉ số mảng (vd. `contact.phone`). */
export function fieldOf(path: ReadonlyArray<PropertyKey>): string | undefined {
  if (path.length === 0) return undefined;
  if (path[0] === 'items' || path[0] === 'lines' || path[0] === 'voucherCodes' || path[0] === 'expected') {
    return String(path[0]);
  }
  const parts = path.filter((p) => typeof p !== 'number').map(String);
  return parts.join('.') || undefined;
}

export function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw Errors.validation(BODY_MSG);
  const r = schema.safeParse(body);
  if (r.success) return r.data;
  const issue = r.error.issues[0];
  throw Errors.validation(issue.message, fieldOf(issue.path));
}

/** Body tuỳ chọn (vd. huỷ đơn): rỗng / không có -> {}. */
export function parseOptionalBody<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  return parseBody(schema, body === undefined || body === null ? {} : body);
}

const KEY_RE = /^[A-Za-z0-9-]{16,64}$/;
/** `Idempotency-Key` bắt buộc, 16-64 ký tự `A-Za-z0-9-` (BR-CHK-15). */
export function parseIdempotencyKey(req: Request): string {
  const v = req.get('idempotency-key');
  if (!v || !KEY_RE.test(v)) throw Errors.validation('Thiếu hoặc sai Idempotency-Key.', 'Idempotency-Key');
  return v;
}
