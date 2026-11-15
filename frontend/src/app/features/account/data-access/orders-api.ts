import { inject, Injectable, InjectionToken } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, map, Observable } from 'rxjs';
import { API_CONFIG } from '../../../core/api-config';
import { CheckoutError, toCheckoutError } from '../../checkout/checkout-api';
import { CancelChoice, Order } from '../../orders/order-models';
import { OrderDto, toOrder } from '../../orders/order-mapper';
import { canCancel, cancelModeOf } from '../../orders/order-status';
import { AccountError } from './account-api';

export interface OrderPage {
  items: Order[];
  total: number;
  page: number;
  limit: number;
}

/** Orders of the signed-in shopper (Slice 3). Profile, addresses and returns stay in `ACCOUNT_API`. */
export interface OrdersApi {
  list(query: { page: number; limit: number }): Observable<OrderPage>;
  /** `orderCode` is the order `id` (`N2F...`). */
  get(orderCode: string): Observable<Order>;
  cancel(orderCode: string, choice?: CancelChoice): Observable<Order>;
  /** ORD-11: the shopper confirms the parcel arrived (`to_receive` -> `completed`). */
  confirmReceived(orderCode: string): Observable<Order>;
}

export const ORDERS_API = new InjectionToken<OrdersApi>('ORDERS_API');

@Injectable({ providedIn: 'root' })
export class HttpOrdersApi implements OrdersApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_CONFIG).baseUrl}/orders`;

  list(query: { page: number; limit: number }): Observable<OrderPage> {
    return this.http
      .get<Omit<OrderPage, 'items'> & { items: OrderDto[] }>(this.base, {
        params: { page: query.page, limit: query.limit },
      })
      .pipe(
        map((body) => ({ ...body, items: body.items.map(toOrder) })),
        catchError(toCheckoutError),
      );
  }
  get(orderCode: string): Observable<Order> {
    return this.http
      .get<OrderDto>(`${this.base}/${encodeURIComponent(orderCode)}`)
      .pipe(map(toOrder), catchError(toCheckoutError));
  }
  cancel(orderCode: string, choice?: CancelChoice): Observable<Order> {
    return this.http
      .post<OrderDto>(`${this.base}/${encodeURIComponent(orderCode)}/cancel`, choice ?? {})
      .pipe(map(toOrder), catchError(toCheckoutError));
  }
  confirmReceived(orderCode: string): Observable<Order> {
    return this.http
      .post<OrderDto>(`${this.base}/${encodeURIComponent(orderCode)}/received`, {})
      .pipe(map(toOrder), catchError(toCheckoutError));
  }
}

/** The mock has no server, so "may the shopper cancel / confirm receipt" comes from the local rules. */
export function withCancel(order: Order): Order {
  const can = canCancel(order);
  return {
    ...order,
    canCancel: can,
    cancelMode: can ? cancelModeOf(order) : undefined,
    canConfirmReceived: order.status === 'shipping' || order.status === 'delivering',
  };
}

const MESSAGES = {
  'not-found': 'Không tìm thấy đơn hàng.',
  'not-cancellable':
    'Đơn hàng này không huỷ được trực tuyến nữa (đã bàn giao vận chuyển, đã có yêu cầu huỷ hoặc đã huỷ). Đã cập nhật lại đơn; cần hỗ trợ vui lòng gọi hotline.',
  unauthenticated: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  'rate-limited': 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.',
  'invalid-transition': 'Đơn hàng không ở trạng thái đang giao. Đã cập nhật lại đơn.',
} as const;

/** One message for failures of either adapter. */
export function orderErrorMessage(error: unknown): string {
  const code =
    error instanceof CheckoutError || error instanceof AccountError ? error.code : 'unavailable';
  return (
    (MESSAGES as Record<string, string>)[code] ??
    'Chưa thực hiện được. Vui lòng kiểm tra kết nối và thử lại.'
  );
}
