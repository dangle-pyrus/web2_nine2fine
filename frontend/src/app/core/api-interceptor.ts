import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { API_CONFIG } from './api-config';
import { readApiError } from './api-error';
import { SessionEvents } from './session-events';

/** Sign-in, session lookup and sign-out answer `unauthenticated` as a normal result, not expiry. */
const OWN_AUTH_PATHS = /^\/(admin\/)?auth\/(login|me|logout)/;

/**
 * Every `/api` request carries the session cookie and the CSRF header the backend requires on
 * writes (`X-Requested-With: n2f`, docs/api/openapi.yaml). Other origins are left untouched.
 * A `401 unauthenticated` from any other endpoint means the session ended (BR-AUTH-26).
 */
export const apiInterceptor: HttpInterceptorFn = (request, next) => {
  const base = inject(API_CONFIG).baseUrl;
  if (request.url !== base && !request.url.startsWith(`${base}/`)) return next(request);
  const events = inject(SessionEvents);
  const path = request.url.slice(base.length);
  return next(
    request.clone({ withCredentials: true, setHeaders: { 'X-Requested-With': 'n2f' } }),
  ).pipe(
    tap({
      error: (error: unknown) => {
        if (!(error instanceof HttpErrorResponse) || OWN_AUTH_PATHS.test(path)) return;
        if (error.status === 401 && readApiError(error).code === 'unauthenticated') {
          events.expired.next(path.startsWith('/admin/') ? 'admin' : 'storefront');
        }
      },
    }),
  );
};
