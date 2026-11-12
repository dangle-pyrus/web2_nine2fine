import { storeSettings } from '../../core/store-settings';
import { Order, ReturnLine, ReturnReason, ReturnState } from './order-models';

const DAY = 24 * 60 * 60 * 1000;

/** Reasons offered on the return form; `sellerFault` returns are free and need photos. */
export const RETURN_REASONS: { value: ReturnReason; label: string; sellerFault: boolean }[] = [
  { value: 'wrong-size', label: 'Giao sai size', sellerFault: true },
  { value: 'wrong-color', label: 'Giao sai màu', sellerFault: true },
  { value: 'wrong-item', label: 'Giao sai sản phẩm', sellerFault: true },
  { value: 'defective', label: 'Sản phẩm lỗi hoặc hư hỏng', sellerFault: true },
  { value: 'not-fit', label: 'Không vừa', sellerFault: false },
  { value: 'changed-mind', label: 'Không còn nhu cầu', sellerFault: false },
];

export function returnReason(value: ReturnReason) {
  return RETURN_REASONS.find((reason) => reason.value === value)!;
}

/**
 * ISO datetime the return window closes, counted from delivery; null if never delivered. Uses the
 * return days in force when the order was delivered, today's for older orders.
 */
export function returnDeadline(order: Order): string | null {
  // API orders: the server computes the deadline (no client clock arithmetic).
  if (order.canReturn !== undefined) return order.returnDeadline ?? null;
  const delivered = order.delivery?.deliveredAt;
  const days = order.returnDays ?? storeSettings().policy.returnDays;
  return delivered ? new Date(Date.parse(delivered) + days * DAY).toISOString() : null;
}

export function canRequestReturn(order: Order, now = Date.now()): boolean {
  // API orders: `canReturn` is the server's answer (status, payment, window, no other request).
  if (order.canReturn !== undefined) return order.canReturn;
  const deadline = returnDeadline(order);
  return (
    order.status === 'completed' && !order.returnRequest && !!deadline && Date.parse(deadline) > now
  );
}

/**
 * Refund for the picked lines: what was actually paid for them (order discount allocated by line
 * value), minus return shipping when the reason is the shopper's own. When the whole order goes
 * back because of a seller fault, the original shipping fee is refunded too.
 */
export function estimateRefund(
  order: Order,
  lines: ReturnLine[],
  reason: ReturnReason,
): { amount: number; returnShippingFee: number } {
  const { subtotal, discount, shippingFee, shippingDiscount } = order.pricing;
  if (order.canReturn !== undefined) return estimateByLine(order, lines, reason);
  const value = lines.reduce(
    (sum, line) => sum + (order.items[line.index]?.unitPrice ?? 0) * line.quantity,
    0,
  );
  if (!value) return { amount: 0, returnShippingFee: 0 };
  const share = subtotal ? Math.round((discount * value) / subtotal) : 0;
  const fault = returnReason(reason).sellerFault;
  const returnShippingFee = fault ? 0 : storeSettings().policy.returnShippingFee;
  const all = order.items.every((item, index) =>
    lines.some((line) => line.index === index && line.quantity === item.quantity),
  );
  const shippingBack = fault && all ? shippingFee - shippingDiscount : 0;
  return {
    amount: Math.max(0, value - share - returnShippingFee + shippingBack),
    returnShippingFee,
  };
}

/** Whether the return screens are offered for the orders this build loads. */
export function returnsEnabled(config: { returnsMode: string; checkoutMode: string }): boolean {
  return config.returnsMode === 'http' || config.checkoutMode === 'mock';
}

/** Customer-facing label of a return request state (BR-RET-23). */
export const RETURN_STATE_LABEL: Record<ReturnState, string> = {
  requested: 'Chờ nine2fine duyệt',
  approved: 'Đã duyệt, chờ bạn gửi hàng',
  received: 'Đã nhận hàng, đang hoàn tiền',
  refunded: 'Đã hoàn tiền',
  rejected: 'Không được chấp nhận',
  cancelled: 'Đã huỷ yêu cầu',
};

/**
 * API orders (BR-RET-30): per line what was paid (unitPrice x quantity - lineDiscount), half-up
 * share for a partial quantity; the delivery fee comes back only for a seller fault when every
 * line goes back in full; the shopper's own reasons pay the return shipping fee. The server's
 * estimateReturnAmount is the truth; this is what shows until it answers.
 */
function estimateByLine(
  order: Order,
  lines: ReturnLine[],
  reason: ReturnReason,
): { amount: number; returnShippingFee: number } {
  const fault = returnReason(reason).sellerFault;
  let goods = 0;
  for (const line of lines) {
    const item = order.items[line.index];
    if (!item) continue;
    const paid = item.unitPrice * item.quantity - (item.lineDiscount ?? 0);
    goods +=
      line.quantity >= item.quantity ? paid : Math.round((paid * line.quantity) / item.quantity);
  }
  if (!goods) return { amount: 0, returnShippingFee: 0 };
  const all = order.items.every((item, index) =>
    lines.some((line) => line.index === index && line.quantity === item.quantity),
  );
  const { shippingFee, shippingDiscount } = order.pricing;
  const shippingBack = fault && all ? shippingFee - shippingDiscount : 0;
  const returnShippingFee = fault ? 0 : storeSettings().policy.returnShippingFee;
  return { amount: Math.max(0, goods + shippingBack - returnShippingFee), returnShippingFee };
}
