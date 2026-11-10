import { HOUR, MINUTE } from '../lib/clock';

/**
 * GIẢ ĐỊNH CHỜ THẮNG (Slice 3), gom một chỗ để đổi dễ. Đổi hành vi ở đây là đổi contract locked (qua handoff).
 * - Q1 COMMON: tên trạng thái nằm ở enum DB `order_status` / `payment_status` (đổi cần migration + contract).
 * - Q2 QR/SePay: mặc định chưa bật (cờ DB `store_settings.bank_transfer_enabled` = false, lát 3.8 không làm).
 * - Q3 địa giới: 34 tỉnh/thành, seed `prisma/seed-data/vn-locations.json`.
 * - Q4 huỷ `to_ship`: thay bởi S4-Q1 (xem `toShipCancelMode`); lát 4.5 đã phát hành với 'request'.
 */
export const ASSUMPTIONS = {
  /** Q1: mã giảm % làm tròn xuống tới bội số này (đồng). */
  percentRoundStep: 1000,
  /** Q1: OTP tra cứu đơn khách theo BR-AUTH-04..09 (8 số, 10 phút, gửi lại sau 60 giây, sai 5 lần khoá 15 phút). */
  lookupOtpResendSeconds: 60,
  /** Q1: quyền xem đơn khách sau OTP (cookie n2f_oa). */
  orderAccessTtlMs: 30 * MINUTE,
  /**
   * S4-Q1 (thay Q4 Slice 3): khách ở `to_ship` -> 'direct' = huỷ thẳng (Slice 3), 'request' = gửi yêu cầu huỷ chờ shop duyệt.
   * Phát hành 'request' cùng lát 4.5 (2026-11-08). Điểm lật: đổi về 'direct' = hành vi Slice 3 (contract đổi theo quy trình).
   */
  toShipCancelMode: 'request' as 'direct' | 'request',
  /** Khách huỷ thẳng từ các trạng thái này (khi `toShipCancelMode = 'direct'` thì cả `to_ship`, xem `customerCancellableFrom()`). */
  customerDirectCancelFrom: ['to_pay'] as readonly string[],
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

/** Trạng thái khách được huỷ thẳng theo cờ `toShipCancelMode`. */
export function customerCancellableFrom(): readonly string[] {
  return ASSUMPTIONS.toShipCancelMode === 'direct' ? [...ASSUMPTIONS.customerDirectCancelFrom, 'to_ship'] : ASSUMPTIONS.customerDirectCancelFrom;
}

/** GIẢ ĐỊNH Slice 4 (S4-Q1..Q9, Thắng nhận mặc định 2026-11-08). Đổi = sửa đúng chỗ + sửa BR/contract theo quy trình. */
export const ADMIN_ASSUMPTIONS = {
  /** S4-Q2: 'two-step' = huỷ từ `to_receive` không cộng tồn, `returned-stock` cộng sau. */
  returnStockMode: 'two-step' as 'two-step' | 'one-step',
  /** S4-Q3 (chỉ cờ `overdue`): giờ làm việc VN 08:00-18:00, thứ Hai-thứ Bảy (1..6). */
  workHours: { fromHour: 8, toHour: 18, days: [1, 2, 3, 4, 5, 6] as readonly number[] },
  callSlaWorkingHours: 2,
  cancelRequestSlaHours: 24,
  /** S4-Q4: lý do huỷ chỉ admin được dùng. */
  adminOnlyCancelReasons: ['other'] as readonly string[],
  /** S4-Q5: đơn vị vận chuyển nhập tự do. */
  carrierMode: 'free-text' as 'free-text',
  /** S4-Q6: mỗi đơn khách chỉ một yêu cầu huỷ. */
  cancelRequestResubmit: false,
  /** S4-Q9: `unreachable` = 3 lần gọi liên tiếp, lần cuối - lần đầu <= 24 giờ 00 phút. */
  unreachableAttempts: 3,
  unreachableWindowMs: 24 * HOUR,
} as const;

/** GIẢ ĐỊNH Slice 5 (S5-Q1..Q6, PO tự chốt theo uỷ quyền của Thắng 2026-11-08). */
export const ACCOUNT_ASSUMPTIONS = {
  /** S5-Q1: ngưỡng chi tiêu (đồng) theo năm dương lịch VN, chỉ đơn `completed`. Thứ tự tăng dần. */
  tiers: [
    { tier: 'bronze', minSpent: 0 },
    { tier: 'silver', minSpent: 18_000_000 },
    { tier: 'gold', minSpent: 40_000_000 },
  ] as ReadonlyArray<{ tier: 'bronze' | 'silver' | 'gold'; minSpent: number }>,
  /** S5-Q4: số địa chỉ tối đa mỗi tài khoản. */
  maxAddresses: 10,
  /** BR-ACC-06: sai mật khẩu hiện tại 5 lần liên tiếp (cách <= 15 phút) thì khoá đổi mật khẩu 15 phút. */
  passwordChangeMaxFails: 5,
  passwordChangeGapMs: 15 * MINUTE,
  passwordChangeLockMs: 15 * MINUTE,
} as const;

/**
 * GIẢ ĐỊNH Slice 6 (S6-Q1..Q9, mặc định PO; Orchestrator duyệt plan 2026-11-10).
 * Đổi một câu trả lời = sửa đúng một chỗ ở đây + BR/contract theo quy trình.
 */
export const CATALOG_ASSUMPTIONS = {
  /** S6-Q3: khoá slug sau lần công khai đầu. `false` = bỏ kiểm khoá, `slugLocked` luôn false. */
  lockSlugAfterPublish: true,
  /** S6-Q4: voucher đã có lượt dùng thì khoá loại / giá trị / giảm tối đa. */
  voucherLockWhenRedeemed: true,
  /** S6-Q5: ảnh sản phẩm. */
  image: {
    maxBytes: 5 * 1024 * 1024,
    minShort: 600,
    maxLong: 6000,
    maxPerProduct: 12,
    mimes: ['image/jpeg', 'image/png', 'image/webp'] as readonly string[],
  },
  /** S6-Q6: tồn kho. */
  stock: {
    maxDelta: 10_000,
    maxQty: 100_000,
    reasons: ['received', 'return', 'damaged', 'count', 'correction'] as readonly string[],
  },
  /** S6-Q8: giá trị khởi tạo ngưỡng sắp hết (giá trị chạy lưu ở `store_settings.low_stock_default`). */
  defaultLowStockThreshold: 5,
  /** S6-Q9: khoảng giá (đồng). Đổi cần migration mới cho CHECK `chk_products_*`. */
  price: { min: 1000, max: 100_000_000 },
  /** BR-INV-19 / 21. */
  variant: { maxVariants: 32, maxColors: 8, sizes: ['S', 'M', 'L', 'XL'] as readonly string[] },
} as const;

export type CatalogPermission = 'catalog.read' | 'stock.adjust' | 'products.write' | 'media.upload' | 'stock.thresholds' | 'promotions.write';

/** S6-Q2 / BR-INV-02: staff đọc + điều chỉnh tồn; admin mọi việc. Một nguồn cho `requirePermission`. */
export const CATALOG_PERMISSIONS: Record<'staff' | 'admin', readonly CatalogPermission[]> = {
  staff: ['catalog.read', 'stock.adjust'],
  admin: ['catalog.read', 'stock.adjust', 'products.write', 'media.upload', 'stock.thresholds', 'promotions.write'],
};
