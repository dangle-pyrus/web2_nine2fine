import type { Order, OrderEvent, OrderItem, order_event_kind, order_status } from '@prisma/client';
import { ASSUMPTIONS } from '../../config/assumptions';
import { now as clockNow } from '../../lib/clock';
import type { ReturnRequestDto } from '../returns/return.mapper';
import { checkEligibility, returnDeadline } from '../returns/return-rules';

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
    /** BR-REV-09: `null` nếu sản phẩm đã xoá. */
    productId: string | null;
    /** BR-REV-09: chỉ đơn của chủ đơn thành viên (`toOrderDtosWithReturn`) mới có thể `true`. */
    canReview: boolean;
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
  /** COMMON-01.9 / ORD-06: khách được bấm "Đã nhận hàng" (đơn đang `to_receive`). */
  canConfirmReceived: boolean;
  /** Slice 9: máy chủ tính (đủ điều kiện + còn hạn + chưa có yêu cầu sống; `withReturn` chỉnh theo yêu cầu). */
  canReturn: boolean;
  returnDeadline?: string;
  return?: ReturnRequestDto;
  cancelMode?: 'cancel' | 'request';
  cancelRequest?: { requestedAt: string; outcome: 'pending' | 'rejected' | 'approved'; rejectReason?: string };
  shipment?: { carrier: string; trackingNumber: string; handedOverAt: string };
  deliveredAt?: string;
  willCallToConfirm?: boolean;
  timeline: Array<{ at: string; title: string; detail?: string; actor: 'customer' | 'nine2fine' }>;
}

export type OrderRow = Order & { items: OrderItem[]; events: OrderEvent[] };

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

/** Sự kiện Slice 3 (kind NULL) suy ra loại theo trạng thái (plan mục 2). */
export function kindOf(e: Pick<OrderEvent, 'kind' | 'fromStatus' | 'toStatus'>): order_event_kind {
  if (e.kind) return e.kind;
  if (e.fromStatus === null) return 'placed';
  if (e.toStatus === 'cancelled') return 'cancelled';
  if (e.fromStatus === 'to_pay' && e.toStatus === 'to_ship') return 'payment_received';
  return 'note';
}

/** Chỉ các lần đổi trạng thái khách cần thấy (BR-ADM-12): không có lần gọi, xác nhận, ghi chú, hàng hoàn. */
const CUSTOMER_KINDS: ReadonlySet<order_event_kind> = new Set<order_event_kind>([
  'placed', 'payment_received', 'shipped', 'delivered', 'cancel_requested', 'cancel_approved', 'cancel_rejected', 'cancelled',
  'return_requested', 'return_approved', 'return_rejected', 'return_received', 'return_refunded', 'return_cancelled', 'refunded',
]);

function timelineTitle(kind: order_event_kind, e: OrderEvent): string {
  switch (kind) {
    case 'placed':
      return e.toStatus === 'to_pay' ? 'Đã đặt hàng, chờ thanh toán' : 'Đã đặt hàng';
    case 'payment_received':
      return 'Đã nhận thanh toán';
    case 'shipped':
      return 'Đang vận chuyển';
    case 'delivered':
      return 'Giao hàng thành công';
    case 'cancel_requested':
      return 'Đã gửi yêu cầu huỷ';
    case 'cancel_rejected':
      return 'Yêu cầu huỷ chưa được chấp nhận';
    // Slice 9: nhánh `default` là bẫy ("Đã huỷ đơn") nên mỗi loại trả hàng có `case` riêng.
    case 'return_requested':
      return 'Đã gửi yêu cầu trả hàng';
    case 'return_approved':
      return 'Yêu cầu trả hàng đã được duyệt';
    case 'return_rejected':
      return 'Yêu cầu trả hàng không được chấp nhận';
    case 'return_received':
      return 'Đã nhận hàng trả về';
    case 'return_refunded':
      return 'Đã hoàn tiền';
    case 'return_cancelled':
      return 'Đã huỷ yêu cầu trả hàng';
    case 'refunded':
      return 'Đã hoàn tiền';
    default:
      return 'Đã huỷ đơn';
  }
}

/** Khách huỷ được không: `to_pay` huỷ ngay; `to_ship` chưa từng gửi yêu cầu: 'request' hoặc 'direct' theo cờ (BR-ADM-33). */
export function customerCancelMode(o: Pick<Order, 'status' | 'cancelRequestedAt'>): 'cancel' | 'request' | null {
  if (o.status === 'to_pay') return 'cancel';
  if (o.status === 'to_ship' && o.cancelRequestedAt === null) return ASSUMPTIONS.toShipCancelMode === 'request' ? 'request' : 'cancel';
  return null;
}

export function toOrderDto(o: OrderRow): OrderDto {
  const items = [...o.items].sort((a, b) => a.lineNo - b.lineNo);
  const events = [...o.events]
    .map((e) => ({ e, kind: kindOf(e) }))
    .filter((x) => CUSTOMER_KINDS.has(x.kind))
    .sort((a, b) => a.e.at.getTime() - b.e.at.getTime());
  const dto: OrderDto = {
    id: o.code,
    placedAt: o.createdAt.toISOString(),
    status: o.status,
    paymentStatus: o.paymentStatus,
    paymentMethod: o.paymentMethod === 'bank_transfer' ? 'bank-transfer' : 'cod',
    items: items.map((i) => ({
      variantId: i.variantId,
      productId: i.productId ?? null,
      canReview: false,
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
    canCancel: false,
    canConfirmReceived: o.status === 'to_receive',
    canReturn: false,
    timeline: events.map(({ e, kind }) => ({
      at: e.at.toISOString(),
      title: timelineTitle(kind, e),
      ...(e.detail ? { detail: e.detail } : {}),
      actor: e.actor === 'customer' ? ('customer' as const) : ('nine2fine' as const),
    })),
  };
  if (o.status === 'to_pay' && o.paymentDueAt) dto.paymentDueAt = o.paymentDueAt.toISOString();
  if (o.paidAt) dto.paidAt = o.paidAt.toISOString();
  if (o.note) dto.note = o.note;
  if (o.invoiceCompany && o.invoiceTaxCode && o.invoiceAddress && o.invoiceEmail) {
    dto.invoice = { companyName: o.invoiceCompany, taxCode: o.invoiceTaxCode, address: o.invoiceAddress, email: o.invoiceEmail };
  }
  const mode = customerCancelMode(o);
  if (mode) {
    dto.canCancel = true;
    dto.cancelMode = mode;
  }
  if (o.cancelRequestedAt) {
    const outcome = o.status === 'cancel_requested' ? 'pending' : o.cancelRequestOutcome === 'rejected' ? 'rejected' : 'approved';
    dto.cancelRequest = {
      requestedAt: o.cancelRequestedAt.toISOString(),
      outcome,
      ...(outcome === 'rejected' && o.cancelRequestRejectReason ? { rejectReason: o.cancelRequestRejectReason } : {}),
    };
  }
  if (o.carrier && o.trackingNumber && o.handedOverAt) {
    dto.shipment = { carrier: o.carrier, trackingNumber: o.trackingNumber, handedOverAt: o.handedOverAt.toISOString() };
  }
  if (o.status === 'completed' && o.deliveredAt) {
    dto.deliveredAt = o.deliveredAt.toISOString();
    dto.returnDeadline = returnDeadline(o.deliveredAt).toISOString();
  }
  // Phần thuần (đơn đủ điều kiện + còn hạn); `withReturn` hạ xuống false khi đơn đã có yêu cầu sống.
  dto.canReturn = checkEligibility({ status: o.status, paymentStatus: o.paymentStatus, deliveredAt: o.deliveredAt }, clockNow()) === 'ok';
  if (o.cancelledBy) dto.cancelledBy = o.cancelledBy;
  if (o.cancelledAt) dto.cancelledAt = o.cancelledAt.toISOString();
  if (o.cancelReason) dto.cancelReason = o.cancelReason;
  if (o.paymentMethod === 'cod' && o.status === 'to_ship') dto.willCallToConfirm = o.needsConfirmCall;
  return dto;
}

export const ORDER_INCLUDE = { items: true, events: true } as const;
