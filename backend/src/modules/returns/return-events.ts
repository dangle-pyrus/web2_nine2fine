import type { order_actor, order_event_kind, order_status, payment_status } from '@prisma/client';
import type { Db } from '../../lib/sql';
import { EventActorUser, insertOrderEvent } from '../order/order-event';

/**
 * Sự kiện đơn của yêu cầu trả hàng (BR-RET-40): MỖI chuyển trạng thái đúng 1 dòng, cùng giao dịch, mang `return_id`.
 * `detail` = phần khách được thấy (hướng dẫn / lý do từ chối). KHÔNG BAO GIỜ đưa số tài khoản, ngân hàng, mã giao dịch vào đây.
 * Chỉ `return_requested` mang `reason_code` (dòng thời gian admin); sự kiện của nhân viên để NULL để nhật ký hợp nhất không lộ ghi chú.
 */

export type ReturnEventKind = Extract<
  order_event_kind,
  'return_requested' | 'return_approved' | 'return_rejected' | 'return_received' | 'return_refunded' | 'return_cancelled'
>;

/** Tên thư theo loại sự kiện (null = không thư). */
export const RETURN_EMAIL_TEMPLATE: Record<ReturnEventKind, string | null> = {
  return_requested: 'return-requested',
  return_approved: 'return-approved',
  return_rejected: 'return-rejected',
  return_received: 'return-received',
  return_refunded: 'return-refunded',
  return_cancelled: null,
};

export const RETURN_EVENT_KINDS: readonly ReturnEventKind[] = [
  'return_requested', 'return_approved', 'return_rejected', 'return_received', 'return_refunded', 'return_cancelled',
];

export interface EmitReturnEvent {
  orderId: string;
  returnId: string;
  /** Trạng thái đơn + thanh toán TẠI thời điểm ghi (đơn giữ `completed`; `return_refunded` mang `payment_status` mới). */
  orderStatus: order_status;
  paymentStatus: payment_status;
  kind: ReturnEventKind;
  actor: Extract<order_actor, 'customer' | 'shop'>;
  actorUser?: EventActorUser;
  at: Date;
  detail?: string | null;
  reasonCode?: string | null;
  /** Mặc định theo `RETURN_EMAIL_TEMPLATE`; `null` để tắt thư. */
  emailTemplate?: string | null;
}

export function emitReturnEvent(tx: Db, e: EmitReturnEvent): Promise<string> {
  return insertOrderEvent(tx, {
    orderId: e.orderId,
    at: e.at,
    fromStatus: e.orderStatus,
    toStatus: e.orderStatus,
    paymentStatus: e.paymentStatus,
    actor: e.actor,
    actorUser: e.actorUser,
    kind: e.kind,
    detail: e.detail ?? null,
    reasonCode: e.reasonCode ?? null,
    emailTemplate: e.emailTemplate === undefined ? RETURN_EMAIL_TEMPLATE[e.kind] : e.emailTemplate,
    returnId: e.returnId,
  });
}
