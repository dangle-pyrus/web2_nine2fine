import { ExistingProvider, Provider, Type, ValueProvider } from '@angular/core';
import { ACCOUNT_API } from '../features/account/data-access/account-api';
import { ORDERS_API } from '../features/account/data-access/orders-api';
import { AUTH_API } from '../features/auth/data-access/auth-api';
import { CART_API } from '../features/cart/data-access/cart-api';
import { CATALOG_API } from '../features/catalog/data-access/catalog-api';
import { CHECKOUT_API, PAYMENT_SIMULATOR } from '../features/checkout/checkout-api';

/** Tokens bound by `storefront-adapters.ts` (HTTP) and its e2e twin (mocks). */
export const STOREFRONT_TOKENS = {
  CATALOG_API,
  CHECKOUT_API,
  PAYMENT_SIMULATOR,
  CART_API,
  ORDERS_API,
  AUTH_API,
  ACCOUNT_API,
};
export type StorefrontToken = keyof typeof STOREFRONT_TOKENS;

/** What each token resolves to. Typed as a full record, so a file that forgets one fails to build. */
export type StorefrontBindings = Record<
  StorefrontToken,
  { useExisting: Type<unknown> } | { useValue: unknown }
>;

export function toStorefrontProviders(bindings: StorefrontBindings): Provider[] {
  return (Object.keys(STOREFRONT_TOKENS) as StorefrontToken[]).map((name) => {
    const binding = bindings[name];
    const provide = STOREFRONT_TOKENS[name];
    return 'useExisting' in binding
      ? ({ provide, useExisting: binding.useExisting } satisfies ExistingProvider)
      : ({ provide, useValue: binding.useValue } satisfies ValueProvider);
  });
}
