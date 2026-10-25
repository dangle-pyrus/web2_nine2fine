import { Order, OrderEvent, OrderStatus } from './order-models';

/**
 * Labels and colours from the Figma `order-status` component set (135:135). `processing` is not in
 * Figma: it marks a confirmed order that has not been handed to the carrier yet.
 */
export const ORDER_STATUS: Record<OrderStatus, { label: string; color: string }> = {
  'pending-payment': { label: 'Chờ thanh toán', color: '#b45309' },
  'pending-confirmation': { label: 'Chờ xác nhận', color: '#b45309' },
  processing: { label: 'Đang chuẩn bị hàng', color: '#1d4ed8' },
  shipping: { label: 'Đang vận chuyển', color: '#1d4ed8' },
  delivering: { label: 'Đang giao hàng', color: '#1d4ed8' },
  'delivery-failed': { label: 'Giao không thành công', color: '#b91c1c' },
  'returned-to-sender': { label: 'Đã hoàn về shop', color: '#b91c1c' },
  completed: { label: 'Hoàn thành', color: '#15803d' },
  cancelled: { label: 'Đã hủy', color: '#b91c1c' },
  'return-requested': { label: 'Đang xử lý trả hàng', color: '#6d28d9' },
  returned: { label: 'Trả hàng/Hoàn tiền', color: '#6d28d9' },
};

/**
 * History tabs. Each tab is named exactly like the badge of the orders it holds, so a shopper never
 * sees "Đang chuẩn bị hàng" under a "Vận chuyển" tab. `active` tabs show a count.
 */
export const ORDER_TABS = [
  { id: 'pending-payment', label: 'Chờ thanh toán', statuses: ['pending-payment'], active: true },
  {
    id: 'processing',
    label: 'Đang chuẩn bị',
    statuses: ['pending-confirmation', 'processing'],
    active: true,
  },
  { id: 'shipping', label: 'Đang vận chuyển', statuses: ['shipping'], active: true },
  {
    id: 'delivering',
    label: 'Đang giao hàng',
    statuses: ['delivering', 'delivery-failed'],
    active: true,
  },
  { id: 'completed', label: 'Hoàn thành', statuses: ['completed'], active: false },
  {
    id: 'cancelled',
    label: 'Đã hủy',
    statuses: ['cancelled', 'returned-to-sender'],
    active: false,
  },
  {
    id: 'returned',
    label: 'Trả hàng/Hoàn tiền',
    statuses: ['return-requested', 'returned'],
    active: false,
  },
] as const satisfies readonly {
  id: string;
  label: string;
  statuses: readonly OrderStatus[];
  active: boolean;
}[];

export type OrderTab = (typeof ORDER_TABS)[number];

export function findOrderTab(id: string | null): OrderTab | undefined {
  return ORDER_TABS.find((tab) => tab.id === id);
}

export function inTab(order: Order, tab: OrderTab): boolean {
  return (tab.statuses as readonly OrderStatus[]).includes(order.status);
}

const dateFormat = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const timeFormat = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' });
const weekdayFormat = new Intl.DateTimeFormat('vi-VN', {
  weekday: 'long',
  day: '2-digit',
  month: '2-digit',
});
const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return `${timeFormat.format(date)} - ${dateFormat.format(date)}`;
}

/** "thứ Hai, 20/10" for delivery estimates. */
export function formatWeekday(iso: string): string {
  return weekdayFormat.format(new Date(iso));
}

/** "2 giờ 15 phút" / "25 phút" until `iso`; empty once it has passed. */
export function formatRemaining(iso: string, now = Date.now()): string {
  const minutes = Math.ceil((Date.parse(iso) - now) / 60_000);
  if (minutes <= 0) return '';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} phút`;
  return rest ? `${hours} giờ ${rest} phút` : `${hours} giờ`;
}

/** A pending bank transfer whose hold has run out; the backend cancels it shortly after. */
export function isPaymentOverdue(order: Order, now = Date.now()): boolean {
  return (
    order.status === 'pending-payment' &&
    !!order.paymentDueAt &&
    Date.parse(order.paymentDueAt) <= now
  );
}

export function canPay(order: Order, now = Date.now()): boolean {
  return order.status === 'pending-payment' && !isPaymentOverdue(order, now);
}

/**
 * The shopper may cancel until the order is handed to the carrier: an unpaid transfer that is still
 * held, or a confirmed order still being packed (COD, or paid and refunded on cancel).
 */
export function canCancel(order: Order, now = Date.now()): boolean {
  return canPay(order, now) || order.status === 'processing';
}

/** Orders whose items can be put back in the bag in one click. */
export function canBuyAgain(order: Order): boolean {
  return (
    order.status === 'completed' || order.status === 'cancelled' || order.status === 'returned'
  );
}

/** Refund state: a refund counts as done once `refundedAt` is set or its expected date has passed. */
export function refundState(
  order: Order,
  now = Date.now(),
): { done: boolean; date: string } | null {
  const refund = order.refund;
  if (!refund) return null;
  const done = !!refund.refundedAt || Date.parse(refund.expectedBy) <= now;
  return { done, date: refund.refundedAt ?? refund.expectedBy };
}

function refundText(order: Order): string {
  const state = refundState(order);
  if (!state || !order.refund) return '';
  const amount = money.format(order.refund.amount);
  return state.done
    ? `Đã hoàn ${amount} ngày ${formatDate(state.date)}`
    : `${amount} đang được hoàn, dự kiến trước ${formatDate(state.date)}`;
}

function cancelText(order: Order): string {
  switch (order.cancelledBy) {
    case 'shop':
      return 'nine2fine đã hủy đơn';
    case 'system':
      return 'Đơn tự hủy do quá hạn thanh toán';
    default:
      return 'Bạn đã hủy đơn';
  }
}

function itemCount(order: Order): number {
  return order.items.reduce((sum, line) => sum + line.quantity, 0);
}

function returnedText(order: Order): string {
  const returned = order.refund?.items ?? itemCount(order);
  const total = itemCount(order);
  return returned < total ? `Đã trả ${returned}/${total} sản phẩm` : `Đã trả ${returned} sản phẩm`;
}

export type OrderNoteTone = 'alert' | 'transit' | 'success' | 'muted';

/** One-line status context shown on order cards (Figma `history-card` 193:2519). */
export function orderNote(
  order: Order,
  now = Date.now(),
): { text: string; tone: OrderNoteTone } | null {
  switch (order.status) {
    case 'pending-confirmation':
      return {
        text: 'nine2fine sẽ gọi cho bạn để xác nhận đơn trước khi đóng gói.',
        tone: 'transit',
      };
    case 'processing':
      return {
        text: 'Đơn hàng đã được xác nhận, nine2fine đang đóng gói.',
        tone: 'transit',
      };
    case 'delivery-failed':
      return {
        text: 'Shipper chưa giao được hàng. nine2fine sẽ liên hệ để hẹn giao lại.',
        tone: 'alert',
      };
    case 'returned-to-sender':
      return { text: 'Đơn không giao được và đã hoàn về nine2fine.', tone: 'muted' };
    case 'pending-payment': {
      if (!order.paymentDueAt) return null;
      const left = formatRemaining(order.paymentDueAt, now);
      return left
        ? {
            text: `Còn ${left} để thanh toán (trước ${formatDateTime(order.paymentDueAt)})`,
            tone: 'alert',
          }
        : { text: 'Đã quá hạn thanh toán, đơn sẽ được hủy tự động.', tone: 'muted' };
    }
    case 'shipping':
      return order.delivery
        ? {
            text: `Dự kiến giao ${formatWeekday(order.delivery.estimatedAt)} qua ${order.delivery.carrier}`,
            tone: 'transit',
          }
        : null;
    case 'delivering':
      return order.delivery
        ? {
            text: `Shipper đang giao đến bạn, dự kiến trước ${formatDateTime(order.delivery.estimatedAt)}`,
            tone: 'transit',
          }
        : null;
    case 'completed':
      if (order.returnRequest?.decision?.status === 'rejected') {
        return {
          text: `Yêu cầu trả hàng bị từ chối: ${order.returnRequest.decision.note}`,
          tone: 'alert',
        };
      }
      return order.delivery?.deliveredAt
        ? {
            text: `Đã giao thành công lúc ${formatDateTime(order.delivery.deliveredAt)}`,
            tone: 'success',
          }
        : null;
    case 'cancelled': {
      const refund = refundText(order);
      return {
        text: refund ? `${cancelText(order)} · ${refund}` : cancelText(order),
        tone: 'muted',
      };
    }
    case 'return-requested': {
      const request = order.returnRequest;
      return {
        text: request
          ? `Đã gửi yêu cầu trả hàng ngày ${formatDate(request.requestedAt)} · dự kiến hoàn ${money.format(request.amount)}`
          : 'Đã gửi yêu cầu trả hàng',
        tone: 'transit',
      };
    }
    case 'returned': {
      const refund = refundText(order);
      return {
        text: refund ? `${returnedText(order)} · ${refund}` : returnedText(order),
        tone: 'muted',
      };
    }
  }
}

export interface ProgressStep {
  label: string;
  icon: string;
  state: 'done' | 'current' | 'upcoming';
}

const STEPS = [
  { label: 'Đặt hàng', icon: 'reiconBasket' },
  { label: 'Thanh toán', icon: 'reiconCard' },
  { label: 'Vận chuyển', icon: 'reiconTruck' },
  { label: 'Đang giao', icon: 'reiconDelivery' },
  { label: 'Hoàn thành', icon: 'reiconCheckCircle' },
];

const CURRENT_STEP: Partial<Record<OrderStatus, number>> = {
  'pending-payment': 1,
  'pending-confirmation': 1,
  processing: 2,
  shipping: 2,
  delivering: 3,
  'delivery-failed': 3,
  completed: 5,
};

/** Progress for active orders; cancelled / returned orders show refund details instead. */
export function orderProgress(order: Order): ProgressStep[] | null {
  const current = CURRENT_STEP[order.status];
  if (current === undefined) return null;
  return STEPS.map((step, index) => {
    let { label, icon } = step;
    // COD is collected on delivery, so the second step is the shop's confirmation.
    if (index === 1 && order.payment.method === 'cod') {
      label = 'Xác nhận';
      icon = 'reiconReceipt';
    }
    // A confirmed order still in the warehouse is being packed, not travelling yet.
    if (index === 2 && order.status === 'processing') {
      label = 'Chuẩn bị hàng';
      icon = 'reiconPackage';
    }
    return {
      label,
      icon,
      state: index < current ? 'done' : index === current ? 'current' : 'upcoming',
    };
  });
}

export function orderHeadline(order: Order): { eyebrow: string; title: string; detail: string } {
  switch (order.status) {
    case 'pending-payment': {
      const overdue = isPaymentOverdue(order);
      return {
        eyebrow: 'Đơn hàng của bạn',
        title: overdue ? 'Đã quá hạn thanh toán' : 'Đang chờ thanh toán',
        detail: overdue
          ? 'Đơn hàng chưa được thanh toán đúng hạn và sẽ được hủy tự động.'
          : order.paymentDueAt
            ? `Vui lòng thanh toán trước ${formatDateTime(order.paymentDueAt)} để giữ đơn hàng.`
            : 'Vui lòng hoàn tất thanh toán để giữ đơn hàng.',
      };
    }
    case 'pending-confirmation':
      return {
        eyebrow: 'Đơn hàng của bạn',
        title: 'Chờ xác nhận',
        detail: orderNote(order)?.text ?? '',
      };
    case 'processing':
      return {
        eyebrow: 'Đơn hàng của bạn',
        title: 'Đang chuẩn bị hàng',
        detail: orderNote(order)?.text ?? '',
      };
    case 'delivery-failed':
      return {
        eyebrow: 'Cập nhật đơn hàng',
        title: 'Giao hàng không thành công',
        detail: orderNote(order)?.text ?? '',
      };
    case 'returned-to-sender':
      return {
        eyebrow: 'Cập nhật đơn hàng',
        title: 'Đơn đã hoàn về shop',
        detail: orderNote(order)?.text ?? '',
      };
    case 'shipping':
      return {
        eyebrow: 'Đơn hàng của bạn',
        title: order.delivery
          ? `Dự kiến giao ${formatWeekday(order.delivery.estimatedAt)}`
          : 'Đang vận chuyển',
        detail: order.delivery
          ? `${order.delivery.carrier} đang vận chuyển đơn hàng đến bạn.`
          : 'Đơn hàng đã rời kho nine2fine.',
      };
    case 'delivering':
      return {
        eyebrow: 'Đơn hàng của bạn',
        title: 'Shipper đang giao hàng',
        detail: order.delivery
          ? `Dự kiến đến trước ${formatDateTime(order.delivery.estimatedAt)}. Vui lòng để ý điện thoại.`
          : 'Vui lòng để ý điện thoại.',
      };
    case 'completed':
      if (order.returnRequest?.decision?.status === 'rejected') {
        return {
          eyebrow: 'Cập nhật đơn hàng',
          title: 'Yêu cầu trả hàng bị từ chối',
          detail: `Lý do: ${order.returnRequest.decision.note}`,
        };
      }
      return {
        eyebrow: 'Đơn hàng của bạn',
        title: 'Đã giao thành công',
        detail: orderNote(order)?.text ?? 'Cảm ơn bạn đã mua sắm cùng nine2fine.',
      };
    case 'cancelled': {
      const by = cancelText(order);
      const reason = order.refund?.reason;
      return {
        eyebrow: 'Cập nhật đơn hàng',
        title: order.cancelledBy === 'system' ? 'Đơn hàng đã tự hủy' : 'Đơn hàng đã hủy',
        detail: reason && order.cancelledBy === 'shop' ? `${by}. Lý do: ${reason}` : by + '.',
      };
    }
    case 'return-requested':
      return {
        eyebrow: 'Cập nhật đơn hàng',
        title: 'Đang xử lý trả hàng',
        detail:
          'nine2fine đã nhận yêu cầu và sẽ liên hệ trong 24 giờ làm việc để hẹn lấy hàng. Tiền được hoàn sau khi kiểm tra sản phẩm.',
      };
    case 'returned': {
      const done = refundState(order)?.done;
      return {
        eyebrow: 'Cập nhật đơn hàng',
        title: done ? 'Đã trả hàng và hoàn tiền' : 'Đang hoàn tiền cho hàng trả lại',
        detail: `${returnedText(order)}.${order.refund?.reason ? ` Lý do: ${order.refund.reason}` : ''}`,
      };
    }
  }
}

/**
 * Order history, newest first. Uses backend events when present; otherwise rebuilds the steps the
 * order data itself proves (placed, paid, cancelled, delivered, refunded).
 */
export function orderTimeline(order: Order, now = Date.now()): OrderEvent[] {
  const events: OrderEvent[] = order.timeline?.length
    ? [...order.timeline]
    : derivedEvents(order, now);
  return events
    .filter((event) => Date.parse(event.at) <= now)
    .sort((a, b) => b.at.localeCompare(a.at));
}

function derivedEvents(order: Order, now: number): OrderEvent[] {
  const events: OrderEvent[] = [{ at: order.placedAt, title: 'Đặt hàng thành công' }];
  if (order.paidAt) {
    events.push({ at: order.paidAt, title: 'Đã nhận thanh toán', detail: order.payment.label });
  }
  if (order.status === 'cancelled' && order.cancelledAt) {
    events.push({ at: order.cancelledAt, title: cancelText(order) });
  }
  if (order.delivery?.deliveredAt) {
    events.push({ at: order.delivery.deliveredAt, title: 'Giao hàng thành công' });
  }
  if (order.returnRequest) {
    events.push({ at: order.returnRequest.requestedAt, title: 'Đã gửi yêu cầu trả hàng' });
  }
  const refund = refundState(order, now);
  if (refund?.done) {
    events.push({ at: refund.date, title: 'Đã hoàn tiền', detail: order.refund?.destination });
  }
  return events;
}

/** Public tracking page of the carriers nine2fine works with; null when unknown. */
export function carrierTrackingUrl(carrier: string, code: string): string | null {
  const id = encodeURIComponent(code);
  switch (carrier.toLowerCase()) {
    case 'ghn':
      return `https://donhang.ghn.vn/?order_code=${id}`;
    case 'ghtk':
      return `https://i.ghtk.vn/${id}`;
    case 'viettel post':
      return `https://viettelpost.com.vn/tra-cuu-hanh-trinh-don/?code=${id}`;
    default:
      return null;
  }
}

/**
 * Payment state line, kept apart from the method name. Older data mixes both in `label`
 * ("Chưa thanh toán · Chuyển khoản"), so the method is read after the last "·".
 */
export function paymentMethodLabel(order: Order): string {
  if (order.payment.method === 'cod') return 'Thanh toán khi nhận hàng (COD)';
  const parts = order.payment.label.split('·');
  return parts[parts.length - 1].trim();
}

export function paymentStateLabel(order: Order): string {
  if (order.payment.paid) {
    const at = order.paidAt ?? (order.payment.method === 'card' ? order.placedAt : undefined);
    if (order.payment.method === 'cod') return 'Đã thanh toán khi nhận hàng';
    return at ? `Đã thanh toán lúc ${formatDateTime(at)}` : 'Đã thanh toán';
  }
  if (order.status === 'cancelled') return 'Không thu tiền';
  if (order.payment.method === 'cod') return 'Thanh toán khi nhận hàng';
  return isPaymentOverdue(order) ? 'Quá hạn thanh toán' : 'Chưa thanh toán';
}
