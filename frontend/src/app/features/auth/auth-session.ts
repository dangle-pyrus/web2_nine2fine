import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { catchError, finalize, Observable, of, ReplaySubject, take, tap, timeout } from 'rxjs';
import { SessionEvents } from '../../core/session-events';
import { isAdminPath, sanitizeReturnUrl } from '../../core/return-url';
import { AUTH_API, AuthRole, AuthUser } from './data-access/auth-api';

/** BR-AUTH-25: pages that need a session wait at most this long for `GET /auth/me`. */
const RESTORE_TIMEOUT_MS = 10_000;

/**
 * In-memory profile of the signed-in shopper. The backend session cookie stays authoritative;
 * no token or profile is persisted in browser storage.
 */
@Injectable({ providedIn: 'root' })
export class AuthSession {
  private readonly api = inject(AUTH_API);
  private readonly settled = new ReplaySubject<void>(1);

  readonly user = signal<AuthUser | null>(null);
  readonly signedIn = computed(() => this.user() !== null);
  /** True from start-up until the first `GET /auth/me` answered, failed or timed out. */
  readonly restoring = signal(true);

  constructor() {
    const router = inject(Router);
    // BR-AUTH-26: the server dropped the session. Public pages just turn into guest pages; the
    // account area goes back to sign-in and says why.
    inject(SessionEvents)
      .expired.pipe(takeUntilDestroyed())
      .subscribe((audience) => {
        if (audience !== 'storefront' || !this.user()) return;
        this.signOut();
        if (router.url === '/account' || router.url.startsWith('/account/')) {
          void router.navigate(['/auth/login'], {
            queryParams: { returnUrl: router.url },
            state: { notice: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' },
          });
        }
      });
  }

  /** Emits once the first restore attempt finished (immediately afterwards). */
  whenSettled(): Observable<void> {
    return this.settled.pipe(take(1));
  }

  /** Asks the backend who is signed in. A failure or a timeout counts as a guest (BR-AUTH-25). */
  restore(): void {
    this.api
      .me()
      .pipe(
        timeout({ first: RESTORE_TIMEOUT_MS }),
        catchError(() => of(null)),
        finalize(() => {
          this.restoring.set(false);
          this.settled.next();
        }),
      )
      .subscribe((user) => {
        if (user && !this.user()) this.user.set(user);
      });
  }

  signIn(user: AuthUser): void {
    this.user.set(user);
  }
  /** Clears the local profile only (the server already ended the session). */
  signOut(): void {
    this.user.set(null);
  }
  /** Ends this session on the server, then locally. A failed call still clears local state. */
  logout(): Observable<void> {
    return this.api.logout().pipe(
      catchError(() => of(undefined)),
      tap(() => this.signOut()),
    );
  }
}

/** Email entered on the first login step, shared with register / reset screens without the URL. */
@Injectable({ providedIn: 'root' })
export class AuthFlowState {
  readonly email = signal('');
  /** Safe internal path the shopper asked for, or null for the default page of the role. */
  readonly returnUrl = signal<string | null>(null);
  /** Set by a page that is about to navigate away after signing in, so no second redirect runs. */
  completing = false;

  setReturnUrl(candidate: string | null): void {
    this.returnUrl.set(sanitizeReturnUrl(candidate));
  }

  /** Where to go after signing in: the return path, else `/admin` for staff and `/new-in`. */
  destinationFor(role: AuthRole): string {
    const url = this.returnUrl();
    const staff = role !== 'member';
    if (url && (staff || !isAdminPath(url))) return url;
    return staff ? '/admin' : '/new-in';
  }
}

/**
 * BR-AUTH-30: someone already signed in who opens an auth page is sent on at once (return path or
 * the default page of the role). Call from the constructor of an auth page.
 */
export function redirectWhenSignedIn(): void {
  const session = inject(AuthSession);
  const flow = inject(AuthFlowState);
  const router = inject(Router);
  flow.completing = false;
  effect(() => {
    const user = session.user();
    if (session.restoring() || !user || flow.completing) return;
    flow.completing = true;
    void router.navigateByUrl(flow.destinationFor(user.role), { replaceUrl: true });
  });
}
