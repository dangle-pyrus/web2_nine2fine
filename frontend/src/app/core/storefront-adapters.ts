import { Provider } from '@angular/core';
import { HttpOrdersApi } from '../features/account/data-access/orders-api';
import { HttpAuthApi } from '../features/auth/data-access/auth-api';
import { HttpCartApi } from '../features/cart/data-access/cart-api';
import { HttpCatalogApi } from '../features/catalog/data-access/catalog-api';
import { HttpCheckoutApi } from '../features/checkout/checkout-api';
import { StorefrontBindings, toStorefrontProviders } from './storefront-adapter-tokens';

/** Code the mock sign-in accepts, shown as a hint. `null` in the normal build (real emails). */
export const demoVerificationCode: string | null = null;

const bindings: StorefrontBindings = {
  CATALOG_API: { useExisting: HttpCatalogApi },
  CHECKOUT_API: { useExisting: HttpCheckoutApi },
  PAYMENT_SIMULATOR: { useValue: null },
  CART_API: { useExisting: HttpCartApi },
  ORDERS_API: { useExisting: HttpOrdersApi },
  AUTH_API: { useExisting: HttpAuthApi },
};

/**
 * Adapters of the slices that talk to the real backend (auth, catalog, cart, checkout, orders).
 * The normal build binds only the HTTP adapters, so the mock adapters and their demo data stay out
 * of the initial chunk. The e2e build (angular.json "e2e") replaces this file with
 * `storefront-adapters.e2e.ts`, which binds the mocks. Both files list the same tokens: the
 * `StorefrontBindings` record type makes the compiler enforce it.
 */
export const storefrontAdapterProviders: Provider[] = toStorefrontProviders(bindings);
