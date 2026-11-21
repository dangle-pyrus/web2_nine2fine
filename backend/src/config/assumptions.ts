import { DAY, HOUR, MINUTE } from '../lib/clock';

/**
 * GIẢ ĐỊNH CHỜ THẮNG (Slice 3), gom một chỗ để đổi dễ. Đổi hành vi ở đây là đổi contract locked (qua handoff).
 * - Q1 COMMON: tên trạng thái nằm ở enum DB `order_status` / `payment_status` (đổi cần migration + contract).
 * - Q2 QR/SePay: đã tích hợp (webhook `POST /api/payments/sepay/webhook`); chỉ bật khi cờ DB `store_settings.bank_transfer_enabled` = true VÀ đủ BANK_* + SEPAY_WEBHOOK_KEY.
 * - Q3 địa giới: 34 tỉnh/thành, seed `prisma/seed-data/vn-locations.json`.
 * - Q4 huỷ `to_ship`: thay bởi S4-Q1 (xem `toShipCancelMode`); lát 4.5 đã phát hành với 'request'.
 */
/**
 * Chuẩn OTP chung (Thắng chốt 2026-11-14) cho mọi luồng dùng mã qua email: đăng nhập, đăng ký, quên mật khẩu, tra cứu đơn.
 * 6 chữ số, hiệu lực 5 phút, dùng một lần; gửi lại sau 60 giây, 5 lần / 30 phút / email, 10 lần / giờ / IP;
 * sai 5 lần thì mã bị vô hiệu và khoá xác thực bằng mã 15 phút.
 */
export const OTP_POLICY = {
  digits: 6,
  ttlMs: 5 * MINUTE,
  resendSeconds: 60,
  sendPerEmailMax: 5,
  sendPerEmailWindowMs: 30 * MINUTE,
  sendPerIpMax: 10,
  sendPerIpWindowMs: HOUR,
  maxWrong: 5,
  lockMs: 15 * MINUTE,
} as const;

export const ASSUMPTIONS = {
  /** Q1: mã giảm % làm tròn xuống tới bội số này (đồng). */
  percentRoundStep: 1000,
  /** Q1: OTP tra cứu đơn khách theo `OTP_POLICY` (6 số, 5 phút, gửi lại sau 60 giây, sai 5 lần khoá 15 phút). */
  lookupOtpResendSeconds: OTP_POLICY.resendSeconds,
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
  /** COMMON-01.9 / ORD-11: đơn `to_receive` không có phản hồi sau khoảng này (tính từ lúc bàn giao) thì hệ thống tự hoàn thành. */
  autoCompleteAfterMs: 7 * DAY,
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
    /** 2026-11-21: nới 12 -> 120 cho dữ liệu thật (mỗi màu một bộ ảnh, có sản phẩm 7 màu x ~16 ảnh). */
    maxPerProduct: 120,
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
  /** BR-CAT-19 / M-1: /api/media có bộ đếm riêng (cao hơn catalog) để duyệt trang nhiều ảnh không làm 429 catalog. */
  mediaRateLimit: { max: 600, windowMs: 60_000 },
  /** BR-INV-19 / 21. */
  /** 2026-11-21: size theo thứ tự may mặc (chữ, FREESIZE, size số 34–56) cho dữ liệu sản phẩm thật. Đổi cần migration cho CHECK `chk_variants_size`. */
  variant: { maxVariants: 32, maxColors: 8, sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'FREESIZE', '34', '36', '38', '40', '42', '44', '46', '48', '50', '52', '54', '56'] as readonly string[] },
} as const;

export type CatalogPermission = 'catalog.read' | 'stock.adjust' | 'products.write' | 'media.upload' | 'stock.thresholds' | 'promotions.write';

/** S6-Q2 / BR-INV-02: staff đọc + điều chỉnh tồn; admin mọi việc. Một nguồn cho `requirePermission`. */
export const CATALOG_PERMISSIONS: Record<'staff' | 'admin', readonly CatalogPermission[]> = {
  staff: ['catalog.read', 'stock.adjust'],
  admin: ['catalog.read', 'stock.adjust', 'products.write', 'media.upload', 'stock.thresholds', 'promotions.write'],
};

/**
 * GIẢ ĐỊNH Slice 7 (S7-Q1..Q9, mặc định PO; Orchestrator duyệt plan 2026-11-11).
 * Đổi một câu trả lời = sửa đúng một chỗ ở đây + BR/contract theo quy trình.
 */
export const USERS_ASSUMPTIONS = {
  /** S7-Q4: lý do khoá 5..250 ký tự (CHECK DB `chk_account_events_reason` cùng giới hạn). */
  reason: { min: 5, max: 250 },
  /** S7-Q9. */
  name: { min: 2, max: 100 },
  listLimit: { default: 20, max: 50 },
  maxStaff: 200,
  recentOrders: 10,
  historyLimit: 20,
  /** S7-Q9: 10 lần tạo nhân viên / 60 phút / admin. */
  staffCreateRateLimit: { max: 10, windowMs: 60 * 60_000 },
  /** Khoá cố vấn toàn cục (pg_advisory_xact_lock) cho mọi thao tác nhân viên: chống để lại 0 admin hoạt động. */
  adminGuardKey: 7_000_001,
  q: { max: 100, minDigits: 4 },
} as const;

export type UserPermission = 'customers.view' | 'customers.contact' | 'customers.edit' | 'settings.staff';

/** S7-Q2, Q3: staff chỉ xem khách (liên hệ đã che); admin mọi việc. Cùng tên với `frontend/.../permissions.ts`. */
export const USER_PERMISSIONS: Record<'staff' | 'admin', readonly UserPermission[]> = {
  staff: ['customers.view'],
  admin: ['customers.view', 'customers.contact', 'customers.edit', 'settings.staff'],
};

export const canSeeContact = (role: string): boolean =>
  (role === 'staff' || role === 'admin') && USER_PERMISSIONS[role].includes('customers.contact');

/**
 * GIẢ ĐỊNH Slice 8 (S8-Q1..Q10, mặc định PO; Orchestrator duyệt plan 2026-11-12).
 * Đổi một câu trả lời = sửa đúng một chỗ ở đây (hoặc `revenue.sql.ts` cho S8-Q1) + BR/contract theo quy trình.
 */
export const INSIGHTS_ASSUMPTIONS = {
  /** S8-Q5: báo cáo <= 366 ngày, nhật ký <= 92 ngày. */
  reportMaxDays: 366,
  auditMaxDays: 92,
  /** Khoảng mặc định khi thiếu `from`: `to` - 29 ngày (30 ngày gồm hai đầu). */
  defaultSpanDays: 29,
  topDashboard: 5,
  topReport: 10,
  auditLimit: { default: 20, max: 50 },
  /** S8-Q9: `Cache-Control: public, max-age=<giây>` của `GET /store/settings`. */
  publicSettingsMaxAge: 60,
} as const;

export type InsightPermission = 'dashboard.view' | 'dashboard.revenue' | 'settings.store' | 'settings.audit';

/** Cùng tên với `frontend/src/app/admin/core/permissions.ts`. S8-Q2: staff không thấy tiền ở Tổng quan. */
export const INSIGHT_PERMISSIONS: Record<'staff' | 'admin', readonly InsightPermission[]> = {
  staff: ['dashboard.view'],
  admin: ['dashboard.view', 'dashboard.revenue', 'settings.store', 'settings.audit'],
};

/**
 * Giá trị mặc định thông tin cửa hàng + tham số (= `STORE_INFO` / `STORE_POLICY` của FE và DEFAULT của migration
 * 20261112000100). Dùng khi thiếu dòng `store_settings` (`GET /store/settings` không ghi DB, không 500).
 */
export const STORE_SETTINGS_SEED = {
  info: {
    legalName: 'Công ty TNHH Thời trang Nine2Fine',
    registrationNumber: '0319245768',
    registrationIssuer: 'Sở Tài chính TP. Hồ Chí Minh',
    registrationDate: '2025-08-15' as string | null,
    address: 'Tầng 5, 172 Hai Bà Trưng, Phường Tân Định, TP. Hồ Chí Minh',
    hotline: '1900 6868 29',
    email: 'cskh@nine2fine.vn',
    privacyEmail: 'dulieu@nine2fine.vn',
    hours: '9:00 – 21:00, tất cả các ngày trong tuần',
    notificationUrl: '',
    social: { facebook: '', instagram: '', tiktok: '', youtube: '' },
  },
  operations: {
    shippingFee: 30_000,
    freeShippingThreshold: 1_000_000,
    bankHoldMinutes: 30,
    codMaxTotal: 5_000_000,
    deliveryDaysMin: 2,
    deliveryDaysMax: 4,
    cutoffHour: 16,
  },
  cart: {
    /** Giỏ khách: tối đa 10 / sản phẩm (biến thể) — đổi từ 5 ngày 2026-11-17; khớp mặc định DB `store_settings.max_per_variant`. */
    maxPerVariant: 10,
    maxItemsPerOrder: 20,
    maxCartLines: 30,
    cartRetentionDays: 30,
    codRefusalLimit: 2,
    codRefusalMonths: 6,
    codOpenOrderLimit: 3,
  },
  lowStockDefault: 5,
} as const;

/** Trần số lượng mỗi sản phẩm trong giỏ / đơn của khách (DTO giỏ + đặt hàng). Một nguồn duy nhất. */
export const CART_MAX_PER_VARIANT: number = STORE_SETTINGS_SEED.cart.maxPerVariant;

/**
 * GIẢ ĐỊNH Slice 9 (S9-Q1..Q14, mặc định PO; Orchestrator duyệt plan 2026-11-12).
 * Đổi một câu trả lời = sửa đúng một chỗ ở đây (hoặc `return-rules.ts` / `return-amount.ts`) + BR/contract theo quy trình.
 */
export const RETURNS_ASSUMPTIONS = {
  /** S9-Q2: hạn trả = hết 23:59:59 giờ VN của ngày thứ N kể từ ngày giao (ngày giao = ngày 0). */
  windowDays: 30,
  /** S9-Q3: phí gửi trả (đồng), chỉ khi lỗi của khách. Hằng số chính sách, không sửa ở Cài đặt. */
  returnShippingFee: 30_000,
  /** S9-Q4: ảnh minh chứng (kho riêng tư). */
  photo: {
    maxBytes: 5 * 1024 * 1024,
    minShort: 200,
    maxLong: 8000,
    max: 5,
    attachWindowMs: 24 * HOUR,
  },
  /** S9-Q12: mốc "dự kiến" (không ép). */
  overdueHours: 24,
  refundWorkingDays: 3,
  /** Giới hạn tần suất (key = tài khoản). */
  createRateLimit: { max: 10, windowMs: HOUR },
  photoRateLimit: { max: 30, windowMs: HOUR },
  listLimit: { default: 20, max: 50 },
  q: { max: 100, minDigits: 4 },
} as const;

export type ReturnPermission = 'returns.process' | 'returns.refund';

/** S9-Q7: staff xem / duyệt / từ chối / nhận hàng; chỉ admin xác nhận hoàn tiền + xem số tài khoản đầy đủ. Cùng tên với `frontend/.../permissions.ts`. */
export const RETURN_PERMISSIONS: Record<'staff' | 'admin', readonly ReturnPermission[]> = {
  staff: ['returns.process'],
  admin: ['returns.process', 'returns.refund'],
};
/**
 * GIẢ ĐỊNH Slice 10 (S10-Q1..Q12, mặc định PO 2026-11-13; contract `docs/api/openapi.yaml` locked).
 * Đổi một câu trả lời = sửa đúng một chỗ ở đây + BR/contract theo quy trình. Mỗi nhóm do một lát sở hữu; lát khác chỉ đọc.
 */
export const P1_ASSUMPTIONS = {
  /** 10.5 BR-REV-01..07. */
  reviews: {
    eligibleDays: 365,
    title: { min: 2, max: 80 },
    body: { min: 20, max: 1000 },
    heightMax: 20,
    hideReason: { min: 5, max: 250 },
    reply: { min: 5, max: 500 },
    listLimit: { default: 10, max: 20 },
    adminLimit: { default: 20, max: 50 },
    lowRatingMax: 2,
    createRateLimit: { max: 5, windowMs: HOUR },
    publicMaxAge: 10,
  },
  /** 10.4 BR-WISH-02, 04, BR-P1-05. */
  wishlist: {
    max: 100,
    mergeMax: 100,
    writeRateLimit: { max: 60, windowMs: MINUTE },
  },
  /** 10.6 BR-REC-01..03, 05 (Should). */
  recommendations: {
    limit: { default: 4, max: 8 },
    maxInputs: 10,
    maxAge: 30,
    coPurchaseMinOrders: 3,
    coPurchaseDays: 365,
  },
  /** 10.3 + 10.8 BR-MOM, BR-CMS. */
  content: {
    homeMaxAge: 60,
    sizeChartMaxAge: 60,
    maxBlocks: 16,
    maxCategories: 8,
    eyebrowMax: 40,
    titleMax: 80,
    descriptionMax: 200,
    labelMax: 40,
    captionMax: 40,
    productCardsMax: 6,
    momentLineMax: 60,
    momentLinesMax: 2,
    hrefMax: 200,
    moments: ['work', 'dinner', 'event', 'weekend'] as const,
    sizeChart: { maxRows: 12, maxCols: 8, sizeLabel: { min: 1, max: 10 }, cellMax: 20, columnMax: 20 },
  },
  /** 10.7 BR-PROMO-01, 07. */
  promo: {
    maxDays: 90,
    minSalePrice: 1000,
    bulkPercent: { min: 5, max: 70 },
    bulkRoundStep: 1000,
  },
  /** 10.8 BR-CMS-07 (Should). */
  collections: {
    maxProducts: 200,
    nameMax: 80,
    slug: { min: 2, max: 50 },
    descriptionMax: 300,
  },
  /** 10.2 BR-RET-62, 63 (S10-Q11): giới hạn trả hàng vãng lai; key = băm grant (`n2f_oa`) hoặc IP. */
  guestReturn: {
    createPerGrant: { max: 5, windowMs: HOUR },
    createPerIp: { max: 10, windowMs: HOUR },
    photoPerGrant: { max: 30, windowMs: HOUR },
    photoPerIp: { max: 60, windowMs: HOUR },
  },
} as const;

export type ContentPermission = 'reviews.moderate' | 'content.view' | 'content.edit';

/**
 * BR-P1-03 / S10-Q10: staff kiểm duyệt đánh giá + xem nội dung; chỉ admin sửa nội dung / bảng size / bộ sưu tập.
 * Giá khuyến mãi dùng `promotions.write` (= `promotions.edit` ở PRD) + `products.write`, cả hai chỉ admin. Cùng tên với `frontend/.../permissions.ts`.
 */
export const CONTENT_PERMISSIONS: Record<'staff' | 'admin', readonly ContentPermission[]> = {
  staff: ['reviews.moderate', 'content.view'],
  admin: ['reviews.moderate', 'content.view', 'content.edit'],
};
