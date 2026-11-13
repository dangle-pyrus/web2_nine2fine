// E2E build (angular.json configuration "e2e"): replaces storefront-adapters.ts so Playwright runs
// the auth, catalog, cart, checkout, orders and account slices on mocks (see api-config.e2e.ts).
import { Provider } from '@angular/core';
import { DEMO_VERIFICATION_CODE } from '../../mocks/accounts';
import { MockAccountApi } from '../../mocks/mock-account-api';
import { MockAuthApi } from '../../mocks/mock-auth-api';
import { MockCartApi } from '../../mocks/mock-cart-api';
import { MockCatalogApi } from '../../mocks/mock-catalog-api';
import { MockCheckoutApi } from '../../mocks/mock-checkout-api';
import { HttpCatalogApi } from '../features/catalog/data-access/catalog-api';
import { HttpOrdersApi } from '../features/account/data-access/orders-api';
import { apiConfig } from './api-config';
import { MockOrdersApi } from '../../mocks/mock-orders-api';
import { MockRecommendationsApi } from '../../mocks/mock-recommendations-api';
import { MockReviewsApi } from '../../mocks/mock-reviews-api';
import { MockWishlistApi } from '../../mocks/mock-wishlist-api';
import { HttpRecommendationsApi } from '../features/catalog/data-access/recommendations-api';
import { HttpCheckoutApi } from '../features/checkout/checkout-api';
import { HttpReviewsApi } from '../features/product/data-access/reviews-api';
import { HttpWishlistApi } from '../features/wishlist/data-access/wishlist-api';
import { StorefrontBindings, toStorefrontProviders } from './storefront-adapter-tokens';

export const demoVerificationCode: string | null = DEMO_VERIFICATION_CODE;

function onHttp(flag: string): boolean {
  try {
    return localStorage.getItem(`n2f.e2e.${flag}`) === 'http';
  } catch {
    return false;
  }
}

const bindings: StorefrontBindings = {
  // The promotions / wishlist page specs read products from /api (sale fields) with this flag.
  CATALOG_API: { useExisting: onHttp('catalogHttp') ? HttpCatalogApi : MockCatalogApi },
  // The guest return spec (Tra cứu đơn on /api, grant cookie) sets localStorage['n2f.e2e.guestLookup'] = 'http'.
  CHECKOUT_API: { useExisting: onHttp('guestLookup') ? HttpCheckoutApi : MockCheckoutApi },
  PAYMENT_SIMULATOR: { useExisting: MockCheckoutApi },
  CART_API: { useExisting: MockCartApi },
  // Slice 9 specs (`returnsMode: http`) answer /api/orders themselves: `canReturn` / `return` are the server's.
  ORDERS_API: { useExisting: apiConfig.returnsMode === 'http' ? HttpOrdersApi : MockOrdersApi },
  AUTH_API: { useExisting: MockAuthApi },
  ACCOUNT_API: { useExisting: MockAccountApi },
  // Slice 10 specs pick the HTTP adapters with localStorage['n2f.e2e.<flag>'] and answer /api themselves.
  REVIEWS_API: { useExisting: apiConfig.reviewsMode === 'http' ? HttpReviewsApi : MockReviewsApi },
  WISHLIST_API: {
    useExisting: apiConfig.wishlistMode === 'http' ? HttpWishlistApi : MockWishlistApi,
  },
  RECOMMENDATIONS_API: {
    useExisting:
      apiConfig.recommendationsMode === 'http' ? HttpRecommendationsApi : MockRecommendationsApi,
  },
};

export const storefrontAdapterProviders: Provider[] = toStorefrontProviders(bindings);
