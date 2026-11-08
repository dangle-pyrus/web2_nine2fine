/**
 * Admin orders contract (Slice 4, docs/api/openapi.yaml tag `admin-orders`, locked 2026-11-08).
 * Names and shapes are the contract's; the HTTP adapter and the mock both return exactly these.
 * Dates are ISO 8601, money is an integer number of VND.
 */

/** The six API order statuses (the earlier mock back office has eleven, see `order-desk-status.ts`). */
export type DeskOrderStatus =
  'to_pay' | 'to_ship' | 'to_receive' | 'completed' | 'cancel_requested' | 'cancelled';
export type DeskPaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'partially_refunded';
export type DeskPaymentMethod = 'cod' | 'bank-transfer';

export const DESK_BUCKETS = [
  'pending-payment',
  'to-confirm',
  'to-fulfil',
  'in-transit',
  'cancel-requests',
  'returning',
  'completed',
  'cancelled',
] as const;
export type DeskBucket = (typeof DESK_BUCKETS)[number];
export type DeskTab = 'all' | DeskBucket;
export type DeskOrderCounts = Record<DeskTab, number>;

export type DeskOverdueFlag = 'confirm-call' | 'cancel-request' | 'delivery';

export type DeskAction =
  | 'call-attempt'
  | 'confirm'
  | 'ship'
  | 'deliver'
  | 'cancel-unreachable'
  | 'cancel-declined-on-call'
  | 'cancel-customer-request'
  | 'cancel-refused'
  | 'cancel-undeliverable'
  | 'cancel-other'
  | 'restock'
  | 'write-off'
  | 'approve-cancel'
  | 'reject-cancel'
  | 'add-note'
  | 'print-slip';

export interface DeskStaffRef {
  name: string;
  role: 'staff' | 'admin';
}

export interface DeskActor {
  type: 'customer' | 'system' | 'staff';
  name?: string;
  role?: 'staff' | 'admin';
}

export type DeskEventKind =
  | 'placed'
  | 'payment_received'
  | 'call_attempt'
  | 'confirmed'
  | 'shipped'
  | 'delivered'
  | 'cancel_requested'
  | 'cancel_approved'
  | 'cancel_rejected'
  | 'cancelled'
  | 'stock_restocked'
  | 'stock_written_off'
  | 'note';

export interface DeskTimelineEntry {
  at: string;
  kind: DeskEventKind;
  fromStatus?: DeskOrderStatus | null;
  toStatus: DeskOrderStatus;
  paymentStatus: DeskPaymentStatus;
  actor: DeskActor;
  title: string;
  detail?: string;
  reasonCode?: string;
  /** Internal note, never in a shopper API. */
  note?: string;
}

export interface DeskOrderSummary {
  id: string;
  placedAt: string;
  status: DeskOrderStatus;
  paymentStatus: DeskPaymentStatus;
  paymentMethod: DeskPaymentMethod;
  recipientName: string;
  total: number;
  itemCount: number;
  needsCall: boolean;
  hasCancelRequest: boolean;
  tab: DeskBucket;
  overdue: DeskOverdueFlag[];
}

export interface DeskOrderPage {
  items: DeskOrderSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface DeskOrderLine {
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
}

export interface DeskPricing {
  subtotal: number;
  discount: number;
  shippingFee: number;
  shippingDiscount: number;
  total: number;
}

export type DeskCancelReasonCode =
  'unreachable' | 'declined_on_call' | 'customer_request' | 'refused' | 'undeliverable' | 'other';

export interface DeskOrder {
  id: string;
  placedAt: string;
  status: DeskOrderStatus;
  paymentStatus: DeskPaymentStatus;
  paymentMethod: DeskPaymentMethod;
  paymentDueAt?: string;
  paidAt?: string;
  deliveredAt?: string;
  items: DeskOrderLine[];
  pricing: DeskPricing;
  vouchers: { code: string; kind: 'discount' | 'free-shipping'; amount: number }[];
  recipient: { name: string; phone: string; email: string };
  shippingAddress: { street: string; ward: string; province: string };
  note?: string;
  invoice?: { companyName: string; taxCode: string; address: string; email: string };
  estimatedDelivery: { from: string; to: string };
  tab: DeskBucket;
  needsCall: boolean;
  confirmation?: { confirmedAt: string; confirmedBy: DeskStaffRef };
  callAttempts: { total: number; inFirstDay: number; firstAt?: string; lastAt?: string };
  shipment?: {
    carrier: string;
    trackingNumber: string;
    handedOverAt: string;
    handedOverBy: DeskStaffRef;
  };
  cancellation?: {
    by: 'customer' | 'shop' | 'system';
    at: string;
    reasonCode?: DeskCancelReasonCode;
    reason?: string;
    note?: string;
  };
  cancelRequest?: {
    requestedAt: string;
    reason?: string;
    outcome: 'pending' | 'approved' | 'rejected';
    decidedAt?: string;
    decidedBy?: DeskStaffRef;
    rejectReason?: string;
  };
  returnHandling?: {
    state: 'pending' | 'restocked' | 'written_off';
    decidedAt?: string;
    decidedBy?: DeskStaffRef;
    note?: string;
  };
  stockRestoredAt?: string;
  deliveryRefusedAt?: string;
  overdue: DeskOverdueFlag[];
  allowedActions: DeskAction[];
  /** Newest first. */
  timeline: DeskTimelineEntry[];
}

/** Query of the list and (without `view`, `page`, `limit`) of the counts. */
export interface DeskOrderFilter {
  q: string;
  payment: DeskPaymentMethod | '';
  /** Inclusive YYYY-MM-DD in GMT+7; empty = open. */
  from: string;
  to: string;
}

export interface DeskOrderQuery extends DeskOrderFilter {
  view: DeskTab;
  page: number;
  limit: number;
}

export const DESK_MAX_SEARCH = 100;
export const DESK_DEFAULT_LIMIT = 20;
export const DESK_LIMITS = [20, 50] as const;
