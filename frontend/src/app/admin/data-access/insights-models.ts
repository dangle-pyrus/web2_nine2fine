/**
 * Admin Tổng quan, Báo cáo, Cài đặt cửa hàng and Nhật ký (Slice 8, docs/api/openapi.yaml tags
 * `admin-dashboard`, `admin-reports`, `admin-store-settings`, `admin-audit`, locked 2026-11-12).
 * Names and shapes are the contract's. Money is an integer number of VND, ratios are 0..1, instants
 * are ISO 8601 UTC and dates are `YYYY-MM-DD` in Vietnam time.
 */
import type { WireImageRef } from './catalog-media';

export type InsightsRange = 'today' | '7d' | '30d';

export interface KpiValue {
  value: number;
  /** (this period - previous) / previous, `null` when the previous period is 0 (shown as "—"). */
  change: number | null;
}

export interface DashboardTodo {
  toConfirm: number;
  pendingPayment: number;
  toFulfil: number;
  inTransit: number;
  cancelRequests: number;
  returning: number;
  lateDelivery: number;
  lowStock: number;
  outOfStock: number;
}

export interface RevenuePoint {
  date: string;
  revenue: number;
  previous: number;
}

export interface DashboardTopProduct {
  productId: string;
  name: string;
  image: WireImageRef | null;
  units: number;
  revenue: number;
}

/**
 * Staff receive only `generatedAt`, `orders` and `todo`: every other key is absent (BR-DSH-07), so
 * the screen has to cope with their absence rather than with zeros.
 */
export interface Dashboard {
  generatedAt: string;
  orders: KpiValue;
  todo: DashboardTodo;
  range?: InsightsRange;
  period?: { from: string; to: string; previousFrom: string; previousTo: string };
  revenue?: KpiValue;
  completedOrders?: KpiValue;
  averageOrderValue?: KpiValue;
  newCustomers?: KpiValue;
  revenueSeries?: RevenuePoint[];
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
  kpis: Record<ReportFigureKey, ReportFigure>;
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
