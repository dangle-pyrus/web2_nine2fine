import { z } from 'zod';
import { USERS_ASSUMPTIONS } from '../../config/assumptions';
import { Errors } from '../../lib/errors';
import { cleanText } from '../../lib/text';
import { parseOptionalBody } from '../../lib/validate';
import { requiredIdempotencyKey } from '../catalog-admin/inventory-promotion.schemas';

const { reason: REASON, name: NAME, listLimit, q: Q } = USERS_ASSUMPTIONS;
const blankToUndef = (v: unknown) => (v === '' ? undefined : v);
const len = (v: string) => [...v].length;

const Q_MSG = `Từ khoá tìm kiếm tối đa ${Q.max} ký tự.`;
const LIMIT_MSG = `Số dòng mỗi trang phải từ 1 đến ${listLimit.max}.`;
const PAGE_MSG = 'Trang không hợp lệ.';
const page = z.preprocess(blankToUndef, z.coerce.number({ error: PAGE_MSG }).int({ error: PAGE_MSG }).min(1, { error: PAGE_MSG }).default(1));
const limit = z.preprocess(
  blankToUndef,
  z.coerce.number({ error: LIMIT_MSG }).int({ error: LIMIT_MSG }).min(1, { error: LIMIT_MSG }).max(listLimit.max, { error: LIMIT_MSG }).default(listLimit.default),
);

export const CUSTOMER_SORTS = ['lastOrderAt', 'totalSpent', 'orderCount', 'name'] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];
export type CustomerTier = 'bronze' | 'silver' | 'gold';

export const customerListQuerySchema = z.object({
  q: z
    .string({ error: Q_MSG })
    .transform((v) => v.normalize('NFC').trim())
    .refine((v) => len(v) <= Q.max, { error: Q_MSG })
    .optional()
    .transform((v) => (v ? v : undefined)),
  view: z.preprocess(blankToUndef, z.enum(['all', 'blocked'], { error: 'Tab không hợp lệ.' }).default('all')),
  tier: z.preprocess(blankToUndef, z.enum(['bronze', 'silver', 'gold'], { error: 'Hạng không hợp lệ.' }).optional()),
  sort: z.preprocess(blankToUndef, z.enum(CUSTOMER_SORTS, { error: 'Cách sắp xếp không hợp lệ.' }).default('lastOrderAt')),
  page,
  limit,
});

export const customerOrdersQuerySchema = z.object({ page, limit });

const REASON_MSG = `Lý do bắt buộc, từ ${REASON.min} đến ${REASON.max} ký tự.`;
const REASON_OPT_MSG = `Lý do tối đa ${REASON.max} ký tự.`;

export const lockSchema = z.object({
  reason: z
    .string({ error: REASON_MSG })
    .transform(cleanText)
    .refine((v) => len(v) >= REASON.min && len(v) <= REASON.max, { error: REASON_MSG }),
});

const optionalReason = z
  .string({ error: REASON_OPT_MSG })
  .transform(cleanText)
  .refine((v) => len(v) <= REASON.max, { error: REASON_OPT_MSG })
  .optional()
  .transform((v) => v ?? '');

export const unlockSchema = z.object({ reason: optionalReason });

const ROLE_MSG = 'Vai trò phải là staff hoặc admin.';
export const roleSchema = z.object({
  role: z.enum(['staff', 'admin'], { error: ROLE_MSG }),
  reason: optionalReason,
});

const NAME_MSG = `Họ tên từ ${NAME.min} đến ${NAME.max} ký tự.`;
const EMAIL_MSG = 'Nhập địa chỉ email hợp lệ.';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const staffCreateSchema = z.object({
  name: z
    .string({ error: NAME_MSG })
    .transform(cleanText)
    .refine((v) => len(v) >= NAME.min && len(v) <= NAME.max, { error: NAME_MSG }),
  email: z
    .string({ error: EMAIL_MSG })
    .transform((v) => v.trim().toLowerCase())
    .refine((v) => v.length >= 6 && v.length <= 254 && EMAIL_RE.test(v), { error: EMAIL_MSG }),
  role: z.enum(['staff', 'admin'], { error: ROLE_MSG }),
});

/** Zod -> 422 `validation` kèm `field` là khoá cấp 1; thân rỗng / thiếu coi là `{}` (để lỗi trỏ đúng trường). */
export function parseInput<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  if (body !== undefined && body !== null && (typeof body !== 'object' || Array.isArray(body))) {
    throw Errors.validation('Dữ liệu gửi lên không hợp lệ.');
  }
  return parseOptionalBody(schema, body);
}

const KEY_RE = /^[A-Za-z0-9-]{16,64}$/;
/** `Idempotency-Key` tuỳ chọn; có mà sai dạng -> 422. */
export function optionalKey(v: string | undefined): string | undefined {
  if (v === undefined) return undefined;
  if (!KEY_RE.test(v)) throw Errors.validation('Idempotency-Key sai dạng.', 'Idempotency-Key');
  return v;
}
export const requiredKey = requiredIdempotencyKey;
