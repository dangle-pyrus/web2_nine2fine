import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthSession } from '../auth/auth-session';

/**
 * UX-only guard: the backend still authorizes every account request. While the session is being
 * restored after start-up (BR-AUTH-25) it waits instead of bouncing the shopper to the sign-in page.
 */
export const accountGuard: CanActivateFn = (_route, state) => {
  const session = inject(AuthSession);
  const router = inject(Router);
  const decide = () =>
    session.signedIn() ||
    router.createUrlTree(['/auth/login'], { queryParams: { returnUrl: state.url } });
  return session.restoring() ? session.whenSettled().pipe(map(decide)) : decide();
};
