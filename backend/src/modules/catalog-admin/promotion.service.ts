import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { now as clockNow } from '../../lib/clock';
import { AppError, Errors } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { isRetryable } from '../../lib/retry';
import type { Db } from '../../lib/sql';
import { UUID_RE } from '../../lib/validate';
import type { PromotionCreateInput, PromotionUpdateInput } from './inventory-promotion.schemas';
import { AdminPromotionDto, loadPromotion } from './promotion.query';
import type { Actor } from './product.write';

/**
 * Ghi khuyến mãi = voucher (plan mục 8, BR-INV-38..44). Khoá voucher là khoá ĐẦU của thứ tự toàn hệ thống (cùng `placeOrder`,
 * `cancelOrderTx`), nên sửa `usageLimit` và tăng `used_count` tuần tự hoá nhau. Phiên bản = `COALESCE(admin_updated_at, created_at)`:
 * checkout chỉ cập nhật `updated_at` / `used_count`, không bao giờ làm admin thấy xung đột giả.
 */

const TX = { timeout: 10_000, maxWait: 5_000 } as const;
const DB_KIND = { percent: 'percent', fixed: 'fixed', 'free-shipping': 'free_shipping' } as const;

async function inTx<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(fn, TX);
    } catch (err) {
      if (!(err instanceof AppError) && attempt < 3 && isRetryable(err)) continue;
      throw err;
    }
  }
}

const isUnique = (e: unknown): boolean => (e as { code?: string })?.code === 'P2002';
const isFk = (e: unknown): boolean => (e as { code?: string })?.code === 'P2003' || (e as { meta?: { code?: string } })?.meta?.code === '23503';

interface Locked {
  code: string;
  kind: string;
  value: number | null;
  max_discount: number | null;
  used_count: number;
  is_active: boolean;
  starts_at: Date | null;
  version_ms: number;
}

/** Khoá dòng voucher (khoá đầu tiên của thứ tự toàn hệ thống). */
async function lockVoucher(tx: Db, id: string): Promise<Locked> {
  if (!UUID_RE.test(id)) throw Errors.notFound('Không tìm thấy khuyến mãi.');
  const rows = await tx.$queryRaw<Locked[]>(Prisma.sql`
    SELECT code, kind::text AS kind, value, max_discount, used_count, is_active, starts_at,
           floor(extract(epoch FROM COALESCE(admin_updated_at, created_at)) * 1000)::float8 AS version_ms
    FROM vouchers WHERE voucher_id = ${id}::uuid FOR UPDATE`);
  if (!rows[0]) throw Errors.notFound('Không tìm thấy khuyến mãi.');
  return rows[0];
}

const checkVersion = (row: Locked, updatedAt: string): void => {
  if (Number(row.version_ms) !== Date.parse(updatedAt)) throw Errors.versionConflict();
};

async function categoryIdOf(tx: Db, slugs: string[] | undefined): Promise<string | null> {
  if (!slugs || slugs.length === 0) return null;
  const c = await tx.category.findUnique({ where: { slug: slugs[0] } });
  if (!c) throw Errors.validation('Danh mục không tồn tại.', 'categories');
  return c.category_id;
}

export async function createPromotion(actor: Actor, input: PromotionCreateInput): Promise<AdminPromotionDto> {
  const at = clockNow();
  const startsAt = input.startsAt ?? at;
  const endsAt = input.endsAt ?? null;
  if (endsAt !== null && endsAt.getTime() <= at.getTime()) throw Errors.validation('Thời điểm kết thúc phải sau bây giờ.', 'endsAt');
  if (endsAt !== null && endsAt.getTime() <= startsAt.getTime()) throw Errors.validation('Thời điểm kết thúc phải sau thời điểm bắt đầu.', 'endsAt');
  try {
    const id = await inTx(async (tx) => {
      if (await tx.voucher.findUnique({ where: { code: input.code }, select: { voucher_id: true } })) {
        throw Errors.duplicate('code', 'Mã khuyến mãi này đã tồn tại.');
      }
      const categoryId = await categoryIdOf(tx, input.categories);
      const v = await tx.voucher.create({
        data: {
          code: input.code,
          name: input.title,
          kind: DB_KIND[input.type],
          value: input.value ?? null,
          maxDiscount: input.maxDiscount ?? null,
          minSubtotal: input.minSubtotal,
          isActive: input.enabled,
          startsAt,
          endsAt,
          totalLimit: input.usageLimit ?? null,
          perUserLimit: input.perCustomerLimit,
          membersOnly: input.audience === 'members',
          firstOrderOnly: input.firstOrderOnly ?? false,
          categoryId,
          excludeSaleItems: input.excludeSaleItems ?? false,
          createdAt: at,
          adminUpdatedAt: at,
          updatedById: actor.id,
        },
        select: { voucher_id: true },
      });
      return v.voucher_id;
    });
    logger.info('admin-promotion-create', { id, userId: actor.id });
    return await loadPromotion(prisma, id);
  } catch (err) {
    if (isUnique(err)) throw Errors.duplicate('code', 'Mã khuyến mãi này đã tồn tại.');
    throw err;
  }
}

export async function updatePromotion(actor: Actor, id: string, input: PromotionUpdateInput): Promise<AdminPromotionDto> {
  const at = clockNow();
  await inTx(async (tx) => {
    const cur = await lockVoucher(tx, id);
    checkVersion(cur, input.updatedAt);
    if (input.code !== cur.code) throw Errors.validation('Mã khuyến mãi không đổi được sau khi tạo.', 'code');

    const hasRedemptions = (await tx.voucherRedemption.count({ where: { voucherId: id } })) > 0;
    const kind = DB_KIND[input.type];
    if (hasRedemptions && (kind !== cur.kind || (input.value ?? null) !== cur.value || (input.maxDiscount ?? null) !== cur.max_discount)) {
      throw Errors.voucherInUse('Mã đã được dùng; hãy tạo mã mới.');
    }
    const usageLimit = input.usageLimit === undefined ? undefined : input.usageLimit;
    if (usageLimit !== undefined && usageLimit !== null && usageLimit < cur.used_count) {
      throw Errors.validation(`Tổng lượt không được thấp hơn ${cur.used_count} lượt đã dùng.`, 'totalLimit');
    }
    const startsAt = input.startsAt === undefined ? undefined : input.startsAt;
    const effectiveStart = startsAt === undefined ? cur.starts_at : startsAt;
    if (input.endsAt && effectiveStart && input.endsAt.getTime() <= effectiveStart.getTime()) {
      throw Errors.validation('Thời điểm kết thúc phải sau thời điểm bắt đầu.', 'endsAt');
    }
    const categoryId = input.categories === undefined ? undefined : await categoryIdOf(tx, input.categories);

    // Trường tuỳ chọn vắng = giữ nguyên (như PUT sản phẩm); `null` rõ ràng ở usageLimit / endsAt / startsAt = bỏ giới hạn.
    await tx.voucher.update({
      where: { voucher_id: id },
      data: {
        name: input.title,
        kind,
        value: input.value ?? null,
        maxDiscount: input.maxDiscount ?? null,
        minSubtotal: input.minSubtotal,
        isActive: input.enabled,
        ...(startsAt !== undefined ? { startsAt } : {}),
        ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
        ...(usageLimit !== undefined ? { totalLimit: usageLimit } : {}),
        perUserLimit: input.perCustomerLimit,
        ...(input.audience !== undefined ? { membersOnly: input.audience === 'members' } : {}),
        ...(input.firstOrderOnly !== undefined ? { firstOrderOnly: input.firstOrderOnly } : {}),
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(input.excludeSaleItems !== undefined ? { excludeSaleItems: input.excludeSaleItems } : {}),
        adminUpdatedAt: at,
        updatedById: actor.id,
      },
    });
  });
  logger.info('admin-promotion-update', { id, userId: actor.id });
  return loadPromotion(prisma, id);
}

export async function setPromotionEnabled(actor: Actor, id: string, enabled: boolean, updatedAt: string | undefined): Promise<AdminPromotionDto> {
  const at = clockNow();
  await inTx(async (tx) => {
    const cur = await lockVoucher(tx, id);
    if (updatedAt !== undefined) checkVersion(cur, updatedAt);
    if (cur.is_active === enabled) return; // đặt đúng giá trị hiện có: 200, không đổi phiên bản
    await tx.voucher.update({ where: { voucher_id: id }, data: { isActive: enabled, adminUpdatedAt: at, updatedById: actor.id } });
  });
  logger.info('admin-promotion-enabled', { id, enabled, userId: actor.id });
  return loadPromotion(prisma, id);
}

export async function deletePromotion(id: string): Promise<void> {
  try {
    await inTx(async (tx) => {
      await lockVoucher(tx, id);
      // Có bản ghi lượt dùng (kể cả đã trả lượt) -> không xoá; FK RESTRICT là đai cuối.
      if ((await tx.voucherRedemption.count({ where: { voucherId: id } })) > 0) {
        throw Errors.voucherInUse('Mã đã có lượt dùng nên không xoá được; hãy tắt thay vì xoá.');
      }
      await tx.voucher.delete({ where: { voucher_id: id } });
    });
  } catch (err) {
    if (isFk(err)) throw Errors.voucherInUse('Mã đã có lượt dùng nên không xoá được; hãy tắt thay vì xoá.');
    throw err;
  }
}
