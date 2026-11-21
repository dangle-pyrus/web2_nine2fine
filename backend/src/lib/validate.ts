import type { Request } from 'express';
import { z } from 'zod';
import { OTP_POLICY } from '../config/assumptions';
import { Errors } from './errors';

/** Validate đầu vào Slice 3: trường lạ bị loại, lỗi đầu tiên -> 422 validation kèm `field` (tên trường trong body). */

export const BODY_MSG = 'Dữ liệu gửi lên không hợp lệ.';
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const uuidField = (msg = BODY_MSG) => z.string({ error: msg }).regex(UUID_RE, { error: msg });

/** Mã OTP qua email (mọi luồng): đúng `OTP_POLICY.digits` chữ số; bỏ khoảng trắng / gạch nối khi dán "123 456". */
export const OTP_CODE_MSG = `Nhập đủ ${OTP_POLICY.digits} chữ số của mã xác thực.`;
const OTP_CODE_RE = new RegExp(`^[0-9]{${OTP_POLICY.digits}}$`);
export const otpCodeField = z
  .string({ error: OTP_CODE_MSG })
  .transform((v) => v.replace(/[\s-]/g, ''))
  .refine((v) => OTP_CODE_RE.test(v), { error: OTP_CODE_MSG });

const PHONE_MSG = 'Số điện thoại chưa hợp lệ.';
/** Trim, bỏ khoảng trắng, `+84` -> `0`; di động VN 10 số đầu 03/05/07/08/09 (BR-CHK-04). */
export const normalizePhone = (v: string): string => v.replace(/\s+/g, '').replace(/^\+84/, '0');
export const phoneField = z
  .string({ error: PHONE_MSG })
  .transform(normalizePhone)
  .refine((v) => /^0(3|5|7|8|9)[0-9]{8}$/.test(v), { error: PHONE_MSG });

const EMAIL_MSG = 'Nhập địa chỉ email hợp lệ.';
export const EMAIL_ACCENT_MSG = 'Email không được chứa chữ có dấu hoặc ký tự đặc biệt.';
/**
 * Email chuẩn (chỉ ASCII): phần trước @ gồm chữ, số, . _ % + - (không bắt đầu / kết thúc bằng dấu chấm,
 * không có hai dấu chấm liền nhau); tên miền gồm các nhãn chữ / số / gạch ngang (không bắt đầu / kết thúc
 * bằng gạch ngang, không rỗng nên chặn `a@.gmail.com`), đuôi tối thiểu 2 chữ cái.
 */
export const EMAIL_RE =
  /^(?!\.)(?!.*\.\.)[a-z0-9._%+-]{1,64}(?<!\.)@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
/** Có ký tự ngoài ASCII in được (chữ có dấu, emoji…). */
export const hasNonAscii = (v: string): boolean => /[^!-~]/.test(v);
export const emailField = z
  .string({ error: EMAIL_MSG })
  .transform((v) => v.trim().toLowerCase())
  .refine((v) => !hasNonAscii(v), { error: EMAIL_ACCENT_MSG })
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

/** Như `parseBody` nhưng báo MỌI lỗi theo trường một lần (Slice 8, AC-SET-02): `error.fieldErrors`. Trùng `field` chỉ giữ lỗi đầu. */
export function parseBodyAll<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw Errors.validation(BODY_MSG);
  const r = schema.safeParse(body);
  if (r.success) return r.data;
  const seen = new Set<string>();
  const issues: Array<{ field: string; message: string }> = [];
  for (const i of r.error.issues) {
    const field = fieldOf(i.path) ?? 'body';
    if (seen.has(field)) continue;
    seen.add(field);
    issues.push({ field, message: i.message });
  }
  throw Errors.validationMany(issues);
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
