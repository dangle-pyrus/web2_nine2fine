/**
 * Admin API contract (document/admin/ADMIN_API_CONTRACT.md). Mock and HTTP implementations return
 * exactly these shapes, so switching `apiConfig.mode` to 'http' needs no UI change.
 * Dates are ISO 8601 strings in UTC; money is an integer number of VND.
 */
import type {
  Order,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  ReturnReason,
} from '../../features/orders/order-models';
import type { SizeChart } from '../../features/catalog/models/product';
import type { LandingContent } from '../../features/home/landing-content';

export type { LandingBlock } from '../../features/home/landing-content';
export type { LandingContent, SizeChart };

export type { OrderStatus, PaymentMethod, ReturnReason };

// ---------- Common ----------

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type SortDir = 'asc' | 'desc';

export interface PageQuery {
  page: number;
  pageSize: number;
  search: string;
  sort: string;
  dir: SortDir;
}

/** Error codes the backend returns in `{ code, message }` bodies. */
export type AdminErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'invalid-transition'
  | 'validation'
  | 'unavailable';

export class AdminApiError extends Error {
  constructor(
    readonly code: AdminErrorCode,
    message: string,
    /** Field → message for `validation` errors. */
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

// ---------- Auth & staff ----------

export type StaffRole = 'admin' | 'staff';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
}

export interface StaffMember extends AdminUser {
  status: 'active' | 'disabled';
  createdAt: string;
  lastActiveAt?: string;
}

export interface StaffInput {
  name: string;
  email: string;
  role: StaffRole;
}

// ---------- Dashboard ----------

/** KPI period: today (vs. the same weekday last week) or the last 7/30 days (vs. the 7/30 before). */
export type DashboardRange = 'today' | '7d' | '30d';

export interface DashboardSummary {
  generatedAt: string;
  range: DashboardRange;
  /** Totals for `range`, compared with the period before it. */
  kpis: {
    revenue: KpiValue;
    orders: KpiValue;
    averageOrderValue: KpiValue;
    /** Ratio of orders returned or cancelled after shipping in the last 7 days. */
    returnRate: KpiValue;
  };
  todo: {
    /** COD orders waiting for a confirmation call. */
    toConfirm: number;
    pendingPayment: number;
    toFulfil: number;
    inTransit: number;
    /** In transit and past the estimated delivery date. */
    lateDelivery: number;
    /** The carrier could not deliver; needs a retry or a return to sender. */
    deliveryFailed: number;
    returnRequests: number;
    lowStock: number;
  };
  /** Last 30 days, oldest first. `previous` is the same day 30 days earlier. */
  revenueSeries: { date: string; revenue: number; previous: number }[];
  topProducts: {
    productId: string;
    name: string;
    image: string;
    units: number;
    revenue: number;
  }[];
}

export interface KpiValue {
  value: number;
  /** Change vs. the comparison period as a ratio (0.12 = +12%); null when there is no baseline. */
  change: number | null;
}

// ---------- Orders ----------

export type PaymentState = 'paid' | 'unpaid' | 'cod' | 'refunded' | 'void';

export interface OrderCustomerRef {
  /** Null for guest checkout. */
  id: string | null;
  name: string;
  email: string;
  phone: string;
  /** Orders placed by this customer, this one included. */
  orderCount: number;
  /** Returns accepted for this customer before. */
  returnCount: number;
}

export interface AdminOrderSummary {
  id: string;
  placedAt: string;
  status: OrderStatus;
  paymentState: PaymentState;
  paymentMethod: PaymentMethod;
  customerName: string;
  total: number;
  itemCount: number;
  /** Set when a return request waits for a decision. */
  returnPending: boolean;
}

export type OrderEventKind = 'system' | 'comment';

export interface AdminOrderEvent {
  id: string;
  at: string;
  kind: OrderEventKind;
  title: string;
  detail?: string;
  /** Staff name for comments and staff actions; absent for automatic events. */
  author?: string;
}

export interface AdminOrderItem extends OrderItem {
  productId: string;
  variantId: string;
  sku: string;
  /** Absolute or root-relative image URL. */
  image: string;
}

export interface AdminOrder extends Omit<Order, 'timeline' | 'items'> {
  items: AdminOrderItem[];
  paymentState: PaymentState;
  customer: OrderCustomerRef;
  /** Merged history: system events and internal staff comments, newest first. */
  events: AdminOrderEvent[];
  /** Internal tags, never shown to the shopper. */
  tags: string[];
  /** Last failed delivery attempt reported by the carrier or staff. */
  deliveryFailure?: { at: string; reason: string; attempts: number };
}

export type ShippingAddress = AdminOrder['shippingAddress'];

export type OrderView =
  | 'all'
  | 'to-confirm'
  | 'pending-payment'
  | 'to-fulfil'
  | 'in-transit'
  | 'late'
  | 'failed'
  | 'completed'
  | 'cancelled'
  | 'returns';

export interface OrderQuery extends PageQuery {
  view: OrderView;
  payment: PaymentMethod | '';
  /** Inclusive YYYY-MM-DD bounds in GMT+7; empty = open. */
  from: string;
  to: string;
}

export interface ShipInput {
  carrier: string;
  trackingCode: string;
  /** ISO datetime promised to the shopper. */
  estimatedAt: string;
}

export interface DeliveryFailureInput {
  /** Why the carrier could not deliver, e.g. "Khách không nghe máy". */
  reason: string;
}

export interface ReturnToSenderInput {
  /** Put the parcel back into sellable stock (otherwise it goes to the defect pile). */
  restock: boolean;
}

/** Swap one order line to another variant (size/colour) of the same product before shipping. */
export interface ChangeItemInput {
  index: number;
  variantId: string;
}

export interface CancelInput {
  reason: string;
  /** Refund a paid order to the original payment method. */
  refund: boolean;
}

export interface ReturnDecisionInput {
  decision: 'approved' | 'rejected';
  /** Shown to the shopper; required when rejecting. */
  note: string;
}

export interface ReturnCompletionInput {
  refundAmount: number;
  /** Put the returned units back into sellable stock (otherwise they go to the defect pile). */
  restock: boolean;
}

// ---------- Returns ----------

export interface ReturnSummary {
  orderId: string;
  requestedAt: string;
  customerName: string;
  reason: ReturnReason;
  itemCount: number;
  amount: number;
  state: 'pending' | 'approved' | 'rejected' | 'completed';
}

export interface ReturnQuery extends PageQuery {
  state: ReturnSummary['state'] | '';
}

// ---------- Products ----------

export type ProductStatus = 'active' | 'draft' | 'hidden';

export interface ProductImage {
  id: string;
  url: string;
  alt: string;
  /** Colour this photo shows; empty = all colours. */
  color: string;
}

export interface ProductOption {
  name: 'Màu' | 'Size';
  values: string[];
}

export interface AdminVariant {
  id: string;
  sku: string;
  color: { name: string; hex: string };
  size: string;
  /** Null = product price. */
  price: number | null;
  inventory: number;
}

export interface AdminProduct {
  id: string;
  slug: string;
  name: string;
  /** Product type line, e.g. "Áo blazer · Dáng suông". */
  type: string;
  description: string;
  status: ProductStatus;
  category: string;
  genders: string[];
  moments: string[];
  tags: string[];
  price: number;
  compareAtPrice: number | null;
  /** Cost per item; only roles with `products.cost` see it. */
  cost: number | null;
  material: string;
  care: string[];
  fitSummary: string;
  images: ProductImage[];
  colors: { name: string; hex: string }[];
  sizes: string[];
  variants: AdminVariant[];
  seoTitle: string;
  seoDescription: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminProductSummary {
  id: string;
  name: string;
  image: string;
  status: ProductStatus;
  category: string;
  price: number;
  compareAtPrice: number | null;
  inventory: number;
  variantCount: number;
  updatedAt: string;
}

export type ProductInput = Omit<AdminProduct, 'id' | 'createdAt' | 'updatedAt'>;

export type ProductView = 'all' | 'active' | 'draft' | 'hidden' | 'out-of-stock';

export interface ProductQuery extends PageQuery {
  view: ProductView;
  category: string;
}

// ---------- Inventory ----------

export interface InventoryItem {
  variantId: string;
  productId: string;
  productName: string;
  image: string;
  color: { name: string; hex: string };
  size: string;
  sku: string;
  onHand: number;
  /** Units held by orders not yet shipped. */
  reserved: number;
  available: number;
  lowStockThreshold: number;
  /** True when this SKU has its own threshold instead of the shop default. */
  thresholdCustom: boolean;
  category: string;
  status: StockStatus;
}

/** Còn hàng / Sắp hết (available at or under the threshold) / Hết hàng (nothing to sell). */
export type StockStatus = 'in' | 'low' | 'out';

export type InventoryView = 'all' | StockStatus;

export interface InventoryQuery extends PageQuery {
  view: InventoryView;
  category: string;
  color: string;
  size: string;
}

/** Filter options and tab counts for the inventory list, plus the shop-wide threshold. */
export interface InventoryFacets {
  categories: { value: string; label: string }[];
  colors: { name: string; hex: string }[];
  sizes: string[];
  counts: Record<InventoryView, number>;
  defaultThreshold: number;
  customCount: number;
}

export type AdjustmentReason = 'count' | 'received' | 'damaged' | 'return' | 'correction';

export interface InventoryAdjustment {
  mode: 'delta' | 'set';
  quantity: number;
  reason: AdjustmentReason;
  note: string;
}

export interface InventoryMovement {
  id: string;
  at: string;
  change: number;
  after: number;
  reason: AdjustmentReason | 'order' | 'cancel';
  note: string;
  author: string;
}

// ---------- Customers ----------

export type CustomerTier = 'member' | 'silver' | 'gold';

export interface AdminCustomerSummary {
  id: string;
  name: string;
  email: string;
  phone: string;
  tier: CustomerTier;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
  status: 'active' | 'blocked';
}

export interface AdminCustomer extends AdminCustomerSummary {
  createdAt: string;
  birthDate: string | null;
  marketingOptIn: boolean;
  tags: string[];
  note: string;
  returnCount: number;
  averageOrderValue: number;
  /** Most bought sizes, most frequent first. */
  usualSizes: string[];
  addresses: {
    recipient: string;
    phone: string;
    line: string;
    isDefault: boolean;
  }[];
  recentOrders: AdminOrderSummary[];
}

export interface CustomerQuery extends PageQuery {
  tier: CustomerTier | '';
  status: 'active' | 'blocked' | '';
}

export interface CustomerUpdate {
  tags?: string[];
  note?: string;
  status?: 'active' | 'blocked';
}

// ---------- Promotions ----------

export type PromotionType = 'percent' | 'fixed' | 'free-shipping';
export type PromotionState = 'running' | 'scheduled' | 'expired' | 'disabled';

/**
 * everyone: any shopper, guests included. tiers: signed-in members of the chosen tiers.
 * customers: only the listed accounts. private: shown to no one; staff hand the code out
 * themselves (influencers, apologies) and whoever has it can use it.
 */
export type PromotionAudience = 'everyone' | 'tiers' | 'customers' | 'private';

export interface Promotion {
  id: string;
  code: string;
  title: string;
  type: PromotionType;
  /** Percent (1–100) or VND, unused for free shipping. */
  value: number;
  /** Cap for percent discounts; null = no cap. */
  maxDiscount: number | null;
  minSubtotal: number;
  /** Empty = whole catalogue. */
  categories: string[];
  usageLimit: number | null;
  perCustomerLimit: number;
  /** Who can use the code; see PromotionAudience. */
  audience: PromotionAudience;
  /** Tiers that can use it when audience is 'tiers'. */
  tiers: CustomerTier[];
  /** Customers that can use it when audience is 'customers'. */
  customerIds: string[];
  used: number;
  startsAt: string;
  endsAt: string | null;
  enabled: boolean;
  createdAt: string;
}

export type PromotionInput = Omit<Promotion, 'id' | 'used' | 'createdAt'>;

export interface PromotionQuery extends PageQuery {
  state: PromotionState | '';
}

// ---------- Settings & audit ----------

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: {
    type: 'order' | 'product' | 'customer' | 'promotion' | 'staff' | 'settings' | 'inventory';
    id: string;
    label: string;
  };
  before?: string;
  after?: string;
}

export interface AuditQuery extends PageQuery {
  targetType: AuditEntry['target']['type'] | '';
}

// ---------- Global search ----------

export interface SearchResults {
  orders: {
    id: string;
    customerName: string;
    total: number;
    status: OrderStatus;
  }[];
  products: { id: string; name: string; image: string; sku?: string }[];
  customers: { id: string; name: string; email: string; phone: string }[];
}

export const DEFAULT_PAGE_SIZE = 50;
export const PAGE_SIZES = [20, 50, 100] as const;

// ---------- Storefront content (Đợt 3, frontend-only: runs on the mock data) ----------

export type ReviewStatus = 'published' | 'hidden';

export interface AdminReview {
  id: string;
  /** Admin product id (`p01`). */
  productId: string;
  productName: string;
  productImage: string;
  author: string;
  rating: number;
  /** -1 = runs small, 0 = true to size, 1 = runs large. */
  fit: -1 | 0 | 1;
  sizeBought: string;
  title: string;
  body: string;
  /** ISO date. */
  date: string;
  verified: boolean;
  /** Demo fixture shipped with the storefront mock. */
  sample: boolean;
  status: ReviewStatus;
  reply?: { body: string; at: string; author: string };
}

export type ReviewView = 'all' | 'unanswered' | 'low' | 'hidden';

export interface ReviewQuery extends PageQuery {
  view: ReviewView;
  /** 0 = any rating. */
  rating: number;
}

export interface ReviewStats {
  total: number;
  average: number;
  unanswered: number;
  low: number;
  hidden: number;
}

export type CollectionStatus = 'active' | 'draft';

export interface AdminCollection {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: CollectionStatus;
  productIds: string[];
  updatedAt: string;
}

export type CollectionInput = Omit<AdminCollection, 'id' | 'updatedAt'>;

export interface AdminSizeChart {
  /** Product category the chart applies to (the storefront shows charts per category). */
  category: string;
  label: string;
  chart: SizeChart;
  productCount: number;
  /** Edited in the admin; false = the built-in chart. */
  customised: boolean;
}

export type ReportRange = '7d' | '30d' | '90d' | '365d';

/** A figure for the chosen period and the same-length period before it (null = no data then). */
export interface ReportFigure {
  value: number;
  previous: number | null;
}

export type AbcClass = 'A' | 'B' | 'C';

/**
 * Báo cáo kinh doanh: everything is computed over orders that were confirmed and not cancelled,
 * at the prices actually paid. "Doanh thu thuần" = paid totals minus shipping and refunds.
 */
export interface SalesReport {
  range: ReportRange;
  /** ISO bounds of the period and of the comparison period. */
  from: string;
  to: string;
  previousFrom: string;
  kpis: {
    netRevenue: ReportFigure;
    grossProfit: ReportFigure;
    /** 0..1 */
    grossMargin: ReportFigure;
    orders: ReportFigure;
    averageOrder: ReportFigure;
    unitsPerOrder: ReportFigure;
    /** Share of revenue given away as discounts, 0..1. */
    discountRate: ReportFigure;
    /** Refunded value over revenue, 0..1. */
    refundRate: ReportFigure;
    /** Cancelled orders over all orders placed, 0..1. */
    cancelRate: ReportFigure;
    customers: ReportFigure;
  };
  trend: {
    bucket: 'day' | 'week' | 'month';
    points: { label: string; revenue: number; previous: number; orders: number; profit: number }[];
  };
  categories: {
    category: string;
    label: string;
    revenue: number;
    units: number;
    profit: number;
    /** Share of revenue, 0..1. */
    share: number;
  }[];
  products: {
    productId: string;
    name: string;
    image: string;
    category: string;
    units: number;
    revenue: number;
    profit: number;
    /** 0..1 */
    margin: number;
    /** Units returned over units sold, 0..1. */
    returnRate: number;
    onHand: number;
    /** Days the current stock lasts at this period's pace; null = nothing sold. */
    daysOfCover: number | null;
    /** Sold over sold + still on hand, 0..1. */
    sellThrough: number;
    /** A = the products making the first 80% of revenue, B the next 15%, C the rest. */
    abc: AbcClass;
  }[];
  bySize: { size: string; units: number; revenue: number; returned: number }[];
  byColor: { color: string; hex: string; units: number; revenue: number }[];
  customers: {
    newCustomers: number;
    returningCustomers: number;
    newRevenue: number;
    returningRevenue: number;
    guestOrders: number;
    guestRevenue: number;
    /** Customers with 2+ orders ever over customers who ordered in the period, 0..1. */
    repeatRate: number;
    /** Average lifetime spend of customers who ordered in the period. */
    lifetimeValue: number;
    byTier: {
      tier: CustomerTier;
      label: string;
      customers: number;
      orders: number;
      revenue: number;
      averageOrder: number;
    }[];
    top: {
      id: string;
      name: string;
      tier: CustomerTier;
      orders: number;
      revenue: number;
      lastOrderAt: string;
    }[];
  };
  regions: { province: string; orders: number; revenue: number; share: number }[];
  /** Orders per weekday (0 = Monday) and 4-hour block (0 = 00:00–04:00), GMT+7. */
  heatmap: number[][];
  payments: {
    method: string;
    label: string;
    orders: number;
    revenue: number;
    share: number;
    /** Orders that failed delivery or were sent back, over shipped orders, 0..1. */
    failureRate: number;
  }[];
  operations: {
    /** Hours from order to hand-over to the carrier, median. */
    hoursToShip: number | null;
    /** Share of shipped orders handed over within 24 hours, 0..1. */
    shippedWithinDay: number;
    deliveryFailures: number;
    returnedToSender: number;
    cancelled: number;
    cancelReasons: { reason: string; count: number }[];
  };
  returns: {
    orders: number;
    units: number;
    value: number;
    reasons: { reason: string; count: number }[];
  };
  returnsByProduct: {
    productId: string;
    name: string;
    sold: number;
    returned: number;
    reasons: { reason: string; count: number }[];
  }[];
  inventory: {
    units: number;
    /** At cost. */
    value: number;
    /** At selling price. */
    retailValue: number;
    outOfStockSkus: number;
    /** Best sellers of the period with at least one size out of stock. */
    stockoutRisks: {
      productId: string;
      name: string;
      variant: string;
      sku: string;
      available: number;
      unitsSold: number;
    }[];
  };
  agingStock: {
    variantId: string;
    productId: string;
    sku: string;
    name: string;
    variant: string;
    onHand: number;
    /** Null = never sold in the data the shop has. */
    lastSoldAt: string | null;
    stockValue: number;
  }[];
  promotions: {
    code: string;
    title: string;
    orders: number;
    discount: number;
    revenue: number;
    averageOrder: number;
    /** Discount over revenue for this code, 0..1. */
    cost: number;
  }[];
  /** Average order with and without a code, to judge whether codes lift basket size. */
  promotionLift: { withCode: number; withoutCode: number; ordersWithCode: number };
}
