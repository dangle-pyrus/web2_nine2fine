import { z } from 'zod';
import { RETURNS_ASSUMPTIONS } from '../../config/assumptions';
import { Errors } from '../../lib/errors';
import { UUID_RE } from '../../lib/validate';
import { cleanText } from '../../lib/text';
import { faultOf, REASON_CODES, type ReturnReason } from './return-rules';

/**
 * Kiểm đầu vào trả hàng (plan mục 4, 6.1b). Thông điệp CỐ ĐỊNH theo trường, KHÔNG nhúng giá trị nhập (đặc biệt số tài khoản).
 * Hình dạng kiểm bằng Zod (`shapeSchema`); quy tắc phụ thuộc lý do / phương thức thanh toán kiểm ở `dependentIssues`
 * để gom MỌI lỗi theo trường một lần (`Errors.validationMany`).
 */

export interface Issue {
  field: string;
  message: string;
}

const MSG = {
  lines: 'Chọn ít nhất một sản phẩm và số lượng hợp lệ (không vượt số đã mua).',
  reason: 'Chọn lý do trả hàng.',
  detail: 'Mô tả chưa hợp lệ.',
  detailShop: 'Mô tả lỗi từ 10 đến 500 ký tự.',
  conditionAck: 'Vui lòng xác nhận sản phẩm còn nguyên tem nhãn, chưa qua sử dụng.',
  photos: 'Ảnh minh chứng chưa hợp lệ.',
  photosShop: 'Cần ít nhất 1 ảnh minh chứng (tối đa 5 ảnh).',
  bank: 'Nhập tên ngân hàng (2 đến 60 ký tự).',
  accountNumber: 'Số tài khoản gồm 6 đến 19 chữ số.',
  accountName: 'Tên chủ tài khoản gồm 2 đến 50 chữ cái.',
  amount: 'Giá trị hàng trả không đủ bù phí gửi trả 30.000 ₫.',
} as const;
export const RETURN_MSG = MSG;

const uuid = z.string().regex(UUID_RE);
export const linesSchema = z
  .array(z.object({ variantId: uuid, quantity: z.number().int().min(1).max(99) }), { error: MSG.lines })
  .min(1, { error: MSG.lines })
  .max(32, { error: MSG.lines })
  .refine((a) => new Set(a.map((l) => l.variantId.toLowerCase())).size === a.length, { error: MSG.lines });

const reasonSchema = z.enum(REASON_CODES as [ReturnReason, ...ReturnReason[]], { error: MSG.reason });

/** Chuẩn hoá mô tả: NFC, \r\n -> \n, cắt hai đầu, giữ xuống dòng. */
export const cleanDetail = (s: string): string => s.normalize('NFC').replace(/\r\n?/g, '\n').trim();
const HAS_BAD_CONTROL = /(?!\n)\p{Cc}/u;

const detailSchema = z
  .string({ error: MSG.detail })
  .max(4000, { error: MSG.detail })
  .transform(cleanDetail)
  .refine((s) => !HAS_BAD_CONTROL.test(s) && s.length <= 500, { error: MSG.detail });

const photosSchema = z
  .array(uuid, { error: MSG.photos })
  .max(RETURNS_ASSUMPTIONS.photo.max, { error: MSG.photos })
  .refine((a) => new Set(a.map((x) => x.toLowerCase())).size === a.length, { error: MSG.photos });

export type CreateShape = {
  lines: z.output<typeof linesSchema>;
  reason: ReturnReason;
  detail?: string;
  conditionAck?: boolean;
  photos?: string[];
};

const FIELD_SCHEMAS = {
  lines: linesSchema,
  reason: reasonSchema,
  detail: detailSchema,
  conditionAck: z.boolean({ error: MSG.conditionAck }),
  photos: photosSchema,
} as const;

/**
 * Kiểm hình dạng THEO TỪNG TRƯỜNG (một trường hỏng không che lỗi trường khác; giá trị hợp lệ vẫn dùng được cho quy tắc phụ thuộc).
 * Trường lạ bị loại. `lines` và `reason` bắt buộc; còn lại tuỳ chọn. Tài khoản kiểm riêng ở `parseAccount` (đơn chuyển khoản bỏ qua).
 */
export function parseCreateFields(raw: Record<string, unknown>, fields: ReadonlyArray<keyof typeof FIELD_SCHEMAS> = ['lines', 'reason', 'detail', 'conditionAck', 'photos']): { value: Partial<CreateShape>; issues: Issue[] } {
  const value: Record<string, unknown> = {};
  const issues: Issue[] = [];
  for (const k of fields) {
    const required = k === 'lines' || k === 'reason';
    if (raw[k] === undefined && !required) continue;
    const r = FIELD_SCHEMAS[k].safeParse(raw[k]);
    if (r.success) value[k] = r.data;
    else issues.push({ field: k, message: r.error.issues[0].message });
  }
  return { value: value as Partial<CreateShape>, issues };
}

export interface RefundAccount {
  bank: string;
  accountNumber: string;
  accountName: string;
}

/** Tên ngân hàng / chủ tài khoản / số: chuẩn hoá + kiểm; trả `undefined` kèm lỗi nếu sai. */
export function parseAccount(raw: { bank?: unknown; accountNumber?: unknown; accountName?: unknown }): { value?: RefundAccount; issues: Issue[] } {
  const issues: Issue[] = [];
  const bank = typeof raw.bank === 'string' ? cleanText(raw.bank) : '';
  if (bank.length < 2 || bank.length > 60) issues.push({ field: 'bank', message: MSG.bank });
  const number = typeof raw.accountNumber === 'string' ? raw.accountNumber.replace(/\s+/g, '') : '';
  if (!/^[0-9]{6,19}$/.test(number)) issues.push({ field: 'accountNumber', message: MSG.accountNumber });
  const nameClean = typeof raw.accountName === 'string' ? cleanText(raw.accountName) : '';
  if (!/^[\p{L} ]{2,50}$/u.test(nameClean)) issues.push({ field: 'accountName', message: MSG.accountName });
  if (issues.length > 0) return { issues };
  return { value: { bank, accountNumber: number, accountName: nameClean.toLocaleUpperCase('vi-VN') }, issues };
}

/**
 * Quy tắc phụ thuộc lý do / phương thức thanh toán (cần biết đơn). `value` = thân đã qua `createShape` (có thể thiếu nếu hình dạng lỗi:
 * khi đó chỉ kiểm phần không phụ thuộc trường lỗi).
 */
export function dependentIssues(
  raw: Record<string, unknown>,
  value: Partial<CreateShape>,
  paymentMethod: 'cod' | 'bank_transfer',
): { account?: RefundAccount; issues: Issue[] } {
  const issues: Issue[] = [];
  const reason = typeof raw.reason === 'string' && (REASON_CODES as string[]).includes(raw.reason) ? (raw.reason as ReturnReason) : undefined;
  if (reason) {
    if (faultOf(reason) === 'shop') {
      const detail = value.detail;
      if (detail !== undefined || raw.detail === undefined) {
        if (detail === undefined || detail.length < 10 || detail.length > 500) issues.push({ field: 'detail', message: MSG.detailShop });
      }
      const photos = value.photos;
      if (photos !== undefined || raw.photos === undefined) {
        if (!photos || photos.length < 1) issues.push({ field: 'photos', message: MSG.photosShop });
      }
    } else if (value.conditionAck !== true) {
      issues.push({ field: 'conditionAck', message: MSG.conditionAck });
    }
  }
  let account: RefundAccount | undefined;
  if (paymentMethod === 'cod') {
    const a = parseAccount(raw);
    account = a.value;
    issues.push(...a.issues);
  }
  return { account, issues };
}

/** Gộp lỗi theo trường (lỗi đầu mỗi trường), giữ thứ tự: hình dạng trước, phụ thuộc sau. */
export function throwIfIssues(...lists: Issue[][]): void {
  const seen = new Set<string>();
  const merged: Issue[] = [];
  for (const i of lists.flat()) {
    if (seen.has(i.field)) continue;
    seen.add(i.field);
    merged.push(i);
  }
  if (merged.length > 0) throw Errors.validationMany(merged);
}

/** `variantId` chuẩn hoá chữ thường (so khớp với DB). */
export const lc = (s: string): string => s.toLowerCase();

/* ------------------------------ Admin ------------------------------ */

export const MSG_ADMIN = {
  note: 'Ghi chú tối đa 250 ký tự.',
  rejectNote: 'Lý do từ 5 đến 250 ký tự.',
  receiveNote: 'Cần ghi chú từ 5 đến 250 ký tự khi có sản phẩm không đạt.',
  lines: 'Danh sách sản phẩm nhận chưa hợp lệ.',
  amount: 'Số tiền không khớp số đã chốt. Vui lòng tải lại.',
  refundReference: 'Mã giao dịch từ 4 đến 60 ký tự.',
  carrier: 'Đơn vị vận chuyển tối đa 50 ký tự.',
  trackingNumber: 'Mã vận đơn tối đa 40 ký tự.',
  state: 'Trạng thái lọc không hợp lệ.',
  q: 'Từ khoá tìm kiếm tối đa 100 ký tự.',
  sort: 'Cách sắp xếp không hợp lệ.',
  page: 'Trang phải là số nguyên từ 1.',
  limit: 'Số dòng mỗi trang chỉ nhận 20 hoặc 50.',
} as const;

const optText = (max: number, msg: string) => z.string({ error: msg }).transform(cleanText).refine((v) => v.length <= max, { error: msg });

export const approveSchema = z.object({
  note: optText(250, MSG_ADMIN.note).optional(),
  carrier: optText(50, MSG_ADMIN.carrier).optional(),
  trackingNumber: optText(40, MSG_ADMIN.trackingNumber).optional(),
});

export const rejectSchema = z.object({
  note: z.string({ error: MSG_ADMIN.rejectNote }).transform(cleanText).refine((v) => v.length >= 5 && v.length <= 250, { error: MSG_ADMIN.rejectNote }),
});

export const receiveSchema = z.object({
  lines: z
    .array(
      z.object({
        variantId: uuid,
        acceptedQuantity: z.number().int().min(0).max(99),
        disposition: z.enum(['restock', 'writeoff']).optional(),
        /** ADM-RET-05/08: phần đạt nhập lại kho (0..acceptedQuantity). Vắng = theo `disposition` (cả phần đạt hoặc 0). */
        restockQuantity: z.number().int().min(0).max(99).optional(),
      }),
      { error: MSG_ADMIN.lines },
    )
    .min(1, { error: MSG_ADMIN.lines })
    .max(32, { error: MSG_ADMIN.lines }),
  note: optText(250, MSG_ADMIN.note).optional(),
});

export const refundSchema = z.object({
  amount: z.number({ error: MSG_ADMIN.amount }).int({ error: MSG_ADMIN.amount }).min(0, { error: MSG_ADMIN.amount }),
  refundReference: z.string({ error: MSG_ADMIN.refundReference }).transform(cleanText).refine((v) => v.length >= 4 && v.length <= 60, { error: MSG_ADMIN.refundReference }),
});

export type ReturnStateFilter = 'requested' | 'approved' | 'received' | 'refunded' | 'closed';
export interface ReturnListQuery {
  state?: ReturnStateFilter;
  q?: string;
  sort: ReturnSort;
  page: number;
  limit: 20 | 50;
}
/** ADM-RET-01: mới nhất (mặc định), cũ nhất (xử lý hàng đợi), số tiền giảm dần. */
export type ReturnSort = 'requestedAt' | 'oldest' | 'amount';

const intStr = (msg: string) => z.string({ error: msg }).regex(/^[0-9]{1,9}$/, { error: msg }).transform(Number);
export const listQuerySchema = z.object({
  state: z.enum(['requested', 'approved', 'received', 'refunded', 'closed'], { error: MSG_ADMIN.state }).optional(),
  q: z.string({ error: MSG_ADMIN.q }).transform(cleanText).refine((v) => v.length <= 100, { error: MSG_ADMIN.q }).optional(),
  sort: z.enum(['requestedAt', 'oldest', 'amount'], { error: MSG_ADMIN.sort }).default('requestedAt'),
  page: intStr(MSG_ADMIN.page).refine((n) => n >= 1, { error: MSG_ADMIN.page }).default(1),
  limit: intStr(MSG_ADMIN.limit).refine((n) => n === 20 || n === 50, { error: MSG_ADMIN.limit }).default(20),
});
