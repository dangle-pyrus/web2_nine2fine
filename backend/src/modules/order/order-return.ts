import prisma from '../../config/prisma';
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
  return Promise.all(
    rows.map(async (r) => {
      const dto = toOrderDto(r);
      const ret = returns.get(r.order_id);
      if (!ret) return dto;
      if (isLive(ret.state as ReturnState)) dto.canReturn = false;
      dto.return = await toReturnRequest(prisma, ret, r.paymentMethod, viewer === 'guest' ? { kind: 'guest', orderCode: r.code } : { kind: 'member' });
      return dto;
    }),
  );
}
