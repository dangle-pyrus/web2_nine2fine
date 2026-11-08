import { CommercePolicy } from '../../core/commerce-policy';
import { OrderPricing } from '../orders/order-models';

/** Quote / voucher models of docs/api/openapi.yaml (Slice 3). Names follow the contract. */

export type Availability = 'available' | 'low-stock' | 'out-of-stock' | 'discontinued';

/** One cart line refreshed from the database (`RefreshedLine`). */
export interface RefreshedLine {
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  mediaId: string;
  color: string;
  size: string;
  unitPrice: number;
  compareAtPrice?: number;
  requestedQuantity: number;
  maxQuantity: number;
  effectiveQuantity: number;
  availability: Availability;
  inventory: number;
  limitedBy?: 'stock' | 'per-variant-limit';
}

export type VoucherKind = 'discount' | 'free-shipping';

export interface VoucherApplied {
  applied: true;
  code: string;
  kind: VoucherKind;
  label: string;
  /** Goods discount; 0 for free-shipping (that one is `pricing.shippingDiscount`). */
  amount: number;
}

export type VoucherReason =
  | 'not-found'
  | 'not-started'
  | 'expired'
  | 'exhausted'
  | 'login-required'
  | 'per-user-limit'
  | 'first-order-only'
  | 'category-mismatch'
  | 'excluded-sale-items'
  | 'min-spend'
  | 'shipping-already-free';

export interface VoucherRejection {
  applied: false;
  code: string;
  reason: VoucherReason;
  startsAt?: string;
  missingAmount?: number;
  minSubtotal?: number;
  categoryName?: string;
}

export type PaymentMethodId = 'cod' | 'bank-transfer';

export interface PaymentOption {
  method: PaymentMethodId;
  available: boolean;
  reason?: 'over-limit' | 'too-many-refusals' | 'too-many-open-orders' | 'not-enabled';
}

export interface CheckoutQuote {
  lines: RefreshedLine[];
  lineDiscounts?: { variantId: string; amount: number }[];
  pricing: OrderPricing;
  vouchers: VoucherApplied[];
  rejectedVouchers: VoucherRejection[];
  shipping: { fee: number; freeReason: 'threshold' | 'voucher' | null; addressRequired: boolean };
  /** `YYYY-MM-DD` dates. */
  estimatedDelivery: { from: string; to: string };
  paymentMethods: PaymentOption[];
  policy: CommercePolicy;
}

export interface VoucherCheckResult {
  result: VoucherApplied | VoucherRejection;
  quote: CheckoutQuote;
}
