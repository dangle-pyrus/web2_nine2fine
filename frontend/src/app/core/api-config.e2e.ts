// E2E build (angular.json configuration "e2e"): replaces api-config.ts so Playwright runs on mocks.
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
  /** See `api-config.ts`. */
  adminOrdersMode: 'mock' | 'http' | 'contract-mock';
  /**
   * Account (Slice 5): profile, password, address book, membership, vouchers, and the saved
   * addresses / profile prefill at checkout. `http` in the normal build, `mock` in e2e.
   */
  accountMode: 'mock' | 'http';
  baseUrl: string;
}
/**
 * Playwright picks the order desk with `localStorage['n2f.e2e.adminOrdersMode'] = 'contract-mock'`;
 * every other spec keeps the earlier mock back office.
 */
function readAdminOrdersMode(): ApiConfig['adminOrdersMode'] {
  try {
    return localStorage.getItem('n2f.e2e.adminOrdersMode') === 'contract-mock'
      ? 'contract-mock'
      : 'mock';
  } catch {
    return 'mock';
  }
}
export const API_CONFIG = new InjectionToken<ApiConfig>('API_CONFIG');
export const apiConfig: ApiConfig = {
  mode: 'mock',
  authMode: 'mock',
  catalogMode: 'mock',
  checkoutMode: 'mock',
  adminOrdersMode: readAdminOrdersMode(),
  accountMode: 'mock',
  baseUrl: '/api',
};
