import { Prisma } from '@prisma/client';
import type { Voucher } from '@prisma/client';
import type { Db } from '../../lib/sql';
import { discountAmount, PricingLine, sumValue } from '../checkout/pricing';
import type { LineCtx } from '../checkout/lines.service';

/** Kiểm / áp mã giảm giá (BR-VOU-01..13, plan mục 4.10). */

export type VoucherKindDto = 'discount' | 'free-shipping';
export type VoucherReason =
  | 'not-found'
  | 'not-started'
  | 'expired'
  | 'exhausted'
  | 'login-required'
  | 'per-user-limit'
  | 'first-order-only'
  | 'category-mismatch'
  | 'excluded-sale-items'
  | 'min-spend'
  | 'shipping-already-free';

export interface VoucherAppliedDto {
  applied: true;
  code: string;
  kind: VoucherKindDto;
  label: string;
  amount: number;
}
export interface VoucherRejectionDto {
  applied: false;
  code: string;
  reason: VoucherReason;
  startsAt?: string;
  missingAmount?: number;
  minSubtotal?: number;
  categoryName?: string;
}

export interface Customer {
  userId?: string;
  phone?: string;
  email?: string;
}

export interface EvaluateInput {
  db: Db;
  codes: readonly string[];
  /** Chỉ các dòng còn hàng (effectiveQuantity > 0) tính tiền. */
  lines: readonly LineCtx[];
  customer: Customer;
  now: Date;
  /** Tiền hàng đã đạt ngưỡng miễn phí giao (xét trước voucher). */
  thresholdFree: boolean;
}

export interface AppliedDiscount {
  row: Voucher;
  eligibleVariantIds: Set<string>;
  amount: number;
}

export interface EvaluateResult {
  vouchers: VoucherAppliedDto[];
  rejected: VoucherRejectionDto[];
  discount?: AppliedDiscount;
  freeShip?: { row: Voucher };
  /** Số mã không tồn tại (cộng vào bộ đếm chống dò, BR-VOU-09). */
  notFoundCount: number;
}

const CODE_RE = /^[A-Z0-9]{4,20}$/;

/** Server trim, bỏ khoảng trắng, chuyển chữ hoa (BR-VOU-02). */
export const normalizeVoucherCode = (raw: string): string => raw.replace(/\s+/g, '').toUpperCase();

const groupOf = (kind: Voucher['kind']): VoucherKindDto => (kind === 'free_shipping' ? 'free-shipping' : 'discount');

const toPricingLines = (lines: readonly LineCtx[]): PricingLine[] =>
  lines.map((l) => ({ variantId: l.variantId, unitPrice: l.unitPrice, quantity: l.effectiveQuantity }));

function identityConditions(c: Customer, cols: { user: string; phone: string; email: string }): Prisma.Sql | null {
  const parts: Prisma.Sql[] = [];
  if (c.userId) parts.push(Prisma.sql`${Prisma.raw(cols.user)} = ${c.userId}::uuid`);
  if (c.phone) parts.push(Prisma.sql`${Prisma.raw(cols.phone)} = ${c.phone}`);
  if (c.email) parts.push(Prisma.sql`${Prisma.raw(cols.email)} = ${c.email}`);
  return parts.length ? Prisma.join(parts, ' OR ') : null;
}

/** Số lượt còn tính của cùng khách (tài khoản, hoặc SĐT, hoặc email trùng). */
export async function countCustomerRedemptions(db: Db, voucherId: string, c: Customer): Promise<number> {
  const cond = identityConditions(c, { user: '"user_id"', phone: '"phone"', email: '"email"' });
  if (!cond) return 0;
  const rows = await db.$queryRaw<Array<{ c: number }>>(
    Prisma.sql`SELECT COUNT(*)::int AS c FROM "voucher_redemptions"
               WHERE "voucher_id" = ${voucherId}::uuid AND "released_at" IS NULL AND (${cond})`,
  );
  return rows[0]?.c ?? 0;
}

/** Khách đã có đơn còn hiệu lực (không `cancelled`) theo tài khoản / SĐT / email. */
export async function hasActiveOrder(db: Db, c: Customer): Promise<boolean> {
  const cond = identityConditions(c, { user: '"user_id"', phone: '"recipient_phone"', email: '"email"' });
  if (!cond) return false;
  const rows = await db.$queryRaw<Array<{ x: number }>>(
    Prisma.sql`SELECT 1 AS x FROM "orders" WHERE "status" <> 'cancelled' AND (${cond}) LIMIT 1`,
  );
  return rows.length > 0;
}

/** Điều kiện (5) lượt riêng và (6) đơn đầu tiên; dùng lại sau khi khoá dòng voucher lúc đặt hàng. */
export async function customerRuleViolation(
  db: Db,
  v: Pick<Voucher, 'voucher_id' | 'perUserLimit' | 'firstOrderOnly'>,
  customer: Customer,
): Promise<'per-user-limit' | 'first-order-only' | null> {
  if ((await countCustomerRedemptions(db, v.voucher_id, customer)) >= v.perUserLimit) return 'per-user-limit';
  if (v.firstOrderOnly && (await hasActiveOrder(db, customer))) return 'first-order-only';
  return null;
}

export async function evaluateVouchers(input: EvaluateInput): Promise<EvaluateResult> {
  const { db, lines, customer, now } = input;
  const result: EvaluateResult = { vouchers: [], rejected: [], notFoundCount: 0 };

  const normalized: string[] = [];
  for (const raw of input.codes) {
    const code = normalizeVoucherCode(raw);
    if (!normalized.includes(code)) normalized.push(code);
  }
  const valid = normalized.filter((c) => CODE_RE.test(c));
  const rows = valid.length
    ? await db.voucher.findMany({ where: { code: { in: valid } }, include: { category: { select: { name: true } } } })
    : [];
  const byCode = new Map(rows.map((r) => [r.code, r]));

  const winners: { discount?: { code: string; applied: VoucherAppliedDto; data: AppliedDiscount }; free?: { code: string; applied: VoucherAppliedDto; row: Voucher } } = {};

  for (const code of normalized) {
    const row = byCode.get(code);
    const reject = (r: Omit<VoucherRejectionDto, 'applied' | 'code'>) =>
      result.rejected.push({ applied: false, code, ...r });
    if (!row) {
      result.notFoundCount++;
      reject({ reason: 'not-found' });
      continue;
    }
    // (2) bật + trong hiệu lực: tắt = hết hạn (AC-VOU-02/03).
    if (!row.isActive || (row.endsAt && row.endsAt <= now)) {
      reject({ reason: 'expired' });
      continue;
    }
    if (row.startsAt && row.startsAt > now) {
      reject({ reason: 'not-started', startsAt: row.startsAt.toISOString() });
      continue;
    }
    // (3) lượt chung (lượt đang giữ cho đơn chờ thanh toán đã nằm trong used_count).
    if (row.totalLimit !== null && row.usedCount >= row.totalLimit) {
      reject({ reason: 'exhausted' });
      continue;
    }
    // (4) chỉ thành viên.
    if (row.membersOnly && !customer.userId) {
      reject({ reason: 'login-required' });
      continue;
    }
    // (5) lượt riêng, (6) đơn đầu tiên.
    const violation = await customerRuleViolation(db, row, customer);
    if (violation) {
      reject({ reason: violation });
      continue;
    }
    // (7) danh mục / hàng đang giảm (Should, BR-VOU-13).
    let eligible = lines;
    if (row.categoryId) {
      eligible = eligible.filter((l) => l.categoryId === row.categoryId);
      if (eligible.length === 0) {
        reject({ reason: 'category-mismatch', categoryName: row.category?.name });
        continue;
      }
    }
    if (row.excludeSaleItems) {
      eligible = eligible.filter((l) => !l.onSale);
      if (eligible.length === 0) {
        reject({ reason: 'excluded-sale-items' });
        continue;
      }
    }
    // (8) tiền hàng đủ điều kiện >= mức tối thiểu (bằng là đạt).
    const base = sumValue(toPricingLines(eligible));
    if (base < row.minSubtotal) {
      reject({ reason: 'min-spend', missingAmount: row.minSubtotal - base, minSubtotal: row.minSubtotal });
      continue;
    }
    // (9) mã free-ship chỉ áp khi đang phải trả phí giao (ngưỡng thắng mã).
    if (row.kind === 'free_shipping') {
      if (input.thresholdFree) {
        reject({ reason: 'shipping-already-free' });
        continue;
      }
      winners.free = {
        code,
        row,
        applied: { applied: true, code, kind: 'free-shipping', label: row.name, amount: 0 },
      };
      continue;
    }
    const amount = discountAmount({ kind: row.kind as 'percent' | 'fixed', value: row.value ?? 0, maxDiscount: row.maxDiscount }, base);
    // Hai mã cùng nhóm: mã đứng sau thay mã đứng trước.
    winners.discount = {
      code,
      applied: { applied: true, code, kind: groupOf(row.kind), label: row.name, amount },
      data: { row, eligibleVariantIds: new Set(eligible.map((l) => l.variantId)), amount },
    };
  }

  // Mã discount trước, free-ship sau (khớp thứ tự hiển thị `vouchers`).
  if (winners.discount) {
    result.vouchers.push(winners.discount.applied);
    result.discount = winners.discount.data;
  }
  if (winners.free) {
    result.vouchers.push(winners.free.applied);
    result.freeShip = { row: winners.free.row };
  }
  return result;
}
