/**
 * Admin API ports. Pages depend only on these tokens; `provideAdminApis()` binds them to the
 * in-memory mocks (`src/mocks/admin`) or to the HTTP adapters below depending on `apiConfig.mode`.
 * Endpoints are documented in document/admin/ADMIN_API_CONTRACT.md.
 */
import { HttpClient } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import type { StoreSettingsValue } from '../../core/store-settings';
import { adminBase, adminErrors, toParams } from './http-support';
import {
  AdminApiError,
  AdminCollection,
  AdminReview,
  AdminSizeChart,
  CollectionInput,
  LandingContent,
  ReportRange,
  ReviewQuery,
  ReviewStats,
  ReviewStatus,
  SalesReport,
  SizeChart,
  AdminCustomer,
  AdminCustomerSummary,
  AdminOrder,
  AdminOrderEvent,
  AdminOrderSummary,
  AdminProduct,
  AdminProductSummary,
  AdminUser,
  AuditEntry,
  AuditQuery,
  CancelInput,
  ChangeItemInput,
  DeliveryFailureInput,
  ReturnToSenderInput,
  ShippingAddress,
  CustomerQuery,
  CustomerUpdate,
  DashboardRange,
  DashboardSummary,
  InventoryAdjustment,
  InventoryItem,
  InventoryFacets,
  InventoryMovement,
  InventoryQuery,
  OrderQuery,
  OrderView,
  Page,
  ProductImage,
  ProductInput,
  ProductQuery,
  ProductStatus,
  Promotion,
  PromotionInput,
  PromotionQuery,
  ReturnCompletionInput,
  ReturnDecisionInput,
  ReturnQuery,
  ReturnSummary,
  SearchResults,
  ShipInput,
  StaffInput,
  StaffMember,
} from './models';

// ---------- Ports ----------

export interface AdminAuthApi {
  login(email: string, password: string): Observable<AdminUser>;
  /** Current staff session (from the session cookie); errors with `unauthenticated` when none. */
  me(): Observable<AdminUser>;
  logout(): Observable<void>;
}

export interface AdminDashboardApi {
  summary(range: DashboardRange): Observable<DashboardSummary>;
}

export interface AdminOrdersApi {
  list(query: OrderQuery): Observable<Page<AdminOrderSummary>>;
  /** Count per saved view, for the tab badges and the sidebar. */
  counts(): Observable<Record<OrderView, number>>;
  get(id: string): Observable<AdminOrder>;
  confirmPayment(id: string): Observable<AdminOrder>;
  /** COD order confirmed with the shopper by phone: pending-confirmation → processing. */
  confirm(id: string): Observable<AdminOrder>;
  /** Shipping address and order lines can change only before hand-over. */
  updateAddress(id: string, address: ShippingAddress): Observable<AdminOrder>;
  changeItem(id: string, input: ChangeItemInput): Observable<AdminOrder>;
  ship(id: string, input: ShipInput): Observable<AdminOrder>;
  markDelivering(id: string): Observable<AdminOrder>;
  markDelivered(id: string): Observable<AdminOrder>;
  failDelivery(id: string, input: DeliveryFailureInput): Observable<AdminOrder>;
  /** Failed delivery → the carrier tries again (delivering). */
  redeliver(id: string): Observable<AdminOrder>;
  /** Failed delivery → parcel back in the warehouse; COD is not collected. */
  returnToSender(id: string, input: ReturnToSenderInput): Observable<AdminOrder>;
  cancel(id: string, input: CancelInput): Observable<AdminOrder>;
  decideReturn(id: string, input: ReturnDecisionInput): Observable<AdminOrder>;
  completeReturn(id: string, input: ReturnCompletionInput): Observable<AdminOrder>;
  addComment(id: string, text: string): Observable<AdminOrderEvent>;
  updateTags(id: string, tags: string[]): Observable<AdminOrder>;
}

export interface AdminReturnsApi {
  list(query: ReturnQuery): Observable<Page<ReturnSummary>>;
}

export interface AdminProductsApi {
  list(query: ProductQuery): Observable<Page<AdminProductSummary>>;
  get(id: string): Observable<AdminProduct>;
  create(input: ProductInput): Observable<AdminProduct>;
  update(id: string, input: ProductInput): Observable<AdminProduct>;
  setStatus(ids: string[], status: ProductStatus): Observable<void>;
  remove(id: string): Observable<void>;
  uploadImage(file: File): Observable<ProductImage>;
}

export interface AdminInventoryApi {
  list(query: InventoryQuery): Observable<Page<InventoryItem>>;
  adjust(variantId: string, input: InventoryAdjustment): Observable<InventoryItem>;
  history(variantId: string): Observable<InventoryMovement[]>;
  facets(): Observable<InventoryFacets>;
  /** Own threshold for these SKUs; null puts them back on the shop default. */
  setThreshold(variantIds: string[], value: number | null): Observable<void>;
  /** Shop-wide default; `resetCustom` also drops every SKU's own threshold. */
  setDefaultThreshold(value: number, resetCustom: boolean): Observable<void>;
}

export interface AdminCustomersApi {
  list(query: CustomerQuery): Observable<Page<AdminCustomerSummary>>;
  get(id: string): Observable<AdminCustomer>;
  update(id: string, input: CustomerUpdate): Observable<AdminCustomer>;
}

export interface AdminPromotionsApi {
  list(query: PromotionQuery): Observable<Page<Promotion>>;
  get(id: string): Observable<Promotion>;
  create(input: PromotionInput): Observable<Promotion>;
  update(id: string, input: PromotionInput): Observable<Promotion>;
  setEnabled(id: string, enabled: boolean): Observable<Promotion>;
  remove(id: string): Observable<void>;
}

export interface AdminSettingsApi {
  getStore(): Observable<StoreSettingsValue>;
  updateStore(value: StoreSettingsValue): Observable<StoreSettingsValue>;
  listStaff(): Observable<StaffMember[]>;
  inviteStaff(input: StaffInput): Observable<StaffMember>;
  updateStaff(
    id: string,
    input: Partial<StaffInput> & { status?: StaffMember['status'] },
  ): Observable<StaffMember>;
  audit(query: AuditQuery): Observable<Page<AuditEntry>>;
}

export interface AdminSearchApi {
  search(term: string): Observable<SearchResults>;
}

/**
 * Storefront content managed from the admin (Đợt 3): home page blocks, review moderation,
 * collections and size charts. Frontend-only for now: no backend endpoint exists yet.
 */
export interface AdminStorefrontApi {
  getHome(): Observable<LandingContent>;
  saveHome(content: LandingContent): Observable<LandingContent>;
  /** Back to the built-in home page content. */
  resetHome(): Observable<LandingContent>;
  reviews(query: ReviewQuery): Observable<Page<AdminReview>>;
  reviewStats(): Observable<ReviewStats>;
  setReviewStatus(ids: string[], status: ReviewStatus): Observable<void>;
  /** Empty body removes the reply. */
  replyReview(id: string, body: string): Observable<AdminReview>;
  collections(): Observable<AdminCollection[]>;
  saveCollection(id: string | null, input: CollectionInput): Observable<AdminCollection>;
  removeCollection(id: string): Observable<void>;
  /** Adds or removes one product in the given collections, leaving the others as they are. */
  setProductCollections(productId: string, collectionIds: string[]): Observable<AdminCollection[]>;
  sizeCharts(): Observable<AdminSizeChart[]>;
  saveSizeChart(category: string, chart: SizeChart): Observable<AdminSizeChart>;
  resetSizeChart(category: string): Observable<AdminSizeChart>;
}

export interface AdminReportsApi {
  sales(range: ReportRange): Observable<SalesReport>;
}

export const ADMIN_AUTH_API = new InjectionToken<AdminAuthApi>('ADMIN_AUTH_API');
export const ADMIN_DASHBOARD_API = new InjectionToken<AdminDashboardApi>('ADMIN_DASHBOARD_API');
export const ADMIN_ORDERS_API = new InjectionToken<AdminOrdersApi>('ADMIN_ORDERS_API');
export const ADMIN_RETURNS_API = new InjectionToken<AdminReturnsApi>('ADMIN_RETURNS_API');
export const ADMIN_PRODUCTS_API = new InjectionToken<AdminProductsApi>('ADMIN_PRODUCTS_API');
export const ADMIN_INVENTORY_API = new InjectionToken<AdminInventoryApi>('ADMIN_INVENTORY_API');
export const ADMIN_CUSTOMERS_API = new InjectionToken<AdminCustomersApi>('ADMIN_CUSTOMERS_API');
export const ADMIN_PROMOTIONS_API = new InjectionToken<AdminPromotionsApi>('ADMIN_PROMOTIONS_API');
export const ADMIN_SETTINGS_API = new InjectionToken<AdminSettingsApi>('ADMIN_SETTINGS_API');
export const ADMIN_SEARCH_API = new InjectionToken<AdminSearchApi>('ADMIN_SEARCH_API');
export const ADMIN_STOREFRONT_API = new InjectionToken<AdminStorefrontApi>('ADMIN_STOREFRONT_API');
export const ADMIN_REPORTS_API = new InjectionToken<AdminReportsApi>('ADMIN_REPORTS_API');

// ---------- HTTP adapters ----------

/** For screens built ahead of the backend: the HTTP adapter says so instead of guessing a URL. */
function frontendOnly<T>(): Observable<T> {
  return throwError(
    () =>
      new AdminApiError('unavailable', 'Chức năng này chưa có API, hiện chỉ chạy với dữ liệu mẫu.'),
  );
}

@Injectable()
export class HttpAdminAuthApi implements AdminAuthApi {
  private readonly http = inject(HttpClient);
  private readonly base = adminBase();
  login(email: string, password: string) {
    return this.http
      .post<AdminUser>(`${this.base}/auth/login`, { email, password })
      .pipe(adminErrors());
  }
  me() {
    return this.http.get<AdminUser>(`${this.base}/auth/me`).pipe(adminErrors());
  }
  logout() {
    return this.http.post<void>(`${this.base}/auth/logout`, {}).pipe(adminErrors());
  }
}

@Injectable()
export class HttpAdminDashboardApi implements AdminDashboardApi {
  private readonly http = inject(HttpClient);
  private readonly base = adminBase();
  summary(range: DashboardRange) {
    return this.http
      .get<DashboardSummary>(`${this.base}/dashboard`, { params: { range } })
      .pipe(adminErrors());
  }
}

@Injectable()
export class HttpAdminOrdersApi implements AdminOrdersApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${adminBase()}/orders`;
  list(query: OrderQuery) {
    return this.http
      .get<Page<AdminOrderSummary>>(this.base, { params: toParams(query) })
      .pipe(adminErrors());
  }
  counts() {
    return this.http.get<Record<OrderView, number>>(`${this.base}/counts`).pipe(adminErrors());
  }
  get(id: string) {
    return this.http.get<AdminOrder>(`${this.base}/${id}`).pipe(adminErrors());
  }
  confirmPayment(id: string) {
    return this.action(id, 'confirm-payment', {});
  }
  // Frontend-only features (Đợt 2): no backend endpoint yet, they run on the mock data.
  confirm() {
    return frontendOnly<AdminOrder>();
  }
  updateAddress() {
    return frontendOnly<AdminOrder>();
  }
  changeItem() {
    return frontendOnly<AdminOrder>();
  }
  ship(id: string, input: ShipInput) {
    return this.action(id, 'ship', input);
  }
  markDelivering(id: string) {
    return this.action(id, 'out-for-delivery', {});
  }
  markDelivered(id: string) {
    return this.action(id, 'deliver', {});
  }
  failDelivery() {
    return frontendOnly<AdminOrder>();
  }
  redeliver() {
    return frontendOnly<AdminOrder>();
  }
  returnToSender() {
    return frontendOnly<AdminOrder>();
  }
  cancel(id: string, input: CancelInput) {
    return this.action(id, 'cancel', input);
  }
  decideReturn(id: string, input: ReturnDecisionInput) {
    return this.action(id, 'return/decision', input);
  }
  completeReturn(id: string, input: ReturnCompletionInput) {
    return this.action(id, 'return/complete', input);
  }
  addComment(id: string, text: string) {
    return this.http
      .post<AdminOrderEvent>(`${this.base}/${id}/comments`, { text })
      .pipe(adminErrors());
  }
  updateTags(id: string, tags: string[]) {
    return this.http.patch<AdminOrder>(`${this.base}/${id}`, { tags }).pipe(adminErrors());
  }
  private action(id: string, path: string, body: object) {
    return this.http.post<AdminOrder>(`${this.base}/${id}/${path}`, body).pipe(adminErrors());
  }
}

@Injectable()
export class HttpAdminReturnsApi implements AdminReturnsApi {
  private readonly http = inject(HttpClient);
  private readonly base = adminBase();
  list(query: ReturnQuery) {
    return this.http
      .get<Page<ReturnSummary>>(`${this.base}/returns`, { params: toParams(query) })
      .pipe(adminErrors());
  }
}

@Injectable()
export class HttpAdminProductsApi implements AdminProductsApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${adminBase()}/products`;
  list(query: ProductQuery) {
    return this.http
      .get<Page<AdminProductSummary>>(this.base, { params: toParams(query) })
      .pipe(adminErrors());
  }
  get(id: string) {
    return this.http.get<AdminProduct>(`${this.base}/${id}`).pipe(adminErrors());
  }
  create(input: ProductInput) {
    return this.http.post<AdminProduct>(this.base, input).pipe(adminErrors());
  }
  update(id: string, input: ProductInput) {
    return this.http.put<AdminProduct>(`${this.base}/${id}`, input).pipe(adminErrors());
  }
  setStatus(ids: string[], status: ProductStatus) {
    return this.http.post<void>(`${this.base}/bulk-status`, { ids, status }).pipe(adminErrors());
  }
  remove(id: string) {
    return this.http.delete<void>(`${this.base}/${id}`).pipe(adminErrors());
  }
  uploadImage(file: File) {
    const body = new FormData();
    body.append('file', file);
    return this.http
      .post<ProductImage>(`${adminBase()}/uploads/product-images`, body)
      .pipe(adminErrors());
  }
}

@Injectable()
export class HttpAdminInventoryApi implements AdminInventoryApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${adminBase()}/inventory`;
  list(query: InventoryQuery) {
    return this.http
      .get<Page<InventoryItem>>(this.base, { params: toParams(query) })
      .pipe(adminErrors());
  }
  adjust(variantId: string, input: InventoryAdjustment) {
    return this.http
      .post<InventoryItem>(`${this.base}/${variantId}/adjustments`, input)
      .pipe(adminErrors());
  }
  history(variantId: string) {
    return this.http
      .get<InventoryMovement[]>(`${this.base}/${variantId}/movements`)
      .pipe(adminErrors());
  }
  facets = () => frontendOnly<InventoryFacets>();
  setThreshold = () => frontendOnly<void>();
  setDefaultThreshold = () => frontendOnly<void>();
}

@Injectable()
export class HttpAdminCustomersApi implements AdminCustomersApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${adminBase()}/customers`;
  list(query: CustomerQuery) {
    return this.http
      .get<Page<AdminCustomerSummary>>(this.base, { params: toParams(query) })
      .pipe(adminErrors());
  }
  get(id: string) {
    return this.http.get<AdminCustomer>(`${this.base}/${id}`).pipe(adminErrors());
  }
  update(id: string, input: CustomerUpdate) {
    return this.http.patch<AdminCustomer>(`${this.base}/${id}`, input).pipe(adminErrors());
  }
}

@Injectable()
export class HttpAdminPromotionsApi implements AdminPromotionsApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${adminBase()}/promotions`;
  list(query: PromotionQuery) {
    return this.http
      .get<Page<Promotion>>(this.base, { params: toParams(query) })
      .pipe(adminErrors());
  }
  get(id: string) {
    return this.http.get<Promotion>(`${this.base}/${id}`).pipe(adminErrors());
  }
  create(input: PromotionInput) {
    return this.http.post<Promotion>(this.base, input).pipe(adminErrors());
  }
  update(id: string, input: PromotionInput) {
    return this.http.put<Promotion>(`${this.base}/${id}`, input).pipe(adminErrors());
  }
  setEnabled(id: string, enabled: boolean) {
    return this.http.patch<Promotion>(`${this.base}/${id}`, { enabled }).pipe(adminErrors());
  }
  remove(id: string) {
    return this.http.delete<void>(`${this.base}/${id}`).pipe(adminErrors());
  }
}

@Injectable()
export class HttpAdminSettingsApi implements AdminSettingsApi {
  private readonly http = inject(HttpClient);
  private readonly base = adminBase();
  getStore() {
    return this.http.get<StoreSettingsValue>(`${this.base}/settings/store`).pipe(adminErrors());
  }
  updateStore(value: StoreSettingsValue) {
    return this.http
      .put<StoreSettingsValue>(`${this.base}/settings/store`, value)
      .pipe(adminErrors());
  }
  listStaff() {
    return this.http.get<StaffMember[]>(`${this.base}/staff`).pipe(adminErrors());
  }
  inviteStaff(input: StaffInput) {
    return this.http.post<StaffMember>(`${this.base}/staff`, input).pipe(adminErrors());
  }
  updateStaff(id: string, input: Partial<StaffInput> & { status?: StaffMember['status'] }) {
    return this.http.patch<StaffMember>(`${this.base}/staff/${id}`, input).pipe(adminErrors());
  }
  audit(query: AuditQuery) {
    return this.http
      .get<Page<AuditEntry>>(`${this.base}/audit-log`, { params: toParams(query) })
      .pipe(adminErrors());
  }
}

@Injectable()
export class HttpAdminSearchApi implements AdminSearchApi {
  private readonly http = inject(HttpClient);
  private readonly base = adminBase();
  search(term: string) {
    return this.http
      .get<SearchResults>(`${this.base}/search`, { params: toParams({ q: term }) })
      .pipe(adminErrors());
  }
}

/** No endpoints yet: every call reports that the feature runs on the mock data only. */
@Injectable()
export class HttpAdminStorefrontApi implements AdminStorefrontApi {
  getHome = () => frontendOnly<LandingContent>();
  saveHome = () => frontendOnly<LandingContent>();
  resetHome = () => frontendOnly<LandingContent>();
  reviews = () => frontendOnly<Page<AdminReview>>();
  reviewStats = () => frontendOnly<ReviewStats>();
  setReviewStatus = () => frontendOnly<void>();
  replyReview = () => frontendOnly<AdminReview>();
  collections = () => frontendOnly<AdminCollection[]>();
  saveCollection = () => frontendOnly<AdminCollection>();
  removeCollection = () => frontendOnly<void>();
  setProductCollections = () => frontendOnly<AdminCollection[]>();
  sizeCharts = () => frontendOnly<AdminSizeChart[]>();
  saveSizeChart = () => frontendOnly<AdminSizeChart>();
  resetSizeChart = () => frontendOnly<AdminSizeChart>();
}

@Injectable()
export class HttpAdminReportsApi implements AdminReportsApi {
  sales = () => frontendOnly<SalesReport>();
}
