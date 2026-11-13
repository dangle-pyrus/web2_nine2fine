import { Injectable } from '@angular/core';
import { defer, Observable } from 'rxjs';
import type {
  WishlistApi,
  WishlistEntry,
  WishlistMergeResult,
  WishlistSnapshot,
} from '../app/features/wishlist/data-access/wishlist-api';
import { readLocal, writeLocal } from '../app/core/local-state';
import { respond } from './mock-latency';

const KEY = 'n2f.wishlist.v1';
const MAX = 100;

/**
 * Mock server list: the earlier local list (`n2f.wishlist.v1`, newest last) played the server's
 * part, so the demo seed and the specs that read it keep working. The store is the browser, so one
 * list serves whoever signs in; the contract's `addedAt` is faked in order.
 */
@Injectable({ providedIn: 'root' })
export class MockWishlistApi implements WishlistApi {
  list(): Observable<WishlistSnapshot> {
    return defer(() => respond(this.snapshot(this.read())));
  }

  add(productId: string): Observable<WishlistEntry> {
    return defer(() => {
      const ids = this.read();
      if (!ids.includes(productId)) {
        this.write([...ids, productId]);
      }
      return respond(this.entry(productId, this.read()));
    });
  }

  remove(productId: string): Observable<void> {
    return defer(() => {
      this.write(this.read().filter((id) => id !== productId));
      return respond(undefined);
    });
  }

  merge(productIds: string[]): Observable<WishlistMergeResult> {
    return defer(() => {
      const ids = this.read();
      let skipped = 0;
      for (const id of new Set(productIds)) {
        if (ids.includes(id)) continue;
        if (ids.length >= MAX) skipped++;
        else ids.push(id);
      }
      this.write(ids);
      return respond({ ...this.snapshot(ids), skipped });
    });
  }

  private read(): string[] {
    return readLocal<string[]>(
      KEY,
      [],
      (value): value is string[] =>
        Array.isArray(value) && value.every((id) => typeof id === 'string'),
    );
  }

  private write(ids: string[]): void {
    writeLocal(KEY, ids);
  }

  private entry(productId: string, ids: string[]): WishlistEntry {
    return {
      productId,
      addedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, ids.indexOf(productId))).toISOString(),
    };
  }

  /** Newest first, like the server. */
  private snapshot(ids: string[]): WishlistSnapshot {
    const items = [...ids].reverse().map((id) => this.entry(id, ids));
    return { items, total: items.length };
  }
}
