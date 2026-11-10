import { ExistingProvider, Provider, Type } from '@angular/core';
import {
  ADMIN_INVENTORY_API,
  ADMIN_PRODUCTS_API,
  ADMIN_PROMOTIONS_API,
} from './data-access/admin-apis';

/** Tokens bound by `admin-catalog-adapters.ts` (HTTP) and its e2e twin (mock or HTTP). */
export const ADMIN_CATALOG_TOKENS = {
  ADMIN_PRODUCTS_API,
  ADMIN_INVENTORY_API,
  ADMIN_PROMOTIONS_API,
};
export type AdminCatalogToken = keyof typeof ADMIN_CATALOG_TOKENS;

/** Full record: a file that forgets a token fails to build, so both builds bind the same set. */
export type AdminCatalogBindings = Record<
  AdminCatalogToken,
  { useExisting: Type<unknown> } | { useFactory: () => unknown }
>;

export function toAdminCatalogProviders(bindings: AdminCatalogBindings): Provider[] {
  return (Object.keys(ADMIN_CATALOG_TOKENS) as AdminCatalogToken[]).map((name) => {
    const binding = bindings[name];
    const provide = ADMIN_CATALOG_TOKENS[name];
    return 'useExisting' in binding
      ? ({ provide, useExisting: binding.useExisting } satisfies ExistingProvider)
      : ({ provide, useFactory: binding.useFactory } satisfies Provider);
  });
}
