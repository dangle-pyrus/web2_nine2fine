/**
 * Port and HTTP adapter of the admin orders contract (Slice 4, lát 4.1-4.2: read side). The
 * mutating endpoints (call-attempts, confirm, ship, deliver, cancel, returned-stock, cancel-request
 * decisions, notes) arrive with lát 4.3-4.6. Cookie `n2f_asid` and `X-Requested-With: n2f` come
 * from `core/api-interceptor.ts`; a `401` there already sends the user to `/admin/login?returnUrl`.
 */
import { HttpClient } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { catchError, Observable, throwError } from 'rxjs';
import { API_CONFIG } from '../../core/api-config';
import { ApiErrorCode, readApiError } from '../../core/api-error';
import { defaultMessage, toParams } from './http-support';
import { AdminApiError, AdminErrorCode } from './models';
import type {
  DeskOrder,
  DeskOrderCounts,
  DeskOrderFilter,
  DeskOrderPage,
  DeskOrderQuery,
} from './order-desk-models';

export interface AdminOrderDeskApi {
  list(query: DeskOrderQuery): Observable<DeskOrderPage>;
  /** Count per tab for the same filters (`q`, `payment`, `from`, `to`) as the list. */
  counts(filter: DeskOrderFilter): Observable<DeskOrderCounts>;
  /** `orderCode` may be lower case and carry a `#`. */
  get(orderCode: string): Observable<DeskOrder>;
}

export const ADMIN_ORDER_DESK_API = new InjectionToken<AdminOrderDeskApi>('ADMIN_ORDER_DESK_API');

const KNOWN: readonly ApiErrorCode[] = [
  'unauthenticated',
  'forbidden',
  'not-found',
  'validation',
  'rate-limited',
  'origin-not-allowed',
  'invalid-transition',
  'order-state-changed',
  'condition-not-met',
  'unavailable',
];

/** Reads the contract error by `error.code` only (BR-ADM-34); anything else counts as unavailable. */
export function deskError(error: unknown): AdminApiError {
  const detail = readApiError(error);
  const code = (KNOWN.includes(detail.code) ? detail.code : 'unavailable') as AdminErrorCode;
  const fields = detail.field ? { [detail.field]: detail.message } : {};
  return new AdminApiError(
    code,
    detail.message || defaultMessage(code),
    fields,
    detail.retryAfterSeconds,
  );
}

function failDesk<T>() {
  return catchError<T, Observable<never>>((error: unknown) => throwError(() => deskError(error)));
}

@Injectable({ providedIn: 'root' })
export class HttpAdminOrderDeskApi implements AdminOrderDeskApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_CONFIG).baseUrl}/admin/orders`;

  list(query: DeskOrderQuery): Observable<DeskOrderPage> {
    const { view, ...rest } = query;
    return this.http
      .get<DeskOrderPage>(this.base, {
        params: toParams({ ...rest, view: view === 'all' ? '' : view }),
      })
      .pipe(failDesk());
  }

  counts(filter: DeskOrderFilter): Observable<DeskOrderCounts> {
    return this.http
      .get<DeskOrderCounts>(`${this.base}/counts`, { params: toParams(filter) })
      .pipe(failDesk());
  }

  get(orderCode: string): Observable<DeskOrder> {
    return this.http
      .get<DeskOrder>(`${this.base}/${encodeURIComponent(orderCode)}`)
      .pipe(failDesk());
  }
}
