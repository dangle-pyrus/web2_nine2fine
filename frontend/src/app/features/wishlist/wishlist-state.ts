import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { readLocal, writeLocal } from '../../core/local-state';
import { AuthSession } from '../auth/auth-session';

/**
 * Wishlist for signed-in members (user decision 2026-10-11): a guest who taps a heart is sent to
 * sign in, and the product is saved once they come back signed in.
 */
@Injectable({ providedIn: 'root' })
export class WishlistState {
  private readonly key = 'n2f.wishlist.v1';
  private readonly session = inject(AuthSession);
  private readonly router = inject(Router);
  /** Product a guest tried to save; added after sign-in. */
  private readonly pendingId = signal<string | null>(null);
  private readonly ids = signal(
    readLocal<string[]>(
      this.key,
      [],
      (value): value is string[] =>
        Array.isArray(value) && value.every((id) => typeof id === 'string'),
    ),
  );
  /** Saved products as the UI should show them: empty for guests. */
  readonly savedIds = computed(() => (this.session.signedIn() ? this.ids() : []));

  constructor() {
    effect(() => {
      const id = this.pendingId();
      if (!id || !this.session.signedIn()) return;
      untracked(() => {
        this.pendingId.set(null);
        if (!this.ids().includes(id)) this.write([...this.ids(), id]);
      });
    });
  }

  /** Toggles a product; returns false when a guest was sent to sign in instead. */
  toggle(id: string): boolean {
    if (!this.session.signedIn()) {
      this.pendingId.set(id);
      void this.router.navigate(['/auth/login'], { queryParams: { returnUrl: this.router.url } });
      return false;
    }
    const ids = this.ids();
    this.write(ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
    return true;
  }

  private write(ids: string[]): void {
    this.ids.set(ids);
    writeLocal(this.key, ids);
  }
}
