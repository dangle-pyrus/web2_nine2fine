import { z } from 'zod';
import { CATALOG_ASSUMPTIONS } from '../../config/assumptions';
import { Errors } from '../../lib/errors';
import { cleanText } from '../../lib/text';
import { intQuery, line, single } from './catalog-admin.schemas';

const { stock: STOCK, variant: VAR } = CATALOG_ASSUMPTIONS;
const THRESHOLD_MSG = 'Ngưỡng là số nguyên từ 0 đến 1.000.';
const qField = z.preprocess(
  single,
  z.string({ error: 'Từ khoá tìm kiếm không hợp lệ.' }).transform(cleanText).refine((v) => v.length <= 100, { error: 'Từ khoá tối đa 100 ký tự.' }).optional(),
);
const page = z.preprocess(single, intQuery('Trang phải là số nguyên từ 1 trở lên.', 1, 1_000_000, 1));
const limit = z.preprocess(single, intQuery('Số dòng mỗi trang từ 1 đến 100.', 1, 100, 20));

/* ======================= Lát 6.5 - 6.7: tồn kho ======================= */

const inventoryFilter = {
  q: qField,
  category: z.preprocess(single, z.string().optional()),
  color: z.preprocess(single, z.string().transform(cleanText).optional()),
  size: z.preprocess(
    (v) => (single(v) === '' ? undefined : single(v)),
    z.enum(VAR.sizes as [string, ...string[]], { error: 'Size không hợp lệ.' }).optional(),
  ),
};

export const inventoryFacetsQuerySchema = z.object(inventoryFilter);
export const inventoryListQuerySchema = z.object({
  ...inventoryFilter,
  view: z.preprocess(single, z.enum(['all', 'in', 'low', 'out'], { error: 'Tab không hợp lệ.' }).optional().default('all')),
  page,
  limit,
});
export type InventoryFilter = z.output<typeof inventoryFacetsQuerySchema>;
export type InventoryListQuery = z.output<typeof inventoryListQuerySchema>;

const KEY_RE = /^[A-Za-z0-9-]{16,64}$/;
/** `Idempotency-Key` BẮT BUỘC cho điều chỉnh tồn (BR-INV-33). */
export function requiredIdempotencyKey(v: string | undefined): string {
  if (v === undefined || !KEY_RE.test(v)) throw Errors.validation('Thiếu hoặc sai dạng Idempotency-Key.', 'Idempotency-Key');
  return v;
}

const adjustmentBase = z.object({
  mode: z.enum(['delta', 'set'], { error: 'Cách điều chỉnh là delta hoặc set.' }),
  quantity: z.number({ error: 'Số lượng phải là số nguyên.' }).int({ error: 'Số lượng phải là số nguyên.' }),
  reason: z.enum(STOCK.reasons as unknown as [string, ...string[]], { error: 'Lý do không hợp lệ.' }),
  note: z.string({ error: 'Ghi chú không hợp lệ.' }).transform(cleanText).optional(),
  expectedAvailable: z
    .number({ error: 'expectedAvailable phải là số nguyên không âm.' })
    .int({ error: 'expectedAvailable phải là số nguyên không âm.' })
    .min(0, { error: 'expectedAvailable phải là số nguyên không âm.' })
    .nullable()
    .optional(),
});

export interface AdjustmentInput {
  mode: 'delta' | 'set';
  quantity: number;
  reason: 'received' | 'return' | 'damaged' | 'count' | 'correction';
  note: string;
  expectedAvailable: number | undefined;
}

/** Kiểm cặp (mode, reason, dấu quantity, note) thuần, trước khi khoá (plan mục 7 bước 1). Trường lạ bị bỏ qua. */
export const adjustmentSchema = adjustmentBase.transform((v, ctx): AdjustmentInput => {
  const bad = (path: string, message: string): never => {
    ctx.addIssue({ code: 'custom', path: [path], message });
    return z.NEVER;
  };
  const note = v.note ?? '';
  if (note.length > 200) bad('note', 'Ghi chú tối đa 200 ký tự.');
  if (v.mode === 'delta') {
    if (v.quantity === 0 || Math.abs(v.quantity) > STOCK.maxDelta) bad('quantity', 'Số lượng thay đổi khác 0 và tối đa 10.000.');
  } else {
    if (v.quantity < 0 || v.quantity > STOCK.maxQty) bad('quantity', 'Số lượng đếm được từ 0 đến 100.000.');
    if (v.expectedAvailable === undefined || v.expectedAvailable === null) bad('expectedAvailable', 'Thiếu số Có thể bán đang thấy (expectedAvailable).');
  }
  const r = v.reason;
  const okPair =
    r === 'count' ? v.mode === 'set'
    : r === 'correction' ? true
    : r === 'damaged' ? v.mode === 'delta' && v.quantity < 0
    : v.mode === 'delta' && v.quantity > 0; // received | return
  if (!okPair) bad('reason', 'Lý do không khớp với cách và dấu của số lượng.');
  if (r === 'correction' && note.length < 5) bad('note', 'Điều chỉnh khác cần ghi chú từ 5 ký tự.');
  return { mode: v.mode, quantity: v.quantity, reason: r as AdjustmentInput['reason'], note, expectedAvailable: v.expectedAvailable ?? undefined };
});

const thresholdNum = z.number({ error: THRESHOLD_MSG }).int({ error: THRESHOLD_MSG }).min(0, { error: THRESHOLD_MSG }).max(1000, { error: THRESHOLD_MSG });

export const thresholdsSchema = z
  .object({
    defaultThreshold: thresholdNum.optional(),
    clearCustom: z.boolean({ error: 'clearCustom là true / false.' }).optional(),
    items: z
      .array(
        z.object(
          { variantId: z.string({ error: 'Biến thể không hợp lệ.' }), threshold: thresholdNum.nullable() },
          { error: 'Mục ngưỡng không hợp lệ.' },
        ),
        { error: 'Danh sách ngưỡng không hợp lệ.' },
      )
      .min(1, { error: 'Cần ít nhất 1 biến thể.' })
      .max(100, { error: 'Tối đa 100 biến thể mỗi lần.' })
      .optional(),
  })
  .refine((v) => v.defaultThreshold !== undefined || v.clearCustom !== undefined || v.items !== undefined, {
    error: 'Cần ít nhất một trong defaultThreshold, clearCustom, items.',
    path: ['defaultThreshold'],
  });
export type ThresholdsInput = z.output<typeof thresholdsSchema>;

/* ======================= Lát 6.6: khuyến mãi ======================= */

export const promotionListQuerySchema = z.object({
  q: qField,
  state: z.preprocess(single, z.enum(['running', 'scheduled', 'expired', 'disabled'], { error: 'Trạng thái không hợp lệ.' }).optional()),
  page,
  limit,
});
export type PromotionListQuery = z.output<typeof promotionListQuerySchema>;

/** Mã chuẩn hoá: bỏ mọi khoảng trắng + chữ hoa (BR-INV-39). */
export const cleanCode = (s: string): string => s.normalize('NFC').replace(/\s+/g, '').toUpperCase();
export const CODE_RE = /^[A-Z0-9]{4,20}$/;

const isoDate = (msg: string) =>
  z
    .string({ error: msg })
    .refine((v) => !Number.isNaN(Date.parse(v)), { error: msg })
    .transform((v) => new Date(v));

const intIn = (msg: string, min: number, max: number) =>
  z.number({ error: msg }).int({ error: msg }).min(min, { error: msg }).max(max, { error: msg });

const promotionShape = {
  title: line('Tên chương trình từ 1 đến 100 ký tự.', 1, 100),
  type: z.enum(['percent', 'fixed', 'free-shipping'], { error: 'Loại khuyến mãi không hợp lệ.' }),
  value: z.number({ error: 'Giá trị không hợp lệ.' }).int({ error: 'Giá trị không hợp lệ.' }).nullable().optional(),
  maxDiscount: z.number({ error: 'Giảm tối đa không hợp lệ.' }).int({ error: 'Giảm tối đa không hợp lệ.' }).nullable().optional(),
  minSubtotal: intIn('Đơn tối thiểu từ 0 đến 100.000.000 đồng.', 0, 100_000_000),
  categories: z.array(z.string({ error: 'Danh mục không hợp lệ.' }), { error: 'Danh mục không hợp lệ.' }).max(1, { error: 'Chỉ chọn tối đa 1 danh mục.' }).optional(),
  usageLimit: intIn('Tổng lượt dùng từ 1 đến 1.000.000.', 1, 1_000_000).nullable().optional(),
  perCustomerLimit: intIn('Lượt dùng mỗi khách từ 1 đến 10.', 1, 10),
  audience: z.enum(['everyone', 'members'], { error: 'Đối tượng chỉ gồm mọi người hoặc thành viên.' }).optional(),
  firstOrderOnly: z.boolean({ error: 'firstOrderOnly là true / false.' }).optional(),
  excludeSaleItems: z.boolean({ error: 'excludeSaleItems là true / false.' }).optional(),
  startsAt: isoDate('Thời điểm bắt đầu không hợp lệ.').nullable().optional(),
  endsAt: isoDate('Thời điểm kết thúc không hợp lệ.').nullable().optional(),
  enabled: z.boolean({ error: 'enabled là true / false.' }),
  // FE cũ: bỏ qua nếu rỗng, 422 nếu khác rỗng (contract AdminPromotionInput).
  tiers: z.unknown().optional(),
  customerIds: z.unknown().optional(),
};

interface PromoRaw {
  type: 'percent' | 'fixed' | 'free-shipping';
  value?: number | null | undefined;
  maxDiscount?: number | null | undefined;
  tiers?: unknown;
  customerIds?: unknown;
}

/** Quy tắc giá trị theo loại (BR-INV-39) + trường FE cũ. */
function refinePromotion(v: PromoRaw, ctx: z.RefinementCtx): void {
  const add = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
  const nonEmpty = (x: unknown) => x !== undefined && x !== null && !(Array.isArray(x) && x.length === 0);
  if (nonEmpty(v.tiers)) add('tiers', 'Chưa hỗ trợ giới hạn theo hạng thành viên.');
  if (nonEmpty(v.customerIds)) add('customerIds', 'Chưa hỗ trợ giới hạn theo khách hàng.');
  const val = v.value ?? null;
  const max = v.maxDiscount ?? null;
  if (v.type === 'percent') {
    if (val === null || val < 1 || val > 90) add('value', 'Phần trăm giảm từ 1 đến 90.');
    if (max !== null && (max < 1000 || max > 10_000_000)) add('maxDiscount', 'Giảm tối đa từ 1.000 đến 10.000.000 đồng.');
  } else if (v.type === 'fixed') {
    if (val === null || val < 1000 || val > 10_000_000) add('value', 'Số tiền giảm từ 1.000 đến 10.000.000 đồng.');
    if (max !== null) add('maxDiscount', 'Giảm tối đa chỉ dùng cho loại phần trăm.');
  } else {
    if (val !== null) add('value', 'Miễn phí vận chuyển không có giá trị giảm.');
    if (max !== null) add('maxDiscount', 'Giảm tối đa chỉ dùng cho loại phần trăm.');
  }
}

export const promotionCreateSchema = z
  .object({
    code: z
      .string({ error: 'Mã gồm 4 đến 20 chữ cái in hoa hoặc số.' })
      .transform(cleanCode)
      .refine((v) => CODE_RE.test(v), { error: 'Mã gồm 4 đến 20 chữ cái in hoa hoặc số.' }),
    ...promotionShape,
  })
  .superRefine(refinePromotion);

export const promotionUpdateSchema = z
  .object({
    code: z.string({ error: 'Mã không hợp lệ.' }).transform(cleanCode),
    ...promotionShape,
    updatedAt: z.string({ error: 'Thiếu updatedAt.' }).refine((v) => !Number.isNaN(Date.parse(v)), { error: 'updatedAt không hợp lệ.' }),
  })
  .superRefine(refinePromotion);

export const promotionEnabledSchema = z.object({
  enabled: z.boolean({ error: 'enabled là true / false.' }),
  updatedAt: z
    .string({ error: 'updatedAt không hợp lệ.' })
    .refine((v) => !Number.isNaN(Date.parse(v)), { error: 'updatedAt không hợp lệ.' })
    .optional(),
});

export type PromotionCreateInput = z.output<typeof promotionCreateSchema>;
export type PromotionUpdateInput = z.output<typeof promotionUpdateSchema>;
