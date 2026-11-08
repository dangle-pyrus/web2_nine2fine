import { inject, InjectionToken, Provider, Type } from '@angular/core';
import { API_CONFIG, apiConfig } from '../core/api-config';
import * as ports from './data-access/admin-apis';
import * as mocks from '../../mocks/admin/mock-admin-apis';
import { MockAdminReportsApi } from '../../mocks/admin/mock-admin-reports';
import * as storefrontMocks from '../../mocks/admin/mock-admin-storefront';
import { adminOrderAdapterProviders } from './admin-order-adapters';
import { AdminDialogs } from './ui/dialogs';
import { provideAdminIcons } from './ui/icons';

/** Binds a port to its mock or HTTP adapter from `apiConfig.mode` (src/app/core/api-config.ts). */
function bind<T>(
  token: InjectionToken<T>,
  mock: Type<T>,
  http: Type<T>,
  mode: 'mode' | 'authMode' = 'mode',
): Provider[] {
  return [
    http,
    {
      provide: token,
      useFactory: () => (inject(API_CONFIG)[mode] === 'mock' ? inject(mock) : inject(http)),
    },
  ];
}

/**
 * Everything the admin needs, scoped to the lazy `/admin` route so the storefront bundle never
 * includes admin code, mocks or icons.
 */
export function provideAdmin(): Provider[] {
  // BR-ADM-36: the real orders API needs the real admin session (cookie `n2f_asid`).
  const config = apiConfig;
  if (config.adminOrdersMode === 'http' && config.authMode !== 'http') {
    console.warn(
      "adminOrdersMode 'http' needs authMode 'http': without the admin session cookie every order request answers 401.",
    );
  }
  return [
    provideAdminIcons(),
    AdminDialogs,
    // Slice 4 orders desk: the HTTP adapter, or the contract mock in the e2e build.
    ...adminOrderAdapterProviders,
    // Auth follows `authMode` so Slice 1 can go live before the other admin modules.
    ...bind(ports.ADMIN_AUTH_API, mocks.MockAdminAuthApi, ports.HttpAdminAuthApi, 'authMode'),
    ...bind(ports.ADMIN_DASHBOARD_API, mocks.MockAdminDashboardApi, ports.HttpAdminDashboardApi),
    ...bind(ports.ADMIN_ORDERS_API, mocks.MockAdminOrdersApi, ports.HttpAdminOrdersApi),
    ...bind(ports.ADMIN_RETURNS_API, mocks.MockAdminReturnsApi, ports.HttpAdminReturnsApi),
    ...bind(ports.ADMIN_PRODUCTS_API, mocks.MockAdminProductsApi, ports.HttpAdminProductsApi),
    ...bind(ports.ADMIN_INVENTORY_API, mocks.MockAdminInventoryApi, ports.HttpAdminInventoryApi),
    ...bind(ports.ADMIN_CUSTOMERS_API, mocks.MockAdminCustomersApi, ports.HttpAdminCustomersApi),
    ...bind(ports.ADMIN_PROMOTIONS_API, mocks.MockAdminPromotionsApi, ports.HttpAdminPromotionsApi),
    ...bind(ports.ADMIN_SETTINGS_API, mocks.MockAdminSettingsApi, ports.HttpAdminSettingsApi),
    ...bind(ports.ADMIN_SEARCH_API, mocks.MockAdminSearchApi, ports.HttpAdminSearchApi),
    ...bind(
      ports.ADMIN_STOREFRONT_API,
      storefrontMocks.MockAdminStorefrontApi,
      ports.HttpAdminStorefrontApi,
    ),
    ...bind(ports.ADMIN_REPORTS_API, MockAdminReportsApi, ports.HttpAdminReportsApi),
  ];
}
