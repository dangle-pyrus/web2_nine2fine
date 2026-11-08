/**
 * Port and HTTP adapter of the admin orders contract (Slice 4). Read side (lát 4.1-4.2) and the
 * writes of lát 4.3-4.4 (call-attempts, confirm, ship, deliver, cancel, returned-stock); the
 * cancel-request decisions and notes arrive with lát 4.5-4.6. Cookie `n2f_asid` and
 * `X-Requested-With: n2f` come from `core/api-interceptor.ts`; a `401` there already sends the
 * user to `/admin/login?returnUrl`.
 */
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { catchError, Observable, throwError } from 'rxjs';
import { API_CONFIG } from '../../core/api-config';
import { ApiErrorCode, readApiError } from '../../core/api-error';
import { defaultMessage, toParams } from './http-support';
import { AdminApiError, AdminErrorCode } from './models';
import type {
  DeskCommand,
  DeskOrder,
  DeskOrderCounts,
  DeskOrderFilter,
  DeskOrderPage,
  DeskOrderQuery,
  DeskOrderStatus,
} from './order-desk-models';

export interface AdminOrderDeskApi {
  list(query: DeskOrderQuery): Observable<DeskOrderPage>;
  /** Count per tab for the same filters (`q`, `payment`, `from`, `to`) as the list. */
  counts(filter: DeskOrderFilter): Observable<DeskOrderCounts>;
  /** `orderCode` may be lower case and carry a `#`. */
  get(orderCode: string): Observable<DeskOrder>;
  /**
   * Runs one action and returns the order after it. `idempotencyKey` is made once per intention
   * and reused when the same command is retried (BR-ADM-15); a changed command needs a new key.
   * Errors are `DeskApiError`.
   */
  perform(orderCode: string, command: DeskCommand, idempotencyKey: string): Observable<DeskOrder>;
}

export const ADMIN_ORDER_DESK_API = new InjectionToken<AdminOrderDeskApi>('ADMIN_ORDER_DESK_API');

/** An admin error that may carry what the server saw (`order-state-changed`: `order`). */
export class DeskApiError extends AdminApiError {
  constructor(
    code: AdminErrorCode,
    message: string,
    fields: Record<string, string> = {},
    retryAfterSeconds?: number,
    /** Current order of an `order-state-changed` answer (BR-ADM-14). */
    readonly order?: DeskOrder,
    readonly currentStatus?: DeskOrderStatus,
  ) {
    super(code, message, fields, retryAfterSeconds);
  }
}

/** BR-ADM-41: what a `429 rate-limited` says on screen (the wait is `retryAfterSeconds`). */
export function rateLimitedText(seconds: number): string {
  return `Bạn thao tác quá nhanh. Chờ ${seconds} giây rồi thử lại.`;
}

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
export function deskError(error: unknown): DeskApiError {
  const detail = readApiError(error);
  const code = (
    detail.code === 'idempotency-conflict'
      ? 'conflict'
      : KNOWN.includes(detail.code)
        ? detail.code
        : 'unavailable'
  ) as AdminErrorCode;
  const fields = detail.field ? { [detail.field]: detail.message } : {};
  const wait = detail.retryAfterSeconds;
  const raw = (error as { error?: { error?: Record<string, unknown> } } | null)?.error?.error;
  const order = raw?.['order'] as DeskOrder | undefined;
  const status = raw?.['currentStatus'];
  return new DeskApiError(
    code,
    code === 'rate-limited' && wait
      ? rateLimitedText(wait)
      : detail.message || defaultMessage(code),
    fields,
    detail.retryAfterSeconds,
    order && typeof order === 'object' && typeof order.id === 'string' ? order : undefined,
    typeof status === 'string' ? (status as DeskOrderStatus) : undefined,
  );
}

function failDesk<T>() {
  return catchError<T, Observable<never>>((error: unknown) => throwError(() => deskError(error)));
}

const WRITE_PATHS = {
  'call-attempt': 'call-attempts',
  confirm: 'confirm',
  ship: 'ship',
  deliver: 'deliver',
  cancel: 'cancel',
  'returned-stock': 'returned-stock',
  'approve-cancel': 'cancel-request/approve',
  'reject-cancel': 'cancel-request/reject',
  'add-note': 'notes',
} as const;

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

  perform(orderCode: string, command: DeskCommand, idempotencyKey: string): Observable<DeskOrder> {
    const { action, ...body } = command;
    return this.http
      .post<DeskOrder>(
        `${this.base}/${encodeURIComponent(orderCode)}/${WRITE_PATHS[action]}`,
        body,
        {
          headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }),
        },
      )
      .pipe(failDesk());
  }
}
