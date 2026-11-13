import { Prisma } from '@prisma/client';
import { foldCol } from '../../lib/sql-fold';
import { foldVi } from '../../lib/text';
import type { Db } from '../../lib/sql';
import { normalizeOrderCode } from '../order/order-code';
import { isLive, type ReturnState } from './return-rules';

/**
 * Truy vấn yêu cầu trả hàng. Cột bản mã số tài khoản (`account_number_enc`) KHÔNG BAO GIỜ nằm trong các truy vấn thường:
 * mọi `findX` dùng `omit`; chỉ `loadAccountCipher` đọc, và chỉ `toAdminReturn` gọi khi đủ điều kiện (plan mục 7.1).
 */

const OMIT = { accountNumberEnc: true } as const;

/** Dòng yêu cầu + dòng trả (kèm dòng đơn để lấy tên / màu / size) + ảnh (cũ trước). */
export const RETURN_INCLUDE = {
  items: { include: { orderItem: true }, orderBy: { orderItem: { lineNo: 'asc' } } },
  photos: { orderBy: [{ createdAt: 'asc' }, { photo_id: 'asc' }] },
} as const satisfies Prisma.OrderReturnInclude;

export type ReturnRow = Prisma.OrderReturnGetPayload<{ omit: typeof OMIT; include: typeof RETURN_INCLUDE }>;

export async function loadReturn(db: Db, returnId: string): Promise<ReturnRow | null> {
  return db.orderReturn.findUnique({ where: { return_id: returnId }, omit: OMIT, include: RETURN_INCLUDE });
}

/** Yêu cầu mới nhất của đơn (sống trước; không có thì `cancelled` mới nhất). */
export async function loadReturnOfOrder(db: Db, orderId: string): Promise<ReturnRow | null> {
  const rows = await db.orderReturn.findMany({ where: { orderId }, omit: OMIT, include: RETURN_INCLUDE, orderBy: [{ requestedAt: 'desc' }, { return_id: 'desc' }] });
  return pickRelevant(rows);
}

/** MỘT truy vấn theo mảng id đơn (danh sách đơn không N+1). */
export async function loadReturnsForOrders(db: Db, orderIds: string[]): Promise<Map<string, ReturnRow>> {
  const out = new Map<string, ReturnRow>();
  if (orderIds.length === 0) return out;
  const rows = await db.orderReturn.findMany({
    where: { orderId: { in: orderIds } }, omit: OMIT, include: RETURN_INCLUDE, orderBy: [{ requestedAt: 'desc' }, { return_id: 'desc' }],
  });
  const by = new Map<string, ReturnRow[]>();
  for (const r of rows) by.set(r.orderId, [...(by.get(r.orderId) ?? []), r]);
  for (const [orderId, list] of by) {
    const pick = pickRelevant(list);
    if (pick) out.set(orderId, pick);
  }
  return out;
}

function pickRelevant(rows: ReturnRow[]): ReturnRow | null {
  return rows.find((r) => isLive(r.state as ReturnState)) ?? rows[0] ?? null;
}

/** Chỉ cho `toAdminReturn` (admin + `received`). Không bao giờ đưa vào phản hồi / log. */
export async function loadAccountCipher(db: Db, returnId: string): Promise<string | null> {
  const r = await db.orderReturn.findUnique({ where: { return_id: returnId }, select: { accountNumberEnc: true } });
  return r?.accountNumberEnc ?? null;
}

/** Số yêu cầu theo tab. Một truy vấn `COUNT(*) FILTER`; dùng chung cho danh sách admin (`counts`) và Tổng quan (`todo`). */
export interface ReturnCounts {
  all: number;
  requested: number;
  approved: number;
  received: number;
  refunded: number;
  closed: number;
}

const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** `q`: mã đơn (chuẩn hoá, tiền tố), SĐT (>= 4 chữ số, bỏ ký tự phân cách), tên (không dấu). */
function searchSql(q: string): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  const code = normalizeOrderCode(q) ?? q.replace(/^#/, '').toUpperCase();
  if (code.length >= 6) parts.push(Prisma.sql`o."code" LIKE ${escapeLike(code) + '%'} ESCAPE '\\'`);
  let digits = q.replace(/[\s.\-]/g, '');
  if (/^\+?84/.test(digits)) digits = digits.replace(/^\+?84/, '0');
  if (/^[0-9]{4,}$/.test(digits)) parts.push(Prisma.sql`o."recipient_phone" LIKE ${'%' + digits + '%'}`);
  const folded = foldVi(q);
  if (folded) parts.push(Prisma.sql`${foldCol('o."recipient_name"')} LIKE ${'%' + escapeLike(folded) + '%'} ESCAPE '\\'`);
  return Prisma.sql`(${Prisma.join(parts, ' OR ')})`;
}

const STATE_SQL: Record<string, Prisma.Sql> = {
  requested: Prisma.sql`r."state" = 'requested'`,
  approved: Prisma.sql`r."state" = 'approved'`,
  received: Prisma.sql`r."state" = 'received'`,
  refunded: Prisma.sql`r."state" = 'refunded'`,
  closed: Prisma.sql`r."state" IN ('rejected', 'cancelled')`,
};

export async function countReturns(db: Db, q?: string): Promise<ReturnCounts> {
  const where = q ? Prisma.sql`WHERE ${searchSql(q)}` : Prisma.empty;
  const [row] = await db.$queryRaw<Array<Record<string, number>>>(Prisma.sql`
    SELECT COUNT(*)::int AS "all",
      (COUNT(*) FILTER (WHERE ${STATE_SQL.requested}))::int AS "requested", (COUNT(*) FILTER (WHERE ${STATE_SQL.approved}))::int AS "approved",
      (COUNT(*) FILTER (WHERE ${STATE_SQL.received}))::int AS "received", (COUNT(*) FILTER (WHERE ${STATE_SQL.refunded}))::int AS "refunded",
      (COUNT(*) FILTER (WHERE ${STATE_SQL.closed}))::int AS "closed"
    FROM "order_returns" r JOIN "orders" o ON o."order_id" = r."order_id" ${where}`);
  return { all: row.all, requested: row.requested, approved: row.approved, received: row.received, refunded: row.refunded, closed: row.closed };
}

export interface ReturnSummaryRow {
  return_id: string;
  code: string;
  requested_at: Date;
  recipient_name: string;
  reason: string;
  fault: string;
  state: string;
  source: string;
  amount: number;
  item_count: number;
  handled_by: string | null;
  handled_role: string | null;
  handled_at: Date | null;
}

export async function listReturns(
  db: Db,
  f: { state?: string; q?: string; sort: 'requestedAt' | 'amount'; page: number; limit: number },
): Promise<{ rows: ReturnSummaryRow[]; total: number }> {
  const conds: Prisma.Sql[] = [];
  if (f.q) conds.push(searchSql(f.q));
  if (f.state) conds.push(STATE_SQL[f.state]);
  const where = conds.length ? Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}` : Prisma.empty;
  const order = f.sort === 'amount' ? Prisma.sql`r."amount" DESC, r."requested_at" DESC, r."return_id" DESC` : Prisma.sql`r."requested_at" DESC, r."return_id" DESC`;
  const [rows, [cnt]] = await Promise.all([
    db.$queryRaw<ReturnSummaryRow[]>(Prisma.sql`
      SELECT r."return_id"::text AS "return_id", o."code", r."requested_at", o."recipient_name", r."reason", r."fault", r."state", r."requested_via" AS "source", r."amount",
        (SELECT COALESCE(SUM(i."quantity"), 0)::int FROM "order_return_items" i WHERE i."return_id" = r."return_id") AS "item_count",
        h."actor_name" AS "handled_by", h."actor_role"::text AS "handled_role", h."at" AS "handled_at"
      FROM "order_returns" r JOIN "orders" o ON o."order_id" = r."order_id"
      LEFT JOIN LATERAL (
        SELECT e."actor_name", e."actor_role", e."at" FROM "order_events" e WHERE e."return_id" = r."return_id" AND e."actor" = 'shop'
        ORDER BY e."at" DESC, e."event_id" DESC LIMIT 1) h ON TRUE
      ${where} ORDER BY ${order} LIMIT ${f.limit} OFFSET ${(f.page - 1) * f.limit}`),
    db.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`SELECT COUNT(*) AS "n" FROM "order_returns" r JOIN "orders" o ON o."order_id" = r."order_id" ${where}`),
  ]);
  return { rows, total: Number(cnt.n) };
}
