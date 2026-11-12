import { RETURNS_ASSUMPTIONS } from '../../config/assumptions';
import { divRoundHalfUp } from '../../lib/money-math';
import type { ReturnFault } from './return-rules';

/**
 * MỘT công thức tiền hoàn (plan mục 5, BR-RET-30): ước tính, tạo (số dự kiến), nhận hàng (số chốt). Hàm thuần.
 * Đây (cùng `return.query.ts`) là nơi DUY NHẤT dùng `line_discount` cho tiền hoàn (T-RET-50 quét tĩnh).
 */

export interface ReturnOrderLine {
  orderItemId: string;
  unitPrice: number;
  quantity: number;
  lineDiscount: number;
}

export interface ReturnAmountInput {
  /** MỌI dòng của đơn. */
  orderLines: readonly ReturnOrderLine[];
  /** Số lượng tính tiền theo dòng (khách chọn hoặc nhân viên cho đạt); 0 / vắng = không tính. */
  qtyByItem: ReadonlyMap<string, number>;
  fault: ReturnFault;
  shippingFee: number;
  shippingDiscount: number;
}

export interface ReturnAmountResult {
  lines: Map<string, number>;
  goodsAmount: number;
  shippingRefund: number;
  returnShippingFee: number;
  amount: number;
}

export function computeReturnAmount(i: ReturnAmountInput): ReturnAmountResult {
  const lines = new Map<string, number>();
  let goods = 0;
  let full = i.orderLines.length > 0;
  for (const l of i.orderLines) {
    const q = i.qtyByItem.get(l.orderItemId) ?? 0;
    if (q !== l.quantity) full = false;
    const lineNet = l.unitPrice * l.quantity - l.lineDiscount;
    const amount = q <= 0 ? 0 : q === l.quantity ? lineNet : divRoundHalfUp(Math.max(0, lineNet) * q, l.quantity);
    lines.set(l.orderItemId, amount);
    goods += amount;
  }
  const shippingRefund = i.fault === 'shop' && full ? Math.max(0, i.shippingFee - i.shippingDiscount) : 0;
  const returnShippingFee = i.fault === 'customer' ? RETURNS_ASSUMPTIONS.returnShippingFee : 0;
  return { lines, goodsAmount: goods, shippingRefund, returnShippingFee, amount: goods + shippingRefund - returnShippingFee };
}
