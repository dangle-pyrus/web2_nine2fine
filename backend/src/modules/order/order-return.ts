import prisma from '../../config/prisma';
import { purchaseEligibility } from '../reviews/eligibility';
import { now as clockNow } from '../../lib/clock';
import { toReturnRequest } from '../returns/return.mapper';
import { loadReturnsForOrders } from '../returns/return.query';
import { isLive, type ReturnState } from '../returns/return-rules';
import { OrderDto, OrderRow, toOrderDto } from './order.mapper';

/**
 * Người xem đơn (Slice 9 + 10.2): `owner` = thành viên chủ đơn; `guest` = khách vãng lai của đơn KHÔNG có tài khoản, xem bằng grant `n2f_oa`
 * (BR-RET-61: có `canReturn` / `returnDeadline` / `return`, ảnh trỏ về `/api/orders/{code}/return/photos/{id}`);
 * `other` = người khác xem (grant mở đơn của thành viên): không có `return`, `canReturn = false`.
 */
export type OrderViewer = 'owner' | 'guest' | 'other';

/** Người xem đơn đã qua kiểm quyền (đơn thuộc thành viên mà người xem không phải chủ -> `other`; đơn vãng lai -> `guest`). */
export const viewerOf = (order: Pick<OrderRow, 'userId'>, isOwner: boolean): OrderViewer => (isOwner ? 'owner' : order.userId === null ? 'guest' : 'other');

/**
 * Ghép `return` (yêu cầu sống mới nhất, không có thì `cancelled` mới nhất) và chỉnh `canReturn` (không có yêu cầu sống).
 * MỘT truy vấn theo mảng id (danh sách đơn không N+1).
 */
export async function toOrderDtosWithReturn(rows: OrderRow[], viewer: OrderViewer): Promise<OrderDto[]> {
  if (viewer === 'other') return rows.map((r) => ({ ...toOrderDto(r), canReturn: false }));
  const returns = await loadReturnsForOrders(prisma, rows.map((r) => r.order_id));
  const reviewable = viewer === 'owner' ? await reviewableProducts(rows) : new Map<string, Set<string>>();
  return Promise.all(
    rows.map(async (r) => {
      const dto = toOrderDto(r);
      const ok = reviewable.get(r.order_id);
      if (ok) for (const it of dto.items) it.canReview = it.productId !== null && ok.has(it.productId);
      const ret = returns.get(r.order_id);
      if (!ret) return dto;
      if (isLive(ret.state as ReturnState)) dto.canReturn = false;
      dto.return = await toReturnRequest(prisma, ret, r.paymentMethod, viewer === 'guest' ? { kind: 'guest', orderCode: r.code } : { kind: 'member' });
      return dto;
    }),
  );
}

/**
 * BR-REV-09: theo đơn, tập `productId` còn đánh giá được = đúng hàm `purchaseEligibility` (completed, 365 ngày, chưa trả hết) và chưa có đánh giá.
 * Chỉ đơn `completed` của thành viên; đơn khác không có khoá.
 */
async function reviewableProducts(rows: OrderRow[]): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  const owned = rows.filter((r) => r.userId !== null && r.status === 'completed');
  if (owned.length === 0) return out;
  const at = clockNow();
  const cache = new Map<string, boolean>(); // `${userId}:${productId}`
  for (const r of owned) {
    const userId = r.userId as string;
    const ok = new Set<string>();
    for (const productId of new Set(r.items.map((i) => i.productId))) {
      const key = `${userId}:${productId}`;
      let v = cache.get(key);
      if (v === undefined) {
        const reviewed = await prisma.productReview.findUnique({ where: { userId_productId: { userId, productId } }, select: { review_id: true } });
        v = !reviewed && (await purchaseEligibility(prisma, userId, productId, at)).status === 'eligible';
        cache.set(key, v);
      }
      if (v) ok.add(productId);
    }
    out.set(r.order_id, ok);
  }
  return out;
}
