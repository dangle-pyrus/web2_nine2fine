import { z } from 'zod';

const TABS = ['all', 'pending-payment', 'to-confirm', 'to-fulfil', 'in-transit', 'cancel-requests', 'returning', 'completed', 'cancelled'] as const;
export type AdminTab = (typeof TABS)[number];
export type AdminBucket = Exclude<AdminTab, 'all'>;

const blankToUndef = (v: unknown) => (v === '' ? undefined : v);

const isRealDate = (s: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
const dateField = (msg: string) => z.preprocess(blankToUndef, z.string({ error: msg }).refine(isRealDate, { error: msg }).optional());

const Q_MSG = 'Từ khoá tìm kiếm tối đa 100 ký tự.';
const filterShape = {
  q: z
    .string({ error: Q_MSG })
    .transform((v) => v.normalize('NFC').trim())
    .refine((v) => [...v].length <= 100, { error: Q_MSG })
    .optional()
    .transform((v) => (v ? v : undefined)),
  payment: z.preprocess(blankToUndef, z.enum(['cod', 'bank-transfer'], { error: 'Phương thức thanh toán không hợp lệ.' }).optional()),
  from: dateField('Ngày bắt đầu không hợp lệ (YYYY-MM-DD).'),
  to: dateField('Ngày kết thúc không hợp lệ (YYYY-MM-DD).'),
};

const fromBeforeTo = (v: { from?: string; to?: string }, ctx: z.RefinementCtx) => {
  if (v.from && v.to && v.from > v.to) ctx.addIssue({ code: 'custom', path: ['from'], message: 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.' });
};

export const countsQuerySchema = z.object(filterShape).superRefine(fromBeforeTo);

const LIMIT_MSG = 'Số đơn mỗi trang phải từ 1 đến 50.';
export const listQuerySchema = z
  .object({
    ...filterShape,
    view: z.preprocess(blankToUndef, z.enum(TABS, { error: 'Tab không hợp lệ.' }).default('all')),
    page: z.preprocess(
      blankToUndef,
      z.coerce.number({ error: 'Trang không hợp lệ.' }).int({ error: 'Trang không hợp lệ.' }).min(1, { error: 'Trang không hợp lệ.' }).default(1),
    ),
    limit: z.preprocess(
      blankToUndef,
      z.coerce.number({ error: LIMIT_MSG }).int({ error: LIMIT_MSG }).min(1, { error: LIMIT_MSG }).max(50, { error: LIMIT_MSG }).default(20),
    ),
  })
  .superRefine(fromBeforeTo);

export type OrderFilter = { q?: string; payment?: 'cod' | 'bank-transfer'; from?: string; to?: string };
