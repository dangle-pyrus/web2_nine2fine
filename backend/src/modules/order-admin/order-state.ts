import type { order_status, user_role } from '@prisma/client';
import { ADMIN_ASSUMPTIONS } from '../../config/assumptions';
import type { AdminBucket } from './order-admin.schemas';

/**
 * Máy trạng thái admin (plan mục 4): MỘT nguồn sự thật. `allowedActions` và (từ lát 4.3) kiểm 409 của service dùng cùng bảng.
 * Vai trò: 'staff' = staff + admin; 'admin' = chỉ admin.
 */
export type AdminAction =
  | 'call-attempt' | 'confirm' | 'ship' | 'deliver'
  | 'cancel-unreachable' | 'cancel-declined-on-call' | 'cancel-customer-request' | 'cancel-refused' | 'cancel-undeliverable' | 'cancel-other'
  | 'restock' | 'write-off' | 'approve-cancel' | 'reject-cancel' | 'add-note' | 'print-slip';

export interface StateOrder {
  status: order_status;
  paymentMethod: 'cod' | 'bank_transfer';
  needsConfirmCall: boolean;
  confirmedAt: Date | null;
  returnedFromTransit: boolean;
  returnHandledAt: Date | null;
  stockRestoredAt: Date | null;
}

export interface CallStats {
  total: number;
  /** Số lần lớn nhất trong một cửa sổ 24 giờ 00 phút bất kỳ. */
  inFirstDay: number;
  firstAt?: Date;
  lastAt?: Date;
}

/** "Cần gọi": COD, `to_ship`, cần xác nhận, chưa xác nhận. */
export const needsCall = (o: Pick<StateOrder, 'status' | 'paymentMethod' | 'needsConfirmCall' | 'confirmedAt'>): boolean =>
  o.paymentMethod === 'cod' && o.status === 'to_ship' && o.needsConfirmCall && o.confirmedAt === null;

/** Số lần lớn nhất nằm trong một cửa sổ <= `windowMs` (so sánh `<=`), `times` đã sắp tăng. */
export function maxInWindow(times: readonly number[], windowMs: number): number {
  let best = 0;
  let lo = 0;
  for (let hi = 0; hi < times.length; hi++) {
    while (times[hi] - times[lo] > windowMs) lo++;
    best = Math.max(best, hi - lo + 1);
  }
  return best;
}

export function callStatsOf(attemptTimes: readonly Date[]): CallStats {
  const t = attemptTimes.map((d) => d.getTime()).sort((a, b) => a - b);
  return {
    total: t.length,
    inFirstDay: maxInWindow(t, ADMIN_ASSUMPTIONS.unreachableWindowMs),
    ...(t.length > 0 ? { firstAt: new Date(t[0]), lastAt: new Date(t[t.length - 1]) } : {}),
  };
}

interface Row {
  action: AdminAction;
  from: readonly order_status[];
  who: 'staff' | 'admin';
  when?: (o: StateOrder, c: CallStats) => boolean;
  /**
   * Khi `when` sai: nếu `unmet.test` đúng thì là thiếu điều kiện (`409 condition-not-met`, kèm câu `message`),
   * ngược lại là bước không hợp lệ (`409 invalid-transition`). Không có `unmet` = luôn `invalid-transition`.
   */
  unmet?: { test: (o: StateOrder, c: CallStats) => boolean; message: string };
}

const returnPending = (o: StateOrder) => o.returnedFromTransit && o.returnHandledAt === null && o.stockRestoredAt === null;

export const TRANSITIONS: readonly Row[] = [
  { action: 'call-attempt', from: ['to_ship'], who: 'staff', when: (o) => needsCall(o) },
  { action: 'confirm', from: ['to_ship'], who: 'staff', when: (o) => needsCall(o) },
  {
    action: 'ship', from: ['to_ship'], who: 'staff', when: (o) => !needsCall(o),
    unmet: { test: (o) => needsCall(o), message: 'Đơn cần gọi xác nhận với khách trước khi bàn giao vận chuyển.' },
  },
  { action: 'deliver', from: ['to_receive'], who: 'staff' },
  {
    action: 'cancel-unreachable', from: ['to_ship'], who: 'staff',
    when: (o, c) => needsCall(o) && c.inFirstDay >= ADMIN_ASSUMPTIONS.unreachableAttempts,
    unmet: { test: (o) => needsCall(o), message: 'Chưa đủ 3 lần không liên lạc được trong 24 giờ.' },
  },
  { action: 'cancel-declined-on-call', from: ['to_ship'], who: 'staff', when: (o) => needsCall(o) },
  { action: 'cancel-customer-request', from: ['to_ship'], who: 'staff' },
  { action: 'cancel-refused', from: ['to_receive'], who: 'staff' },
  { action: 'cancel-undeliverable', from: ['to_receive'], who: 'staff' },
  { action: 'cancel-other', from: ['to_ship', 'to_receive'], who: 'admin' },
  { action: 'restock', from: ['cancelled'], who: 'staff', when: returnPending },
  { action: 'write-off', from: ['cancelled'], who: 'staff', when: returnPending },
  { action: 'approve-cancel', from: ['cancel_requested'], who: 'staff' },
  { action: 'reject-cancel', from: ['cancel_requested'], who: 'staff' },
];

export type TransitionVerdict =
  | { ok: true }
  | { ok: false; kind: 'forbidden' }
  | { ok: false; kind: 'invalid-transition' }
  | { ok: false; kind: 'condition-not-met'; message: string };

/** Kiểm MỘT hành động bằng cùng bảng `TRANSITIONS` mà `allowedActions` dùng (409 và nút không thể lệch nhau). */
export function checkTransition(action: AdminAction, o: StateOrder, role: user_role, c: CallStats): TransitionVerdict {
  const r = TRANSITIONS.find((x) => x.action === action);
  if (!r) return { ok: false, kind: 'invalid-transition' };
  if (r.who === 'admin' && role !== 'admin') return { ok: false, kind: 'forbidden' };
  if (!r.from.includes(o.status)) return { ok: false, kind: 'invalid-transition' };
  if (r.when && !r.when(o, c)) {
    return r.unmet && r.unmet.test(o, c) ? { ok: false, kind: 'condition-not-met', message: r.unmet.message } : { ok: false, kind: 'invalid-transition' };
  }
  return { ok: true };
}

export type AdminCancelReason = 'unreachable' | 'declined_on_call' | 'customer_request' | 'refused' | 'undeliverable' | 'other';
export const CANCEL_REASONS: readonly AdminCancelReason[] = ['unreachable', 'declined_on_call', 'customer_request', 'refused', 'undeliverable', 'other'];
export const cancelActionOf = (r: AdminCancelReason): AdminAction => `cancel-${r.replace(/_/g, '-')}` as AdminAction;

/** Câu chuẩn cho khách theo lý do huỷ do shop (BR-ADM-28, S4-Q7): vào `cancel_reason`, timeline khách và email. */
export const SHOP_CANCEL_REASON_TEXT: Record<AdminCancelReason, string> = {
  unreachable: 'Chúng tôi không liên lạc được với bạn để xác nhận đơn.',
  declined_on_call: 'Bạn đã báo không muốn nhận đơn.',
  customer_request: 'Đơn đã được huỷ theo yêu cầu của bạn.',
  refused: 'Đơn không được nhận khi giao hàng.',
  undeliverable: 'Giao hàng không thành công.',
  other: 'nine2fine không thể thực hiện đơn này.',
};

/** Hành động hợp lệ ngay lúc này cho đúng vai trò (BR-ADM-04). `add-note` luôn có; `print-slip` ở `to_ship` / `to_receive`. */
export function computeAllowedActions(o: StateOrder, role: user_role, c: CallStats): AdminAction[] {
  const out: AdminAction[] = [];
  for (const r of TRANSITIONS) {
    if (!r.from.includes(o.status)) continue;
    if (r.who === 'admin' && role !== 'admin') continue;
    if (r.when && !r.when(o, c)) continue;
    out.push(r.action);
  }
  out.push('add-note');
  if (o.status === 'to_ship' || o.status === 'to_receive') out.push('print-slip');
  return out;
}

/** Tab của đơn (mỗi đơn đúng một). Khớp biểu thức SQL ở `order-admin.query.ts`. */
export function tabOf(o: StateOrder): AdminBucket {
  switch (o.status) {
    case 'to_pay':
      return 'pending-payment';
    case 'to_ship':
      return needsCall(o) ? 'to-confirm' : 'to-fulfil';
    case 'to_receive':
      return 'in-transit';
    case 'cancel_requested':
      return 'cancel-requests';
    case 'completed':
      return 'completed';
    case 'cancelled':
      return o.returnedFromTransit && o.returnHandledAt === null ? 'returning' : 'cancelled';
  }
}
