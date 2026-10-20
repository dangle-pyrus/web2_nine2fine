import { inject, Injectable, InjectionToken } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { catchError, Observable, throwError } from 'rxjs';
import { API_CONFIG } from '../../../core/api-config';

export type VerificationPurpose = 'login' | 'register' | 'reset-password';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
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

export type AuthErrorCode =
  | 'invalid-code'
  | 'invalid-credentials'
  | 'email-registered'
  | 'email-not-registered'
  | 'rate-limited'
  | 'unavailable';

export class AuthError extends Error {
  constructor(readonly code: AuthErrorCode) {
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
}

export const AUTH_API = new InjectionToken<AuthApi>('AUTH_API');

const HTTP_ERROR_CODES: Record<number, AuthErrorCode> = {
  401: 'invalid-credentials',
  409: 'email-registered',
  422: 'invalid-code',
  429: 'rate-limited',
};

function toAuthError(error: unknown): Observable<never> {
  const status = error instanceof HttpErrorResponse ? error.status : 0;
  return throwError(() => new AuthError(HTTP_ERROR_CODES[status] ?? 'unavailable'));
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

  private post<T>(path: string, body: object): Observable<T> {
    return this.http
      .post<T>(`${this.baseUrl}/${path}`, body, { withCredentials: true })
      .pipe(catchError(toAuthError));
  }
}
