import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { OrderPage, OrdersApi, withCancel } from '../app/features/account/data-access/orders-api';
import { CancelChoice, cancelChoiceText, Order } from '../app/features/orders/order-models';
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

/** Mock adapter: the order part of `MockAccountApi`, paged like the server. */
@Injectable({ providedIn: 'root' })
export class MockOrdersApi implements OrdersApi {
  private readonly account = inject(MockAccountApi);

  list(query: { page: number; limit: number }): Observable<OrderPage> {
    return this.account.listOrders().pipe(
      map((orders) => ({
        items: orders
          .slice((query.page - 1) * query.limit, query.page * query.limit)
          .map(withCancel),
        total: orders.length,
        page: query.page,
        limit: query.limit,
      })),
    );
  }
  get(orderCode: string): Observable<Order> {
    return this.account.getOrder(orderCode).pipe(map(withCancel), map(withReviewable));
  }
  cancel(orderCode: string, choice?: CancelChoice): Observable<Order> {
    return this.account.cancelOrder(orderCode, cancelChoiceText(choice)).pipe(map(withCancel));
  }
  confirmReceived(orderCode: string): Observable<Order> {
    return this.account.confirmReceived(orderCode).pipe(map(withCancel));
  }
}
