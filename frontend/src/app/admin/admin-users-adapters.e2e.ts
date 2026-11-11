// E2E build (angular.json configuration "e2e"): replaces admin-users-adapters.ts. The earlier mock
// back office stays the default; a spec switches to the HTTP adapters with
// `localStorage['n2f.e2e.adminUsersMode'] = 'http'` and answers `/api/admin/**` itself.
import { inject, Provider, Type } from '@angular/core';
import { API_CONFIG } from '../core/api-config';
import {
  MockAdminCustomerAccountsApi,
  MockAdminStaffApi,
} from '../../mocks/admin/mock-admin-users';
import { HttpAdminCustomerAccountsApi } from './data-access/customers-api';
import { HttpAdminStaffApi } from './data-access/staff-api';
import { AdminUsersBindings, toAdminUsersProviders } from './admin-users-adapter-tokens';

function pick(mock: Type<unknown>, http: Type<unknown>) {
  return {
    useFactory: () => (inject(API_CONFIG).adminUsersMode === 'http' ? inject(http) : inject(mock)),
  };
}

const bindings: AdminUsersBindings = {
  ADMIN_CUSTOMER_ACCOUNTS_API: pick(MockAdminCustomerAccountsApi, HttpAdminCustomerAccountsApi),
  ADMIN_STAFF_API: pick(MockAdminStaffApi, HttpAdminStaffApi),
};

export const adminUsersAdapterProviders: Provider[] = [
  HttpAdminCustomerAccountsApi,
  HttpAdminStaffApi,
  ...toAdminUsersProviders(bindings),
];
