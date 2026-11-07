import { HOUR, MINUTE } from '../lib/clock';

/**
 * GIẢ ĐỊNH CHỜ THẮNG (Slice 3), gom một chỗ để đổi dễ. Đổi hành vi ở đây là đổi contract locked (qua handoff).
 * - Q1 COMMON: tên trạng thái nằm ở enum DB `order_status` / `payment_status` (đổi cần migration + contract).
 * - Q2 QR/SePay: mặc định chưa bật (cờ DB `store_settings.bank_transfer_enabled` = false, lát 3.8 không làm).
 * - Q3 địa giới: 34 tỉnh/thành, seed `prisma/seed-data/vn-locations.json`.
 * - Q4 huỷ `to_ship`: khách tự huỷ thẳng.
 */
export const ASSUMPTIONS = {
  /** Q1: mã giảm % làm tròn xuống tới bội số này (đồng). */
  percentRoundStep: 1000,
  /** Q1: OTP tra cứu đơn khách theo BR-AUTH-04..09 (8 số, 10 phút, gửi lại sau 60 giây, sai 5 lần khoá 15 phút). */
  lookupOtpResendSeconds: 60,
  /** Q1: quyền xem đơn khách sau OTP (cookie n2f_oa). */
  orderAccessTtlMs: 30 * MINUTE,
  /** Q4: trạng thái khách được tự huỷ. Khi có slice Admin, bỏ `to_ship` (chuyển sang `cancel_requested`). */
  customerCancellableFrom: ['to_pay', 'to_ship'] as const,
  /** Hệ thống tự huỷ chỉ đơn chờ thanh toán quá hạn. */
  systemCancellableFrom: ['to_pay'] as const,
  /** Khoá Idempotency-Key hiệu lực 24 giờ (BR-CHK-15). */
  idempotencyTtlMs: 24 * HOUR,
  /** Chống dò mã voucher (BR-VOU-09): 10 mã không tồn tại / 15 phút / IP thì khoá 15 phút. */
  voucherMissMax: 10,
  voucherMissWindowMs: 15 * MINUTE,
  /** Đơn tối thiểu cho "cần gọi xác nhận" (BR-CHK-20). */
  noConfirmCallBelowTotal: 1_000_000,
  /** Đơn trùng (BR-CHK-16, Should): cùng SĐT + cùng sản phẩm trong khoảng này. */
  duplicateWindowMs: 10 * MINUTE,
} as const;
