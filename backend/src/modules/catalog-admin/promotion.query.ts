import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { now as clockNow } from '../../lib/clock';
import { Errors } from '../../lib/errors';
import type { Db } from '../../lib/sql';
import { ts } from '../../lib/sql';
import { foldVi } from '../../lib/text';
import { UUID_RE } from '../../lib/validate';
import { staffDisplayName } from '../order/order-event';
import type { PromotionListQuery } from './inventory-promotion.schemas';

export type PromotionState = 'running' | 'scheduled' | 'expired' | 'disabled';

/**
 * Trạng thái tính lúc đọc (BR-INV-43), MỘT hàm thuần; SQL ở `stateSql` lặp lại đúng thứ tự:
 * `disabled` -> `scheduled` (bắt đầu > bây giờ) -> `expired` (kết thúc <= bây giờ, hoặc hết tổng lượt) -> `running`.
 * `startsAt` null (voucher cũ) = đã bắt đầu.
 */
export function computeState(
  v: { enabled: boolean; startsAt: Date | null; endsAt: Date | null; usageLimit: number | null; used: number },
  at: Date,
): PromotionState {
  if (!v.enabled) return 'disabled';
  if (v.startsAt !== null && v.startsAt.getTime() > at.getTime()) return 'scheduled';
  if ((v.endsAt !== null && v.endsAt.getTime() <= at.getTime()) || (v.usageLimit !== null && v.used >= v.usageLimit)) return 'expired';
  return 'running';
}

/** So sánh theo UTC bất kể múi giờ phiên DB: cột `timestamp(6)` lưu UTC, `ts()` trả `timestamp` UTC. */
const stateSql = (at: Date) => Prisma.sql`(CASE
  WHEN NOT v.is_active THEN 'disabled'
  WHEN v.starts_at IS NOT NULL AND v.starts_at > ${ts(at)} THEN 'scheduled'
  WHEN (v.ends_at IS NOT NULL AND v.ends_at <= ${ts(at)}) OR (v.total_limit IS NOT NULL AND v.used_count >= v.total_limit) THEN 'expired'
  ELSE 'running' END)`;

const ms = (col: string) => Prisma.raw(`floor(extract(epoch FROM ${col}) * 1000)::float8`);

interface Row {
  voucher_id: string;
  code: string;
  name: string;
  kind: 'percent' | 'fixed' | 'free_shipping';
  value: number | null;
  max_discount: number | null;
  min_subtotal: number;
  category: string | null;
  total_limit: number | null;
  per_user_limit: number;
  members_only: boolean;
  first_order_only: boolean;
  exclude_sale_items: boolean;
  used_count: number;
  starts_ms: number | null;
  ends_ms: number | null;
  is_active: boolean;
  created_ms: number;
  version_ms: number;
  has_redemptions: boolean;
  by_first: string | null;
  by_last: string | null;
}

const SELECT = Prisma.sql`
  SELECT v.voucher_id, v.code, v.name, v.kind::text AS kind, v.value, v.max_discount, v.min_subtotal, c.slug AS category,
         v.total_limit, v.per_user_limit, v.members_only, v.first_order_only, v.exclude_sale_items, v.used_count,
         ${ms('v.starts_at')} AS starts_ms, ${ms('v.ends_at')} AS ends_ms, v.is_active, ${ms('v.created_at')} AS created_ms,
         ${ms('COALESCE(v.admin_updated_at, v.created_at)')} AS version_ms,
         EXISTS (SELECT 1 FROM voucher_redemptions r WHERE r.voucher_id = v.voucher_id) AS has_redemptions,
         u.first_name AS by_first, u.last_name AS by_last
  FROM vouchers v
  LEFT JOIN categories c ON c.category_id = v.category_id
  LEFT JOIN users u ON u.user_id = v.updated_by`;

const iso = (m: number | null): string | null => (m === null ? null : new Date(Number(m)).toISOString());

export function toPromotion(r: Row, at: Date) {
  const startsAt = r.starts_ms === null ? null : new Date(Number(r.starts_ms));
  const endsAt = r.ends_ms === null ? null : new Date(Number(r.ends_ms));
  const used = Number(r.used_count);
  return {
    id: r.voucher_id,
    code: r.code,
    title: r.name,
    type: r.kind === 'free_shipping' ? ('free-shipping' as const) : r.kind,
    value: r.value === null ? null : Number(r.value),
    maxDiscount: r.max_discount === null ? null : Number(r.max_discount),
    minSubtotal: Number(r.min_subtotal),
    categories: r.category ? [r.category] : [],
    usageLimit: r.total_limit === null ? null : Number(r.total_limit),
    perCustomerLimit: Number(r.per_user_limit),
    audience: r.members_only ? ('members' as const) : ('everyone' as const),
    firstOrderOnly: r.first_order_only,
    excludeSaleItems: r.exclude_sale_items,
    used,
    hasRedemptions: r.has_redemptions,
    startsAt: iso(r.starts_ms),
    endsAt: iso(r.ends_ms),
    enabled: r.is_active,
    state: computeState({ enabled: r.is_active, startsAt, endsAt, usageLimit: r.total_limit, used }, at),
    createdAt: new Date(Number(r.created_ms)).toISOString(),
    updatedAt: new Date(Number(r.version_ms)).toISOString(),
    updatedBy: r.by_first !== null && r.by_last !== null ? { name: staffDisplayName({ firstName: r.by_first, lastName: r.by_last }) } : null,
  };
}
export type AdminPromotionDto = ReturnType<typeof toPromotion>;

/** Id các voucher khớp `q` (mã hoặc tên, bỏ dấu): bảng nhỏ nên lọc trong bộ nhớ bằng `foldVi`, giữ SQL tham số hoá. */
async function matchIds(q: string | undefined): Promise<string[] | null> {
  const tokens = foldVi((q ?? '').normalize('NFC')).split(' ').filter(Boolean);
  if (tokens.length === 0) return null;
  const rows = await prisma.voucher.findMany({ select: { voucher_id: true, code: true, name: true } });
  return rows.filter((r) => tokens.every((t) => foldVi(`${r.code} ${r.name}`).includes(t))).map((r) => r.voucher_id);
}

export async function listPromotions(q: PromotionListQuery) {
  const at = clockNow();
  const ids = await matchIds(q.q);
  const where = ids === null ? Prisma.sql`TRUE` : Prisma.sql`v.voucher_id = ANY(${ids}::uuid[])`;
  const stateCond = q.state ? Prisma.sql`${stateSql(at)} = ${q.state}` : Prisma.sql`TRUE`;
  const offset = (q.page - 1) * q.limit;
  const [rows, [c]] = await Promise.all([
    prisma.$queryRaw<Row[]>(Prisma.sql`
      ${SELECT} WHERE ${where} AND ${stateCond}
      ORDER BY v.created_at DESC, v.voucher_id DESC LIMIT ${q.limit} OFFSET ${offset}`),
    prisma.$queryRaw<Array<Record<'all' | PromotionState, number>>>(Prisma.sql`
      SELECT COUNT(*)::int AS "all",
             (COUNT(*) FILTER (WHERE ${stateSql(at)} = 'running'))::int AS "running",
             (COUNT(*) FILTER (WHERE ${stateSql(at)} = 'scheduled'))::int AS "scheduled",
             (COUNT(*) FILTER (WHERE ${stateSql(at)} = 'expired'))::int AS "expired",
             (COUNT(*) FILTER (WHERE ${stateSql(at)} = 'disabled'))::int AS "disabled"
      FROM vouchers v WHERE ${where}`),
  ]);
  const counts = { all: Number(c.all), running: Number(c.running), scheduled: Number(c.scheduled), expired: Number(c.expired), disabled: Number(c.disabled) };
  return { items: rows.map((r) => toPromotion(r, at)), total: q.state ? counts[q.state] : counts.all, page: q.page, limit: q.limit, counts };
}

export async function loadPromotion(db: Db, id: string): Promise<AdminPromotionDto> {
  if (!UUID_RE.test(id)) throw Errors.notFound('Không tìm thấy khuyến mãi.');
  const rows = await db.$queryRaw<Row[]>(Prisma.sql`${SELECT} WHERE v.voucher_id = ${id}::uuid`);
  if (!rows[0]) throw Errors.notFound('Không tìm thấy khuyến mãi.');
  return toPromotion(rows[0], clockNow());
}
