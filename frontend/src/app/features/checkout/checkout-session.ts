import { Injectable, signal } from '@angular/core';
import { OrderReceipt } from './checkout-api';

/**
 * Receipt of the order just placed, kept in memory for the success page. It is not persisted:
 * after a reload the success page falls back to order tracking.
 */
@Injectable({ providedIn: 'root' })
export class CheckoutSession {
  readonly lastReceipt = signal<OrderReceipt | null>(null);
}
