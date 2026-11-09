import { z } from 'zod';
import { Errors } from '../../lib/errors';
import { BODY_MSG, phoneField } from '../../lib/validate';
import { isAtLeast13, NEW_PASSWORD_MAX, NEW_PASSWORD_MIN, parseRealDate, vnToday } from '../auth/auth.schemas';

/** Đầu vào `/account/**` (PRD Slice 5 BR-ACC-04, 05, 09). Trường lạ bị bỏ. */

const MSG = {
  birthDate: 'Ngày sinh chưa hợp lệ.',
  phone: 'Số điện thoại chưa hợp lệ.',
  newPassword: 'Mật khẩu chưa đạt yêu cầu.',
  samePassword: 'Mật khẩu mới phải khác mật khẩu hiện tại.',
  currentPassword: 'Nhập mật khẩu hiện tại.',
  recipient: 'Nhập họ tên người nhận (tối đa 100 ký tự).',
  street: 'Số nhà, tên đường cần 5–200 ký tự.',
  address: 'Địa chỉ chưa hợp lệ.',
};

const codePoints = (s: string) => [...s].length;
type Ymd = [number, number, number];
const cmp = (a: Ymd, b: Ymd) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

const nullable = <T extends z.ZodTypeAny>(schema: T) => z.union([z.null(), schema]);

const profileSchema = z.object({
  birthDate: nullable(z.string({ error: MSG.birthDate })).optional(),
  phone: nullable(phoneField).optional(),
});

export interface ProfilePatch {
  birthDate?: string | null;
  phone?: string | null;
}

function firstIssue(r: z.ZodSafeParseError<unknown>): never {
  const issue = r.error.issues[0];
  const field = issue.path[0] === undefined ? undefined : String(issue.path[0]);
  const message = field === 'phone' ? MSG.phone : field === 'birthDate' ? MSG.birthDate : issue.message;
  throw Errors.validation(message, field);
}

function asObject(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw Errors.validation(BODY_MSG);
  return body as Record<string, unknown>;
}

/** BR-ACC-04: chỉ `birthDate`, `phone`; không có trường nào -> 422; chưa đủ 13 tuổi -> `underage`. */
export function parseProfilePatch(body: unknown): ProfilePatch {
  const raw = asObject(body);
  const r = profileSchema.safeParse(raw);
  if (!r.success) firstIssue(r);
  const out: ProfilePatch = {};
  if ('birthDate' in raw) out.birthDate = r.data.birthDate ?? null;
  if ('phone' in raw) out.phone = r.data.phone ?? null;
  if (!('birthDate' in out) && !('phone' in out)) throw Errors.validation('Không có thông tin nào để cập nhật.');
  if (out.birthDate) {
    const ymd = parseRealDate(out.birthDate);
    if (!ymd || cmp(ymd, [1900, 1, 1]) < 0 || cmp(ymd, vnToday()) >= 0) throw Errors.validation(MSG.birthDate, 'birthDate');
    if (!isAtLeast13(ymd)) throw Errors.underage();
  }
  return out;
}

const passwordSchema = z.object({
  currentPassword: nullable(z.string({ error: MSG.currentPassword }).max(128, { error: MSG.currentPassword })).optional(),
  newPassword: z
    .string({ error: MSG.newPassword })
    .refine((v) => codePoints(v) >= NEW_PASSWORD_MIN && codePoints(v) <= NEW_PASSWORD_MAX, { error: MSG.newPassword })
    .refine((v) => /[A-Z]/.test(v) && /[0-9]/.test(v), { error: MSG.newPassword }),
});

export interface PasswordInput {
  currentPassword: string | null;
  newPassword: string;
}

export function parsePassword(body: unknown): PasswordInput {
  const r = passwordSchema.safeParse(asObject(body));
  if (!r.success) {
    const issue = r.error.issues[0];
    throw Errors.validation(issue.message, issue.path[0] === undefined ? undefined : String(issue.path[0]));
  }
  const current = r.data.currentPassword;
  return { currentPassword: current === undefined || current === null || current === '' ? null : current, newPassword: r.data.newPassword };
}

export const PASSWORD_MSG = MSG;

const addressSchema = z.object({
  recipient: z
    .string({ error: MSG.recipient })
    .transform((v) => v.normalize('NFC').trim().replace(/\s+/g, ' '))
    .refine((v) => codePoints(v) >= 1 && codePoints(v) <= 100, { error: MSG.recipient }),
  phone: phoneField,
  provinceCode: z.string({ error: MSG.address }).min(1, { error: MSG.address }).max(10, { error: MSG.address }),
  wardCode: z.string({ error: MSG.address }).min(1, { error: MSG.address }).max(10, { error: MSG.address }),
  street: z
    .string({ error: MSG.street })
    .transform((v) => v.normalize('NFC').trim().replace(/\s+/g, ' '))
    .refine((v) => codePoints(v) >= 5 && codePoints(v) <= 200, { error: MSG.street }),
  isDefault: z.boolean({ error: MSG.address }).optional().default(false),
});

export type AddressBody = z.output<typeof addressSchema>;

export function parseAddress(body: unknown): AddressBody {
  const r = addressSchema.safeParse(asObject(body));
  if (!r.success) {
    const issue = r.error.issues[0];
    throw Errors.validation(issue.message, issue.path[0] === undefined ? undefined : String(issue.path[0]));
  }
  return r.data;
}
