/**
 * Admin Tổng quan, Báo cáo, Cài đặt cửa hàng and Nhật ký (Slice 8, docs/api/openapi.yaml tags
 * `admin-dashboard`, `admin-reports`, `admin-store-settings`, `admin-audit`, locked 2026-11-12).
 * Names and shapes are the contract's. Money is an integer number of VND, ratios are 0..1, instants
 * are ISO 8601 UTC and dates are `YYYY-MM-DD` in Vietnam time.
 */
import type { WireImageRef } from './catalog-media';

export type InsightsRange = 'today' | '7d' | '30d';

// ---------- Tổng quan v2 (docs/api/openapi.yaml, tag admin-dashboard) ----------

export interface DashboardKpi {
  value: number;
  /** Same figure for the compare period (yesterday / the 7 or 30 days right before). */
  previous: number;
  /** (value - previous) / previous; `null` when `previous` is 0. */
  change: number | null;
}

/** Work waiting now (not tied to the range). */
export interface DashboardTodo {
  toConfirm: number;
  pendingPayment: number;
  toFulfil: number;
  cancelRequests: number;
  lateDelivery: number;
  returnRequested: number;
  returnApproved: number;
  returnReceived: number;
  lowStock: number;
  outOfStock: number;
}

/** `revenue` / `orders` are `null` for an hour not reached yet or a day the compare month lacks. */
export interface DashboardPoint {
  key: string;
  label: string;
  revenue: number | null;
  orders: number | null;
}

export interface DashboardSeries {
  unit: 'hour' | 'day';
  /** This period; `previous[i]` is the compare bucket matched to `points[i]`. */
  points: DashboardPoint[];
  previous: DashboardPoint[];
}

export interface DashboardRecentOrder {
  id: string;
  code: string;
  createdAt: string;
  customerName: string;
  total: number;
  status: 'to_pay' | 'to_ship' | 'to_receive' | 'completed' | 'cancel_requested' | 'cancelled';
  paymentStatus: string;
  /** The API only sends `website`; marketplace rows are frontend demo data (marketplace-demo.ts). */
  channel: 'website' | 'shopee' | 'tiktok' | 'lazada';
}

export interface DashboardTopProduct {
  rank: number;
  /** Rank in the compare period, `null` = not ranked then ("Mới"). */
  previousRank: number | null;
  productId: string;
  name: string;
  image: WireImageRef | null;
  category: { slug: string; name: string };
  units: number;
  revenue: number;
  /** Share of the period's net revenue, 0..1. */
  share: number;
}

/**
 * Staff receive only `kpis.orders`, `todo` and `recentOrders` besides the periods: every money key
 * is absent (BR-DSH-07), so the screen copes with absence rather than zeros.
 */
export interface Dashboard {
  generatedAt: string;
  range: InsightsRange;
  period: { from: string; to: string };
  comparePeriod: { from: string; to: string };
  kpis: {
    orders: DashboardKpi;
    netRevenue?: DashboardKpi;
    averageOrderValue?: DashboardKpi;
    returnRate?: DashboardKpi;
  };
  todo: DashboardTodo;
  recentOrders: DashboardRecentOrder[];
  series?: DashboardSeries;
  topProducts?: DashboardTopProduct[];
}

// ---------- Report ----------

export type ReportSort = 'units' | 'revenue';

export interface ReportFigure {
  value: number;
  /** `null` when the previous period has no orders of that group. */
  previous: number | null;
}

export type ReportFigureKey =
  | 'revenue'
  | 'completedOrders'
  | 'units'
  | 'averageOrderValue'
  | 'discountTotal'
  | 'shippingCollected'
  | 'placedOrders'
  | 'cancelledOrders'
  | 'cancelRate';

/** Slice 9: revenue is net of refunds; these say how much came back. `returnRate` is Should. */
export type ReturnFigureKey = 'refundedAmount' | 'refundedUnits' | 'returnedOrders' | 'returnRate';

export interface ReportCategoryRef {
  slug: string;
  name: string;
}

export interface SalesReport {
  generatedAt: string;
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
  days: number;
  sort: ReportSort;
  kpis: Record<ReportFigureKey, ReportFigure> & Partial<Record<ReturnFigureKey, ReportFigure>>;
  byDay: { date: string; revenue: number; completedOrders: number; units: number }[];
  topProducts: {
    productId: string;
    name: string;
    image: WireImageRef | null;
    category: ReportCategoryRef;
    units: number;
    revenue: number;
  }[];
  topVariants: {
    variantId: string;
    productId: string;
    sku: string;
    productName: string;
    color: string;
    size: string;
    units: number;
    revenue: number;
  }[];
  byCategory: { category: ReportCategoryRef; revenue: number; units: number; share: number }[];
  byPayment: {
    method: 'cod' | 'bank-transfer';
    completedOrders: number;
    revenue: number;
    share: number;
  }[];
}

export interface SalesReportQuery {
  from: string;
  to: string;
  sort: ReportSort;
}

/** The CSV answer: the bytes and the file name the server chose (or the documented default). */
export interface ReportCsv {
  blob: Blob;
  filename: string;
}

// ---------- Store settings ----------

export interface StoreSocial {
  facebook: string;
  instagram: string;
  tiktok: string;
  youtube: string;
}

export interface StoreInfoSettings {
  legalName: string;
  registrationNumber: string;
  registrationIssuer: string;
  registrationDate: string | null;
  address: string;
  hotline: string;
  hotlineHref: string;
  email: string;
  privacyEmail: string;
  hours: string;
  notificationUrl: string;
  social: StoreSocial;
}

export interface StoreOperations {
  shippingFee: number;
  freeShippingThreshold: number;
  bankHoldMinutes: number;
  codMaxTotal: number;
  deliveryDaysMin: number;
  deliveryDaysMax: number;
  cutoffHour: number;
}

export interface StoreCart {
  maxPerVariant: number;
  maxItemsPerOrder: number;
  maxCartLines: number;
  cartRetentionDays: number;
  codRefusalLimit: number;
  codRefusalMonths: number;
  codOpenOrderLimit: number;
}

export interface AdminStoreSettings {
  info: StoreInfoSettings;
  operations: StoreOperations;
  cart: StoreCart;
  derived: { deliveryWindow: string; lowStockDefault: number };
  updatedAt: string;
}

/** `PUT` body: replaces `info` and `operations`; `cart` is optional (absent = unchanged). */
export interface StoreSettingsInput {
  updatedAt: string;
  info: Omit<StoreInfoSettings, 'hotlineHref'>;
  operations: StoreOperations;
  cart: StoreCart;
}

// ---------- Audit log ----------

export type AuditTargetType = 'order' | 'inventory' | 'customer' | 'staff' | 'settings';

export interface AuditEntry {
  id: string;
  at: string;
  actor: { id: string | null; name: string; role: 'staff' | 'admin' };
  action: { code: string; label: string };
  target: { type: AuditTargetType; id: string | null; label: string };
  reason?: string;
  roleBefore?: 'staff' | 'admin';
  roleAfter?: 'staff' | 'admin';
  changes?: { field: string; label: string; before: string; after: string }[];
}

export interface AuditQuery {
  from: string;
  to: string;
  targetType: AuditTargetType | '';
  page: number;
  limit: number;
}

export interface AuditPage {
  items: AuditEntry[];
  total: number;
  page: number;
  limit: number;
}
