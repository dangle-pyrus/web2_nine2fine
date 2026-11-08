// E2E build (angular.json configuration "e2e"): replaces admin-order-adapters.ts so Playwright
// runs the order desk on the contract mock (see `adminOrdersMode: 'contract-mock'`).
import { Provider } from '@angular/core';
import { MockAdminOrderDeskApi } from '../../mocks/admin/mock-order-desk-api';
import { AdminOrderBindings, toAdminOrderProviders } from './admin-order-adapter-tokens';

const bindings: AdminOrderBindings = {
  ADMIN_ORDER_DESK_API: { useExisting: MockAdminOrderDeskApi },
};

export const adminOrderAdapterProviders: Provider[] = toAdminOrderProviders(bindings);
