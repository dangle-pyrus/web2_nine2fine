import { inject, Injectable, InjectionToken } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, map, Observable, of, switchMap, throwError } from 'rxjs';
import { API_CONFIG } from '../../../core/api-config';
import { CheckoutError, toCheckoutError } from '../../checkout/checkout-api';
import { CancelChoice, Order } from '../../orders/order-models';
import { OrderDto, toOrder } from '../../orders/order-mapper';
import { canCancel, cancelModeOf, OrderTab } from '../../orders/order-status';
import { AccountError } from './account-api';

/** History tab id (`ORDER_TABS`), sent as `status`. */
export type OrderTabId = OrderTab['id'];

/** ORD-02/04/05: the tab, the search term and the page all go to the server; nothing is filtered here. */
export interface OrderListQuery {
  page: number;
  limit: number;
  status?: OrderTabId;
  q?: string;
}

export interface OrderPage {
  items: Order[];
  /** Orders matching `status` + `q`, across every page. */
  total: number;
  page: number;
  limit: number;
  /** More pages exist for the same `status` + `q`. */
  hasMore: boolean;
  /** Per-tab totals over all the shopper's orders, when the server sends them. */
  counts?: Partial<Record<OrderTabId, number>>;
}

/** Orders of the signed-in shopper (Slice 3). Profile, addresses and returns stay in `ACCOUNT_API`. */
export interface OrdersApi {
  list(query: OrderListQuery): Observable<OrderPage>;
  /** `orderCode` is the order `id` (`N2F...`). Opened by the session owner or a guest lookup grant. */
  get(orderCode: string): Observable<Order>;
  /**
   * ORD-07, "Đơn hàng của tôi": only an order of the signed-in account. A guest lookup grant
   * (cookie `n2f_oa`, sent by the browser on every `/orders/*` call) never opens one here:
   * an order missing from the account's own list answers `not-found`.
   */
  getMine(orderCode: string): Observable<Order>;
  cancel(orderCode: string, choice?: CancelChoice): Observable<Order>;
  /** ORD-11: the shopper confirms the parcel arrived (`to_receive` -> `completed`). */
  confirmReceived(orderCode: string): Observable<Order>;
}

export const ORDERS_API = new InjectionToken<OrdersApi>('ORDERS_API');

/** Page size used when looking an order up in the account's own list (the API maximum). */
const OWN_LOOKUP_LIMIT = 50;

@Injectable({ providedIn: 'root' })
export class HttpOrdersApi implements OrdersApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_CONFIG).baseUrl}/orders`;

  list(query: OrderListQuery): Observable<OrderPage> {
    const params: Record<string, string | number> = { page: query.page, limit: query.limit };
    if (query.status) params['status'] = query.status;
    const q = query.q?.trim();
    if (q) params['q'] = q;
    return this.http
      .get<{
        items: OrderDto[];
        total: number;
        page: number;
        limit: number;
        hasMore?: boolean;
        counts?: OrderPage['counts'];
      }>(this.base, { params })
      .pipe(
        map((body) => ({
          items: body.items.map(toOrder),
          total: body.total,
          page: body.page,
          limit: body.limit,
          hasMore: body.hasMore ?? body.page * body.limit < body.total,
          counts: body.counts,
        })),
        catchError(toCheckoutError),
      );
  }
  get(orderCode: string): Observable<Order> {
    return this.http
      .get<OrderDto>(`${this.base}/${encodeURIComponent(orderCode)}`)
      .pipe(map(toOrder), catchError(toCheckoutError));
  }
  getMine(orderCode: string): Observable<Order> {
    return ownsOrder(this, orderCode).pipe(
      switchMap((owned) =>
        owned ? this.get(orderCode) : throwError(() => new CheckoutError('not-found')),
      ),
    );
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

/**
 * Is `orderCode` one of the signed-in account's orders? Searches the account's own list (`q` = the
 * code) and walks its pages until the code shows up or the list ends.
 */
export function ownsOrder(api: Pick<OrdersApi, 'list'>, orderCode: string): Observable<boolean> {
  const code = orderCode.trim().toUpperCase();
  const look = (page: number): Observable<boolean> =>
    api
      .list({ page, limit: OWN_LOOKUP_LIMIT, q: code })
      .pipe(
        switchMap((result) =>
          result.items.some((order) => order.id.toUpperCase() === code)
            ? of(true)
            : result.hasMore && result.items.length
              ? look(result.page + 1)
              : of(false),
        ),
      );
  return code ? look(1) : of(false);
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
  'order-state-changed':
    'Trạng thái đơn hàng vừa thay đổi nên chưa thực hiện được. Đã tải lại thông tin mới nhất của đơn.',
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
