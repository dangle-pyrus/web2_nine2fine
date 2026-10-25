import { storeSettings } from '../../core/store-settings';
import { Order, ReturnLine, ReturnReason } from './order-models';

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
  const delivered = order.delivery?.deliveredAt;
  const days = order.returnDays ?? storeSettings().policy.returnDays;
  return delivered ? new Date(Date.parse(delivered) + days * DAY).toISOString() : null;
}

export function canRequestReturn(order: Order, now = Date.now()): boolean {
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
