// E2E build (angular.json configuration "e2e"): replaces storefront-adapters.ts so Playwright runs
// the auth, catalog, cart, checkout, orders and account slices on mocks (see api-config.e2e.ts).
import { Provider } from '@angular/core';
import { DEMO_VERIFICATION_CODE } from '../../mocks/accounts';
import { MockAccountApi } from '../../mocks/mock-account-api';
import { MockAuthApi } from '../../mocks/mock-auth-api';
import { MockCartApi } from '../../mocks/mock-cart-api';
import { MockCatalogApi } from '../../mocks/mock-catalog-api';
import { MockCheckoutApi } from '../../mocks/mock-checkout-api';
import { HttpOrdersApi } from '../features/account/data-access/orders-api';
import { apiConfig } from './api-config';
import { MockOrdersApi } from '../../mocks/mock-orders-api';
import { StorefrontBindings, toStorefrontProviders } from './storefront-adapter-tokens';

export const demoVerificationCode: string | null = DEMO_VERIFICATION_CODE;

const bindings: StorefrontBindings = {
  CATALOG_API: { useExisting: MockCatalogApi },
  CHECKOUT_API: { useExisting: MockCheckoutApi },
  PAYMENT_SIMULATOR: { useExisting: MockCheckoutApi },
  CART_API: { useExisting: MockCartApi },
  // Slice 9 specs (`returnsMode: http`) answer /api/orders themselves: `canReturn` / `return` are the server's.
  ORDERS_API: { useExisting: apiConfig.returnsMode === 'http' ? HttpOrdersApi : MockOrdersApi },
  AUTH_API: { useExisting: MockAuthApi },
  ACCOUNT_API: { useExisting: MockAccountApi },
};

export const storefrontAdapterProviders: Provider[] = toStorefrontProviders(bindings);
