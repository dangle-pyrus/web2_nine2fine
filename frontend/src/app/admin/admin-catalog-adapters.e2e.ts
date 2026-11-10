// E2E build (angular.json configuration "e2e"): replaces admin-catalog-adapters.ts. The earlier
// mock back office stays the default; a spec switches to the HTTP adapters with
// `localStorage['n2f.e2e.adminCatalogMode'] = 'http'` and answers `/api/admin/**` itself.
import { inject, Provider, Type } from '@angular/core';
import { API_CONFIG } from '../core/api-config';
import {
  MockAdminInventoryApi,
  MockAdminProductsApi,
  MockAdminPromotionsApi,
} from '../../mocks/admin/mock-admin-apis';
import { HttpAdminInventoryApi } from './data-access/inventory-api';
import { HttpAdminProductsApi } from './data-access/products-api';
import { HttpAdminPromotionsApi } from './data-access/promotions-api';
import { AdminCatalogBindings, toAdminCatalogProviders } from './admin-catalog-adapter-tokens';

function pick(mock: Type<unknown>, http: Type<unknown>) {
  return {
    useFactory: () =>
      inject(API_CONFIG).adminCatalogMode === 'http' ? inject(http) : inject(mock),
  };
}

const bindings: AdminCatalogBindings = {
  ADMIN_PRODUCTS_API: pick(MockAdminProductsApi, HttpAdminProductsApi),
  ADMIN_INVENTORY_API: pick(MockAdminInventoryApi, HttpAdminInventoryApi),
  ADMIN_PROMOTIONS_API: pick(MockAdminPromotionsApi, HttpAdminPromotionsApi),
};

export const adminCatalogAdapterProviders: Provider[] = [
  HttpAdminProductsApi,
  HttpAdminInventoryApi,
  HttpAdminPromotionsApi,
  ...toAdminCatalogProviders(bindings),
];
