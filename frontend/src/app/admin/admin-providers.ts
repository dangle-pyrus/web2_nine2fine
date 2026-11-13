import { inject, InjectionToken, Provider, Type } from '@angular/core';
import { API_CONFIG, apiConfig } from '../core/api-config';
import * as ports from './data-access/admin-apis';
import * as mocks from '../../mocks/admin/mock-admin-apis';
import { MockAdminReportsApi } from '../../mocks/admin/mock-admin-reports';
import { AdminCategories } from './data-access/admin-categories';
import { adminCatalogAdapterProviders } from './admin-catalog-adapters';
import { adminOrderAdapterProviders } from './admin-order-adapters';
import { adminUsersAdapterProviders } from './admin-users-adapters';
import * as content from './data-access/content-api';
import {
  MockAdminContentApi,
  MockAdminReviewsApi,
  MockAdminSalesApi,
} from '../../mocks/admin/mock-admin-content';
import * as insights from './data-access/insights-api';
import { ADMIN_RETURN_DESK_API, HttpAdminReturnDeskApi } from './data-access/returns-api';
import { AdminDialogs } from './ui/dialogs';
import { provideAdminIcons } from './ui/icons';

/** Binds a port to its mock or HTTP adapter from `apiConfig.mode` (src/app/core/api-config.ts). */
function bind<T>(
  token: InjectionToken<T>,
  mock: Type<T>,
  http: Type<T>,
  mode: 'mode' | 'authMode' | 'reviewsMode' | 'contentMode' | 'promotionsMode' = 'mode',
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
  if (config.adminCatalogMode === 'http' && config.authMode !== 'http') {
    console.warn(
      "adminCatalogMode 'http' needs authMode 'http': without the admin session cookie every catalog request answers 401.",
    );
  }
  if (config.adminUsersMode === 'http' && config.authMode !== 'http') {
    console.warn(
      "adminUsersMode 'http' needs authMode 'http': without the admin session cookie every customer and staff request answers 401.",
    );
  }
  if (config.adminInsightsMode === 'http' && config.authMode !== 'http') {
    console.warn(
      "adminInsightsMode 'http' needs authMode 'http': without the admin session cookie every dashboard, report, settings and audit request answers 401.",
    );
  }
  if (config.returnsMode === 'http' && config.authMode !== 'http') {
    console.warn(
      "returnsMode 'http' needs authMode 'http': without the admin session cookie every returns request answers 401.",
    );
  }
  return [
    provideAdminIcons(),
    AdminDialogs,
    // Slice 4 orders desk: the HTTP adapter, or the contract mock in the e2e build.
    ...adminOrderAdapterProviders,
    // Slice 6 products, inventory, promotions: HTTP adapters, or the mock/HTTP choice in e2e.
    ...adminCatalogAdapterProviders,
    // Slice 7 customers and staff: HTTP adapters, or the mock/HTTP choice in e2e.
    ...adminUsersAdapterProviders,
    // Slice 8 dashboard, reports, store settings, audit log: HTTP only (the mock back office keeps
    // its own ports below and is routed only while `adminInsightsMode` is `mock`).
    insights.HttpInsightsDashboardApi,
    insights.HttpInsightsReportsApi,
    insights.HttpStoreSettingsAdminApi,
    insights.HttpAuditLogApi,
    {
      provide: insights.ADMIN_INSIGHTS_DASHBOARD_API,
      useExisting: insights.HttpInsightsDashboardApi,
    },
    { provide: insights.ADMIN_INSIGHTS_REPORTS_API, useExisting: insights.HttpInsightsReportsApi },
    { provide: insights.ADMIN_STORE_SETTINGS_API, useExisting: insights.HttpStoreSettingsAdminApi },
    { provide: insights.ADMIN_AUDIT_LOG_API, useExisting: insights.HttpAuditLogApi },
    // Slice 9 returns desk: HTTP only (routed only while `returnsMode` is `http`).
    HttpAdminReturnDeskApi,
    { provide: ADMIN_RETURN_DESK_API, useExisting: HttpAdminReturnDeskApi },
    AdminCategories,
    // Slice 10 (admin side): review moderation, home content / size charts / collections and the
    // bulk sale follow reviewsMode, contentMode and promotionsMode.
    ...bind(
      content.ADMIN_REVIEWS_API,
      MockAdminReviewsApi,
      content.HttpAdminReviewsApi,
      'reviewsMode',
    ),
    ...bind(
      content.ADMIN_CONTENT_API,
      MockAdminContentApi,
      content.HttpAdminContentApi,
      'contentMode',
    ),
    ...bind(
      content.ADMIN_SALES_API,
      MockAdminSalesApi,
      content.HttpAdminSalesApi,
      'promotionsMode',
    ),
    // Auth follows `authMode` so Slice 1 can go live before the other admin modules.
    ...bind(ports.ADMIN_AUTH_API, mocks.MockAdminAuthApi, ports.HttpAdminAuthApi, 'authMode'),
    ...bind(ports.ADMIN_DASHBOARD_API, mocks.MockAdminDashboardApi, ports.HttpAdminDashboardApi),
    ...bind(ports.ADMIN_ORDERS_API, mocks.MockAdminOrdersApi, ports.HttpAdminOrdersApi),
    ...bind(ports.ADMIN_RETURNS_API, mocks.MockAdminReturnsApi, ports.HttpAdminReturnsApi),
    ...bind(ports.ADMIN_CUSTOMERS_API, mocks.MockAdminCustomersApi, ports.HttpAdminCustomersApi),
    ...bind(ports.ADMIN_SETTINGS_API, mocks.MockAdminSettingsApi, ports.HttpAdminSettingsApi),
    ...bind(ports.ADMIN_SEARCH_API, mocks.MockAdminSearchApi, ports.HttpAdminSearchApi),
    ...bind(ports.ADMIN_REPORTS_API, MockAdminReportsApi, ports.HttpAdminReportsApi),
  ];
}
