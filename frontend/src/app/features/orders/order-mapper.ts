import {
  CancelMode,
  Order,
  OrderCancelRequest,
  OrderRefund,
  ReturnCase,
  OrderEvent,
  OrderItem,
  OrderPricing,
  OrderStatus,
  PaymentMethod,
} from './order-models';
import { mapCancelledBy, mapOrderStatus } from './order-status-map';

/** `Order` of docs/api/openapi.yaml (only the fields the app reads). */
export interface OrderDto {
  id: string;
  placedAt: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  paymentDueAt?: string;
  paidAt?: string;
  items: {
    variantId?: string;
    productSlug: string;
    name: string;
    color: string;
    size: string;
    quantity: number;
    unitPrice: number;
    compareAtPrice?: number;
    mediaId: string;
    lineDiscount?: number;
    productId?: string | null;
    canReview?: boolean;
  }[];
  pricing: OrderPricing;
  vouchers?: { code: string; kind: string; amount: number }[];
  recipient: { name: string; phone: string; email: string };
  shippingAddress: { street: string; ward: string; province: string };
  note?: string;
  invoice?: { companyName: string; taxCode: string; address: string; email: string };
  estimatedDelivery?: { from: string; to: string };
  cancelledBy?: string;
  cancelledAt?: string;
  cancelReason?: string;
  canCancel?: boolean;
  canConfirmReceived?: boolean;
  cancelMode?: CancelMode;
  cancelRequest?: OrderCancelRequest;
  willCallToConfirm?: boolean;
  canReturn?: boolean;
  returnDeadline?: string;
  return?: ReturnCase;
  /** `system` is accepted too, should the server start telling automatic steps apart. */
  timeline?: {
    at: string;
    title: string;
    detail?: string;
    actor?: 'customer' | 'nine2fine' | 'system';
  }[];
}

/** Timeline steps that run on their own (payment hold expiry, auto-completion). */
const SYSTEM_STEP = /tự động|tự huỷ|tự hủy|hết thời gian|quá hạn thanh toán|hết hạn thanh toán/i;
const CANCEL_STEP = /hu[ỷy]/i;
const REFUND_STEP = /hoàn tiền/i;

/** ORD-09: customer = "Bạn", staff = "Cửa hàng", automatic steps = "Hệ thống". */
function actorOf(
  entry: NonNullable<OrderDto['timeline']>[number],
  dto: OrderDto,
): OrderEvent['actor'] {
  if (entry.actor === 'customer') return 'customer';
  if (entry.actor === 'system') return 'system';
  const text = `${entry.title} ${entry.detail ?? ''}`;
  if (SYSTEM_STEP.test(text)) return 'system';
  if (dto.cancelledBy === 'system' && CANCEL_STEP.test(entry.title)) return 'system';
  return entry.actor ? 'nine2fine' : undefined;
}

/**
 * ORD-13 / ORD-CC-06: the refund the server reports. Refunded (with its date) only when the server
 * says so: `paymentStatus` `refunded` / `partially_refunded`, or a return in state `refunded`.
 * A paid order that was cancelled and not refunded yet shows the refund as pending.
 */
function refundOf(dto: OrderDto, method: PaymentMethod): OrderRefund | undefined {
  const destination = method === 'cod' ? 'Tài khoản ngân hàng bạn cung cấp' : 'Tài khoản đã thanh toán';
  const ret = dto.return;
  if (ret?.state === 'refunded') {
    const to = ret.refundTo;
    return {
      amount: ret.refundedAmount ?? ret.amount.amount,
      destination:
        to.type === 'account' && to.bank
          ? `${to.bank}${to.last4 ? ' · •••• ' + to.last4 : ''}`
          : 'Phương thức đã thanh toán',
      reason: 'Hoàn tiền trả hàng',
      refundedAt: ret.refundedAt,
      confirmed: true,
    };
  }
  const refundedAt = [...(dto.timeline ?? [])]
    .reverse()
    .find((entry) => REFUND_STEP.test(entry.title))?.at;
  if (dto.paymentStatus === 'refunded') {
    return {
      amount: dto.pricing.total,
      destination,
      reason: dto.cancelReason ?? 'Hoàn tiền đơn hàng',
      refundedAt,
      confirmed: true,
    };
  }
  // A partial refund without a settled return: the amount is not in the payload, so no figure.
  if (dto.status === 'cancelled' && dto.paymentStatus === 'paid') {
    return {
      amount: dto.pricing.total,
      destination,
      reason: dto.cancelReason ?? 'Đơn đã huỷ',
    };
  }
  return undefined;
}

const PAYMENT_LABELS: Record<string, string> = {
  'cod:pending': 'Thanh toán khi nhận hàng (COD)',
  'cod:paid': 'Đã thanh toán · Thanh toán khi nhận hàng',
  'bank-transfer:pending': 'Chưa thanh toán · Chuyển khoản QR',
  'bank-transfer:paid': 'Đã thanh toán · Chuyển khoản QR',
  'bank-transfer:failed': 'Thanh toán chưa thành công · Chuyển khoản QR',
  // ORD-08: đơn đã hoàn tiền hiện rõ trạng thái hoàn thay vì "Đã thanh toán".
  'cod:refunded': 'Đã hoàn tiền · Thanh toán khi nhận hàng',
  'cod:partially_refunded': 'Đã hoàn một phần · Thanh toán khi nhận hàng',
  'bank-transfer:refunded': 'Đã hoàn tiền · Chuyển khoản QR',
  'bank-transfer:partially_refunded': 'Đã hoàn một phần · Chuyển khoản QR',
};

/** API order -> FE order (status mapping, payment label, address and voucher shape). */
export function toOrder(dto: OrderDto): Order {
  const mapped = mapOrderStatus(dto.status);
  const refundStatus =
    dto.paymentStatus === 'refunded'
      ? 'full'
      : dto.paymentStatus === 'partially_refunded'
        ? 'partial'
        : undefined;
  const returnCase = dto.return;
  // Slice 9: the order stays `completed` on the server; the label comes from the return request.
  const status: OrderStatus =
    mapped.status === 'completed' && returnCase
      ? returnCase.state === 'requested' ||
        returnCase.state === 'approved' ||
        returnCase.state === 'received'
        ? 'return-requested'
        : returnCase.state === 'refunded' && refundStatus === 'full'
          ? 'returned'
          : 'completed'
      : mapped.status;
  if (mapped.unknown) console.warn('Unknown order status from API:', dto.status);
  const method: PaymentMethod = dto.paymentMethod === 'bank-transfer' ? 'bank-transfer' : 'cod';
  const paid =
    dto.paymentStatus === 'paid' ||
    dto.paymentStatus === 'partially_refunded' ||
    dto.paymentStatus === 'refunded';
  const label =
    PAYMENT_LABELS[`${method}:${dto.paymentStatus}`] ??
    (paid ? 'Đã thanh toán' : 'Chưa thanh toán');
  const items: OrderItem[] = dto.items.map((line) => ({
    variantId: line.variantId,
    productSlug: line.productSlug,
    name: line.name,
    color: line.color,
    size: line.size,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    compareAtPrice: line.compareAtPrice,
    mediaId: line.mediaId,
    lineDiscount: line.lineDiscount || undefined,
    canReview: line.canReview === true,
  }));
  const timeline: OrderEvent[] | undefined = dto.timeline?.map((entry) => ({
    at: entry.at,
    title: entry.title,
    detail: entry.detail,
    actor: actorOf(entry, dto),
  }));
  return {
    id: dto.id,
    placedAt: dto.placedAt,
    status,
    statusNote: mapped.note,
    paymentDueAt: dto.paymentDueAt,
    paidAt: dto.paidAt,
    items,
    pricing: dto.pricing,
    shippingAddress: {
      recipient: dto.recipient.name,
      phone: dto.recipient.phone,
      street: dto.shippingAddress.street,
      ward: dto.shippingAddress.ward,
      province: dto.shippingAddress.province,
    },
    payment: { method, label, paid },
    refund: refundOf(dto, method),
    cancelledBy: mapCancelledBy(dto.cancelledBy),
    cancelledAt: dto.cancelledAt,
    cancelReason: dto.cancelReason,
    note: dto.note,
    voucherCode: dto.vouchers?.map((voucher) => voucher.code).join(', ') || undefined,
    invoice: dto.invoice,
    timeline,
    canCancel: dto.canCancel ?? false,
    canConfirmReceived: dto.canConfirmReceived ?? false,
    cancelMode: dto.canCancel ? dto.cancelMode : undefined,
    cancelRequest: dto.cancelRequest,
    willCallToConfirm: dto.willCallToConfirm,
    canReturn: dto.canReturn ?? false,
    returnDeadline: dto.returnDeadline,
    returnCase,
    refundStatus,
    estimatedDelivery: dto.estimatedDelivery,
    email: dto.recipient.email,
  };
}
