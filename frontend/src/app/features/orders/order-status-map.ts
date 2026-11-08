import { CancelledBy, Order, OrderStatus } from './order-models';

/**
 * Assumptions awaiting the owner's answers (docs/slice-3-cart-checkout/frontend-plan.md section 0).
 * Gathered here so a different answer changes one place.
 */
export const SLICE3_ASSUMPTIONS = {
  /** Q1: COMMON status names `to_pay`/`to_ship`/... and their mapping below. */
  statusNames: 'COMMON',
  /** Q2: with HTTP the QR/bank transfer stays hidden until `policy.bankTransferEnabled`. */
  qrNeedsPolicyFlag: true,
  /** Q3: provinces/wards come from the public API. */
  locationsFromApi: true,
  /** Q4 (answered with Slice 4, S4-Q1): at `to_ship` the shopper only sends a cancel request. */
  cancelAtToShip: false,
} as const;

export interface MappedStatus {
  status: OrderStatus;
  /** Shown instead of the standard label when set (e.g. a cancellation awaiting the shop). */
  note?: string;
  /** The status is not known to the app: callers may log it. */
  unknown?: boolean;
}

/** COMMON status -> FE `OrderStatus` (plan section 9). Pure; unknown values never break a page. */
export function mapOrderStatus(status: string): MappedStatus {
  switch (status) {
    case 'to_pay':
      return { status: 'pending-payment' };
    case 'to_ship':
      return { status: 'processing' };
    case 'to_receive':
      return { status: 'shipping' };
    case 'completed':
      return { status: 'completed' };
    case 'cancel_requested':
      return { status: 'cancel-requested' };
    case 'cancelled':
      return { status: 'cancelled' };
    default:
      return { status: 'processing', unknown: true };
  }
}

export function mapCancelledBy(value: string | undefined): CancelledBy | undefined {
  return value === 'customer' || value === 'shop' || value === 'system' ? value : undefined;
}

/** Whether the shopper may cancel: HTTP orders carry the server's answer. */
export function orderCanCancel(order: Order): boolean {
  return order.canCancel ?? false;
}
