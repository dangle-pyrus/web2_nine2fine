/** Order domain shared by account history, checkout receipts and guest tracking. */
export type OrderStatus =
  | 'pending-payment'
  | 'processing'
  | 'shipping'
  | 'delivering'
  | 'completed'
  | 'cancelled'
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
  photoCount: number;
  /** Null when the refund goes back to the account that paid (bank transfer). */
  refundAccount: RefundAccount | null;
  /** Estimated refund after allocated discounts and any return shipping fee. */
  amount: number;
  returnShippingFee: number;
}

/** Who cancelled an order: the shopper, the shop (e.g. out of stock) or the system (payment expired). */
export type CancelledBy = 'customer' | 'shop' | 'system';

/** One dated entry in the order history (status changes and carrier scans), newest last. */
export interface OrderEvent {
  /** ISO datetime. */
  at: string;
  title: string;
  detail?: string;
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
  invoice?: OrderInvoice;
  returnRequest?: ReturnRequest;
  /** Status and carrier events from the backend; the UI derives a basic history when absent. */
  timeline?: OrderEvent[];
}
