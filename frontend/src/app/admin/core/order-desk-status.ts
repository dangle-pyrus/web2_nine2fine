/**
 * Slice 4 mapping tables (docs/api/admin-orders-implementation-plan.md section 13, items 3-5):
 * the API has six order statuses, the shared FE `OrderStatus` has more; payment names follow the
 * back office `PaymentState`. Labels come from `status.ts`, so shopper and staff read the same words.
 */
import type { OrderStatus } from '../../features/orders/order-models';
import type { PaymentState } from '../data-access/models';
import type {
  DeskAction,
  DeskBucket,
  DeskCancelReasonCode,
  DeskOrderStatus,
  DeskPaymentMethod,
  DeskPaymentStatus,
  DeskTab,
  DeskTimelineEntry,
} from '../data-access/order-desk-models';
import { orderBadge, type BadgeSpec } from './status';

/** `to_ship` splits on the tab: still to call (`to-confirm`) or confirmed and being packed. */
export function feStatus(order: { status: DeskOrderStatus; tab: DeskBucket }): OrderStatus {
  switch (order.status) {
    case 'to_pay':
      return 'pending-payment';
    case 'to_ship':
      return order.tab === 'to-confirm' ? 'pending-confirmation' : 'processing';
    case 'to_receive':
      return 'shipping';
    case 'completed':
      return 'completed';
    case 'cancel_requested':
      return 'cancel-requested';
    case 'cancelled':
      return 'cancelled';
  }
}

export function statusBadge(order: { status: DeskOrderStatus; tab: DeskBucket }): BadgeSpec {
  return orderBadge(feStatus(order));
}

/** Timeline entries carry no tab: `to_ship` reads as "Đang chuẩn bị". */
export function entryStatusLabel(status: DeskOrderStatus): string {
  return orderBadge(feStatus({ status, tab: 'to-fulfil' })).label;
}

export function feStatusLabel(status: DeskOrderStatus, tab: DeskBucket): string {
  return orderBadge(feStatus({ status, tab })).label;
}

export function paymentState(order: {
  status: DeskOrderStatus;
  paymentStatus: DeskPaymentStatus;
  paymentMethod: DeskPaymentMethod;
}): PaymentState {
  switch (order.paymentStatus) {
    case 'paid':
      return 'paid';
    case 'refunded':
    case 'partially_refunded':
      return 'refunded';
    case 'failed':
      return 'unpaid';
    case 'pending':
      if (order.paymentMethod === 'cod') return order.status === 'cancelled' ? 'void' : 'cod';
      return 'unpaid';
  }
}

export const DESK_TABS: { value: DeskTab; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'pending-payment', label: 'Chờ thanh toán' },
  { value: 'to-confirm', label: 'Chờ xác nhận' },
  { value: 'to-fulfil', label: 'Đang chuẩn bị' },
  { value: 'in-transit', label: 'Đang vận chuyển' },
  { value: 'cancel-requests', label: 'Chờ duyệt huỷ' },
  { value: 'returning', label: 'Hàng hoàn' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'cancelled', label: 'Đã huỷ' },
];

export const DESK_PAYMENT_METHODS: { value: DeskPaymentMethod; label: string }[] = [
  { value: 'cod', label: 'COD' },
  { value: 'bank-transfer', label: 'Chuyển khoản' },
];

export const OVERDUE_LABELS = {
  'confirm-call': 'Quá hạn gọi xác nhận',
  'cancel-request': 'Quá hạn duyệt huỷ',
  delivery: 'Quá hạn giao',
} as const;

/** Buttons driven by `allowedActions` (the FE never works the list out itself, BR-ADM-04). */
export const ACTION_LABELS: Record<DeskAction, string> = {
  'call-attempt': 'Ghi không liên lạc được',
  confirm: 'Khách đã xác nhận',
  ship: 'Bàn giao vận chuyển',
  deliver: 'Giao xong',
  'cancel-unreachable': 'Huỷ: không liên lạc được',
  'cancel-declined-on-call': 'Huỷ: khách từ chối khi gọi',
  'cancel-customer-request': 'Huỷ: khách yêu cầu',
  'cancel-refused': 'Huỷ: khách từ chối nhận',
  'cancel-undeliverable': 'Huỷ: giao không thành',
  'cancel-other': 'Huỷ với lý do khác',
  restock: 'Cộng lại tồn kho',
  'write-off': 'Loại bỏ hàng hoàn',
  'approve-cancel': 'Duyệt yêu cầu huỷ',
  'reject-cancel': 'Từ chối yêu cầu huỷ',
  'add-note': 'Thêm ghi chú nội bộ',
  'print-slip': 'In phiếu giao',
};

export function actorLabel(actor: DeskTimelineEntry['actor']): string {
  if (actor.type === 'customer') return 'Khách';
  if (actor.type === 'system') return 'Hệ thống';
  return `${actor.name ?? 'Nhân viên'} (${actor.role === 'admin' ? 'Quản trị viên' : 'Nhân viên'})`;
}

export const CANCEL_REASON_LABELS: Record<DeskCancelReasonCode, string> = {
  unreachable: 'Không liên lạc được',
  declined_on_call: 'Khách từ chối khi gọi xác nhận',
  customer_request: 'Khách yêu cầu huỷ (gọi hotline)',
  refused: 'Khách từ chối nhận hàng',
  undeliverable: 'Giao không thành',
  other: 'Lý do khác',
};

/** Which `allowedActions` entry opens which cancel reason; the picker lists only those present. */
export const CANCEL_ACTION_REASON: Partial<Record<DeskAction, DeskCancelReasonCode>> = {
  'cancel-unreachable': 'unreachable',
  'cancel-declined-on-call': 'declined_on_call',
  'cancel-customer-request': 'customer_request',
  'cancel-refused': 'refused',
  'cancel-undeliverable': 'undeliverable',
  'cancel-other': 'other',
};
export const CANCEL_REASON_ORDER = Object.values(CANCEL_ACTION_REASON);

/** Reasons that need a 5-250 character internal note (AdminCancelRequest.note). */
export const NOTE_REQUIRED_REASONS: readonly DeskCancelReasonCode[] = ['customer_request', 'other'];

/** Reasons the order may be cancelled with right now, in the contract's order. */
export function cancelReasonsOf(order: { allowedActions: DeskAction[] }): DeskCancelReasonCode[] {
  const open = new Set(order.allowedActions.map((action) => CANCEL_ACTION_REASON[action]));
  return CANCEL_REASON_ORDER.filter(
    (reason): reason is DeskCancelReasonCode => !!reason && open.has(reason),
  );
}
