import type { Order, OrderEvent, OrderItem, User, user_role } from '@prisma/client';
import { now as clockNow } from '../../lib/clock';
import { kindOf, toOrderDto } from '../order/order.mapper';
import type { SummaryRow } from './order-admin.query';
import { overdueOf } from './overdue';
import { AdminAction, callStatsOf, computeAllowedActions, needsCall, StateOrder, tabOf } from './order-state';

export type AdminOrderRow = Order & {
  items: OrderItem[];
  events: OrderEvent[];
  confirmer: User | null;
  handoverStaff: User | null;
  cancelDecider: User | null;
  returnHandler: User | null;
};

export const ADMIN_ORDER_INCLUDE = {
  items: true,
  events: true,
  confirmer: true,
  handoverStaff: true,
  cancelDecider: true,
  returnHandler: true,
} as const;

type StaffRef = { name: string; role: 'staff' | 'admin' };
const iso = (d: Date): string => d.toISOString();
const staffRole = (r: user_role | null | undefined): 'staff' | 'admin' => (r === 'admin' ? 'admin' : 'staff');
const userName = (u: User): string => `${u.lastName} ${u.firstName}`.replace(/\s+/g, ' ').trim();

const TITLES: Record<string, string> = {
  placed: 'Đặt hàng',
  payment_received: 'Đã nhận thanh toán',
  call_attempt: 'Ghi nhận không liên lạc được',
  confirmed: 'Khách xác nhận đơn',
  shipped: 'Bàn giao vận chuyển',
  delivered: 'Giao hàng thành công',
  cancel_requested: 'Khách gửi yêu cầu huỷ',
  cancel_approved: 'Duyệt yêu cầu huỷ',
  cancel_rejected: 'Từ chối yêu cầu huỷ',
  cancelled: 'Đã huỷ đơn',
  stock_restocked: 'Hàng hoàn đã nhập kho',
  stock_written_off: 'Hàng hoàn không nhập kho (hỏng / mất)',
  note: 'Ghi chú nội bộ',
};

/** Timeline admin: MỚI NHẤT TRƯỚC (BR-ADM-10); người = tên + vai trò chụp tại lúc làm. */
export function toAdminTimeline(events: OrderEvent[]) {
  return [...events]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .map((e) => {
      const kind = kindOf(e);
      const actor =
        e.actor === 'shop'
          ? { type: 'staff' as const, name: e.actorName ?? 'Nhân viên', role: staffRole(e.actorRole) }
          : { type: e.actor, ...{} };
      return {
        at: iso(e.at),
        kind,
        fromStatus: e.fromStatus,
        toStatus: e.toStatus,
        paymentStatus: e.paymentStatus,
        actor,
        title: TITLES[kind] ?? 'Cập nhật đơn',
        ...(e.detail ? { detail: e.detail } : {}),
        ...(e.reasonCode ? { reasonCode: e.reasonCode } : {}),
        ...(e.internalNote ? { note: e.internalNote } : {}),
      };
    });
}

export const stateOf = (o: Order): StateOrder => ({
  status: o.status,
  paymentMethod: o.paymentMethod,
  needsConfirmCall: o.needsConfirmCall,
  confirmedAt: o.confirmedAt,
  returnedFromTransit: o.returnedFromTransit,
  returnHandledAt: o.returnHandledAt,
  stockRestoredAt: o.stockRestoredAt,
});

/** Người thực hiện lấy từ ảnh chụp ở sự kiện (đổi tên / xoá user không đổi vết); thiếu thì dùng bản ghi user. */
function refFor(events: OrderEvent[], kinds: string[], user: User | null): StaffRef | undefined {
  const e = [...events].filter((x) => x.kind && kinds.includes(x.kind)).sort((a, b) => b.at.getTime() - a.at.getTime())[0];
  if (e?.actorName) return { name: e.actorName, role: staffRole(e.actorRole) };
  if (user) return { name: userName(user), role: staffRole(user.role) };
  return e ? { name: 'Nhân viên', role: 'staff' } : undefined;
}

export function toAdminOrder(o: AdminOrderRow, role: user_role) {
  const base = toOrderDto({ ...o, events: [] });
  const state = stateOf(o);
  const attempts = o.events.filter((e) => e.kind === 'call_attempt').map((e) => e.at);
  const stats = callStatsOf(attempts);
  const allowed: AdminAction[] = computeAllowedActions(state, role, stats);

  const dto: Record<string, unknown> = {
    id: o.code,
    placedAt: iso(o.createdAt),
    status: o.status,
    paymentStatus: o.paymentStatus,
    paymentMethod: base.paymentMethod,
    items: base.items,
    pricing: base.pricing,
    vouchers: base.vouchers,
    recipient: base.recipient,
    shippingAddress: base.shippingAddress,
    estimatedDelivery: base.estimatedDelivery,
    tab: tabOf(state),
    needsCall: needsCall(state),
    callAttempts: {
      total: stats.total,
      inFirstDay: stats.inFirstDay,
      ...(stats.firstAt ? { firstAt: iso(stats.firstAt) } : {}),
      ...(stats.lastAt ? { lastAt: iso(stats.lastAt) } : {}),
    },
    overdue: overdueOf({ status: o.status, needsCall: needsCall(state), createdAt: o.createdAt, cancelRequestedAt: o.cancelRequestedAt, estimatedTo: o.estimatedTo }, clockNow()),
    allowedActions: allowed,
    timeline: toAdminTimeline(o.events),
  };
  if (base.paymentDueAt) dto.paymentDueAt = base.paymentDueAt;
  if (o.paidAt) dto.paidAt = iso(o.paidAt);
  if (o.status === 'completed' && o.deliveredAt) dto.deliveredAt = iso(o.deliveredAt);
  if (base.note) dto.note = base.note;
  if (base.invoice) dto.invoice = base.invoice;

  if (o.confirmedAt) {
    const by = refFor(o.events, ['confirmed'], o.confirmer);
    if (by) dto.confirmation = { confirmedAt: iso(o.confirmedAt), confirmedBy: by };
  }
  if (o.carrier && o.trackingNumber && o.handedOverAt) {
    const by = refFor(o.events, ['shipped'], o.handoverStaff);
    if (by) dto.shipment = { carrier: o.carrier, trackingNumber: o.trackingNumber, handedOverAt: iso(o.handedOverAt), handedOverBy: by };
  }
  if (o.status === 'cancelled' && o.cancelledAt && o.cancelledBy) {
    dto.cancellation = {
      by: o.cancelledBy,
      at: iso(o.cancelledAt),
      ...(o.cancelReasonCode ? { reasonCode: o.cancelReasonCode } : {}),
      ...(o.cancelReason ? { reason: o.cancelReason } : {}),
      ...(o.cancelNote ? { note: o.cancelNote } : {}),
    };
  }
  if (o.cancelRequestedAt) {
    const outcome = o.status === 'cancel_requested' ? 'pending' : (o.cancelRequestOutcome ?? 'pending');
    const decidedBy = o.cancelRequestDecidedAt ? refFor(o.events, ['cancel_approved', 'cancel_rejected'], o.cancelDecider) : undefined;
    dto.cancelRequest = {
      requestedAt: iso(o.cancelRequestedAt),
      ...(o.cancelRequestReason ? { reason: o.cancelRequestReason } : {}),
      outcome,
      ...(o.cancelRequestDecidedAt ? { decidedAt: iso(o.cancelRequestDecidedAt) } : {}),
      ...(decidedBy ? { decidedBy } : {}),
      ...(o.cancelRequestRejectReason ? { rejectReason: o.cancelRequestRejectReason } : {}),
    };
  }
  if (o.status === 'cancelled' && o.returnedFromTransit) {
    const decidedBy = o.returnHandledAt ? refFor(o.events, ['stock_restocked', 'stock_written_off'], o.returnHandler) : undefined;
    dto.returnHandling = {
      state: o.returnDecision ?? 'pending',
      ...(o.returnHandledAt ? { decidedAt: iso(o.returnHandledAt) } : {}),
      ...(decidedBy ? { decidedBy } : {}),
      ...(o.returnNote ? { note: o.returnNote } : {}),
    };
  }
  if (o.stockRestoredAt) dto.stockRestoredAt = iso(o.stockRestoredAt);
  if (o.deliveryRefusedAt) dto.deliveryRefusedAt = iso(o.deliveryRefusedAt);
  return dto;
}

export function toAdminSummary(r: SummaryRow) {
  return {
    id: r.code,
    placedAt: iso(r.created_at),
    status: r.status,
    paymentStatus: r.payment_status,
    paymentMethod: r.payment_method === 'bank_transfer' ? 'bank-transfer' : 'cod',
    recipientName: r.recipient_name,
    total: r.total,
    itemCount: r.item_count,
    needsCall: r.needs_call,
    hasCancelRequest: r.status === 'cancel_requested',
    tab: r.tab,
    overdue: overdueOf({ status: r.status, needsCall: r.needs_call, createdAt: r.created_at, cancelRequestedAt: r.cancel_requested_at, estimatedTo: r.estimated_to }, clockNow()),
  };
}
