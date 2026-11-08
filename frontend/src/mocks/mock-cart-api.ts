import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthSession } from '../app/features/auth/auth-session';
import {
  CartApi,
  CartMergeResult,
  CartMutated,
  CartNotice,
  CartViewDto,
} from '../app/features/cart/data-access/cart-api';
import { CheckoutError } from '../app/features/checkout/checkout-api';
import { fail, respond } from './mock-latency';
import { mockFlags, mockPolicy, refreshMockLine } from './mock-flags';
import { MockPersistence } from './mock-persistence';
import { PRODUCTS } from './products';

interface StoredLine {
  variantId: string;
  quantity: number;
  /** ISO datetime of the last change. */
  updatedAt: string;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Mock of the member cart on the server. Carts are per account and survive F5 (like the other
 * mocks); prices and stock are refreshed on every read, so tests can change them with the
 * `n2f.mock.flags` switches (`mock-flags.ts`).
 */
@Injectable({ providedIn: 'root' })
export class MockCartApi implements CartApi {
  private readonly session = inject(AuthSession);
  private readonly carts = new Map<string, StoredLine[]>();
  private readonly merges = new Map<string, CartMergeResult>();

  constructor() {
    const saved = inject(MockPersistence).register('cart', () => ({
      carts: [...this.carts.entries()],
      merges: [...this.merges.entries()],
    }));
    for (const [key, lines] of saved?.carts ?? []) this.carts.set(key, lines);
    for (const [key, result] of saved?.merges ?? []) this.merges.set(key, result);
  }

  get(): Observable<CartViewDto> {
    return this.run(() => this.view(this.lines()));
  }

  addLine(variantId: string, quantity: number): Observable<CartMutated> {
    return this.run(() => {
      const lines = this.lines();
      const current = lines.find((line) => line.variantId === variantId);
      if (!current && lines.length >= mockPolicy().maxCartLines) {
        throw new CheckoutError('validation', { field: 'variantId' });
      }
      if (refreshMockLine(variantId, 1).maxQuantity < 1) throw new CheckoutError('stock-changed');
      return this.setLine(lines, variantId, (current?.quantity ?? 0) + quantity);
    });
  }

  setQuantity(variantId: string, quantity: number): Observable<CartMutated> {
    return this.run(() => {
      const lines = this.lines();
      if (!lines.some((line) => line.variantId === variantId)) throw new CheckoutError('not-found');
      return this.setLine(lines, variantId, quantity);
    });
  }

  removeLine(variantId: string): Observable<CartMutated> {
    return this.run(() => {
      this.store(this.lines().filter((line) => line.variantId !== variantId));
      return { cart: this.view(this.lines()), notice: null };
    });
  }

  changeVariant(variantId: string, toVariantId: string): Observable<CartMutated> {
    return this.run(() => {
      const lines = this.lines();
      const from = lines.find((line) => line.variantId === variantId);
      if (!from) throw new CheckoutError('not-found');
      const productOf = (id: string) =>
        PRODUCTS.find((product) => product.variants.some((variant) => variant.id === id));
      if (!productOf(toVariantId) || productOf(variantId) !== productOf(toVariantId)) {
        throw new CheckoutError('validation', { field: 'toVariantId' });
      }
      if (refreshMockLine(toVariantId, 1).maxQuantity < 1) throw new CheckoutError('stock-changed');
      const target = lines.find((line) => line.variantId === toVariantId);
      const rest = lines.filter((line) => line.variantId !== variantId);
      const result = this.setLine(rest, toVariantId, from.quantity + (target?.quantity ?? 0));
      return target
        ? {
            cart: result.cart,
            notice: { ...result.notice, code: 'merged' as const, variantId: toVariantId },
          }
        : result;
    });
  }

  merge(
    incoming: { variantId: string; quantity: number }[],
    idempotencyKey: string,
  ): Observable<CartMergeResult> {
    return this.run(() => {
      const replay = this.merges.get(idempotencyKey);
      if (replay) return { ...replay, cart: this.view(this.lines()) };
      let lines = this.lines();
      const merged: string[] = [];
      const skipped: string[] = [];
      for (const line of incoming) {
        const fresh = refreshMockLine(line.variantId, line.quantity);
        if (fresh.availability === 'discontinued') {
          skipped.push(line.variantId);
          continue;
        }
        const current = lines.find((candidate) => candidate.variantId === line.variantId);
        const quantity = Math.min(
          (current?.quantity ?? 0) + line.quantity,
          Math.max(fresh.maxQuantity, 1),
        );
        lines = [
          ...lines.filter((candidate) => candidate.variantId !== line.variantId),
          { variantId: line.variantId, quantity, updatedAt: new Date().toISOString() },
        ];
        merged.push(line.variantId);
      }
      const evicted: CartMergeResult['evicted'] = [];
      const max = mockPolicy().maxCartLines;
      while (lines.length > max) {
        const oldest = [...lines]
          .filter((line) => !merged.includes(line.variantId))
          .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))[0];
        if (!oldest) break;
        lines = lines.filter((line) => line !== oldest);
        evicted.push({
          variantId: oldest.variantId,
          productId: refreshMockLine(oldest.variantId, 1).productId,
          quantity: oldest.quantity,
        });
      }
      this.store(lines);
      const result: CartMergeResult = {
        cart: this.view(lines),
        mergedVariantIds: merged,
        skippedVariantIds: skipped,
        addedCount: merged.length,
        evicted,
      };
      this.merges.set(idempotencyKey, result);
      return result;
    });
  }

  private run<T>(work: () => T): Observable<T> {
    if (mockFlags().cartFail) return fail(new CheckoutError('unavailable'));
    if (!this.session.signedIn()) return fail(new CheckoutError('unauthenticated'));
    try {
      return respond(work());
    } catch (error) {
      return fail(error as Error);
    }
  }

  private owner(): string {
    return this.session.user()?.id ?? 'anonymous';
  }

  private lines(): StoredLine[] {
    return this.carts.get(this.owner()) ?? [];
  }

  private store(lines: StoredLine[]): void {
    this.carts.set(this.owner(), lines);
  }

  /** Sets a quantity cut at min(5, stock) and reports the cut like the server notice. */
  private setLine(lines: StoredLine[], variantId: string, wanted: number): CartMutated {
    const fresh = refreshMockLine(variantId, wanted);
    const quantity = Math.max(1, Math.min(wanted, fresh.maxQuantity));
    let notice: CartNotice | null = null;
    if (quantity < wanted) {
      notice = {
        code: fresh.limitedBy === 'stock' ? 'stock-limit' : 'per-variant-limit',
        variantId,
        adjustedTo: quantity,
      };
    }
    this.store([
      { variantId, quantity, updatedAt: new Date().toISOString() },
      ...lines.filter((line) => line.variantId !== variantId),
    ]);
    return { cart: this.view(this.lines()), notice };
  }

  private view(lines: StoredLine[]): CartViewDto {
    const sorted = [...lines].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return {
      lines: sorted.map((line) => ({
        ...refreshMockLine(line.variantId, line.quantity),
        updatedAt: line.updatedAt,
      })),
      policy: mockPolicy(),
      expiresAt: sorted.length
        ? new Date(Date.parse(sorted[0].updatedAt) + 30 * DAY).toISOString()
        : null,
    };
  }
}
