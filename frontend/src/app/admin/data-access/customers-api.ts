/**
 * Port and HTTP adapter of the admin customers contract (Slice 7, tag `admin-customers`). Cookie
 * `n2f_asid` and `X-Requested-With: n2f` come from `core/api-interceptor.ts`; a `401` there already
 * sends the user to `/admin/login`. The HTTP adapter never imports a mock; the e2e build binds the
 * mock in `admin-users-adapters.e2e.ts`.
 */
import { HttpClient } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { adminBase, adminErrors, toParams } from './http-support';
import type {
  CustomerDetail,
  CustomerListQuery,
  CustomerOrdersPage,
  CustomerPage,
} from './users-models';

export interface AdminCustomerAccountsApi {
  list(query: CustomerListQuery): Observable<CustomerPage>;
  get(id: string): Observable<CustomerDetail>;
  /** Every order of the customer, paged; works for staff too (BR-USR-10). */
  orders(id: string, page: number, limit: number): Observable<CustomerOrdersPage>;
  /** Admin only. `reason` 5..250 characters. Returns the customer after the change. */
  lock(id: string, reason: string): Observable<CustomerDetail>;
  /** Admin only. `reason` optional, at most 250 characters. */
  unlock(id: string, reason?: string): Observable<CustomerDetail>;
}

export const ADMIN_CUSTOMER_ACCOUNTS_API = new InjectionToken<AdminCustomerAccountsApi>(
  'ADMIN_CUSTOMER_ACCOUNTS_API',
);

@Injectable()
export class HttpAdminCustomerAccountsApi implements AdminCustomerAccountsApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${adminBase()}/customers`;

  list(query: CustomerListQuery) {
    return this.http.get<CustomerPage>(this.base, { params: toParams(query) }).pipe(adminErrors());
  }

  get(id: string) {
    return this.http
      .get<CustomerDetail>(`${this.base}/${encodeURIComponent(id)}`)
      .pipe(adminErrors());
  }

  orders(id: string, page: number, limit: number) {
    return this.http
      .get<CustomerOrdersPage>(`${this.base}/${encodeURIComponent(id)}/orders`, {
        params: toParams({ page, limit }),
      })
      .pipe(adminErrors());
  }

  lock(id: string, reason: string) {
    return this.http
      .post<CustomerDetail>(`${this.base}/${encodeURIComponent(id)}/lock`, { reason })
      .pipe(adminErrors());
  }

  unlock(id: string, reason?: string) {
    return this.http
      .post<CustomerDetail>(
        `${this.base}/${encodeURIComponent(id)}/unlock`,
        reason ? { reason } : {},
      )
      .pipe(adminErrors());
  }
}
