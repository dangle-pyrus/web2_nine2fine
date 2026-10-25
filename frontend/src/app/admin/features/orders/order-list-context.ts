import { Injectable, signal } from '@angular/core';
import type { Params } from '@angular/router';
import type { OrderQuery } from '../../data-access/models';

export interface OrderListSnapshot {
  /** The query the list sent to the API (date preset already resolved). */
  query: OrderQuery;
  /** The list URL's query params, for "back to list". */
  params: Params;
  ids: string[];
  total: number;
}

/**
 * The order list the user last looked at, so the detail page can step to the previous/next order
 * of the same filtered view (j/k) and "back" returns to the same filters and page.
 */
@Injectable({ providedIn: 'root' })
export class OrderListContext {
  readonly snapshot = signal<OrderListSnapshot | null>(null);
}
