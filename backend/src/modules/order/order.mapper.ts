import type { Order, OrderEvent, OrderItem, order_status } from '@prisma/client';
import { ASSUMPTIONS } from '../../config/assumptions';

/** Dạng `Order` của contract. Không có `userId`, UUID nội bộ hay dữ liệu thanh toán nhạy cảm. */
export interface OrderDto {
  id: string;
  placedAt: string;
  status: order_status;
  paymentStatus: string;
  paymentMethod: 'cod' | 'bank-transfer';
  paymentDueAt?: string;
  paidAt?: string;
  items: Array<{
    variantId: string;
    productSlug: string;
    name: string;
    color: string;
    size: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    compareAtPrice?: number;
    mediaId: string;
    lineDiscount: number;
  }>;
  pricing: { subtotal: number; discount: number; shippingFee: number; shippingDiscount: number; total: number };
  vouchers: Array<{ code: string; kind: 'discount' | 'free-shipping'; amount: number }>;
  recipient: { name: string; phone: string; email: string };
  shippingAddress: { street: string; ward: string; province: string };
  note?: string;
  invoice?: { companyName: string; taxCode: string; address: string; email: string };
  estimatedDelivery: { from: string; to: string };
  cancelledBy?: string;
  cancelledAt?: string;
  cancelReason?: string;
  canCancel: boolean;
  willCallToConfirm?: boolean;
  timeline: Array<{ at: string; title: string; detail?: string }>;
}

export type OrderRow = Order & { items: OrderItem[]; events: OrderEvent[] };

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

function timelineTitle(e: OrderEvent): string {
  switch (e.toStatus) {
    case 'to_pay':
      return 'Đã đặt hàng, chờ thanh toán';
    case 'to_ship':
      return e.fromStatus === 'to_pay' ? 'Đã nhận thanh toán' : 'Đã đặt hàng';
    case 'to_receive':
      return 'Đang giao hàng';
    case 'completed':
      return 'Giao hàng thành công';
    case 'cancel_requested':
      return 'Yêu cầu huỷ đơn';
    case 'cancelled':
      return 'Đã huỷ đơn';
  }
}

export function toOrderDto(o: OrderRow): OrderDto {
  const items = [...o.items].sort((a, b) => a.lineNo - b.lineNo);
  const events = [...o.events].sort((a, b) => a.at.getTime() - b.at.getTime());
  const dto: OrderDto = {
    id: o.code,
    placedAt: o.createdAt.toISOString(),
    status: o.status,
    paymentStatus: o.paymentStatus,
    paymentMethod: o.paymentMethod === 'bank_transfer' ? 'bank-transfer' : 'cod',
    items: items.map((i) => ({
      variantId: i.variantId,
      productSlug: i.productSlug,
      name: i.name,
      color: i.colorName,
      size: i.size,
      sku: i.sku,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      ...(i.compareAtPrice !== null ? { compareAtPrice: i.compareAtPrice } : {}),
      mediaId: i.mediaId,
      lineDiscount: i.lineDiscount,
    })),
    pricing: {
      subtotal: o.subtotal,
      discount: o.discount,
      shippingFee: o.shippingFee,
      shippingDiscount: o.shippingDiscount,
      total: o.total,
    },
    vouchers: [
      ...(o.discountVoucherCode ? [{ code: o.discountVoucherCode, kind: 'discount' as const, amount: o.discount }] : []),
      ...(o.shippingVoucherCode ? [{ code: o.shippingVoucherCode, kind: 'free-shipping' as const, amount: 0 }] : []),
    ],
    recipient: { name: o.recipientName, phone: o.recipientPhone, email: o.email },
    shippingAddress: { street: o.street, ward: o.wardName, province: o.provinceName },
    estimatedDelivery: { from: isoDate(o.estimatedFrom), to: isoDate(o.estimatedTo) },
    canCancel: (ASSUMPTIONS.customerCancellableFrom as readonly string[]).includes(o.status),
    timeline: events.map((e) => ({ at: e.at.toISOString(), title: timelineTitle(e), ...(e.detail ? { detail: e.detail } : {}) })),
  };
  if (o.status === 'to_pay' && o.paymentDueAt) dto.paymentDueAt = o.paymentDueAt.toISOString();
  if (o.paidAt) dto.paidAt = o.paidAt.toISOString();
  if (o.note) dto.note = o.note;
  if (o.invoiceCompany && o.invoiceTaxCode && o.invoiceAddress && o.invoiceEmail) {
    dto.invoice = { companyName: o.invoiceCompany, taxCode: o.invoiceTaxCode, address: o.invoiceAddress, email: o.invoiceEmail };
  }
  if (o.cancelledBy) dto.cancelledBy = o.cancelledBy;
  if (o.cancelledAt) dto.cancelledAt = o.cancelledAt.toISOString();
  if (o.cancelReason) dto.cancelReason = o.cancelReason;
  if (o.paymentMethod === 'cod' && o.status === 'to_ship') dto.willCallToConfirm = o.needsConfirmCall;
  return dto;
}

export const ORDER_INCLUDE = { items: true, events: true } as const;
