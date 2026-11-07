import { z } from 'zod';
import { now } from '../../lib/clock';
import { Errors } from '../../lib/errors';

/** Chuẩn hoá + validate đầu vào theo docs/api/openapi.yaml (locked). Trường lạ trong body bị bỏ. */

const MSG = {
  email: 'Nhập địa chỉ email hợp lệ.',
  code: 'Nhập đủ 8 chữ số của mã xác thực.',
  firstName: 'Nhập tên của bạn.',
  firstNameInvalid: 'Tên chưa hợp lệ.',
  lastName: 'Nhập họ của bạn.',
  lastNameInvalid: 'Họ chưa hợp lệ.',
  birthDate: 'Ngày sinh chưa hợp lệ.',
  terms: 'Bạn cần đồng ý để tạo tài khoản.',
  newPassword: 'Mật khẩu chưa đạt yêu cầu.',
  password: 'Nhập mật khẩu.',
  purpose: 'Mục đích không hợp lệ.',
  body: 'Dữ liệu gửi lên không hợp lệ.',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} '-]*$/u;
const codePoints = (s: string) => [...s].length;

export const normalizeEmail = (v: string): string => v.trim().toLowerCase();

const emailField = z
  .string({ error: MSG.email })
  .transform(normalizeEmail)
  .refine((v) => v.length >= 6 && v.length <= 254 && EMAIL_RE.test(v), { error: MSG.email });

const codeField = z
  .string({ error: MSG.code })
  .transform((v) => v.replace(/[\s-]/g, ''))
  .refine((v) => /^[0-9]{8}$/.test(v), { error: MSG.code });

const nameField = (required: string, invalid: string) =>
  z
    .string({ error: required })
    .transform((v) => v.normalize('NFC').trim().replace(/\s+/g, ' '))
    .refine((v) => v.length > 0, { error: required })
    .refine((v) => codePoints(v) <= 50 && NAME_RE.test(v), { error: invalid });

export const NEW_PASSWORD_MIN = 8;
export const NEW_PASSWORD_MAX = 64;

/** Ngày hiện tại theo giờ Việt Nam (UTC+7), dạng [năm, tháng, ngày]. */
export function vnToday(d: Date = now()): [number, number, number] {
  const vn = new Date(d.getTime() + 7 * 3600 * 1000);
  return [vn.getUTCFullYear(), vn.getUTCMonth() + 1, vn.getUTCDate()];
}

type Ymd = [number, number, number];
const cmp = (a: Ymd, b: Ymd): number => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

export function parseRealDate(v: string): Ymd | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return [y, mo, d];
}

/** Đủ 13 tuổi tính theo ngày giờ VN: đúng sinh nhật 13 là đủ. */
export function isAtLeast13(birth: Ymd, today: Ymd = vnToday()): boolean {
  return cmp(birth, [today[0] - 13, today[1], today[2]]) <= 0;
}

const birthDateField = z
  .union([z.null(), z.string()], { error: MSG.birthDate })
  .optional()
  .transform((v) => v ?? null)
  .refine(
    (v) => {
      if (v === null) return true;
      const ymd = parseRealDate(v);
      if (!ymd) return false;
      return cmp(ymd, [1900, 1, 1]) >= 0 && cmp(ymd, vnToday()) < 0;
    },
    { error: MSG.birthDate },
  );

const newPasswordField = z
  .string({ error: MSG.newPassword })
  .refine((v) => codePoints(v) >= NEW_PASSWORD_MIN && codePoints(v) <= NEW_PASSWORD_MAX, { error: MSG.newPassword })
  .refine((v) => /[A-Z]/.test(v) && /[0-9]/.test(v), { error: MSG.newPassword });

const loginPasswordField = z
  .string({ error: MSG.password })
  .refine((v) => v.length >= 1 && v.length <= 128, { error: MSG.password });

const lookupSchema = z.object({ email: emailField });
const codesSchema = z.object({
  email: emailField,
  purpose: z.enum(['login', 'register', 'reset-password'], { error: MSG.purpose }),
});
const loginCodeSchema = z.object({ email: emailField, code: codeField });
const loginPasswordSchema = z.object({ email: emailField, password: loginPasswordField });
const registerSchema = z.object({
  email: emailField,
  code: codeField,
  firstName: nameField(MSG.firstName, MSG.firstNameInvalid),
  lastName: nameField(MSG.lastName, MSG.lastNameInvalid),
  birthDate: birthDateField,
  marketingOptIn: z.boolean({ error: 'Lựa chọn nhận email chưa hợp lệ.' }).default(false),
  acceptedTerms: z.literal(true, { error: MSG.terms }),
});
const resetSchema = z.object({ email: emailField, code: codeField, newPassword: newPasswordField });

function parse<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw Errors.validation(MSG.body);
  const r = schema.safeParse(body);
  if (r.success) return r.data;
  const issue = r.error.issues[0];
  const field = issue.path[0] === undefined ? undefined : String(issue.path[0]);
  throw Errors.validation(issue.message, field);
}

export const parseLookup = (b: unknown) => parse(lookupSchema, b);
export const parseCodes = (b: unknown) => parse(codesSchema, b);
export const parseLoginCode = (b: unknown) => parse(loginCodeSchema, b);
export const parseLoginPassword = (b: unknown) => parse(loginPasswordSchema, b);
export const parseRegister = (b: unknown) => {
  const data = parse(registerSchema, b);
  if (data.birthDate !== null && !isAtLeast13(parseRealDate(data.birthDate)!)) throw Errors.underage();
  return data;
};
export const parseReset = (b: unknown) => {
  const data = parse(resetSchema, b);
  // BR-AUTH-20: không được trùng email (không phân biệt hoa thường). Kiểm trước khi tiêu mã.
  if (data.newPassword.toLowerCase() === data.email) throw Errors.validation(MSG.newPassword, 'newPassword');
  return data;
};

