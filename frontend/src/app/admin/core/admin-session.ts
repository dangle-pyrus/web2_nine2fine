import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { SessionEvents } from '../../core/session-events';
import { sanitizeAdminReturnUrl } from '../../core/return-url';
import { AuthSession } from '../../features/auth/auth-session';
import { ADMIN_AUTH_API } from '../data-access/admin-apis';
import type { AdminUser } from '../data-access/models';
import { Permission, ROLE_PERMISSIONS } from './permissions';

/** Signed-in staff member. The backend session cookie stays authoritative. */
@Injectable({ providedIn: 'root' })
export class AdminSession {
  readonly user = signal<AdminUser | null>(null);
  readonly permissions = computed(() => {
    const user = this.user();
    return user ? ROLE_PERMISSIONS[user.role] : new Set<Permission>();
  });

  constructor() {
    const router = inject(Router);
    // BR-AUTH-26: the server dropped the staff session mid-way; sign-in explains why.
    inject(SessionEvents)
      .expired.pipe(takeUntilDestroyed())
      .subscribe((audience) => {
        if (audience !== 'admin' || !this.user()) return;
        this.user.set(null);
        void router.navigate(['/admin/login'], {
          queryParams: { returnUrl: sanitizeAdminReturnUrl(router.url) },
          state: { expired: true },
        });
      });
  }

  can(permission: Permission): boolean {
    return this.permissions().has(permission);
  }
}

/** Restores the session through `GET /admin/auth/me` once, then lets the shell render. */
export const adminAuthGuard: CanActivateFn = (_route, state) => {
  const session = inject(AdminSession);
  const router = inject(Router);
  const shopper = inject(AuthSession);
  if (session.user()) return true;
  const toLogin = router.createUrlTree(['/admin/login'], {
    queryParams: { returnUrl: state.url === '/admin' ? null : state.url },
  });
  return inject(ADMIN_AUTH_API)
    .me()
    .pipe(
      map((user) => {
        session.user.set(user);
        return true;
      }),
      catchError(() => {
        // A signed-in shopper never sees the admin sign-in (AC-AUTH-87).
        return shopper
          .whenSettled()
          .pipe(
            map(() =>
              shopper.user()?.role === 'member' ? router.createUrlTree(['/new-in']) : toLogin,
            ),
          );
      }),
    );
};

/** `/admin/login` for someone already signed in as staff goes straight to the back office. */
export const adminGuestGuard: CanActivateFn = (route) => {
  const session = inject(AdminSession);
  const router = inject(Router);
  const target = () =>
    router.parseUrl(sanitizeAdminReturnUrl(route.queryParamMap.get('returnUrl')) ?? '/admin');
  if (session.user()) return target();
  return inject(ADMIN_AUTH_API)
    .me()
    .pipe(
      map((user) => {
        session.user.set(user);
        return target();
      }),
      catchError(() => of(true)),
    );
};

/** Route-level permission check; sends the user to the dashboard when the module is hidden. */
export function requirePermission(permission: Permission): CanActivateFn {
  return () => inject(AdminSession).can(permission) || inject(Router).createUrlTree(['/admin']);
}
