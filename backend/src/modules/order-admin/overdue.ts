import { ADMIN_ASSUMPTIONS } from '../../config/assumptions';
import { HOUR } from '../../lib/clock';
import { isoDate, vnDateISO } from '../../lib/vn-time';
import { addWorkingHours } from '../../lib/working-hours';

export type OverdueFlag = 'confirm-call' | 'cancel-request' | 'delivery';

export interface OverdueInput {
  status: string;
  /** Đơn đang cần gọi xác nhận (COD, `to_ship`, chưa xác nhận). */
  needsCall: boolean;
  createdAt: Date;
  cancelRequestedAt: Date | null;
  /** Cột DATE `estimated_to` (ngày giao dự kiến muộn nhất). */
  estimatedTo: Date;
}

/**
 * Cờ quá hạn (BR-ADM-40, S4-Q3). Một hàm cho list và detail. Chỉ là cờ, không đổi trạng thái.
 * - confirm-call: cần gọi và `at` > createdAt + 2 giờ làm việc.
 * - cancel-request: `cancel_requested` và `at` > cancelRequestedAt + 24 giờ (giờ thường).
 * - delivery: `to_receive` và ngày VN của `at` > `estimated_to`.
 */
export function overdueOf(o: OverdueInput, at: Date): OverdueFlag[] {
  const out: OverdueFlag[] = [];
  const a = ADMIN_ASSUMPTIONS;
  if (o.status === 'to_ship' && o.needsCall && at.getTime() > addWorkingHours(o.createdAt, a.callSlaWorkingHours, a.workHours).getTime()) {
    out.push('confirm-call');
  }
  if (o.status === 'cancel_requested' && o.cancelRequestedAt && at.getTime() - o.cancelRequestedAt.getTime() > a.cancelRequestSlaHours * HOUR) {
    out.push('cancel-request');
  }
  if (o.status === 'to_receive' && vnDateISO(at) > isoDate(o.estimatedTo)) out.push('delivery');
  return out;
}
