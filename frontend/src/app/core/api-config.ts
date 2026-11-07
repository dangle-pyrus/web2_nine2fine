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
  baseUrl: string;
}
export const API_CONFIG = new InjectionToken<ApiConfig>('API_CONFIG');
export const apiConfig: ApiConfig = {
  mode: 'mock',
  authMode: 'http',
  catalogMode: 'http',
  baseUrl: '/api',
};
