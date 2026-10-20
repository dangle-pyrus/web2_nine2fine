import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthSession } from '../auth/auth-session';

/** UX-only guard: the backend still authorizes every account request. */
export const accountGuard: CanActivateFn = (_route, state) =>
  inject(AuthSession).signedIn() ||
  inject(Router).createUrlTree(['/auth/login'], { queryParams: { returnUrl: state.url } });
