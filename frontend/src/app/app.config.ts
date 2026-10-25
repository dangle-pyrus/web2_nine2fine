import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
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
import { CATALOG_API, HttpCatalogApi } from './features/catalog/data-access/catalog-api';
import { MockCatalogApi } from '../mocks/mock-catalog-api';
import { CHECKOUT_API, HttpCheckoutApi, PAYMENT_SIMULATOR } from './features/checkout/checkout-api';
import { MockCheckoutApi } from '../mocks/mock-checkout-api';
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
import { MockPersistence } from '../mocks/mock-persistence';
import { AuthSession } from './features/auth/auth-session';
import { AuthUser } from './features/auth/data-access/auth-api';
import { CheckoutSession } from './features/checkout/checkout-session';
import { OrderReceipt } from './features/checkout/checkout-api';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(),
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
    // Mock mode only: restore the demo session and last receipt after F5 (a real backend restores
    // the session from its cookie via GET /me instead).
    provideAppInitializer(() => {
      if (inject(API_CONFIG).mode !== 'mock') return;
      const persistence = inject(MockPersistence);
      const session = inject(AuthSession);
      const checkout = inject(CheckoutSession);
      const user = persistence.register<AuthUser | null>('session', () => session.user());
      if (user) session.signIn(user);
      const receipt = persistence.register<OrderReceipt | null>('receipt', () =>
        checkout.lastReceipt(),
      );
      if (receipt) checkout.lastReceipt.set(receipt);
    }),
    {
      provide: CATALOG_API,
      useFactory: () =>
        inject(API_CONFIG).mode === 'mock' ? inject(MockCatalogApi) : inject(HttpCatalogApi),
    },
    {
      provide: CHECKOUT_API,
      useFactory: () =>
        inject(API_CONFIG).mode === 'mock' ? inject(MockCheckoutApi) : inject(HttpCheckoutApi),
    },
    {
      provide: PAYMENT_SIMULATOR,
      useFactory: () => (inject(API_CONFIG).mode === 'mock' ? inject(MockCheckoutApi) : null),
    },
    {
      provide: AUTH_API,
      useFactory: () =>
        inject(API_CONFIG).mode === 'mock' ? inject(MockAuthApi) : inject(HttpAuthApi),
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
