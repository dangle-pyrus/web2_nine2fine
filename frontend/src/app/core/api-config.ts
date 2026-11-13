import { InjectionToken } from '@angular/core';

export interface ApiConfig {
  /** Catalog, checkout, account, admin data: `mock` until each slice is integrated. */
  mode: 'mock' | 'http';
  /**
   * Auth (storefront + admin sign-in, session restore, sign-out). Slice 1 integration switches
   * only this value to `http`; the other slices keep following `mode`.
   */
  authMode: 'mock' | 'http';
  /** Catalog (products, size charts): `http` once Slice 2 is integrated; cart, checkout, account, admin follow `mode`. */
  catalogMode: 'mock' | 'http';
  /**
   * Cart, quote, checkout, order placement, locations, guest order lookup and the order part of the
   * account (Slice 3). Independent of `mode`: profile, addresses and admin stay on `mode`.
   */
  checkoutMode: 'mock' | 'http';
  /**
   * Admin orders (Slice 4), independent of `mode`. `http`: the order desk (`/api/admin/orders`,
   * only the "Đơn hàng" menu, other admin routes say "Chưa khả dụng"; needs `authMode: 'http'`).
   * `mock`: the earlier mock back office, unchanged. `contract-mock`: the order desk on the
   * contract-faithful mock (e2e only, picked by the Playwright specs).
   */
  adminOrdersMode: 'mock' | 'http' | 'contract-mock';
  /**
   * Account (Slice 5): profile, password, address book, membership, vouchers, and the saved
   * addresses / profile prefill at checkout. `http` in the normal build, `mock` in e2e.
   */
  accountMode: 'mock' | 'http';
  /**
   * Admin products, inventory and promotions (Slice 6), independent of `mode`. `http`: the three
   * modules call `/api/admin/{products,inventory,promotions}` (the order desk menu gains Sản phẩm,
   * Tồn kho, Khuyến mãi; Won't fields are hidden; needs `authMode: 'http'`). `mock`: the earlier
   * mock back office. The e2e build picks `http` with `localStorage['n2f.e2e.adminCatalogMode']`
   * and the specs answer `/api/admin/**` themselves.
   */
  adminCatalogMode: 'mock' | 'http';
  /**
   * Admin customers and staff (Slice 7), independent of `mode`. `http`: Khách hàng and Cài đặt >
   * Nhân viên call `/api/admin/{customers,staff,accounts}` (the desk menu gains Khách hàng, and
   * Nhân viên for admins; needs `authMode: 'http'`). `mock`: the earlier mock back office. The e2e
   * build picks `http` with `localStorage['n2f.e2e.adminUsersMode']`.
   */
  adminUsersMode: 'mock' | 'http';
  /**
   * Admin Tổng quan, Báo cáo, Cài đặt cửa hàng and Nhật ký (Slice 8), independent of `mode`. `http`:
   * `/admin` is the real dashboard and Báo cáo, Cài đặt › Cửa hàng, Cài đặt › Nhật ký call
   * `/api/admin/{dashboard,reports,settings/store,audit-log}`; the storefront footer and policies
   * read `GET /api/store/settings`. `mock`: the earlier mock back office. The e2e build picks
   * `http` with `localStorage['n2f.e2e.adminInsightsMode']` and the specs answer the requests.
   */
  adminInsightsMode: 'mock' | 'http';
  /**
   * Returns and refunds (Slice 9), independent of `mode`. `http`: the shopper's return form and
   * status block read `Order.canReturn` / `returnDeadline` / `return` from the server and call
   * `/api/account/orders/{code}/return*`; `/admin/returns` and the order's return block call
   * `/api/admin/returns*` (needs `authMode: 'http'`). `mock`: the earlier mock returns. The e2e
   * build picks `http` with `localStorage['n2f.e2e.returnsMode']`.
   */
  returnsMode: 'mock' | 'http';
  /**
   * Slice 10 storefront flags, each independent of `mode` (same pattern as `returnsMode`). `http`:
   * the HTTP adapter of docs/api/openapi.yaml; `mock`: the earlier mock. The e2e build picks `http`
   * with `localStorage['n2f.e2e.<flag>'] = 'http'` and the specs answer `/api/**` themselves.
   * `reviewsMode`: PDP reviews list / eligibility / submit (`/products/{id}/reviews`, `/reviews*`).
   * `wishlistMode`: wishlist kept per account (`/account/wishlist*`) with a merge on sign-in.
   * `recommendationsMode`: PDP and cart suggestions (`/recommendations`).
   * `contentMode`: home content and Moment cards (`/content/home`), size chart `updatedAt`.
   * `promotionsMode`: sale price display, "đang giảm giá" filter, "Giảm giá đến dd/MM".
   */
  reviewsMode: 'mock' | 'http';
  wishlistMode: 'mock' | 'http';
  recommendationsMode: 'mock' | 'http';
  contentMode: 'mock' | 'http';
  promotionsMode: 'mock' | 'http';
  baseUrl: string;
}
/**
 * Which adapter each slice uses is decided in `storefront-adapters.ts` (HTTP) or its e2e twin
 * (mocks), not here. `authMode`, `catalogMode` and `checkoutMode` are still read at run time to pick
 * behaviour that only exists in one mode (cart sync, demo hints, returns, reviews, demo seed), so
 * keep them in step with the adapter files. Both adapter files must bind the same token set; the
 * `StorefrontBindings` type in `storefront-adapter-tokens.ts` enforces it.
 */
export const API_CONFIG = new InjectionToken<ApiConfig>('API_CONFIG');
export const apiConfig: ApiConfig = {
  mode: 'mock',
  authMode: 'http',
  catalogMode: 'http',
  checkoutMode: 'http',
  adminOrdersMode: 'http',
  accountMode: 'http',
  adminCatalogMode: 'http',
  adminUsersMode: 'http',
  adminInsightsMode: 'http',
  returnsMode: 'http',
  reviewsMode: 'http',
  wishlistMode: 'http',
  recommendationsMode: 'http',
  contentMode: 'http',
  promotionsMode: 'http',
  baseUrl: '/api',
};
