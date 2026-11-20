import { inject, Injectable } from '@angular/core';
import { map, Observable, switchMap, throwError } from 'rxjs';
import {
  OrderListQuery,
  OrderPage,
  OrdersApi,
  OrderTabId,
  ownsOrder,
  withCancel,
} from '../app/features/account/data-access/orders-api';
import { CheckoutError } from '../app/features/checkout/checkout-api';
import { CancelChoice, cancelChoiceText, Order } from '../app/features/orders/order-models';
import { findOrderTab, inTab, ORDER_TABS } from '../app/features/orders/order-status';
import { MockAccountApi } from './mock-account-api';

/** Completed orders: every line but the last can be reviewed (the last stands for "already reviewed"). */
function withReviewable(order: Order): Order {
  if (order.status !== 'completed') return order;
  return {
    ...order,
    items: order.items.map((line, index, all) => ({
      ...line,
      canReview: all.length === 1 || index < all.length - 1,
    })),
  };
}

/** Case- and accent-insensitive match, so "ao so mi" finds "Áo sơ mi". */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .trim();
}

/** Mock adapter: the order part of `MockAccountApi`, filtered and paged like the server. */
@Injectable({ providedIn: 'root' })
export class MockOrdersApi implements OrdersApi {
  private readonly account = inject(MockAccountApi);

  list(query: OrderListQuery): Observable<OrderPage> {
    return this.account.listOrders().pipe(
      map((orders) => {
        const tab = findOrderTab(query.status ?? null);
        const term = normalize(query.q ?? '');
        const matching = orders.filter(
          (order) =>
            (!tab || inTab(order, tab)) &&
            (!term ||
              normalize(order.id).includes(term) ||
              order.items.some((line) => normalize(line.name).includes(term))),
        );
        const counts: Partial<Record<OrderTabId, number>> = {};
        for (const each of ORDER_TABS) {
          counts[each.id] = orders.filter((order) => inTab(order, each)).length;
        }
        return {
          items: matching
            .slice((query.page - 1) * query.limit, query.page * query.limit)
            .map(withCancel),
          total: matching.length,
          page: query.page,
          limit: query.limit,
          hasMore: query.page * query.limit < matching.length,
          counts,
        };
      }),
    );
  }
  get(orderCode: string): Observable<Order> {
    return this.account.getOrder(orderCode).pipe(map(withCancel), map(withReviewable));
  }
  getMine(orderCode: string): Observable<Order> {
    return ownsOrder(this, orderCode).pipe(
      switchMap((owned) =>
        owned ? this.get(orderCode) : throwError(() => new CheckoutError('not-found')),
      ),
    );
  }
  cancel(orderCode: string, choice?: CancelChoice): Observable<Order> {
    return this.account.cancelOrder(orderCode, cancelChoiceText(choice)).pipe(map(withCancel));
  }
  confirmReceived(orderCode: string): Observable<Order> {
    return this.account.confirmReceived(orderCode).pipe(map(withCancel));
  }
}
