import { inject, Injectable, InjectionToken } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, map, Observable, throwError } from 'rxjs';
import { API_CONFIG } from '../../../core/api-config';
import { ApiErrorCode, readApiError } from '../../../core/api-error';

export type VerificationPurpose = 'login' | 'register' | 'reset-password';

export type AuthRole = 'member' | 'staff' | 'admin';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: AuthRole;
}

export interface EmailLookup {
  registered: boolean;
}

export interface CodeDispatch {
  resendAfterSeconds: number;
}

export interface RegisterRequest {
  email: string;
  code: string;
  firstName: string;
  lastName: string;
  /** ISO date (YYYY-MM-DD) when the shopper provided one. */
  birthDate: string | null;
  marketingOptIn: boolean;
  acceptedTerms: true;
}

export interface ResetPasswordRequest {
  email: string;
  code: string;
  newPassword: string;
}

export type AuthErrorCode = ApiErrorCode;

/** Failure of an auth request, identified only by the contract `error.code`. */
export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    /** Seconds to wait; present for `rate-limited`, `code-locked`, `password-locked`. */
    readonly retryAfterSeconds?: number,
    /** Body field the error belongs to (`validation`, `underage`). */
    readonly field?: string,
  ) {
    super(code);
  }
}

/** Session cookies are owned by the backend; the client only receives the public profile. */
export interface AuthApi {
  lookupEmail(email: string): Observable<EmailLookup>;
  requestCode(email: string, purpose: VerificationPurpose): Observable<CodeDispatch>;
  loginWithCode(email: string, code: string): Observable<AuthUser>;
  loginWithPassword(email: string, password: string): Observable<AuthUser>;
  register(request: RegisterRequest): Observable<AuthUser>;
  resetPassword(request: ResetPasswordRequest): Observable<void>;
  /** Current session; `null` for a guest (never an error). */
  me(): Observable<AuthUser | null>;
  /** Ends the current session only. Always succeeds, also for a guest. */
  logout(): Observable<void>;
}

export const AUTH_API = new InjectionToken<AuthApi>('AUTH_API');

function toAuthError(error: unknown): Observable<never> {
  const { code, retryAfterSeconds, field } = readApiError(error);
  return throwError(() => new AuthError(code, retryAfterSeconds, field));
}

@Injectable({ providedIn: 'root' })
export class HttpAuthApi implements AuthApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${inject(API_CONFIG).baseUrl}/auth`;

  lookupEmail(email: string): Observable<EmailLookup> {
    return this.post<EmailLookup>('lookup', { email });
  }
  requestCode(email: string, purpose: VerificationPurpose): Observable<CodeDispatch> {
    return this.post<CodeDispatch>('codes', { email, purpose });
  }
  loginWithCode(email: string, code: string): Observable<AuthUser> {
    return this.post<AuthUser>('login/code', { email, code });
  }
  loginWithPassword(email: string, password: string): Observable<AuthUser> {
    return this.post<AuthUser>('login/password', { email, password });
  }
  register(request: RegisterRequest): Observable<AuthUser> {
    return this.post<AuthUser>('register', request);
  }
  resetPassword(request: ResetPasswordRequest): Observable<void> {
    return this.post<void>('password/reset', request);
  }

  me(): Observable<AuthUser | null> {
    return this.http.get<{ user: AuthUser | null }>(`${this.baseUrl}/me`).pipe(
      map((response) => response.user),
      catchError(toAuthError),
    );
  }
  logout(): Observable<void> {
    return this.post<void>('logout', {});
  }

  // The interceptor adds the session cookie and the `X-Requested-With` CSRF header.
  private post<T>(path: string, body: object): Observable<T> {
    return this.http.post<T>(`${this.baseUrl}/${path}`, body).pipe(catchError(toAuthError));
  }
}
