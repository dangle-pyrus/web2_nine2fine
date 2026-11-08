import { ExistingProvider, Provider, Type, ValueProvider } from '@angular/core';
import { ADMIN_ORDER_DESK_API } from './data-access/order-desk-api';

/** Tokens bound by `admin-order-adapters.ts` (HTTP) and its e2e twin (contract mock). */
export const ADMIN_ORDER_TOKENS = { ADMIN_ORDER_DESK_API };
export type AdminOrderToken = keyof typeof ADMIN_ORDER_TOKENS;

/** Full record: a file that forgets a token fails to build, so both builds bind the same set. */
export type AdminOrderBindings = Record<
  AdminOrderToken,
  { useExisting: Type<unknown> } | { useValue: unknown }
>;

export function toAdminOrderProviders(bindings: AdminOrderBindings): Provider[] {
  return (Object.keys(ADMIN_ORDER_TOKENS) as AdminOrderToken[]).map((name) => {
    const binding = bindings[name];
    const provide = ADMIN_ORDER_TOKENS[name];
    return 'useExisting' in binding
      ? ({ provide, useExisting: binding.useExisting } satisfies ExistingProvider)
      : ({ provide, useValue: binding.useValue } satisfies ValueProvider);
  });
}
