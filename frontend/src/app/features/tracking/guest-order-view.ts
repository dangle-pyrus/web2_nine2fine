import { Injectable } from '@angular/core';
import { Order } from '../orders/order-models';

/** How long the server keeps the view open after the code (BR-ORD lookup grant). */
const VIEW_MS = 30 * 60 * 1000;

/**
 * The order a guest opened with the emailed code. It lives in memory only so the return form can
 * hand the refreshed order back to Tra cứu đơn without another code; it is dropped with the grant
 * (30 minutes) and on a reload, and then the shopper looks the order up again.
 */
@Injectable({ providedIn: 'root' })
export class GuestOrderView {
  private order: Order | null = null;
  private at = 0;

  set(order: Order | null): void {
    this.order = order;
    this.at = Date.now();
  }

  get(): Order | null {
    return this.order && Date.now() - this.at < VIEW_MS ? this.order : null;
  }
}
