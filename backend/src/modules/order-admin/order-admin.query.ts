import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { foldCol } from '../../lib/sql-fold';
import { foldVi } from '../../lib/text';
import { Db, ts } from '../../lib/sql';
import { vnDayRange } from '../../lib/vn-time';
import type { AdminBucket, AdminTab, OrderFilter as PublicOrderFilter } from './order-admin.schemas';

/** Nội bộ: thêm `userId` (Slice 7, đơn của một khách); contract admin-orders không đổi. */
type OrderFilter = PublicOrderFilter & { userId?: string };

/**
 * Danh sách / đếm / tìm kiếm (plan mục 7). MỘT hàm dựng WHERE dùng chung cho list và counts nên số đếm luôn khớp.
 * Tham số hoá bằng Prisma.sql; không nối chuỗi người dùng.
 */

const NEEDS_CALL = Prisma.sql`(o."payment_method" = 'cod' AND o."status" = 'to_ship' AND o."needs_confirm_call" AND o."confirmed_at" IS NULL)`;
const RETURN_PENDING = Prisma.sql`(o."returned_from_transit" AND o."return_handled_at" IS NULL)`;

export const TAB_SQL: Record<AdminBucket, Prisma.Sql> = {
  'pending-payment': Prisma.sql`o."status" = 'to_pay'`,
  'to-confirm': NEEDS_CALL,
  'to-fulfil': Prisma.sql`(o."status" = 'to_ship' AND NOT ${NEEDS_CALL})`,
  'in-transit': Prisma.sql`o."status" = 'to_receive'`,
  'cancel-requests': Prisma.sql`o."status" = 'cancel_requested'`,
  returning: Prisma.sql`(o."status" = 'cancelled' AND ${RETURN_PENDING})`,
  completed: Prisma.sql`o."status" = 'completed'`,
  cancelled: Prisma.sql`(o."status" = 'cancelled' AND NOT ${RETURN_PENDING})`,
};
const BUCKETS = Object.keys(TAB_SQL) as AdminBucket[];

const tabCase = Prisma.join(
  BUCKETS.map((b) => Prisma.sql`WHEN ${TAB_SQL[b]} THEN ${b}`),
  ' ',
);

/** Thoát `\`, `%`, `_` để dùng trong LIKE ... ESCAPE '\'. */
export const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function searchSql(q: string): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  const upperCode = q.replace(/^#/, '').toUpperCase();
  if (upperCode.length >= 6) parts.push(Prisma.sql`o."code" LIKE ${escapeLike(upperCode) + '%'} ESCAPE '\\'`);

  let digits = q.replace(/[\s.\-]/g, '');
  if (/^\+?84/.test(digits)) digits = digits.replace(/^\+?84/, '0');
  if (/^[0-9]{4,}$/.test(digits)) parts.push(Prisma.sql`o."recipient_phone" LIKE ${'%' + digits + '%'}`);

  parts.push(Prisma.sql`o."email" LIKE ${'%' + escapeLike(q.toLowerCase()) + '%'} ESCAPE '\\'`);
  const folded = foldVi(q);
  if (folded) parts.push(Prisma.sql`${foldCol('o."recipient_name"')} LIKE ${'%' + escapeLike(folded) + '%'} ESCAPE '\\'`);
  return Prisma.sql`(${Prisma.join(parts, ' OR ')})`;
}

function filterConds(f: OrderFilter): Prisma.Sql[] {
  const conds: Prisma.Sql[] = [];
  if (f.userId) conds.push(Prisma.sql`o."user_id" = ${f.userId}::uuid`);
  if (f.q) conds.push(searchSql(f.q));
  if (f.payment) conds.push(Prisma.sql`o."payment_method" = ${f.payment === 'bank-transfer' ? 'bank_transfer' : 'cod'}::"payment_method"`);
  const r = vnDayRange(f.from, f.to);
  if (r.gte) conds.push(Prisma.sql`o."created_at" >= ${ts(r.gte)}`);
  if (r.lt) conds.push(Prisma.sql`o."created_at" < ${ts(r.lt)}`);
  return conds;
}

const whereOf = (conds: Prisma.Sql[]): Prisma.Sql => (conds.length ? Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}` : Prisma.empty);

export interface SummaryRow {
  code: string;
  created_at: Date;
  status: string;
  payment_status: string;
  payment_method: string;
  recipient_name: string;
  total: number;
  item_count: number;
  needs_call: boolean;
  /** Slice 10.2 (BR-RET-65): đơn có yêu cầu trả hàng `requested` (cả thành viên lẫn vãng lai). */
  return_pending: boolean;
  cancel_requested_at: Date | null;
  estimated_to: Date;
  tab: AdminBucket;
}

export async function listOrders(
  f: OrderFilter & { view: AdminTab; page: number; limit: number },
  db: Db = prisma,
): Promise<{ rows: SummaryRow[]; total: number }> {
  const conds = filterConds(f);
  if (f.view !== 'all') conds.push(TAB_SQL[f.view]);
  const where = whereOf(conds);
  const [rows, [cnt]] = await Promise.all([
    db.$queryRaw<SummaryRow[]>(Prisma.sql`
      SELECT o."code", o."created_at", o."status"::text AS "status", o."payment_status"::text AS "payment_status",
        o."payment_method"::text AS "payment_method", o."recipient_name", o."total", o."cancel_requested_at", o."estimated_to",
        (SELECT COALESCE(SUM(i."quantity"), 0)::int FROM "order_items" i WHERE i."order_id" = o."order_id") AS "item_count",
        EXISTS (SELECT 1 FROM "order_returns" r WHERE r."order_id" = o."order_id" AND r."state" = 'requested') AS "return_pending",
        ${NEEDS_CALL} AS "needs_call", (CASE ${tabCase} END)::text AS "tab"
      FROM "orders" o ${where}
      ORDER BY o."created_at" DESC, o."code" DESC
      LIMIT ${f.limit} OFFSET ${(f.page - 1) * f.limit}`),
    db.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`SELECT COUNT(*) AS "n" FROM "orders" o ${where}`),
  ]);
  return { rows, total: Number(cnt.n) };
}

export async function countOrders(f: OrderFilter): Promise<Record<AdminTab, number>> {
  const where = whereOf(filterConds(f));
  const filters = BUCKETS.map((b) => Prisma.sql`COUNT(*) FILTER (WHERE ${TAB_SQL[b]})::int AS ${Prisma.raw(`"${b}"`)}`);
  const [row] = await prisma.$queryRaw<Array<Record<string, number | bigint>>>(Prisma.sql`
    SELECT COUNT(*)::int AS "all", ${Prisma.join(filters, ', ')} FROM "orders" o ${where}`);
  const out = { all: Number(row.all) } as Record<AdminTab, number>;
  for (const b of BUCKETS) out[b] = Number(row[b]);
  return out;
}
