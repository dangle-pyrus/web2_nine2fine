import { Provider } from '@angular/core';
import { HttpAdminOrderDeskApi } from './data-access/order-desk-api';
import { AdminOrderBindings, toAdminOrderProviders } from './admin-order-adapter-tokens';

const bindings: AdminOrderBindings = {
  ADMIN_ORDER_DESK_API: { useExisting: HttpAdminOrderDeskApi },
};

/**
 * Adapter of the admin orders slice (Slice 4). The normal build binds only the HTTP adapter, so
 * the contract mock and its fixtures stay out of the admin chunk. The e2e build (angular.json
 * "e2e") replaces this file with `admin-order-adapters.e2e.ts`; both bind the same tokens.
 */
export const adminOrderAdapterProviders: Provider[] = toAdminOrderProviders(bindings);
