import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideIcons } from '@ng-icons/core';
import {
  reiconArrowLeft,
  reiconArrowRight,
  reiconArrowUpRight,
  reiconBag,
  reiconBasket,
  reiconBox,
  reiconCartShop,
  reiconCheck,
  reiconCheckCircle,
  reiconChevronDown,
  reiconChevronLeft,
  reiconChevronRight,
  reiconCopy,
  reiconCopySuccess,
  reiconDollarSquare,
  reiconEye,
  reiconEyeOff,
  reiconFilter,
  reiconHeart,
  reiconHistory,
  reiconListCheck,
  reiconLogout,
  reiconMenu,
  reiconMinus,
  reiconPen,
  reiconPin,
  reiconPlus,
  reiconRefresh,
  reiconRuler,
  reiconSearch,
  reiconShieldCheck,
  reiconStar,
  reiconTicket,
  reiconTrash3,
  reiconTruck,
  reiconTruckFast,
  reiconUser,
  reiconX,
  reiconXCircle,
} from '@ng-icons/reicon';
// Filled heart marks a saved product.
import { reiconHeartFill } from '@ng-icons/reicon/fill';
import { routes } from './app.routes';
import { API_CONFIG, apiConfig } from './core/api-config';
import { apiInterceptor } from './core/api-interceptor';
import { CATALOG_API, HttpCatalogApi } from './features/catalog/data-access/catalog-api';
import { MockCatalogApi } from '../mocks/mock-catalog-api';
import { CHECKOUT_API, HttpCheckoutApi, PAYMENT_SIMULATOR } from './features/checkout/checkout-api';
import { MockCheckoutApi } from '../mocks/mock-checkout-api';
import { CART_API, HttpCartApi } from './features/cart/data-access/cart-api';
import { MockCartApi } from '../mocks/mock-cart-api';
import { HttpOrdersApi, ORDERS_API } from './features/account/data-access/orders-api';
import { MockOrdersApi } from '../mocks/mock-orders-api';
import { AUTH_API, HttpAuthApi } from './features/auth/data-access/auth-api';
import { MockAuthApi } from '../mocks/mock-auth-api';
import { ACCOUNT_API, HttpAccountApi } from './features/account/data-access/account-api';
import { MockAccountApi } from '../mocks/mock-account-api';
import {
  applyStoreSettings,
  HttpStoreSettingsApi,
  STORE_SETTINGS_API,
} from './core/store-settings';
import { MockStoreSettingsApi } from '../mocks/mock-store-settings-api';
import { HttpNewsletterApi, NEWSLETTER_API } from './features/home/newsletter-api';
import { MockNewsletterApi } from '../mocks/mock-newsletter-api';
import { AuthSession } from './features/auth/auth-session';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([apiInterceptor])),
    provideRouter(
      routes,
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
    ),
    provideIcons({
      reiconHeartFill,
      reiconArrowLeft,
      reiconArrowRight,
      reiconArrowUpRight,
      reiconBag,
      reiconBasket,
      reiconBox,
      reiconCartShop,
      reiconCheck,
      reiconCheckCircle,
      reiconChevronDown,
      reiconChevronLeft,
      reiconChevronRight,
      reiconCopy,
      reiconCopySuccess,
      reiconDollarSquare,
      reiconEye,
      reiconEyeOff,
      reiconFilter,
      reiconHeart,
      reiconHistory,
      reiconListCheck,
      reiconLogout,
      reiconMenu,
      reiconMinus,
      reiconPen,
      reiconPin,
      reiconPlus,
      reiconRefresh,
      reiconRuler,
      reiconSearch,
      reiconShieldCheck,
      reiconStar,
      reiconTicket,
      reiconTrash3,
      reiconTruck,
      reiconTruckFast,
      reiconUser,
      reiconX,
      reiconXCircle,
    }),
    { provide: API_CONFIG, useValue: apiConfig },
    // Signed-in shopper: asked from the backend cookie (`GET /auth/me`), or from the mock session.
    provideAppInitializer(() => inject(AuthSession).restore()),
    {
      provide: CATALOG_API,
      useFactory: () =>
        inject(API_CONFIG).catalogMode === 'mock' ? inject(MockCatalogApi) : inject(HttpCatalogApi),
    },
    {
      provide: CHECKOUT_API,
      useFactory: () =>
        inject(API_CONFIG).checkoutMode === 'mock'
          ? inject(MockCheckoutApi)
          : inject(HttpCheckoutApi),
    },
    {
      provide: PAYMENT_SIMULATOR,
      useFactory: () =>
        inject(API_CONFIG).checkoutMode === 'mock' ? inject(MockCheckoutApi) : null,
    },
    {
      provide: CART_API,
      useFactory: () =>
        inject(API_CONFIG).checkoutMode === 'mock' ? inject(MockCartApi) : inject(HttpCartApi),
    },
    {
      provide: ORDERS_API,
      useFactory: () =>
        inject(API_CONFIG).checkoutMode === 'mock' ? inject(MockOrdersApi) : inject(HttpOrdersApi),
    },
    {
      provide: AUTH_API,
      useFactory: () =>
        inject(API_CONFIG).authMode === 'mock' ? inject(MockAuthApi) : inject(HttpAuthApi),
    },
    // Home page content is provided by the lazy home page (`HOME_CONTENT_API`).
    {
      provide: STORE_SETTINGS_API,
      useFactory: () =>
        inject(API_CONFIG).mode === 'mock'
          ? inject(MockStoreSettingsApi)
          : inject(HttpStoreSettingsApi),
    },
    // Store settings (fees, policies, business info): the built-in values show at once
    // and are replaced when the request answers; a failed request keeps them.
    provideAppInitializer(() => {
      inject(STORE_SETTINGS_API)
        .getStoreSettings()
        .subscribe({ next: applyStoreSettings, error: () => undefined });
    }),
    {
      provide: NEWSLETTER_API,
      useFactory: () =>
        inject(API_CONFIG).mode === 'mock' ? inject(MockNewsletterApi) : inject(HttpNewsletterApi),
    },
    {
      provide: ACCOUNT_API,
      useFactory: () =>
        inject(API_CONFIG).mode === 'mock' ? inject(MockAccountApi) : inject(HttpAccountApi),
    },
  ],
};
