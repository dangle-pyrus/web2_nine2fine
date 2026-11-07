import { z } from 'zod';
import { emailField, phoneField, uuidField } from '../../lib/validate';

const ITEMS_MSG = 'Danh sách sản phẩm chưa hợp lệ.';

/** Mỗi `variantId` tối đa một lần, tối đa 30 dòng; `quantity` nguyên 1..max (quote: 99, đặt hàng: 5). */
export const itemsField = (maxQuantity: number) =>
  z
    .array(
      z.object({
        variantId: uuidField(ITEMS_MSG),
        quantity: z.number({ error: ITEMS_MSG }).int({ error: ITEMS_MSG }).min(1, { error: ITEMS_MSG }).max(maxQuantity, { error: ITEMS_MSG }),
      }),
      { error: ITEMS_MSG },
    )
    .min(1, { error: ITEMS_MSG })
    .max(30, { error: 'Giỏ hàng tối đa 30 sản phẩm khác nhau.' })
    .refine((a) => new Set(a.map((i) => i.variantId.toLowerCase())).size === a.length, { error: ITEMS_MSG })
    .transform((a) => a.map((i) => ({ variantId: i.variantId.toLowerCase(), quantity: i.quantity })));

export const voucherCodesField = z
  .array(z.string({ error: 'Mã giảm giá chưa hợp lệ.' }).min(1, { error: 'Mã giảm giá chưa hợp lệ.' }).max(40, { error: 'Mã giảm giá chưa hợp lệ.' }), {
    error: 'Mã giảm giá chưa hợp lệ.',
  })
  .max(2, { error: 'Tối đa 2 mã giảm giá.' })
  .default([]);

const ADDR_MSG = 'Địa chỉ giao hàng chưa hợp lệ.';
export const quoteAddressField = z.object({
  provinceCode: z.string({ error: ADDR_MSG }).min(1, { error: ADDR_MSG }).max(10, { error: ADDR_MSG }),
  wardCode: z.string({ error: ADDR_MSG }).min(1, { error: ADDR_MSG }).max(10, { error: ADDR_MSG }),
});

export const quoteContactField = z.object({
  email: emailField.optional(),
  phone: phoneField.optional(),
});

export const quoteSchema = z.object({
  items: itemsField(99),
  voucherCodes: voucherCodesField,
  address: quoteAddressField.optional(),
  contact: quoteContactField.optional(),
  paymentMethod: z.enum(['cod', 'bank-transfer'], { error: 'Phương thức thanh toán chưa hợp lệ.' }).optional(),
});

export const voucherCheckSchema = z.object({
  code: z.string({ error: 'Nhập mã giảm giá.' }).min(1, { error: 'Nhập mã giảm giá.' }).max(40, { error: 'Mã giảm giá chưa hợp lệ.' }),
  items: itemsField(99),
  voucherCodes: voucherCodesField,
  address: quoteAddressField.optional(),
  contact: quoteContactField.optional(),
});

export type QuoteBody = z.output<typeof quoteSchema>;
export type VoucherCheckBody = z.output<typeof voucherCheckSchema>;
