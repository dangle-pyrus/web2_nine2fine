/** Order domain shared by account history, checkout receipts and guest tracking. */
export type OrderStatus =
  | 'pending-payment'
  /** COD order waiting for the shop to call and confirm it before packing. */
  | 'pending-confirmation'
  | 'processing'
  | 'shipping'
  | 'delivering'
  /** The carrier could not deliver; the shop retries or has it sent back. */
  | 'delivery-failed'
  /** Undelivered parcel back in the shop's warehouse. */
  | 'returned-to-sender'
  | 'completed'
  | 'cancelled'
  /** Shopper asked to cancel a `to_ship` order; the shop decides (Slice 4). */
  | 'cancel-requested'
  /** The shopper asked to return items; nine2fine is collecting and inspecting them. */
  | 'return-requested'
  | 'returned';

export type PaymentMethod = 'cod' | 'bank-transfer' | 'card';

export interface OrderItem {
  productSlug: string;
  name: string;
  color: string;
  size: string;
  quantity: number;
  unitPrice: number;
  compareAtPrice?: number;
  mediaId: string;
  /** API orders: lets "Mua lại" put the exact variant back in the cart. */
  variantId?: string;
  /** Voucher discount already shared out to this line (API orders). */
  lineDiscount?: number;
}

export interface OrderPricing {
  subtotal: number;
  discount: number;
  shippingFee: number;
  shippingDiscount: number;
  total: number;
}

export interface OrderDelivery {
  carrier: string;
  trackingCode: string;
  /** ISO datetime. */
  estimatedAt: string;
  deliveredAt?: string;
}

export interface OrderRefund {
  amount: number;
  destination: string;
  reason: string;
  /** ISO date the refund is expected to arrive. */
  expectedBy: string;
  /** ISO datetime the money was returned; absent while the refund is still processing. */
  refundedAt?: string;
  items?: number;
}

/** Company details for a VAT invoice; absent when the invoice is issued to the buyer. */
export interface OrderInvoice {
  companyName: string;
  taxCode: string;
  address: string;
  email: string;
}

export type ReturnReason =
  'wrong-size' | 'wrong-color' | 'wrong-item' | 'defective' | 'not-fit' | 'changed-mind';

export interface ReturnLine {
  /** Index of the line in `Order.items`. */
  index: number;
  quantity: number;
}

/** Bank account a COD refund is sent to. */
export interface RefundAccount {
  bank: string;
  accountNumber: string;
  accountName: string;
}

export interface ReturnRequest {
  /** ISO datetime. */
  requestedAt: string;
  lines: ReturnLine[];
  reason: ReturnReason;
  detail: string;
  /** Kept for older requests; equals `photos.length` once photos are uploaded. */
  photoCount: number;
  /** Uploaded photos (time-limited URLs from the backend). Missing on older requests. */
  photos?: ReturnPhoto[];
  /** Null when the refund goes back to the account that paid (bank transfer). */
  refundAccount: RefundAccount | null;
  /** Estimated refund after allocated discounts and any return shipping fee. */
  amount: number;
  returnShippingFee: number;
  /** The shop's decision; a rejected request keeps the order `completed` (one request per order). */
  decision?: ReturnDecision;
}

/** A photo the shopper attached to a return request (`POST /api/uploads/return-photos`). */
export interface ReturnPhoto {
  id: string;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
}

export interface ReturnDecision {
  status: 'approved' | 'rejected';
  /** ISO datetime. */
  decidedAt: string;
  /** Shown to the shopper when the request is rejected. */
  note: string;
}

/** `ReturnRequest` of docs/api/openapi.yaml (Slice 9, `returnsMode: http`): server-computed, no full account number. */
export type ReturnState =
  'requested' | 'approved' | 'received' | 'refunded' | 'rejected' | 'cancelled';

export interface ReturnAmount {
  goodsAmount: number;
  shippingRefund: number;
  returnShippingFee: number;
  amount: number;
  /** false = estimate from the quantities the shopper picked; true = settled after inspection. */
  final: boolean;
}

export interface ReturnCaseLine {
  variantId: string;
  name: string;
  color: string;
  size: string;
  sku: string;
  mediaId: string;
  quantity: number;
  acceptedQuantity?: number;
  goodsAmount: number;
}

/** Photo of a request; `url` is a permission-checked same-origin path that needs the session cookie. */
export interface ReturnCasePhoto {
  id: string;
  url: string;
  width: number;
  height: number;
  size: number;
  contentType: string;
}

export interface ReturnCase {
  id: string;
  state: ReturnState;
  reason: ReturnReason;
  fault: 'shop' | 'customer';
  detail: string;
  conditionAck: boolean;
  requestedAt: string;
  approvedAt?: string;
  receivedAt?: string;
  refundedAt?: string;
  rejectedAt?: string;
  cancelledAt?: string;
  lines: ReturnCaseLine[];
  photos: ReturnCasePhoto[];
  amount: ReturnAmount;
  refundedAmount?: number;
  /** `YYYY-MM-DD`. */
  expectedRefundBy?: string;
  approveNote?: string;
  rejectNote?: string;
  carrier?: string;
  trackingNumber?: string;
  instructions?: string;
  refundTo: { type: 'account' | 'original'; bank?: string; last4?: string; accountName?: string };
  canCancel: boolean;
}

/** Who cancelled an order: the shopper, the shop (e.g. out of stock) or the system (payment expired). */
export type CancelledBy = 'customer' | 'shop' | 'system';

/** One dated entry in the order history (status changes and carrier scans), newest last. */
export interface OrderEvent {
  /** ISO datetime. */
  at: string;
  title: string;
  detail?: string;
  /** API orders (Slice 4): who acted; staff and system both read as `nine2fine`. */
  actor?: 'customer' | 'nine2fine';
}

/** `cancelMode` of the API: cancel now (`to_pay`) or send a request the shop reviews (`to_ship`). */
export type CancelMode = 'cancel' | 'request';

/** The shopper's cancel request (Slice 4). One per order: after a rejection the hotline is the way. */
export interface OrderCancelRequest {
  /** ISO datetime. */
  requestedAt: string;
  outcome: 'pending' | 'approved' | 'rejected';
  /** Shown to the shopper when the outcome is `rejected`. */
  rejectReason?: string;
}

export interface Order {
  id: string;
  /** ISO datetime. */
  placedAt: string;
  status: OrderStatus;
  /** ISO datetime; only for pending payment. */
  paymentDueAt?: string;
  /** ISO datetime the transfer was reconciled (bank transfer only). */
  paidAt?: string;
  items: OrderItem[];
  pricing: OrderPricing;
  shippingAddress: {
    recipient: string;
    phone: string;
    street: string;
    ward: string;
    province: string;
  };
  payment: { method: PaymentMethod; label: string; paid: boolean };
  delivery?: OrderDelivery;
  refund?: OrderRefund;
  /** Set when status is `cancelled`. */
  cancelledBy?: CancelledBy;
  /** ISO datetime; set when status is `cancelled`. */
  cancelledAt?: string;
  /** Delivery note written by the shopper at checkout. */
  note?: string;
  /** Voucher code applied at checkout, when any. */
  voucherCode?: string;
  invoice?: OrderInvoice;
  returnRequest?: ReturnRequest;
  /** API orders (Slice 9): the server says whether the shopper may send a return request now. */
  canReturn?: boolean;
  /** API orders: ISO datetime the return window closes (23:59:59 VN of day 30). */
  returnDeadline?: string;
  /** API orders: the latest return request. */
  returnCase?: ReturnCase;
  /** API orders: payment status `partially_refunded` / `refunded` after a refund. */
  refundStatus?: 'partial' | 'full';
  /**
   * Return window in days, fixed when the order is delivered; missing on older
   * orders, which use today's policy.
   */
  returnDays?: number;
  /** Status and carrier events from the backend; the UI derives a basic history when absent. */
  timeline?: OrderEvent[];
  /** Replaces the standard status label (e.g. a cancellation awaiting the shop). */
  statusNote?: string;
  /** API orders: the server says whether the shopper may cancel now. */
  canCancel?: boolean;
  /** API orders: what the cancel button does (`request` = "Gửi yêu cầu huỷ"); absent when `canCancel` is false. */
  cancelMode?: CancelMode;
  /** API orders: the shopper's cancel request, pending or rejected. */
  cancelRequest?: OrderCancelRequest;
  /** COD order the shop will call to confirm (API orders). */
  willCallToConfirm?: boolean;
  cancelReason?: string;
  /** `YYYY-MM-DD` dates (API orders). */
  estimatedDelivery?: { from: string; to: string };
  /** Buyer email on the order (API orders; never put in a URL). */
  email?: string;
}
