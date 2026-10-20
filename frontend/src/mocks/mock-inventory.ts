import { inject, Injectable } from '@angular/core';
import { OrderItem } from '../app/features/orders/order-models';
import { ProductVariant } from '../app/features/catalog/models/product';
import { PRODUCTS } from './products';
import { MockPersistence } from './mock-persistence';

/**
 * Stock of the demo catalog. Placing an order takes the pieces out of stock and cancelling puts
 * them back, so "only N left" and stock conflicts at checkout behave like a real shop.
 */
@Injectable({ providedIn: 'root' })
export class MockInventory {
  constructor() {
    const saved = inject(MockPersistence).register('inventory', () =>
      Object.fromEntries(
        PRODUCTS.flatMap((product) => product.variants.map((v) => [v.id, v.inventory])),
      ),
    );
    if (!saved) return;
    for (const variant of PRODUCTS.flatMap((product) => product.variants)) {
      const stock = (saved as Record<string, unknown>)[variant.id];
      if (Number.isInteger(stock)) variant.inventory = stock as number;
    }
  }

  variant(id: string): ProductVariant | undefined {
    return PRODUCTS.flatMap((product) => product.variants).find((variant) => variant.id === id);
  }

  take(items: OrderItem[]): void {
    this.adjust(items, -1);
  }

  release(items: OrderItem[]): void {
    this.adjust(items, 1);
  }

  private adjust(items: OrderItem[], sign: 1 | -1): void {
    for (const item of items) {
      const variant = PRODUCTS.find((product) => product.slug === item.productSlug)?.variants.find(
        (candidate) => candidate.color.name === item.color && candidate.size === item.size,
      );
      if (variant) variant.inventory = Math.max(0, variant.inventory + sign * item.quantity);
    }
  }
}
