import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { API_CONFIG } from './api-config';
import { readApiError } from './api-error';
import { SessionEvents } from './session-events';

/**
 * Set on guest order requests (cookie `n2f_oa` instead of the shopper session): their
 * `401 unauthenticated` means the 30-minute order view ended, not that the shopper's session did.
 */
export const GUEST_ORDER_ACCESS = new HttpContextToken<boolean>(() => false);

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
  const guestOrder = request.context.get(GUEST_ORDER_ACCESS);
  return next(
    request.clone({ withCredentials: true, setHeaders: { 'X-Requested-With': 'n2f' } }),
  ).pipe(
    tap({
      error: (error: unknown) => {
        if (!(error instanceof HttpErrorResponse) || OWN_AUTH_PATHS.test(path) || guestOrder)
          return;
        if (error.status === 401 && readApiError(error).code === 'unauthenticated') {
          events.expired.next(path.startsWith('/admin/') ? 'admin' : 'storefront');
        }
      },
    }),
  );
};
