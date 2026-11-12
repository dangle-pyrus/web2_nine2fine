import { RETURN_PERMISSIONS, RETURNS_ASSUMPTIONS } from '../../config/assumptions';
import { addCalendarDays, vnDateISO, vnStartOfDay } from '../../lib/vn-time';

/** Quy tắc thuần của trả hàng (BR-RET-08, 10, 12): không truy cập DB, không đồng hồ ẩn. */

export type ReturnReason = 'wrong-size' | 'wrong-color' | 'wrong-item' | 'defective' | 'not-fit' | 'changed-mind';
export type ReturnFault = 'shop' | 'customer';
export type ReturnState = 'requested' | 'approved' | 'received' | 'refunded' | 'rejected' | 'cancelled';
export type ReturnAction = 'approve' | 'reject' | 'receive' | 'refund';

/** S9-Q3: sáu lý do. Lỗi shop miễn phí gửi trả; lỗi khách trừ phí gửi trả. Thêm lý do = sửa đây + CHECK `chk_returns_reason`. */
export const REASONS: Record<ReturnReason, ReturnFault> = {
  'wrong-size': 'shop',
  'wrong-color': 'shop',
  'wrong-item': 'shop',
  defective: 'shop',
  'not-fit': 'customer',
  'changed-mind': 'customer',
};
export const REASON_CODES = Object.keys(REASONS) as ReturnReason[];
export const faultOf = (reason: ReturnReason): ReturnFault => REASONS[reason];

/** Nhãn tiếng Việt (dùng trong thư). */
export const REASON_LABELS: Record<ReturnReason, string> = {
  'wrong-size': 'Giao sai kích cỡ',
  'wrong-color': 'Giao sai màu',
  'wrong-item': 'Giao sai sản phẩm',
  defective: 'Sản phẩm lỗi / hư hỏng',
  'not-fit': 'Không vừa / không hợp',
  'changed-mind': 'Đổi ý',
};

export const STATES: readonly ReturnState[] = ['requested', 'approved', 'received', 'refunded', 'rejected', 'cancelled'];

/** S9-Q6: bảng chuyển trạng thái (BR-RET-08). Ngoài bảng và lặp lại đều bị từ chối. */
export const TRANSITIONS: Record<ReturnState, readonly ReturnState[]> = {
  requested: ['approved', 'rejected', 'cancelled'],
  approved: ['received', 'rejected'],
  received: ['refunded'],
  refunded: [],
  rejected: [],
  cancelled: [],
};
export const canTransition = (from: ReturnState, to: ReturnState): boolean => TRANSITIONS[from].includes(to);

/** Yêu cầu còn "sống" (giữ chỗ duy nhất của đơn) = mọi trạng thái trừ `cancelled`. */
export const isLive = (state: ReturnState): boolean => state !== 'cancelled';

/** Hạn trả: thời điểm KHÔNG còn hợp lệ (đầu ngày VN kế tiếp ngày thứ N kể từ ngày giao). Ngày giao VN = ngày 0. */
export function returnDeadlineExclusive(deliveredAt: Date): Date {
  const deliveryDay = vnDateISO(deliveredAt);
  return vnStartOfDay(addCalendarDays(deliveryDay, RETURNS_ASSUMPTIONS.windowDays + 1));
}

/** Hạn trả hiển thị (23:59:59 giờ VN của ngày thứ N, dạng thời điểm UTC). */
export const returnDeadline = (deliveredAt: Date): Date => new Date(returnDeadlineExclusive(deliveredAt).getTime() - 1000);

export interface EligibilityInput {
  status: string;
  paymentStatus: string;
  deliveredAt: Date | null;
}
export type Eligibility = 'ok' | 'not-returnable' | 'window-closed';

/**
 * Đơn có trả được không (BR-RET-10): `completed`, có `delivered_at`, `payment_status = paid` (loại refunded / partially_refunded),
 * còn trong hạn. Kiểm điều kiện đơn TRƯỚC hạn.
 */
export function checkEligibility(o: EligibilityInput, at: Date): Eligibility {
  if (o.status !== 'completed' || !o.deliveredAt || o.paymentStatus !== 'paid') return 'not-returnable';
  return at.getTime() >= returnDeadlineExclusive(o.deliveredAt).getTime() ? 'window-closed' : 'ok';
}

/** Hành động cho phép theo trạng thái + vai trò (BR-RET-43). `refund` chỉ admin (`returns.refund`). */
export function allowedActions(state: ReturnState, role: 'staff' | 'admin'): ReturnAction[] {
  const can = RETURN_PERMISSIONS[role];
  if (!can.includes('returns.process')) return [];
  const out: ReturnAction[] = [];
  if (canTransition(state, 'approved')) out.push('approve');
  if (canTransition(state, 'rejected')) out.push('reject');
  if (canTransition(state, 'received')) out.push('receive');
  if (canTransition(state, 'refunded') && can.includes('returns.refund')) out.push('refund');
  return out;
}
