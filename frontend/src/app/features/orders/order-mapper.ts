import {
  CancelMode,
  Order,
  OrderCancelRequest,
  OrderEvent,
  OrderItem,
  OrderPricing,
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
  cancelMode?: CancelMode;
  cancelRequest?: OrderCancelRequest;
  willCallToConfirm?: boolean;
  timeline?: { at: string; title: string; detail?: string; actor?: 'customer' | 'nine2fine' }[];
}

const PAYMENT_LABELS: Record<string, string> = {
  'cod:pending': 'Thanh toán khi nhận hàng (COD)',
  'cod:paid': 'Đã thanh toán · Thanh toán khi nhận hàng',
  'bank-transfer:pending': 'Chưa thanh toán · Chuyển khoản QR',
  'bank-transfer:paid': 'Đã thanh toán · Chuyển khoản QR',
  'bank-transfer:failed': 'Thanh toán chưa thành công · Chuyển khoản QR',
};

/** API order -> FE order (status mapping, payment label, address and voucher shape). */
export function toOrder(dto: OrderDto): Order {
  const mapped = mapOrderStatus(dto.status);
  if (mapped.unknown) console.warn('Unknown order status from API:', dto.status);
  const method: PaymentMethod = dto.paymentMethod === 'bank-transfer' ? 'bank-transfer' : 'cod';
  const paid = dto.paymentStatus === 'paid' || dto.paymentStatus === 'partially_refunded';
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
  }));
  const timeline: OrderEvent[] | undefined = dto.timeline?.map((entry) => ({
    at: entry.at,
    title: entry.title,
    detail: entry.detail,
    actor: entry.actor,
  }));
  return {
    id: dto.id,
    placedAt: dto.placedAt,
    status: mapped.status,
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
    cancelledBy: mapCancelledBy(dto.cancelledBy),
    cancelledAt: dto.cancelledAt,
    cancelReason: dto.cancelReason,
    note: dto.note,
    voucherCode: dto.vouchers?.map((voucher) => voucher.code).join(', ') || undefined,
    invoice: dto.invoice,
    timeline,
    canCancel: dto.canCancel ?? false,
    cancelMode: dto.canCancel ? dto.cancelMode : undefined,
    cancelRequest: dto.cancelRequest,
    willCallToConfirm: dto.willCallToConfirm,
    estimatedDelivery: dto.estimatedDelivery,
    email: dto.recipient.email,
  };
}
