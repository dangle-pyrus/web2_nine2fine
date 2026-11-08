import { Provider } from '@angular/core';
import { HttpOrdersApi, ORDERS_API } from '../features/account/data-access/orders-api';
import { AUTH_API, HttpAuthApi } from '../features/auth/data-access/auth-api';
import { CART_API, HttpCartApi } from '../features/cart/data-access/cart-api';
import { CATALOG_API, HttpCatalogApi } from '../features/catalog/data-access/catalog-api';
import {
  CHECKOUT_API,
  HttpCheckoutApi,
  PAYMENT_SIMULATOR,
} from '../features/checkout/checkout-api';

/**
 * Adapters of the slices that talk to the real backend (auth, catalog, cart, checkout, orders).
 * The normal build binds only the HTTP adapters, so the mock adapters and their demo data stay out
 * of the initial chunk. The e2e build (angular.json "e2e") replaces this file with
 * `storefront-adapters.e2e.ts`, which binds the mocks. Keep both files in step with `api-config`.
 */
export const storefrontAdapterProviders: Provider[] = [
  { provide: CATALOG_API, useExisting: HttpCatalogApi },
  { provide: CHECKOUT_API, useExisting: HttpCheckoutApi },
  { provide: PAYMENT_SIMULATOR, useValue: null },
  { provide: CART_API, useExisting: HttpCartApi },
  { provide: ORDERS_API, useExisting: HttpOrdersApi },
  { provide: AUTH_API, useExisting: HttpAuthApi },
];
