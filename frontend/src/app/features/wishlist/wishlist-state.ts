import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { readLocal, writeLocal } from '../../core/local-state';
import { ToastService } from '../../shared/ui/toast';
import { AuthSession } from '../auth/auth-session';
import {
  WISHLIST_API,
  WishlistApiError,
  WishlistMergeResult,
  wishlistErrorMessage,
} from './data-access/wishlist-api';

interface WishlistCache {
  /** Account the cached ids belong to; null until the server answered once. */
  owner: string | null;
  /** Newest first, like the server. */
  ids: string[];
}

const CACHE_KEY = 'n2f.wishlist.v2';
const UNSYNCED_KEY = 'n2f.wishlist.unsynced.v1';
const MAX_ITEMS = 100;

const isIds = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((id) => typeof id === 'string');

/**
 * Wishlist per account (Slice 10, BR-WISH-01..06). The server is the truth once an account has
 * synced; the ids kept in the browser are only a cache of it. Ids added while nothing could be
 * saved (a guest tapping a heart, a lost connection) wait in `unsynced` and go to the server in one
 * merge at the next sign-in / page open; a guest who taps a heart is sent to sign in and the
 * product is saved when they come back (BR-AUTH-32). Signing out on purpose clears the device.
 */
@Injectable({ providedIn: 'root' })
export class WishlistState {
  private readonly api = inject(WISHLIST_API);
  private readonly session = inject(AuthSession);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly cache = readLocal<WishlistCache>(
    CACHE_KEY,
    { owner: null, ids: [] },
    (value): value is WishlistCache =>
      !!value &&
      typeof value === 'object' &&
      isIds((value as WishlistCache).ids) &&
      ['string', 'object'].includes(typeof (value as WishlistCache).owner),
  );
  private readonly ids = signal(this.cache.ids);
  private readonly owner = signal(this.cache.owner);
  /** Ids waiting for a merge: added as a guest or while offline. */
  private readonly unsynced = signal(readLocal<string[]>(UNSYNCED_KEY, [], isIds));
  /** Bumped by every local change; a server answer older than a change must not overwrite it. */
  private version = 0;
  private syncing = false;

  /** Saved products as the UI should show them: empty for guests and for another account's cache. */
  readonly savedIds = computed(() => {
    const user = this.session.user();
    if (!user || (this.owner() && this.owner() !== user.id)) return [];
    return this.ids();
  });

  constructor() {
    // Sign-in (or a restored session): merge what waits, then read the server's list.
    effect(() => {
      const user = this.session.user();
      if (!user) return;
      untracked(() => this.sync(user.id));
    });
    // BR-WISH-05: signing out on purpose clears the device; an expired session keeps the cache.
    this.session.loggedOut.pipe(takeUntilDestroyed()).subscribe(() => {
      this.ids.set([]);
      this.owner.set(null);
      this.unsynced.set([]);
      this.persist();
    });
  }

  /** Toggles a product; returns false when a guest was sent to sign in instead. */
  toggle(id: string): boolean {
    if (!this.session.signedIn()) {
      this.queue([id]);
      void this.router.navigate(['/auth/login'], { queryParams: { returnUrl: this.router.url } });
      return false;
    }
    if (this.savedIds().includes(id)) this.remove(id);
    else this.add(id);
    return true;
  }

  /** Adds products without toggling (cart lines pushed out of a full cart go here). */
  addMany(productIds: string[]): void {
    const fresh = [...new Set(productIds)].filter((id) => id && !this.savedIds().includes(id));
    if (!fresh.length) return;
    if (!this.session.signedIn()) {
      this.queue(fresh);
      return;
    }
    this.version++;
    this.ids.set([...[...fresh].reverse(), ...this.ids()]);
    this.persist();
    this.api.merge(fresh).subscribe({
      next: (result) => {
        this.notifySkipped(result.skipped);
        this.apply(result.items.map((item) => item.productId));
      },
      error: (error: unknown) => {
        if (error instanceof WishlistApiError && error.code === 'offline') {
          this.queue(fresh);
        } else {
          this.drop(fresh);
          this.toast.show({ title: wishlistErrorMessage(error) });
        }
      },
    });
  }

  private add(id: string): void {
    this.version++;
    this.ids.set([id, ...this.ids()]);
    this.persist();
    this.api.add(id).subscribe({
      error: (error: unknown) => {
        if (error instanceof WishlistApiError && error.code === 'offline') {
          // BR-WISH-06: no connection keeps the heart and sends it with the next merge.
          this.queue([id]);
          this.toast.show({
            title: 'Đã lưu trên thiết bị',
            detail: 'Chưa có kết nối, nine2fine sẽ đồng bộ yêu thích khi bạn mở lại trang.',
          });
          return;
        }
        this.drop([id]);
        this.toast.show({ title: wishlistErrorMessage(error) });
      },
    });
  }

  private remove(id: string): void {
    this.version++;
    const before = this.ids();
    this.ids.set(before.filter((item) => item !== id));
    this.unsynced.set(this.unsynced().filter((item) => item !== id));
    this.persist();
    this.api.remove(id).subscribe({
      error: (error: unknown) => {
        // The heart goes back: the server still has the product.
        this.version++;
        this.ids.update((current) => (current.includes(id) ? current : [id, ...current]));
        this.persist();
        this.toast.show({ title: wishlistErrorMessage(error) });
      },
    });
  }

  /** One merge (if anything waits), then the server's list becomes the cache. */
  private sync(userId: string): void {
    if (this.syncing) return;
    if (this.owner() && this.owner() !== userId) {
      // Another account used this browser: its cache is not ours to show or to send.
      this.ids.set([]);
      this.owner.set(null);
      this.persist();
    }
    const pending = this.unsynced();
    const version = this.version;
    this.syncing = true;
    const call = pending.length ? this.api.merge(pending) : this.api.list();
    call.subscribe({
      next: (result) => {
        this.syncing = false;
        if (pending.length) {
          this.unsynced.set(this.unsynced().filter((id) => !pending.includes(id)));
          this.notifySkipped((result as Partial<WishlistMergeResult>).skipped ?? 0);
        }
        if (version === this.version) {
          this.apply(
            result.items.map((item) => item.productId),
            userId,
          );
        } else {
          this.owner.set(userId);
          this.persist();
        }
      },
      // Offline or a failed answer: the cache and the waiting ids stay for the next try.
      error: () => (this.syncing = false),
    });
  }

  private apply(ids: string[], owner: string | null = this.owner()): void {
    this.ids.set(ids);
    this.owner.set(owner);
    this.persist();
  }

  /** Ids to wait for the next merge (guest taps, lost connection). */
  private queue(ids: string[]): void {
    this.unsynced.set([...new Set([...this.unsynced(), ...ids])].slice(0, MAX_ITEMS));
    this.persist();
  }

  private drop(ids: string[]): void {
    this.version++;
    this.ids.update((current) => current.filter((id) => !ids.includes(id)));
    this.persist();
  }

  private notifySkipped(skipped: number): void {
    if (skipped > 0) {
      this.toast.show({
        title: 'Một số sản phẩm chưa được thêm vào yêu thích',
        detail: `${skipped} sản phẩm không còn bán hoặc danh sách đã đủ ${MAX_ITEMS} sản phẩm.`,
      });
    }
  }

  private persist(): void {
    writeLocal(CACHE_KEY, { owner: this.owner(), ids: this.ids() } satisfies WishlistCache);
    writeLocal(UNSYNCED_KEY, this.unsynced());
  }
}
