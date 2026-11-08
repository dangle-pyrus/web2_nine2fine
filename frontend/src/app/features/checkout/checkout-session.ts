import { Injectable, signal } from '@angular/core';
import { OrderReceipt } from './checkout-api';

const KEY_PREFIX = 'n2f.checkout.receipt.';

/**
 * Receipt of the order just placed. It is also written to `sessionStorage` under the order code,
 * so F5 and Back on the success page still show the order (K17, AC-CHK-19); closing the tab
 * drops it and the page falls back to order tracking.
 */
@Injectable({ providedIn: 'root' })
export class CheckoutSession {
  readonly lastReceipt = signal<OrderReceipt | null>(null);

  remember(receipt: OrderReceipt): void {
    this.lastReceipt.set(receipt);
    try {
      sessionStorage.setItem(KEY_PREFIX + receipt.orderId, JSON.stringify(receipt));
      sessionStorage.setItem(`${KEY_PREFIX}latest`, receipt.orderId);
    } catch {
      /* Storage unavailable: the receipt stays in memory for this page only. */
    }
  }

  /** Receipt of `orderCode` from this tab, if it is still there. */
  receiptFor(orderCode: string): OrderReceipt | null {
    const current = this.lastReceipt();
    if (current?.orderId === orderCode) return current;
    try {
      const value: unknown = JSON.parse(sessionStorage.getItem(KEY_PREFIX + orderCode) ?? 'null');
      const receipt = value as OrderReceipt | null;
      if (receipt && receipt.orderId === orderCode && typeof receipt.total === 'number') {
        return receipt;
      }
    } catch {
      /* Corrupt entry: treated as missing. */
    }
    return null;
  }

  /** Code of the receipt most recently placed in this tab. */
  latestCode(): string | null {
    try {
      return sessionStorage.getItem(`${KEY_PREFIX}latest`);
    } catch {
      return null;
    }
  }
}
