import { Prisma } from '@prisma/client';
import type { Db } from '../../lib/sql';
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

/** Số yêu cầu theo tab (một truy vấn, `COUNT(*) FILTER`); dùng chung cho danh sách admin và Tổng quan (9.3 / 9.4). */
export interface ReturnCounts {
  all: number;
  requested: number;
  approved: number;
  received: number;
  refunded: number;
  closed: number;
}
