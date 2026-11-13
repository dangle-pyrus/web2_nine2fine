/**
 * Admin API ports. Pages depend only on these tokens; `provideAdmin()` binds them to the
 * in-memory mocks (`src/mocks/admin`) or to the HTTP adapters below depending on `apiConfig.mode`.
 * Products, inventory and promotions (Slice 6) have their HTTP adapters in `products-api.ts`,
 * `inventory-api.ts` and `promotions-api.ts`, bound by `admin-catalog-adapters.ts`.
 * Endpoints are documented in document/admin/ADMIN_API_CONTRACT.md.
 */
import { HttpClient } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { Observable, of, switchMap, throwError } from 'rxjs';
import type { StoreSettingsValue } from '../../core/store-settings';
import { adminBase, adminErrors, defaultMessage, toParams } from './http-support';
import {
  AdminApiError,
  AdminCategory,
  ReportRange,
  SalesReport,
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
  /** Categories to pick from (BR-INV-10); read only. */
  categories(): Observable<AdminCategory[]>;
}

export interface AdminInventoryApi {
  list(query: InventoryQuery): Observable<Page<InventoryItem>>;
  adjust(variantId: string, input: InventoryAdjustment): Observable<InventoryItem>;
  history(variantId: string): Observable<InventoryMovement[]>;
  /** Counts follow the search / category / colour / size filters, not the status tab. */
  facets(
    query?: Partial<Pick<InventoryQuery, 'search' | 'category' | 'color' | 'size'>>,
  ): Observable<InventoryFacets>;
  /** Own threshold for these SKUs; null puts them back on the shop default. */
  setThreshold(variantIds: string[], value: number | null): Observable<void>;
  /** Shop-wide default; `resetCustom` also drops every SKU's own threshold. */
  setDefaultThreshold(value: number, resetCustom: boolean): Observable<void>;
}

export interface AdminCustomersApi {
  list(query: CustomerQuery): Observable<Page<AdminCustomerSummary>>;
  get(id: string): Observable<AdminCustomer>;
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
  audit(query: AuditQuery): Observable<Page<AuditEntry>>;
}

export interface AdminSearchApi {
  search(term: string): Observable<SearchResults>;
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
export const ADMIN_REPORTS_API = new InjectionToken<AdminReportsApi>('ADMIN_REPORTS_API');

// ---------- HTTP adapters ----------

/** For screens built ahead of the backend: the HTTP adapter says so instead of guessing a URL. */
function frontendOnly<T>(): Observable<T> {
  return throwError(
    () =>
      new AdminApiError('unavailable', 'Chức năng này chưa có API, hiện chỉ chạy với dữ liệu mẫu.'),
  );
}

/** Public profile of docs/api/openapi.yaml `AuthUser`; the admin shell shows one display name. */
interface ContractUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'member' | 'staff' | 'admin';
}

function toAdminUser(user: ContractUser): Observable<AdminUser> {
  // A member never gets an admin session; treat a stray one as refused.
  if (user.role === 'member') {
    return throwError(() => new AdminApiError('forbidden', defaultMessage('forbidden')));
  }
  return of({
    id: user.id,
    email: user.email,
    name: `${user.lastName} ${user.firstName}`.trim(),
    role: user.role,
  });
}

@Injectable()
export class HttpAdminAuthApi implements AdminAuthApi {
  private readonly http = inject(HttpClient);
  private readonly base = adminBase();
  login(email: string, password: string) {
    return this.http.post<ContractUser>(`${this.base}/auth/login`, { email, password }).pipe(
      adminErrors(),
      switchMap((user) => toAdminUser(user)),
    );
  }
  me() {
    return this.http.get<ContractUser>(`${this.base}/auth/me`).pipe(
      adminErrors(),
      switchMap((user) => toAdminUser(user)),
    );
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

@Injectable()
export class HttpAdminReportsApi implements AdminReportsApi {
  sales = () => frontendOnly<SalesReport>();
}
