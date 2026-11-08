import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { OrderPage, OrdersApi, withCancel } from '../app/features/account/data-access/orders-api';
import { Order } from '../app/features/orders/order-models';
import { MockAccountApi } from './mock-account-api';

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
    return this.account.getOrder(orderCode).pipe(map(withCancel));
  }
  cancel(orderCode: string, reason?: string): Observable<Order> {
    return this.account.cancelOrder(orderCode, reason).pipe(map(withCancel));
  }
}
