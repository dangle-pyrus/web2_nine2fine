import { z } from 'zod';
import { emailField, phoneField } from '../../lib/validate';
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
  items: itemsField(5),
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
  code: z
    .string({ error: 'Nhập đủ 8 chữ số của mã xác thực.' })
    .transform((v) => v.replace(/[\s-]/g, ''))
    .refine((v) => /^[0-9]{8}$/.test(v), { error: 'Nhập đủ 8 chữ số của mã xác thực.' }),
});

export const cancelSchema = z.object({
  reason: z
    .string({ error: 'Lý do tối đa 250 ký tự.' })
    .transform((v) => v.trim())
    .refine((v) => [...v].length <= 250, { error: 'Lý do tối đa 250 ký tự.' })
    .optional(),
});

export const listQuerySchema = z.object({
  page: z.coerce.number({ error: 'Trang không hợp lệ.' }).int({ error: 'Trang không hợp lệ.' }).min(1, { error: 'Trang không hợp lệ.' }).default(1),
  limit: z.coerce
    .number({ error: 'Số đơn mỗi trang không hợp lệ.' })
    .int({ error: 'Số đơn mỗi trang không hợp lệ.' })
    .min(1, { error: 'Số đơn mỗi trang không hợp lệ.' })
    .max(50, { error: 'Số đơn mỗi trang không hợp lệ.' })
    .default(10),
});
