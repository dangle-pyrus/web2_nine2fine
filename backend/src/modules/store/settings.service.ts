import { getConfig } from '../../config/env';
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
    bankTransferEnabled: row.bankTransferEnabled && getConfig().bank !== null,
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
