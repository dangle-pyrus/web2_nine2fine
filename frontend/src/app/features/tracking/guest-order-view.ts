import { Injectable } from '@angular/core';
import { Order } from '../orders/order-models';

/** How long the server keeps the view open after the code (BR-ORD lookup grant, cookie `n2f_oa`). */
export const GUEST_VIEW_MS = 30 * 60 * 1000;

/**
 * The order a guest opened with the emailed code. It lives in memory only so the return form can
 * hand the refreshed order back to Tra cứu đơn without another code; it is dropped with the grant
 * (30 minutes) and on a reload, and then the shopper looks the order up again.
 *
 * ORD-LK-04: the 30 minutes run from the OTP check (`start`), like the server's grant; refreshing
 * the order (`set`) never extends them.
 */
@Injectable({ providedIn: 'root' })
export class GuestOrderView {
  private order: Order | null = null;
  private grantedAt = 0;

  /** A new grant: the code was just verified. */
  start(order: Order): void {
    this.order = order;
    this.grantedAt = Date.now();
  }

  /** Fresh data for the same grant (after cancel, return, reload); `null` drops the view. */
  set(order: Order | null): void {
    if (!order) {
      this.order = null;
      this.grantedAt = 0;
      return;
    }
    if (!this.grantedAt) this.grantedAt = Date.now();
    this.order = order;
  }

  get(): Order | null {
    return this.order && !this.expired() ? this.order : null;
  }

  /** The grant ran out (or none exists): the guest has to verify the OTP again. */
  expired(now = Date.now()): boolean {
    return !this.grantedAt || now - this.grantedAt >= GUEST_VIEW_MS;
  }
}
