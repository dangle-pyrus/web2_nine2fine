import { ExistingProvider, Provider, Type } from '@angular/core';
import { ADMIN_CUSTOMER_ACCOUNTS_API } from './data-access/customers-api';
import { ADMIN_STAFF_API } from './data-access/staff-api';

/** Tokens bound by `admin-users-adapters.ts` (HTTP) and its e2e twin (mock or HTTP). */
export const ADMIN_USERS_TOKENS = {
  ADMIN_CUSTOMER_ACCOUNTS_API,
  ADMIN_STAFF_API,
};
export type AdminUsersToken = keyof typeof ADMIN_USERS_TOKENS;

/** Full record: a file that forgets a token fails to build, so both builds bind the same set. */
export type AdminUsersBindings = Record<
  AdminUsersToken,
  { useExisting: Type<unknown> } | { useFactory: () => unknown }
>;

export function toAdminUsersProviders(bindings: AdminUsersBindings): Provider[] {
  return (Object.keys(ADMIN_USERS_TOKENS) as AdminUsersToken[]).map((name) => {
    const binding = bindings[name];
    const provide = ADMIN_USERS_TOKENS[name];
    return 'useExisting' in binding
      ? ({ provide, useExisting: binding.useExisting } satisfies ExistingProvider)
      : ({ provide, useFactory: binding.useFactory } satisfies Provider);
  });
}
