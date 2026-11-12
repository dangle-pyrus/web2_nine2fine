/**
 * Ports and HTTP adapters of Slice 8 (tags `admin-dashboard`, `admin-reports`,
 * `admin-store-settings`, `admin-audit`). Cookie `n2f_asid` and `X-Requested-With: n2f` come from
 * `core/api-interceptor.ts`; a `401` there already sends the user to `/admin/login`. The adapters
 * never import a mock: with `adminInsightsMode: 'mock'` these screens are not routed at all and the
 * earlier mock back office keeps its own ports (`admin-apis.ts`).
 */
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { catchError, from, map, Observable, switchMap, throwError } from 'rxjs';
import { adminBase, adminErrors, toParams } from './http-support';
import type {
  AdminStoreSettings,
  AuditPage,
  AuditQuery,
  Dashboard,
  InsightsRange,
  ReportCsv,
  SalesReport,
  SalesReportQuery,
  StoreSettingsInput,
} from './insights-models';

export interface InsightsDashboardApi {
  get(range: InsightsRange): Observable<Dashboard>;
}

export interface InsightsReportsApi {
  sales(query: SalesReportQuery): Observable<SalesReport>;
  /** Admin only; same `from` / `to` rules as `sales`. */
  exportCsv(query: Pick<SalesReportQuery, 'from' | 'to'>): Observable<ReportCsv>;
}

export interface StoreSettingsAdminApi {
  get(): Observable<AdminStoreSettings>;
  /** `409 version-conflict` when `updatedAt` is stale; `422` carries every field error. */
  save(input: StoreSettingsInput): Observable<AdminStoreSettings>;
}

export interface AuditLogApi {
  list(query: AuditQuery): Observable<AuditPage>;
}

export const ADMIN_INSIGHTS_DASHBOARD_API = new InjectionToken<InsightsDashboardApi>(
  'ADMIN_INSIGHTS_DASHBOARD_API',
);
export const ADMIN_INSIGHTS_REPORTS_API = new InjectionToken<InsightsReportsApi>(
  'ADMIN_INSIGHTS_REPORTS_API',
);
export const ADMIN_STORE_SETTINGS_API = new InjectionToken<StoreSettingsAdminApi>(
  'ADMIN_STORE_SETTINGS_API',
);
export const ADMIN_AUDIT_LOG_API = new InjectionToken<AuditLogApi>('ADMIN_AUDIT_LOG_API');

@Injectable()
export class HttpInsightsDashboardApi implements InsightsDashboardApi {
  private readonly http = inject(HttpClient);
  private readonly base = adminBase();

  get(range: InsightsRange) {
    return this.http
      .get<Dashboard>(`${this.base}/dashboard`, { params: toParams({ range }) })
      .pipe(adminErrors());
  }
}

/** Name the server sends in `Content-Disposition`, if it is a plain `.csv` file name. */
function csvName(disposition: string | null, fallback: string): string {
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition ?? '');
  const name = match ? decodeURIComponent(match[1]) : '';
  return /^[\w.-]+\.csv$/.test(name) ? name : fallback;
}

@Injectable()
export class HttpInsightsReportsApi implements InsightsReportsApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${adminBase()}/reports/sales`;

  sales(query: SalesReportQuery) {
    return this.http
      .get<SalesReport>(this.base, {
        params: toParams({
          from: query.from,
          to: query.to,
          sort: query.sort === 'units' ? '' : query.sort,
        }),
      })
      .pipe(adminErrors());
  }

  exportCsv(query: Pick<SalesReportQuery, 'from' | 'to'>) {
    return this.http
      .get(`${this.base}/export`, {
        params: toParams(query),
        responseType: 'blob',
        observe: 'response',
      })
      .pipe(
        map((response) => ({
          blob: response.body as Blob,
          filename: csvName(
            response.headers.get('Content-Disposition'),
            `nine2fine-bao-cao-${query.from}_${query.to}.csv`,
          ),
        })),
        // Errors of a blob request arrive as a Blob: read it back so the JSON `error` is mapped.
        catchError((error: unknown) => parseBlobError(error)),
        adminErrors(),
      );
  }
}

/** Turns an error whose body is a `Blob` (responseType 'blob') into one with the parsed JSON. */
function parseBlobError(error: unknown): Observable<never> {
  if (!(error instanceof HttpErrorResponse) || !(error.error instanceof Blob))
    return throwError(() => error);
  return from(error.error.text()).pipe(
    map((text) => {
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return null;
      }
    }),
    switchMap((parsed) =>
      throwError(
        () =>
          new HttpErrorResponse({
            status: error.status,
            statusText: error.statusText,
            url: error.url ?? undefined,
            headers: error.headers,
            error: parsed,
          }),
      ),
    ),
  );
}

@Injectable()
export class HttpStoreSettingsAdminApi implements StoreSettingsAdminApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${adminBase()}/settings/store`;

  get() {
    return this.http.get<AdminStoreSettings>(this.base).pipe(adminErrors());
  }

  save(input: StoreSettingsInput) {
    return this.http.put<AdminStoreSettings>(this.base, input).pipe(adminErrors());
  }
}

@Injectable()
export class HttpAuditLogApi implements AuditLogApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${adminBase()}/audit-log`;

  list(query: AuditQuery) {
    return this.http.get<AuditPage>(this.base, { params: toParams(query) }).pipe(adminErrors());
  }
}
