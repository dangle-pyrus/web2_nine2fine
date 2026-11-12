import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { Errors } from '../../lib/errors';
import { Db, ts } from '../../lib/sql';
import { parseBodyAll } from '../../lib/validate';
import { configFromRow, deliveryWindowOf, hotlineHref, StoreConfig } from '../store/settings.service';
import { diffConfig, mergeConfig } from './settings.diff';
import { settingsEventWriter } from './settings.event';
import { storeSettingsSchema } from './settings.schemas';

type SettingRow = NonNullable<Awaited<ReturnType<Db['storeSetting']['findUnique']>>>;

export interface SettingsActor {
  id: string;
  name: string;
}

/** `AdminStoreSettings`: dựng tường minh; không đọc / trả `bankTransferEnabled`. */
export function toAdminSettings(row: SettingRow) {
  const c = configFromRow(row);
  return {
    info: { ...c.info, hotlineHref: hotlineHref(c.info.hotline) },
    operations: c.operations,
    cart: c.cart,
    derived: { deliveryWindow: deliveryWindowOf(c.operations.deliveryDaysMin, c.operations.deliveryDaysMax), lowStockDefault: row.lowStockDefault },
    updatedAt: row.updatedAt.toISOString(),
  };
}
export type AdminStoreSettings = ReturnType<typeof toAdminSettings>;

/** Đường admin được phép ghi dòng mặc định khi thiếu (đường công khai thì không). */
async function ensureRow(db: Db, at: Date): Promise<void> {
  await db.$executeRaw(Prisma.sql`INSERT INTO "store_settings" ("id", "updated_at") VALUES (1, ${ts(at)}) ON CONFLICT ("id") DO NOTHING`);
}

export async function getAdminSettings(db: Db, at: Date): Promise<AdminStoreSettings> {
  let row = await db.storeSetting.findUnique({ where: { id: 1 } });
  if (!row) {
    await ensureRow(db, at);
    row = await db.storeSetting.findUniqueOrThrow({ where: { id: 1 } });
  }
  return toAdminSettings(row);
}

const columnsOf = (c: StoreConfig) => ({
  legalName: c.info.legalName,
  registrationNumber: c.info.registrationNumber,
  registrationIssuer: c.info.registrationIssuer,
  registrationDate: c.info.registrationDate ? new Date(`${c.info.registrationDate}T00:00:00.000Z`) : null,
  address: c.info.address,
  hotline: c.info.hotline,
  email: c.info.email,
  privacyEmail: c.info.privacyEmail,
  hours: c.info.hours,
  notificationUrl: c.info.notificationUrl,
  socialFacebook: c.info.social.facebook,
  socialInstagram: c.info.social.instagram,
  socialTiktok: c.info.social.tiktok,
  socialYoutube: c.info.social.youtube,
  ...c.operations,
  ...c.cart,
});

/**
 * Lưu cài đặt (plan mục 8.2). Zod trước (mọi lỗi theo trường, không mở giao dịch); rồi một giao dịch:
 * khoá dòng -> không đổi gì = 200 (không ghi) -> `updatedAt` lệch = 409 -> ghi + đúng 1 dòng nhật ký.
 */
export async function updateSettings(actor: SettingsActor, rawBody: unknown, now: Date): Promise<AdminStoreSettings> {
  const body = parseBodyAll(storeSettingsSchema(now), rawBody);
  return prisma.$transaction(
    async (tx) => {
      await ensureRow(tx, now);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "store_settings" WHERE "id" = 1 FOR UPDATE`);
      const row = await tx.storeSetting.findUniqueOrThrow({ where: { id: 1 } });
      const current = configFromRow(row);
      const next = mergeConfig(current, body);
      const changes = diffConfig(current, next);
      if (changes.length === 0) return toAdminSettings(row);
      if (new Date(body.updatedAt).getTime() !== row.updatedAt.getTime()) throw Errors.versionConflict();
      // updatedAt luôn tăng ngặt (đồng hồ giả / hai lần lưu cùng mili-giây không làm token cũ trùng token mới).
      const at = new Date(Math.max(now.getTime(), row.updatedAt.getTime() + 1));
      await tx.storeSetting.update({ where: { id: 1 }, data: { ...columnsOf(next), updatedAt: at } });
      await settingsEventWriter.insert(tx, { at, actor, changes });
      return toAdminSettings(await tx.storeSetting.findUniqueOrThrow({ where: { id: 1 } }));
    },
    { timeout: 10_000, maxWait: 5_000 },
  );
}
