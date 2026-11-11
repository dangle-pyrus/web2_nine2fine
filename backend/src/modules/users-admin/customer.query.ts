import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { ACCOUNT_ASSUMPTIONS, canSeeContact, USERS_ASSUMPTIONS } from '../../config/assumptions';
import { now } from '../../lib/clock';
import { escapeLike } from '../../lib/like';
import { foldCol } from '../../lib/sql-fold';
import { Db, ts } from '../../lib/sql';
import { foldVi } from '../../lib/text';
import { UUID_RE } from '../../lib/validate';
import { vnYearBounds } from '../../lib/vn-time';
import { toAdminSummary } from '../order-admin/order-admin.mapper';
import { listOrders } from '../order-admin/order-admin.query';
import { CustomerAddressDto, CustomerRow, toCustomerDetail, toCustomerSummary } from './customer.mapper';
import type { CustomerSort, CustomerTier } from './users-admin.schemas';

/**
 * Khách hàng = users.role = 'member'. Số liệu tính tại lúc gọi bằng LATERAL theo `idx_orders_user_created` (BR-USR-09, không cache).
 * Hạng theo đúng công thức `getMembership` (`COALESCE(delivered_at, created_at)` trong năm VN, đơn `completed`), một nguồn ngưỡng.
 */

const ESC = Prisma.sql`ESCAPE '\\'`;

function tierCase(): Prisma.Sql {
  const tiers = [...ACCOUNT_ASSUMPTIONS.tiers].sort((a, b) => b.minSpent - a.minSpent);
  const whens = tiers.slice(0, -1).map((t) => Prisma.sql`WHEN agg.year_spent >= ${t.minSpent} THEN ${t.tier}`);
  return Prisma.sql`CASE ${Prisma.join(whens, ' ')} ELSE ${tiers[tiers.length - 1].tier} END`;
}

/** Điều kiện `q` (BR-USR-08): tên (bỏ dấu), email, SĐT (>= 4 chữ số liên tiếp). Dùng chung cho list và counts. */
function searchSql(q: string): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  const folded = foldVi(q);
  if (folded) parts.push(Prisma.sql`${foldCol(`(u."last_name" || ' ' || u."first_name")`)} LIKE ${'%' + escapeLike(folded) + '%'} ${ESC}`);
  parts.push(Prisma.sql`u."email" LIKE ${'%' + escapeLike(q.toLowerCase()) + '%'} ${ESC}`);
  let digits = q.replace(/[\s.\-]/g, '');
  if (/^\+?84/.test(digits)) digits = digits.replace(/^\+?84/, '0');
  if (new RegExp(`^[0-9]{${USERS_ASSUMPTIONS.q.minDigits},}$`).test(digits)) {
    parts.push(Prisma.sql`regexp_replace(u."phone_number", '\\D', '', 'g') LIKE ${'%' + digits + '%'}`);
  }
  return Prisma.sql`(${Prisma.join(parts, ' OR ')})`;
}

function baseSql(opts: { q?: string; userId?: string }): Prisma.Sql {
  const { from, to } = vnYearBounds(now());
  const conds: Prisma.Sql[] = [Prisma.sql`u."role" = 'member'`];
  if (opts.userId) conds.push(Prisma.sql`u."user_id" = ${opts.userId}::uuid`);
  if (opts.q) conds.push(searchSql(opts.q));
  return Prisma.sql`
    SELECT u."user_id", u."first_name", u."last_name", u."email", u."phone_number", u."is_active", u."created_at",
           u."marketing_opt_in", u."date_of_birth",
           agg.order_count, agg.total_spent, agg.last_order_at, agg.year_spent, ${tierCase()} AS tier
    FROM "users" u
    LEFT JOIN LATERAL (
      SELECT COUNT(*) FILTER (WHERE o."status" <> 'cancelled')::int AS order_count,
             COALESCE(SUM(o."total") FILTER (WHERE o."status" = 'completed'), 0)::bigint AS total_spent,
             MAX(o."created_at") FILTER (WHERE o."status" <> 'cancelled') AS last_order_at,
             COALESCE(SUM(o."total") FILTER (WHERE o."status" = 'completed'
               AND COALESCE(o."delivered_at", o."created_at") >= ${ts(from)}
               AND COALESCE(o."delivered_at", o."created_at") < ${ts(to)}), 0)::bigint AS year_spent
      FROM "orders" o WHERE o."user_id" = u."user_id") agg ON true
    WHERE ${Prisma.join(conds, ' AND ')}`;
}

const ORDER_BY: Record<CustomerSort, Prisma.Sql> = {
  lastOrderAt: Prisma.sql`b."last_order_at" DESC NULLS LAST`,
  totalSpent: Prisma.sql`b."total_spent" DESC`,
  orderCount: Prisma.sql`b."order_count" DESC`,
  name: Prisma.sql`${foldCol('b."first_name"')} ASC, ${foldCol('b."last_name"')} ASC`,
};

export interface CustomerListParams {
  q?: string;
  view: 'all' | 'blocked';
  tier?: CustomerTier;
  sort: CustomerSort;
  page: number;
  limit: number;
}

export async function listCustomers(p: CustomerListParams, role: string) {
  const base = baseSql({ q: p.q });
  const tierCond = p.tier ? Prisma.sql`WHERE b."tier" = ${p.tier}` : Prisma.empty;
  const viewCond = p.view === 'blocked' ? Prisma.sql`${p.tier ? Prisma.sql`AND` : Prisma.sql`WHERE`} NOT b."is_active"` : Prisma.empty;
  const [rows, [cnt]] = await Promise.all([
    prisma.$queryRaw<CustomerRow[]>(Prisma.sql`
      WITH b AS (${base})
      SELECT b.* FROM b ${tierCond} ${viewCond}
      ORDER BY ${ORDER_BY[p.sort]}, b."user_id" ASC
      LIMIT ${p.limit} OFFSET ${(p.page - 1) * p.limit}`),
    prisma.$queryRaw<Array<{ n_all: number; n_blocked: number }>>(Prisma.sql`
      WITH b AS (${base})
      SELECT COUNT(*)::int AS n_all, (COUNT(*) FILTER (WHERE NOT b."is_active"))::int AS n_blocked FROM b ${tierCond}`),
  ]);
  const counts = { all: Number(cnt.n_all), blocked: Number(cnt.n_blocked) };
  return {
    items: rows.map((r) => toCustomerSummary(r, role)),
    total: p.view === 'blocked' ? counts.blocked : counts.all,
    page: p.page,
    limit: p.limit,
    counts,
  };
}

async function loadRow(db: Db, id: string): Promise<CustomerRow | null> {
  if (!UUID_RE.test(id)) return null;
  const rows = await db.$queryRaw<CustomerRow[]>(Prisma.sql`WITH b AS (${baseSql({ userId: id })}) SELECT b.* FROM b`);
  return rows[0] ?? null;
}

/** Chi tiết khách (đã lọc theo vai trò người gọi); không phải khách / không có -> null (404). */
export async function loadCustomer(db: Db, id: string, role: string) {
  const row = await loadRow(db, id);
  if (!row) return null;
  const { rows } = await listOrders({ userId: id, view: 'all', page: 1, limit: USERS_ASSUMPTIONS.recentOrders }, db);
  let addresses: CustomerAddressDto[] = [];
  if (canSeeContact(role)) {
    const list = await db.address.findMany({
      where: { userId: id },
      include: { province: true, ward: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }, { address_id: 'asc' }],
    });
    addresses = list.map((a) => ({
      recipient: a.recipientName,
      phone: a.phone_number,
      line: [a.street, a.ward?.name ?? a.district, a.province?.name ?? a.city].filter((x) => x && x.trim() !== '').join(', '),
      isDefault: a.isDefault,
    }));
  }
  return toCustomerDetail(row, role, rows.map(toAdminSummary), addresses);
}

export async function customerExists(id: string): Promise<boolean> {
  if (!UUID_RE.test(id)) return false;
  return (await prisma.user.count({ where: { user_id: id, role: 'member' } })) > 0;
}

export async function listCustomerOrders(id: string, page: number, limit: number) {
  const { rows, total } = await listOrders({ userId: id, view: 'all', page, limit });
  return { items: rows.map(toAdminSummary), total, page, limit };
}
