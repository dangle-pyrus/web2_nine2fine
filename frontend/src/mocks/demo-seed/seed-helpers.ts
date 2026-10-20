import type {
  Order,
  OrderEvent,
  OrderItem,
  OrderPricing,
} from '../../app/features/orders/order-models';
import { STORE_POLICY } from '../../app/core/store-policy';
import { PRODUCTS } from '../products';

/** Shared builders for the demo seed. Every value here is fictional demo content. */
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** ISO datetime relative to "now", so seeded dates never look stale. */
export function at(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

/** ISO date (YYYY-MM-DD) relative to today. */
export function dateIn(days: number): string {
  return at(days * DAY).slice(0, 10);
}

/**
 * Order line from a real catalogue product so PDP links and media resolve. `colorIndex` picks the
 * product's colour; `nameOverride` simulates a longer name snapshotted at purchase time.
 */
export function line(
  slug: string,
  size: string,
  options: { quantity?: number; colorIndex?: number; nameOverride?: string } = {},
): OrderItem {
  const product = PRODUCTS.find((candidate) => candidate.slug === slug);
  if (!product) throw new Error(`Unknown demo-seed product ${slug}`);
  const colors = [...new Set(product.variants.map((variant) => variant.color.name))];
  return {
    productSlug: product.slug,
    name: options.nameOverride ?? product.name,
    color: colors[options.colorIndex ?? 0] ?? colors[0],
    size,
    quantity: options.quantity ?? 1,
    unitPrice: product.price,
    compareAtPrice: product.compareAtPrice,
    mediaId: product.mediaId,
  };
}

/** Same rule as the mock checkout: free shipping from the policy threshold or with a voucher. */
export function price(
  items: OrderItem[],
  options: { discount?: number; freeShipping?: boolean } = {},
): OrderPricing {
  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const discount = options.discount ?? 0;
  const shippingFee = STORE_POLICY.shippingFee;
  const free = options.freeShipping || subtotal >= STORE_POLICY.freeShippingFrom;
  const shippingDiscount = free ? shippingFee : 0;
  return {
    subtotal,
    discount,
    shippingFee,
    shippingDiscount,
    total: subtotal - discount + shippingFee - shippingDiscount,
  };
}

/** Order ID in the app's `N2F` + YYMMDD + 3-digit format, derived from the placement date. */
export function orderId(placedAt: string, sequence: number): string {
  return `N2F${placedAt.slice(2, 10).replace(/-/g, '')}${String(sequence).padStart(3, '0')}`;
}

export type ShipTo = Order['shippingAddress'];

export const PAY = {
  cod: { method: 'cod', label: 'Thanh toán khi nhận hàng (COD)', paid: false },
  codPaid: { method: 'cod', label: 'Đã thanh toán khi nhận hàng (COD)', paid: true },
  bankPending: { method: 'bank-transfer', label: 'Chưa thanh toán · Chuyển khoản', paid: false },
  bankPaid: { method: 'bank-transfer', label: 'Đã thanh toán · Chuyển khoản', paid: true },
  visa: { method: 'card', label: 'Visa •••• 4242', paid: true },
  master: { method: 'card', label: 'Mastercard •••• 4444', paid: true },
} as const satisfies Record<string, Order['payment']>;

/**
 * Plausible status and carrier events for a seeded order, derived from its dates so every status
 * has a believable history. Events never land in the future.
 */
export function demoTimeline(order: Omit<Order, 'timeline'>): OrderEvent[] {
  const placed = Date.parse(order.placedAt);
  const now = Date.now();
  const iso = (ms: number) => new Date(Math.min(ms, now - MINUTE)).toISOString();
  const events: OrderEvent[] = [{ at: order.placedAt, title: 'Đặt hàng thành công' }];
  const method = order.payment.method;
  const paid = order.payment.paid && method !== 'cod';
  if (paid) {
    events.push({
      at: order.paidAt ?? iso(placed + (method === 'card' ? MINUTE : 25 * MINUTE)),
      title: 'Đã nhận thanh toán',
      detail: order.payment.label,
    });
  }
  if (order.status === 'pending-payment') return events;
  if (order.status === 'cancelled') {
    const at = order.cancelledAt ?? iso(placed + 2 * HOUR);
    events.push({
      at,
      title:
        order.cancelledBy === 'shop'
          ? 'nine2fine đã hủy đơn hàng'
          : order.cancelledBy === 'system'
            ? 'Đơn tự hủy do quá hạn thanh toán'
            : 'Bạn đã hủy đơn hàng',
      detail: order.cancelledBy === 'shop' ? order.refund?.reason : undefined,
    });
    return withRefund(events, order, now);
  }
  const confirmed = placed + 40 * MINUTE;
  events.push({ at: iso(confirmed), title: 'nine2fine đã xác nhận đơn hàng' });
  if (order.status === 'processing') {
    events.push({ at: iso(confirmed + 2 * HOUR), title: 'Đang đóng gói tại kho TP.HCM' });
    return events;
  }
  const delivery = order.delivery;
  if (!delivery) {
    return order.status === 'returned' ? withReturn(events, order, placed + 3 * DAY, now) : events;
  }
  const handed = confirmed + 5 * HOUR;
  events.push({
    at: iso(handed),
    title: `Đã bàn giao cho ${delivery.carrier}`,
    detail: `Mã vận đơn ${delivery.trackingCode}`,
  });
  events.push({
    at: iso(handed + 9 * HOUR),
    title: 'Đơn hàng đã đến kho phân loại',
    detail: `Bưu cục ${order.shippingAddress.province.replace(/^(Thành phố|Tỉnh) /, '')}`,
  });
  if (order.status === 'shipping') return events;
  const end = delivery.deliveredAt ? Date.parse(delivery.deliveredAt) : now;
  events.push({
    at: iso(Math.max(handed + 10 * HOUR, end - 2 * HOUR)),
    title: 'Shipper đang giao hàng đến bạn',
  });
  if (!delivery.deliveredAt) return events;
  events.push({
    at: delivery.deliveredAt,
    title: 'Giao hàng thành công',
    detail: `Người nhận: ${order.shippingAddress.recipient}`,
  });
  if (order.status === 'returned') {
    return withReturn(events, order, Date.parse(delivery.deliveredAt), now);
  }
  return events;
}

function withReturn(
  events: OrderEvent[],
  order: Omit<Order, 'timeline'>,
  delivered: number,
  now: number,
): OrderEvent[] {
  const iso = (ms: number) => new Date(Math.min(ms, now - MINUTE)).toISOString();
  events.push({ at: iso(delivered + 2 * DAY), title: 'Yêu cầu trả hàng đã được chấp nhận' });
  events.push({ at: iso(delivered + 5 * DAY), title: 'nine2fine đã nhận hàng trả lại' });
  return withRefund(events, order, now);
}

/** Adds `demoTimeline` unless the order already carries its own history. */
export function withDemoTimeline(order: Order): Order {
  return order.timeline?.length ? order : { ...order, timeline: demoTimeline(order) };
}

function withRefund(
  events: OrderEvent[],
  order: Omit<Order, 'timeline'>,
  now: number,
): OrderEvent[] {
  const refund = order.refund;
  if (!refund) return events;
  const at = refund.refundedAt ?? refund.expectedBy;
  if (Date.parse(at) <= now) {
    events.push({ at, title: 'Đã hoàn tiền', detail: refund.destination });
  } else {
    events.push({
      at: new Date(now - HOUR).toISOString(),
      title: 'Đang xử lý hoàn tiền',
      detail: refund.destination,
    });
  }
  return events;
}
