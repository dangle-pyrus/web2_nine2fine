import { z } from 'zod';
import { cleanText } from '../../lib/text';
import { isRealDate, vnDateISO } from '../../lib/vn-time';

/**
 * Zod của `AdminStoreSettingsInput` (BR-SET-02..06, S8-Q10). Trường lạ bị loại (mặc định của `z.object`).
 * Chuẩn hoá: NFC + gộp khoảng trắng + trim; cấm ký tự điều khiển; email chữ thường; URL `https://`.
 * `field` do `parseBodyAll` dựng từ đường dẫn đầy đủ (`info.hotline`, `operations.shippingFee`, `updatedAt`).
 */

const CTRL = /\p{Cc}/u;
const len = (v: string) => [...v].length;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Chuỗi hiển thị: cleanText, khoảng độ dài theo số ký tự, không ký tự điều khiển. */
const text = (min: number, max: number, msg: string) =>
  z
    .string({ error: msg })
    .transform(cleanText)
    .refine((v) => !CTRL.test(v) && len(v) >= min && len(v) <= max, { error: msg });

const intIn = (min: number, max: number, msg: string, step = 1) =>
  z
    .number({ error: msg })
    .int({ error: msg })
    .min(min, { error: msg })
    .max(max, { error: msg })
    .refine((v) => v % step === 0, { error: msg });

const emailOf = (msg: string, allowEmpty: boolean) =>
  z
    .string({ error: msg })
    .transform((v) => v.normalize('NFC').trim().toLowerCase())
    .refine((v) => !CTRL.test(v) && ((allowEmpty && v === '') || (len(v) <= 254 && EMAIL_RE.test(v))), { error: msg });

const URL_MSG = 'Nhập địa chỉ bắt đầu bằng https:// (tối đa 300 ký tự) hoặc để trống.';
const urlField = z
  .string({ error: URL_MSG })
  .transform((v) => v.normalize('NFC').trim())
  .refine(
    (v) => {
      if (v === '') return true;
      if (len(v) > 300 || !/^https:\/\/[^\s]+$/.test(v) || CTRL.test(v)) return false;
      try {
        return new URL(v).protocol === 'https:';
      } catch {
        return false;
      }
    },
    { error: URL_MSG },
  );

const HOTLINE_MSG = 'Hotline cần 8 đến 11 chữ số, bắt đầu bằng 0, 1800 hoặc 1900.';
const hotlineField = z
  .string({ error: HOTLINE_MSG })
  .transform(cleanText)
  .refine(
    (v) => {
      if (CTRL.test(v) || len(v) > 20) return false;
      const digits = v.replace(/[ .-]/g, '');
      return /^(0|1800|1900)[0-9]*$/.test(digits) && digits.length >= 8 && digits.length <= 11;
    },
    { error: HOTLINE_MSG },
  );

const REG_DATE_MSG = 'Ngày cấp phải là ngày có thật và không sau hôm nay (định dạng YYYY-MM-DD).';
const registrationDate = (now: Date) =>
  z
    .union([z.string({ error: REG_DATE_MSG }), z.null({ error: REG_DATE_MSG })], { error: REG_DATE_MSG })
    .transform((v) => (v === null || v.trim() === '' ? null : v.trim()))
    .refine((v) => v === null || (isRealDate(v) && v <= vnDateISO(now)), { error: REG_DATE_MSG });

const UPDATED_MSG = 'Thiếu hoặc sai phiên bản dữ liệu (updatedAt).';
const updatedAt = z
  .string({ error: UPDATED_MSG })
  .refine((v) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(v) && !Number.isNaN(Date.parse(v)), { error: UPDATED_MSG });

const socialSchema = z.object({ facebook: urlField.optional(), instagram: urlField.optional(), tiktok: urlField.optional(), youtube: urlField.optional() });

const operations = z
  .object({
    shippingFee: intIn(0, 500_000, 'Phí vận chuyển từ 0 đến 500.000 đồng, bội số của 1.000.', 1000),
    freeShippingThreshold: intIn(0, 50_000_000, 'Ngưỡng miễn phí vận chuyển từ 0 đến 50.000.000 đồng, bội số của 1.000.', 1000),
    bankHoldMinutes: intIn(10, 1440, 'Thời gian giữ đơn chuyển khoản từ 10 đến 1.440 phút.'),
    codMaxTotal: intIn(100_000, 50_000_000, 'Giá trị COD tối đa từ 100.000 đến 50.000.000 đồng.'),
    deliveryDaysMin: intIn(1, 30, 'Số ngày giao tối thiểu từ 1 đến 30.'),
    deliveryDaysMax: intIn(1, 30, 'Số ngày giao tối đa từ 1 đến 30.'),
    cutoffHour: intIn(0, 23, 'Giờ chốt đơn từ 0 đến 23.'),
  })
  .superRefine((o, ctx) => {
    if (o.deliveryDaysMin > o.deliveryDaysMax) {
      ctx.addIssue({ code: 'custom', path: ['deliveryDaysMax'], message: 'Số ngày giao tối đa phải lớn hơn hoặc bằng tối thiểu.' });
    }
  });

const cart = z.object({
  maxPerVariant: intIn(1, 20, 'Số lượng tối đa mỗi biến thể từ 1 đến 20.'),
  maxItemsPerOrder: intIn(1, 100, 'Số sản phẩm tối đa mỗi đơn từ 1 đến 100.'),
  maxCartLines: intIn(1, 100, 'Số dòng giỏ tối đa từ 1 đến 100.'),
  cartRetentionDays: intIn(1, 180, 'Số ngày giữ giỏ từ 1 đến 180.'),
  codRefusalLimit: intIn(1, 10, 'Số lần từ chối COD từ 1 đến 10.'),
  codRefusalMonths: intIn(1, 24, 'Số tháng tính từ chối COD từ 1 đến 24.'),
  codOpenOrderLimit: intIn(1, 10, 'Số đơn COD đang mở tối đa từ 1 đến 10.'),
});

/** Schema phụ thuộc `now` (ngày cấp không sau hôm nay theo giờ VN). */
export const storeSettingsSchema = (now: Date) =>
  z.object({
    updatedAt,
    info: z.object({
      legalName: text(2, 120, 'Tên pháp nhân từ 2 đến 120 ký tự.'),
      registrationNumber: z
        .string({ error: 'Mã số thuế / số ĐKKD gồm 10 hoặc 13 chữ số.' })
        .transform((v) => v.trim())
        .refine((v) => /^([0-9]{10}|[0-9]{13})$/.test(v), { error: 'Mã số thuế / số ĐKKD gồm 10 hoặc 13 chữ số.' }),
      registrationIssuer: text(0, 100, 'Nơi cấp tối đa 100 ký tự.'),
      registrationDate: registrationDate(now),
      address: text(10, 200, 'Địa chỉ từ 10 đến 200 ký tự.'),
      hotline: hotlineField,
      email: emailOf('Nhập địa chỉ email CSKH hợp lệ (tối đa 254 ký tự).', false),
      privacyEmail: emailOf('Email dữ liệu cá nhân để trống hoặc là email hợp lệ (tối đa 254 ký tự).', true),
      hours: text(0, 100, 'Giờ làm việc tối đa 100 ký tự.'),
      notificationUrl: urlField.optional(),
      social: socialSchema.optional(),
    }),
    operations,
    cart: cart.optional(),
  });

export type StoreSettingsInput = z.output<ReturnType<typeof storeSettingsSchema>>;
