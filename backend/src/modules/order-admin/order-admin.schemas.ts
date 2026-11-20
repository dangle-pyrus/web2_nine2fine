import { z } from 'zod';
import { now } from '../../lib/clock';
import { addCalendarDays, vnDateISO } from '../../lib/vn-time';

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

/** ADM-ORD-01: sắp xếp theo ngày đặt / tổng tiền / mã đơn, tăng hoặc giảm; mặc định ngày đặt mới nhất trước. */
export const SORTS = ['placed-desc', 'placed-asc', 'total-desc', 'total-asc', 'code-desc', 'code-asc'] as const;
export type AdminOrderSort = (typeof SORTS)[number];
const sortField = z.preprocess(blankToUndef, z.enum(SORTS, { error: 'Cách sắp xếp không hợp lệ.' }).default('placed-desc'));

const CODES_MSG = 'Danh sách mã đơn không hợp lệ.';
/** ADM-ORD-18: xuất CSV theo phạm vi: `codes` (trang hiện tại / đơn đã chọn) hoặc toàn bộ đơn khớp bộ lọc (không gửi `codes`). */
export const exportQuerySchema = z
  .object({
    ...filterShape,
    view: z.preprocess(blankToUndef, z.enum(TABS, { error: 'Tab không hợp lệ.' }).default('all')),
    sort: sortField,
    codes: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() ? v.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) : undefined),
      z.array(z.string().regex(/^[A-Z0-9]{4,20}$/, { error: CODES_MSG }), { error: CODES_MSG }).max(200, { error: CODES_MSG }).optional(),
    ),
  })
  .superRefine(fromBeforeTo);
export const listQuerySchema = z
  .object({
    ...filterShape,
    view: z.preprocess(blankToUndef, z.enum(TABS, { error: 'Tab không hợp lệ.' }).default('all')),
    sort: sortField,
    page: z.preprocess(
      blankToUndef,
      z.coerce.number({ error: 'Trang không hợp lệ.' }).int({ error: 'Trang không hợp lệ.' }).min(1, { error: 'Trang không hợp lệ.' }).default(1),
    ),
    limit: z.preprocess(
      blankToUndef,
      z.coerce.number({ error: LIMIT_MSG }).int({ error: LIMIT_MSG }).min(1, { error: LIMIT_MSG }).max(50, { error: LIMIT_MSG }).default(20),
    ),
    /** DASH-05 (2026-11-20): `late=1` chỉ đơn `to_receive` quá ngày giao dự kiến muộn nhất (`estimated_to` < hôm nay VN). */
    late: z.preprocess(blankToUndef, z.enum(['1', 'true', '0', 'false'], { error: 'Tham số late không hợp lệ.' }).optional()).transform((v) => v === '1' || v === 'true'),
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

const REFUND_REF_MSG = 'Nhập mã giao dịch hoàn tiền (3–60 ký tự).';
/** COMMON-02.4: admin ghi nhận đã hoàn tiền đơn huỷ; mã giao dịch bắt buộc (đối soát). */
export const confirmRefundSchema = z.object({
  expectedStatus,
  reference: z
    .string({ error: REFUND_REF_MSG })
    .transform((v) => v.normalize('NFC').trim())
    .refine((v) => [...v].length >= 3 && [...v].length <= 60, { error: REFUND_REF_MSG }),
  note: optionalNote,
});

const INTERNAL_NOTE_MSG = 'Ghi chú nội bộ từ 1 đến 500 ký tự.';
/** BR-ADM-38: không có `expectedStatus` (ghi chú hợp lệ ở mọi trạng thái); trim, 1-500 ký tự. */
export const noteSchema = z.object({
  note: z
    .string({ error: INTERNAL_NOTE_MSG })
    .transform((v) => v.normalize('NFC').trim())
    .refine((v) => len(v) >= 1 && len(v) <= 500, { error: INTERNAL_NOTE_MSG }),
});

export const callAttemptSchema = z.object({ expectedStatus, note: optionalNote });

const ETA_MSG = 'Ngày giao dự kiến phải từ hôm nay đến 60 ngày tới.';
/** `YYYY-MM-DD` có thật, trong [hôm nay VN, hôm nay VN + 60 ngày]. */
function validEta(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return false;
  const today = vnDateISO(now());
  return v >= today && v <= addCalendarDays(today, 60);
}

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
  /** ADM-ORD-04 (2026-11-20): ngày giao dự kiến `YYYY-MM-DD` (giờ VN), từ hôm nay đến 60 ngày tới. Vắng = giữ ngày đã tính lúc đặt. */
  estimatedDeliveryDate: z
    .string({ error: ETA_MSG })
    .refine((v) => validEta(v), { error: ETA_MSG })
    .optional(),
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

const REJECT_MSG = 'Lý do từ chối bắt buộc, từ 5 đến 250 ký tự.';
/** T14: lý do từ chối (khách thấy trong email + `Order.cancelRequest.rejectReason`), 5-250 ký tự sau trim. */
export const rejectCancelSchema = z.object({
  expectedStatus,
  reason: z
    .string({ error: REJECT_MSG })
    .transform((v) => v.normalize('NFC').trim())
    .refine((v) => len(v) >= 5 && len(v) <= 250, { error: REJECT_MSG }),
});

export type CallAttemptBody = z.output<typeof callAttemptSchema>;
export type ConfirmRefundBody = z.output<typeof confirmRefundSchema>;
export type ShipBody = z.output<typeof shipSchema>;
export type CancelBody = z.output<typeof cancelSchema>;
export type ReturnedStockBody = z.output<typeof returnedStockSchema>;
export type RejectCancelBody = z.output<typeof rejectCancelSchema>;
export type NoteBody = z.output<typeof noteSchema>;
