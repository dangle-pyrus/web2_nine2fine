import { Provider } from '@angular/core';
import { HttpAdminInventoryApi } from './data-access/inventory-api';
import { HttpAdminProductsApi } from './data-access/products-api';
import { HttpAdminPromotionsApi } from './data-access/promotions-api';
import { AdminCatalogBindings, toAdminCatalogProviders } from './admin-catalog-adapter-tokens';

const bindings: AdminCatalogBindings = {
  ADMIN_PRODUCTS_API: { useExisting: HttpAdminProductsApi },
  ADMIN_INVENTORY_API: { useExisting: HttpAdminInventoryApi },
  ADMIN_PROMOTIONS_API: { useExisting: HttpAdminPromotionsApi },
};

/**
 * Adapter of the admin products / inventory / promotions slice (Slice 6). The normal build binds
 * only the HTTP adapters and never imports the mock. The e2e build (angular.json "e2e") replaces
 * this file with `admin-catalog-adapters.e2e.ts`; both bind the same tokens.
 */
export const adminCatalogAdapterProviders: Provider[] = [
  HttpAdminProductsApi,
  HttpAdminInventoryApi,
  HttpAdminPromotionsApi,
  ...toAdminCatalogProviders(bindings),
];
