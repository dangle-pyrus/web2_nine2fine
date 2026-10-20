import { computed, Injectable, signal } from '@angular/core';
import { AuthUser } from './data-access/auth-api';

/**
 * In-memory profile of the signed-in shopper. The backend session cookie stays authoritative;
 * no token or profile is persisted in browser storage.
 */
@Injectable({ providedIn: 'root' })
export class AuthSession {
  readonly user = signal<AuthUser | null>(null);
  readonly signedIn = computed(() => this.user() !== null);

  signIn(user: AuthUser): void {
    this.user.set(user);
  }
  signOut(): void {
    this.user.set(null);
  }
}

/** Email entered on the first login step, shared with register / reset screens without the URL. */
@Injectable({ providedIn: 'root' })
export class AuthFlowState {
  readonly email = signal('');
  readonly returnUrl = signal('/new-in');

  setReturnUrl(candidate: string | null): void {
    // Only same-origin app paths are accepted to avoid open redirects.
    if (candidate?.startsWith('/') && !candidate.startsWith('//')) this.returnUrl.set(candidate);
  }
}
