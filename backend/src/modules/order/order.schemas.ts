import { z } from 'zod';
import { CART_MAX_PER_VARIANT } from '../../config/assumptions';
import { Errors } from '../../lib/errors';
import { emailField, otpCodeField, phoneField } from '../../lib/validate';
import { itemsField, quoteAddressField, voucherCodesField } from '../checkout/checkout.schemas';

/** Validate + chuẩn hoá `POST /orders` (BR-CHK-04..09). Trường lạ (kể cả `userId`) bị loại. */

const NAME_MSG = 'Họ tên người nhận từ 2 đến 50 ký tự và có ít nhất một chữ cái.';
const nameField = z
  .string({ error: NAME_MSG })
  .transform((v) => v.normalize('NFC').trim().replace(/\s+/g, ' '))
  .refine((v) => [...v].length >= 2 && [...v].length <= 50 && /\p{L}/u.test(v), { error: NAME_MSG });

const STREET_MSG = 'Địa chỉ cụ thể từ 5 đến 200 ký tự.';
const streetField = z
  .string({ error: STREET_MSG })
  .transform((v) => v.trim().replace(/\s+/g, ' '))
  .refine((v) => [...v].length >= 5 && [...v].length <= 200, { error: STREET_MSG });

const NOTE_MSG = 'Ghi chú tối đa 250 ký tự.';
const noteField = z
  .string({ error: NOTE_MSG })
  .transform((v) => v.trim())
  .refine((v) => [...v].length <= 250, { error: NOTE_MSG })
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional()
  .transform((v) => v ?? null);

const invoiceSchema = z.object({
  companyName: z
    .string({ error: 'Nhập tên công ty (2 đến 200 ký tự).' })
    .transform((v) => v.trim().replace(/\s+/g, ' '))
    .refine((v) => [...v].length >= 2 && [...v].length <= 200, { error: 'Nhập tên công ty (2 đến 200 ký tự).' }),
  taxCode: z
    .string({ error: 'Mã số thuế gồm 10 số hoặc 10 số + "-" + 3 số.' })
    .transform((v) => v.trim())
    .refine((v) => /^[0-9]{10}(-[0-9]{3})?$/.test(v), { error: 'Mã số thuế gồm 10 số hoặc 10 số + "-" + 3 số.' }),
  address: z
    .string({ error: 'Nhập địa chỉ công ty (5 đến 200 ký tự).' })
    .transform((v) => v.trim().replace(/\s+/g, ' '))
    .refine((v) => [...v].length >= 5 && [...v].length <= 200, { error: 'Nhập địa chỉ công ty (5 đến 200 ký tự).' }),
  email: emailField,
});

const money = z.number({ error: 'Giá trị tạm tính chưa hợp lệ.' }).int({ error: 'Giá trị tạm tính chưa hợp lệ.' }).min(0, { error: 'Giá trị tạm tính chưa hợp lệ.' });
const expectedSchema = z.object(
  {
    lines: z.array(z.object({ variantId: z.string(), unitPrice: money })).default([]),
    pricing: z.object({
      subtotal: money,
      discount: money,
      shippingFee: money,
      shippingDiscount: money,
      total: money,
    }),
  },
  { error: 'Thiếu số tiền đối chiếu (expected).' },
);

export const placeOrderSchema = z.object({
  items: itemsField(CART_MAX_PER_VARIANT),
  voucherCodes: voucherCodesField,
  contact: z.object({ name: nameField, phone: phoneField, email: emailField }, { error: 'Thiếu thông tin liên hệ.' }),
  address: quoteAddressField.extend({ street: streetField }),
  note: noteField,
  paymentMethod: z.enum(['cod', 'bank-transfer'], { error: 'Chọn phương thức thanh toán.' }),
  invoice: z.preprocess((v) => (v === undefined ? null : v), invoiceSchema.nullable()),
  acceptedTerms: z.literal(true, { error: 'Bạn cần đồng ý với điều khoản để đặt hàng.' }),
  expected: expectedSchema,
  confirmDuplicate: z.boolean({ error: 'Giá trị confirmDuplicate chưa hợp lệ.' }).default(false),
});
export type PlaceOrderBody = z.output<typeof placeOrderSchema>;

export const lookupCodesSchema = z.object({
  orderCode: z.string({ error: 'Nhập mã đơn hàng.' }).min(1, { error: 'Nhập mã đơn hàng.' }).max(20, { error: 'Nhập mã đơn hàng.' }),
  email: emailField,
});

export const lookupVerifySchema = z.object({
  orderCode: z.string({ error: 'Nhập mã đơn hàng.' }).min(1, { error: 'Nhập mã đơn hàng.' }).max(20, { error: 'Nhập mã đơn hàng.' }),
  email: emailField,
  code: otpCodeField,
});

/**
 * COMMON-01.5 / ORD-CC-02: lý do khách yêu cầu huỷ đơn `to_ship` (bắt buộc chọn một). Câu chữ vào `cancel_request_reason`
 * (admin + lịch sử đơn thấy nguyên câu). "Khác" cần ghi chú.
 */
export const CUSTOMER_CANCEL_REASONS = {
  changed_mind: 'Tôi không còn nhu cầu mua nữa',
  change_variant: 'Tôi muốn đổi size, màu hoặc sản phẩm khác',
  change_address: 'Tôi muốn đổi địa chỉ hoặc thông tin nhận hàng',
  better_price: 'Tôi tìm được nơi bán giá tốt hơn',
  slow_delivery: 'Thời gian giao hàng dự kiến quá lâu',
  other: 'Lý do khác',
} as const;
export type CustomerCancelReason = keyof typeof CUSTOMER_CANCEL_REASONS;
const REASON_CODES = Object.keys(CUSTOMER_CANCEL_REASONS) as [CustomerCancelReason, ...CustomerCancelReason[]];

const freeText = z
  .string({ error: 'Lý do tối đa 250 ký tự.' })
  .transform((v) => v.trim())
  .refine((v) => [...v].length <= 250, { error: 'Lý do tối đa 250 ký tự.' });

export const cancelSchema = z.object({
  /** Mã lý do (bắt buộc khi gửi yêu cầu huỷ đơn `to_ship`, kiểm ở route theo trạng thái đơn). */
  reasonCode: z.enum(REASON_CODES, { error: 'Chọn lý do hủy đơn.' }).optional(),
  /** Ghi chú thêm (bắt buộc khi chọn "Lý do khác"); giữ tên `reason` cho đơn `to_pay` (không bắt buộc). */
  reason: freeText.optional(),
});

/** Câu lưu vào đơn: nhãn lý do (+ ghi chú). `required` = yêu cầu huỷ `to_ship` phải có lý do. */
export function cancelReasonText(b: { reasonCode?: CustomerCancelReason; reason?: string }, required: boolean): string | null {
  const note = b.reason && b.reason.length > 0 ? b.reason : null;
  if (!b.reasonCode) {
    // Ứng dụng gửi `reasonCode`; một câu tự do (client cũ) vẫn được nhận như lý do.
    if (required && !note) throw Errors.validation('Chọn lý do hủy đơn.', 'reasonCode');
    return note;
  }
  if (b.reasonCode === 'other') {
    if (!note) throw Errors.validation('Nhập lý do hủy đơn.', 'reason');
    return `${CUSTOMER_CANCEL_REASONS.other}: ${note}`.slice(0, 250);
  }
  const label = CUSTOMER_CANCEL_REASONS[b.reasonCode];
  return (note ? `${label}. ${note}` : label).slice(0, 250);
}

export const listQuerySchema = z.object({
  page: z.coerce.number({ error: 'Trang không hợp lệ.' }).int({ error: 'Trang không hợp lệ.' }).min(1, { error: 'Trang không hợp lệ.' }).default(1),
  limit: z.coerce
    .number({ error: 'Số đơn mỗi trang không hợp lệ.' })
    .int({ error: 'Số đơn mỗi trang không hợp lệ.' })
    .min(1, { error: 'Số đơn mỗi trang không hợp lệ.' })
    .max(50, { error: 'Số đơn mỗi trang không hợp lệ.' })
    .default(10),
});
