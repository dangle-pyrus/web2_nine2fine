import { computed, effect, Injectable, signal } from '@angular/core';
import { Product, ProductVariant } from '../catalog/models/product';
import { readLocal, writeLocal } from '../../core/local-state';

export interface CartLine {
  productId: string;
  slug: string;
  name: string;
  mediaId: string;
  variantId: string;
  color: string;
  size: string;
  price: number;
  stock: number;
  quantity: number;
}

const CART_KEY = 'n2f.cart.v1';

function isCartLines(value: unknown): value is CartLine[] {
  return (
    Array.isArray(value) &&
    value.every(
      (line: Partial<CartLine>) =>
        typeof line?.variantId === 'string' &&
        typeof line.productId === 'string' &&
        typeof line.slug === 'string' &&
        typeof line.name === 'string' &&
        typeof line.mediaId === 'string' &&
        typeof line.color === 'string' &&
        typeof line.size === 'string' &&
        Number.isInteger(line.price) &&
        Number.isInteger(line.stock) &&
        Number.isInteger(line.quantity) &&
        (line.quantity ?? 0) > 0,
    )
  );
}

/**
 * Guest cart persisted per browser (versioned schema). Prices and stock are display snapshots;
 * checkout must re-validate them against the backend before an order is created.
 */
@Injectable({ providedIn: 'root' })
export class CartState {
  readonly lines = signal<CartLine[]>(readLocal(CART_KEY, [], isCartLines));
  readonly count = computed(() => this.lines().reduce((sum, line) => sum + line.quantity, 0));
  readonly subtotal = computed(() =>
    this.lines().reduce((sum, line) => sum + line.quantity * line.price, 0),
  );
  readonly message = signal('');
  /**
   * Lines picked in the cart's selection mode when the shopper pressed checkout; null means the
   * whole cart. Session-only: after a reload checkout falls back to the whole cart.
   */
  readonly checkoutIds = signal<ReadonlySet<string> | null>(null);
  readonly checkoutLines = computed(() => {
    const ids = this.checkoutIds();
    return ids ? this.lines().filter((line) => ids.has(line.variantId)) : this.lines();
  });
  readonly checkoutCount = computed(() =>
    this.checkoutLines().reduce((sum, line) => sum + line.quantity, 0),
  );
  constructor() {
    effect(() => writeLocal(CART_KEY, this.lines()));
  }

  clear(): void {
    this.lines.set([]);
  }

  /** After an order: remove only what was bought; unpicked lines stay in the cart. */
  clearCheckedOut(): void {
    const bought = new Set(this.checkoutLines().map((line) => line.variantId));
    this.removeMany(bought);
    this.checkoutIds.set(null);
  }

  add(product: Product, variant: ProductVariant): boolean {
    const current = this.lines().find((line) => line.variantId === variant.id);
    if (variant.inventory <= (current?.quantity ?? 0)) {
      this.message.set('Bạn đã chọn hết số lượng còn lại của phiên bản này.');
      return false;
    }
    if (current) this.quantity(variant.id, current.quantity + 1);
    else
      this.lines.update((lines) => [
        ...lines,
        {
          productId: product.id,
          slug: product.slug,
          name: product.name,
          mediaId: product.mediaId,
          variantId: variant.id,
          color: variant.color.name,
          size: variant.size,
          price: product.price,
          stock: variant.inventory,
          quantity: 1,
        },
      ]);
    this.message.set('Đã thêm vào giỏ hàng.');
    return true;
  }

  quantity(id: string, quantity: number): void {
    if (!Number.isInteger(quantity) || quantity < 1) return;
    this.lines.update((lines) =>
      lines.map((line) =>
        line.variantId === id ? { ...line, quantity: Math.min(quantity, line.stock) } : line,
      ),
    );
  }

  adjust(id: string, delta: number): void {
    const line = this.lines().find((item) => item.variantId === id);
    if (line) this.quantity(id, line.quantity + delta);
  }

  /**
   * Swap a line to another colour/size of the same product. If that variant is already in the
   * cart the two lines merge (capped by stock) so the shopper never sees duplicates.
   */
  changeVariant(id: string, product: Product, variant: ProductVariant): void {
    if (id === variant.id) return;
    this.lines.update((lines) => {
      const current = lines.find((line) => line.variantId === id);
      if (!current) return lines;
      const existing = lines.find((line) => line.variantId === variant.id);
      if (existing) {
        return lines
          .filter((line) => line.variantId !== id)
          .map((line) =>
            line.variantId === variant.id
              ? {
                  ...line,
                  quantity: Math.min(line.quantity + current.quantity, variant.inventory),
                }
              : line,
          );
      }
      return lines.map((line) =>
        line.variantId === id
          ? {
              ...line,
              variantId: variant.id,
              color: variant.color.name,
              size: variant.size,
              price: product.price,
              stock: variant.inventory,
              quantity: Math.min(line.quantity, variant.inventory),
            }
          : line,
      );
    });
  }

  /**
   * Applies what the shop reported at checkout: lines that sold out are removed, the others are
   * capped to what is left and remember the new stock.
   */
  applyStock(issues: readonly { variantId: string; available: number }[]): void {
    const left = new Map(issues.map((issue) => [issue.variantId, issue.available]));
    this.lines.update((lines) =>
      lines.flatMap((line) => {
        const available = left.get(line.variantId);
        if (available === undefined) return [line];
        if (available < 1) return [];
        return [{ ...line, stock: available, quantity: Math.min(line.quantity, available) }];
      }),
    );
  }

  /** Bulk delete from the cart's selection mode. */
  removeMany(ids: ReadonlySet<string>): void {
    this.lines.update((lines) => lines.filter((line) => !ids.has(line.variantId)));
  }

  remove(id: string): void {
    this.lines.update((lines) => lines.filter((line) => line.variantId !== id));
  }
}
