/**
 * Port and HTTP adapter of the admin staff contract (Slice 7, tag `admin-staff`). Admin only.
 * `create` always sends an `Idempotency-Key`; the caller makes one per intention and reuses it
 * when the same request is retried.
 */
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { adminBase, adminErrors } from './http-support';
import type { AccountEvent, AccountRole, StaffAccount, StaffCreateInput } from './users-models';

export interface AdminStaffApi {
  list(): Observable<StaffAccount[]>;
  create(input: StaffCreateInput, idempotencyKey: string): Observable<StaffAccount>;
  /** `reason` 5..250 characters. */
  lock(id: string, reason: string): Observable<StaffAccount>;
  unlock(id: string, reason?: string): Observable<StaffAccount>;
  setRole(id: string, role: AccountRole, reason?: string): Observable<StaffAccount>;
  /** The 20 newest actions on a customer or staff account. */
  history(accountId: string): Observable<AccountEvent[]>;
}

export const ADMIN_STAFF_API = new InjectionToken<AdminStaffApi>('ADMIN_STAFF_API');

/** One key per intention: letters, digits and dashes, 16..64 characters. */
export function newIdempotencyKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}0000`
  );
}

@Injectable()
export class HttpAdminStaffApi implements AdminStaffApi {
  private readonly http = inject(HttpClient);
  private readonly base = adminBase();

  list() {
    return this.http.get<StaffAccount[]>(`${this.base}/staff`).pipe(adminErrors());
  }

  create(input: StaffCreateInput, idempotencyKey: string) {
    return this.http
      .post<StaffAccount>(`${this.base}/staff`, input, {
        headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }),
      })
      .pipe(adminErrors());
  }

  lock(id: string, reason: string) {
    return this.http
      .post<StaffAccount>(`${this.base}/staff/${encodeURIComponent(id)}/lock`, { reason })
      .pipe(adminErrors());
  }

  unlock(id: string, reason?: string) {
    return this.http
      .post<StaffAccount>(
        `${this.base}/staff/${encodeURIComponent(id)}/unlock`,
        reason ? { reason } : {},
      )
      .pipe(adminErrors());
  }

  setRole(id: string, role: AccountRole, reason?: string) {
    return this.http
      .put<StaffAccount>(
        `${this.base}/staff/${encodeURIComponent(id)}/role`,
        reason ? { role, reason } : { role },
      )
      .pipe(adminErrors());
  }

  history(accountId: string) {
    return this.http
      .get<AccountEvent[]>(`${this.base}/accounts/${encodeURIComponent(accountId)}/history`)
      .pipe(adminErrors());
  }
}
