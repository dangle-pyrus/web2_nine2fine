import { Provider } from '@angular/core';
import { HttpAdminCustomerAccountsApi } from './data-access/customers-api';
import { HttpAdminStaffApi } from './data-access/staff-api';
import { AdminUsersBindings, toAdminUsersProviders } from './admin-users-adapter-tokens';

const bindings: AdminUsersBindings = {
  ADMIN_CUSTOMER_ACCOUNTS_API: { useExisting: HttpAdminCustomerAccountsApi },
  ADMIN_STAFF_API: { useExisting: HttpAdminStaffApi },
};

/**
 * Adapter of the admin customers / staff slice (Slice 7). The normal build binds only the HTTP
 * adapters and never imports the mock. The e2e build (angular.json "e2e") replaces this file with
 * `admin-users-adapters.e2e.ts`; both bind the same tokens.
 */
export const adminUsersAdapterProviders: Provider[] = [
  HttpAdminCustomerAccountsApi,
  HttpAdminStaffApi,
  ...toAdminUsersProviders(bindings),
];
