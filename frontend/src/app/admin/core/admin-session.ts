import { computed, inject, Injectable, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
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

  can(permission: Permission): boolean {
    return this.permissions().has(permission);
  }
}

/** Restores the session through `GET /admin/auth/me` once, then lets the shell render. */
export const adminAuthGuard: CanActivateFn = (_route, state) => {
  const session = inject(AdminSession);
  const router = inject(Router);
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
      catchError(() => of(toLogin)),
    );
};

/** Route-level permission check; sends the user to the dashboard when the module is hidden. */
export function requirePermission(permission: Permission): CanActivateFn {
  return () => inject(AdminSession).can(permission) || inject(Router).createUrlTree(['/admin']);
}
