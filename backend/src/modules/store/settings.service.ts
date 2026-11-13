import { STORE_SETTINGS_SEED } from '../../config/assumptions';
import { getConfig } from '../../config/env';
import prisma from '../../config/prisma';
import type { Db } from '../../lib/sql';

export interface Settings {
  maxPerVariant: number;
  maxItemsPerOrder: number;
  maxCartLines: number;
  cartRetentionDays: number;
  shippingFee: number;
  freeShippingThreshold: number;
  codMaxTotal: number;
  codRefusalLimit: number;
  codRefusalMonths: number;
  codOpenOrderLimit: number;
  bankHoldMinutes: number;
  /** Hiệu lực = cờ DB VÀ đủ biến BANK_* (plan mục 4, G2). */
  bankTransferEnabled: boolean;
  deliveryDaysMin: number;
  deliveryDaysMax: number;
  cutoffHour: number;
}

export interface PolicyDto {
  maxPerVariant: number;
  maxItemsPerOrder: number;
  maxCartLines: number;
  shippingFee: number;
  freeShippingThreshold: number;
  codMaxTotal: number;
  bankHoldMinutes: number;
  bankTransferEnabled: boolean;
  cartRetentionDays: number;
}

/** Đọc dòng tham số duy nhất (id = 1). Thiếu dòng = chưa seed. */
export async function getSettings(db: Db): Promise<Settings> {
  const row = await db.storeSetting.findUnique({ where: { id: 1 } });
  if (!row) throw new Error('store_settings chưa được seed');
  return {
    maxPerVariant: row.maxPerVariant,
    maxItemsPerOrder: row.maxItemsPerOrder,
    maxCartLines: row.maxCartLines,
    cartRetentionDays: row.cartRetentionDays,
    shippingFee: row.shippingFee,
    freeShippingThreshold: row.freeShippingThreshold,
    codMaxTotal: row.codMaxTotal,
    codRefusalLimit: row.codRefusalLimit,
    codRefusalMonths: row.codRefusalMonths,
    codOpenOrderLimit: row.codOpenOrderLimit,
    bankHoldMinutes: row.bankHoldMinutes,
    // QR chỉ bật khi đủ: cờ DB + tài khoản nhận + cách xác nhận tiền về (khoá webhook SePay, hoặc chế độ giả lập).
    bankTransferEnabled:
      row.bankTransferEnabled && getConfig().bank !== null && (getConfig().sepayWebhookKey !== null || getConfig().paymentSimulator),
    deliveryDaysMin: row.deliveryDaysMin,
    deliveryDaysMax: row.deliveryDaysMax,
    cutoffHour: row.cutoffHour,
  };
}

export const toPolicy = (s: Settings): PolicyDto => ({
  maxPerVariant: s.maxPerVariant,
  maxItemsPerOrder: s.maxItemsPerOrder,
  maxCartLines: s.maxCartLines,
  shippingFee: s.shippingFee,
  freeShippingThreshold: s.freeShippingThreshold,
  codMaxTotal: s.codMaxTotal,
  bankHoldMinutes: s.bankHoldMinutes,
  bankTransferEnabled: s.bankTransferEnabled,
  cartRetentionDays: s.cartRetentionDays,
});

/* ======================= Slice 8: thông tin cửa hàng, công khai ======================= */

export type StoreInfo = {
  legalName: string;
  registrationNumber: string;
  registrationIssuer: string;
  registrationDate: string | null;
  address: string;
  hotline: string;
  email: string;
  privacyEmail: string;
  hours: string;
  notificationUrl: string;
  social: { facebook: string; instagram: string; tiktok: string; youtube: string };
};
export type StoreOperations = {
  shippingFee: number;
  freeShippingThreshold: number;
  bankHoldMinutes: number;
  codMaxTotal: number;
  deliveryDaysMin: number;
  deliveryDaysMax: number;
  cutoffHour: number;
};
export type StoreCart = {
  maxPerVariant: number;
  maxItemsPerOrder: number;
  maxCartLines: number;
  cartRetentionDays: number;
  codRefusalLimit: number;
  codRefusalMonths: number;
  codOpenOrderLimit: number;
};
/** Phần cài đặt Slice 8 sửa được, dạng lồng (khớp thân `PUT /admin/settings/store`). */
export type StoreConfig = { info: StoreInfo; operations: StoreOperations; cart: StoreCart };

type SettingRow = NonNullable<Awaited<ReturnType<Db['storeSetting']['findUnique']>>>;

const isoDay = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

/** Dựng tường minh từng trường (không spread dòng DB: cột mới sau này không tự rò ra ngoài). */
export function configFromRow(r: SettingRow): StoreConfig {
  return {
    info: {
      legalName: r.legalName,
      registrationNumber: r.registrationNumber,
      registrationIssuer: r.registrationIssuer,
      registrationDate: isoDay(r.registrationDate),
      address: r.address,
      hotline: r.hotline,
      email: r.email,
      privacyEmail: r.privacyEmail,
      hours: r.hours,
      notificationUrl: r.notificationUrl,
      social: { facebook: r.socialFacebook, instagram: r.socialInstagram, tiktok: r.socialTiktok, youtube: r.socialYoutube },
    },
    operations: {
      shippingFee: r.shippingFee,
      freeShippingThreshold: r.freeShippingThreshold,
      bankHoldMinutes: r.bankHoldMinutes,
      codMaxTotal: r.codMaxTotal,
      deliveryDaysMin: r.deliveryDaysMin,
      deliveryDaysMax: r.deliveryDaysMax,
      cutoffHour: r.cutoffHour,
    },
    cart: {
      maxPerVariant: r.maxPerVariant,
      maxItemsPerOrder: r.maxItemsPerOrder,
      maxCartLines: r.maxCartLines,
      cartRetentionDays: r.cartRetentionDays,
      codRefusalLimit: r.codRefusalLimit,
      codRefusalMonths: r.codRefusalMonths,
      codOpenOrderLimit: r.codOpenOrderLimit,
    },
  };
}

export const seedConfig = (): StoreConfig => ({
  info: { ...STORE_SETTINGS_SEED.info, social: { ...STORE_SETTINGS_SEED.info.social } },
  operations: { ...STORE_SETTINGS_SEED.operations },
  cart: { ...STORE_SETTINGS_SEED.cart },
});

export const hotlineHref = (hotline: string): string => `tel:${hotline.replace(/\D/g, '')}`;
export const deliveryWindowOf = (min: number, max: number): string => `${min}–${max} ngày`;

export interface PublicSettings {
  info: {
    legalName: string;
    registrationNumber: string;
    registrationIssuer: string;
    registrationDate: string | null;
    address: string;
    hotline: string;
    hotlineHref: string;
    email: string;
    privacyEmail: string;
    hours: string;
    notificationUrl: string | null;
    social: { facebook: string | null; instagram: string | null; tiktok: string | null; youtube: string | null };
  };
  policy: { freeShippingFrom: number; shippingFee: number; deliveryWindow: string; paymentHoldMinutes: number };
}

const orNull = (s: string): string | null => (s === '' ? null : s);

/** Whitelist `StorePublicSettings` (BR-SET-10): chuỗi rỗng của trường tuỳ chọn -> null. */
export function toPublic(c: StoreConfig): PublicSettings {
  const i = c.info;
  return {
    info: {
      legalName: i.legalName,
      registrationNumber: i.registrationNumber,
      registrationIssuer: i.registrationIssuer,
      registrationDate: i.registrationDate,
      address: i.address,
      hotline: i.hotline,
      hotlineHref: hotlineHref(i.hotline),
      email: i.email,
      privacyEmail: i.privacyEmail,
      hours: i.hours,
      notificationUrl: orNull(i.notificationUrl),
      social: { facebook: orNull(i.social.facebook), instagram: orNull(i.social.instagram), tiktok: orNull(i.social.tiktok), youtube: orNull(i.social.youtube) },
    },
    policy: {
      freeShippingFrom: c.operations.freeShippingThreshold,
      shippingFee: c.operations.shippingFee,
      deliveryWindow: deliveryWindowOf(c.operations.deliveryDaysMin, c.operations.deliveryDaysMax),
      paymentHoldMinutes: c.operations.bankHoldMinutes,
    },
  };
}

/** Công khai: thiếu dòng -> mặc định dựng sẵn (không ghi DB, không ném lỗi như `getSettings()`). */
export async function getPublicSettings(db: Db): Promise<PublicSettings> {
  const row = await db.storeSetting.findUnique({ where: { id: 1 } });
  return toPublic(row ? configFromRow(row) : seedConfig());
}

/** Thông tin liên hệ in ở chân thư. Lỗi đọc -> mặc định seed (thư không bao giờ vì vậy mà hỏng). */
export async function mailContact(): Promise<{ hotline: string }> {
  try {
    return { hotline: (await getPublicSettings(prisma)).info.hotline };
  } catch {
    return { hotline: STORE_SETTINGS_SEED.info.hotline };
  }
}
