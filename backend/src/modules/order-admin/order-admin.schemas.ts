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

/* ---------------- Body hành động (lát 4.3, 4.4). Trường lạ bị loại như Slice 3. ---------------- */

const STATUSES = ['to_pay', 'to_ship', 'to_receive', 'completed', 'cancel_requested', 'cancelled'] as const;
const expectedStatus = z.enum(STATUSES, { error: 'Thiếu hoặc sai trạng thái đơn đang hiển thị.' });
const len = (v: string) => [...v].length;

const NOTE_MAX_MSG = 'Ghi chú tối đa 250 ký tự.';
const NOTE_REQ_MSG = 'Ghi chú bắt buộc, từ 5 đến 250 ký tự.';
/** Ghi chú nội bộ tuỳ chọn: trim, rỗng = không có, <= 250. */
const optionalNote = z
  .string({ error: NOTE_MAX_MSG })
  .transform((v) => v.normalize('NFC').trim())
  .refine((v) => len(v) <= 250, { error: NOTE_MAX_MSG })
  .optional()
  .transform((v) => (v ? v : undefined));
const requireNote = (note: string | undefined, ctx: z.RefinementCtx) => {
  if (!note || len(note) < 5) ctx.addIssue({ code: 'custom', path: ['note'], message: NOTE_REQ_MSG });
};

export const expectedStatusSchema = z.object({ expectedStatus });

export const callAttemptSchema = z.object({ expectedStatus, note: optionalNote });

const CARRIER_MSG = 'Đơn vị vận chuyển từ 2 đến 50 ký tự.';
const TRACKING_MSG = 'Mã vận đơn từ 4 đến 40 ký tự, chỉ gồm chữ, số và dấu gạch ngang.';
export const shipSchema = z.object({
  expectedStatus,
  carrier: z
    .string({ error: CARRIER_MSG })
    .transform((v) => v.normalize('NFC').trim().replace(/\s+/g, ' '))
    .refine((v) => len(v) >= 2 && len(v) <= 50, { error: CARRIER_MSG }),
  trackingNumber: z
    .string({ error: TRACKING_MSG })
    .transform((v) => v.trim())
    .refine((v) => /^[A-Za-z0-9-]{4,40}$/.test(v), { error: TRACKING_MSG })
    .transform((v) => v.toUpperCase()),
});

export const cancelSchema = z
  .object({
    expectedStatus,
    reason: z.enum(['unreachable', 'declined_on_call', 'customer_request', 'refused', 'undeliverable', 'other'], { error: 'Lý do huỷ không hợp lệ.' }),
    note: optionalNote,
  })
  .superRefine((v, ctx) => {
    if (v.reason === 'other' || v.reason === 'customer_request') requireNote(v.note, ctx);
  });

export const returnedStockSchema = z
  .object({
    expectedStatus,
    decision: z.enum(['restocked', 'written_off'], { error: 'Cách xử lý hàng hoàn không hợp lệ.' }),
    note: optionalNote,
  })
  .superRefine((v, ctx) => {
    if (v.decision === 'written_off') requireNote(v.note, ctx);
  });

export type CallAttemptBody = z.output<typeof callAttemptSchema>;
export type ShipBody = z.output<typeof shipSchema>;
export type CancelBody = z.output<typeof cancelSchema>;
export type ReturnedStockBody = z.output<typeof returnedStockSchema>;
