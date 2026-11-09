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
  baseUrl: '/api',
};
