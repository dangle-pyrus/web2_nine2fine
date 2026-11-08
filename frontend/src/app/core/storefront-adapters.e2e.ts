// E2E build (angular.json configuration "e2e"): replaces storefront-adapters.ts so Playwright runs
// the auth, catalog, cart, checkout and orders slices on mocks (see api-config.e2e.ts).
import { Provider } from '@angular/core';
import { MockAuthApi } from '../../mocks/mock-auth-api';
import { MockCartApi } from '../../mocks/mock-cart-api';
import { MockCatalogApi } from '../../mocks/mock-catalog-api';
import { MockCheckoutApi } from '../../mocks/mock-checkout-api';
import { MockOrdersApi } from '../../mocks/mock-orders-api';
import { ORDERS_API } from '../features/account/data-access/orders-api';
import { AUTH_API } from '../features/auth/data-access/auth-api';
import { CART_API } from '../features/cart/data-access/cart-api';
import { CATALOG_API } from '../features/catalog/data-access/catalog-api';
import { CHECKOUT_API, PAYMENT_SIMULATOR } from '../features/checkout/checkout-api';

export const storefrontAdapterProviders: Provider[] = [
  { provide: CATALOG_API, useExisting: MockCatalogApi },
  { provide: CHECKOUT_API, useExisting: MockCheckoutApi },
  { provide: PAYMENT_SIMULATOR, useExisting: MockCheckoutApi },
  { provide: CART_API, useExisting: MockCartApi },
  { provide: ORDERS_API, useExisting: MockOrdersApi },
  { provide: AUTH_API, useExisting: MockAuthApi },
];
