/**
 * Admin returns (Slice 9, tag `admin-returns`): models, port and HTTP adapter. Names and shapes are
 * the contract's (docs/api/openapi.yaml). Cookie `n2f_asid` and `X-Requested-With: n2f` come from
 * `core/api-interceptor.ts`. HTTP only: with `returnsMode: 'mock'` the earlier mock `/admin/returns`
 * page keeps its own port (`admin-apis.ts`).
 */
import { HttpClient } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { adminBase, adminErrors, defaultMessage, toParams } from './http-support';
import { AdminApiError } from './models';

export type AdminReturnState =
  'requested' | 'approved' | 'received' | 'refunded' | 'rejected' | 'cancelled';
export type AdminReturnTab = 'all' | 'requested' | 'approved' | 'received' | 'refunded' | 'closed';
export type AdminReturnAction = 'approve' | 'reject' | 'receive' | 'refund';
export type ReturnDisposition = 'restock' | 'writeoff';
export type AdminReturnReason =
  'wrong-size' | 'wrong-color' | 'wrong-item' | 'defective' | 'not-fit' | 'changed-mind';

export interface AdminReturnAmount {
  goodsAmount: number;
  shippingRefund: number;
  returnShippingFee: number;
  amount: number;
  final: boolean;
}

export interface AdminReturnLine {
  variantId: string;
  name: string;
  color: string;
  size: string;
  sku: string;
  mediaId: string;
  quantity: number;
  acceptedQuantity?: number;
  goodsAmount: number;
  disposition?: ReturnDisposition;
  /** ADM-RET-05/08: accepted units put back into stock; the rest of the accepted units were not. */
  restockQuantity?: number;
}

export interface AdminReturnPhoto {
  id: string;
  url: string;
  width: number;
  height: number;
  size: number;
  contentType: string;
}

export interface AdminReturnRefundTo {
  type: 'account' | 'original';
  bank?: string;
  last4?: string;
  accountName?: string;
  /** Full number: only for an admin while `state = received` on a COD order. */
  accountNumber?: string;
}

export interface AdminReturnHistoryEntry {
  at: string;
  kind: string;
  actor: { type: 'customer' | 'system' | 'staff'; name?: string; role?: 'staff' | 'admin' };
  note?: string;
}

/** Slice 10 (Should, BR-RET-65): who sent the request; the label is shown next to the order. */
export type AdminReturnSource = 'member' | 'guest';
export const RETURN_SOURCE_LABELS: Record<AdminReturnSource, string> = {
  member: 'Thành viên',
  guest: 'Khách vãng lai',
};

export interface AdminReturn {
  id: string;
  orderCode: string;
  state: AdminReturnState;
  reason: AdminReturnReason;
  fault: 'shop' | 'customer';
  detail: string;
  conditionAck: boolean;
  requestedAt: string;
  /** Absent when the server has not shipped the Should. */
  source?: AdminReturnSource;
  approvedAt?: string;
  receivedAt?: string;
  refundedAt?: string;
  rejectedAt?: string;
  cancelledAt?: string;
  recipient: { name: string; phone: string; email: string };
  paymentMethod: 'cod' | 'bank-transfer';
  lines: AdminReturnLine[];
  photos: AdminReturnPhoto[];
  amount: AdminReturnAmount;
  refundedAmount?: number;
  expectedRefundBy?: string;
  approveNote?: string;
  rejectNote?: string;
  receiveNote?: string;
  carrier?: string;
  trackingNumber?: string;
  refundReference?: string;
  refundTo: AdminReturnRefundTo;
  history: AdminReturnHistoryEntry[];
  allowedActions: AdminReturnAction[];
  overdue: boolean;
}

export interface AdminReturnSummary {
  id: string;
  orderCode: string;
  requestedAt: string;
  source?: AdminReturnSource;
  recipientName: string;
  reason: AdminReturnReason;
  fault: 'shop' | 'customer';
  state: AdminReturnState;
  itemCount: number;
  amount: number;
  handledBy?: { name: string; role: 'staff' | 'admin' };
  handledAt?: string;
  overdue: boolean;
}

export type AdminReturnCounts = Record<AdminReturnTab, number>;

export interface AdminReturnPage {
  items: AdminReturnSummary[];
  total: number;
  page: number;
  limit: 20 | 50;
  counts: AdminReturnCounts;
}

export interface AdminReturnQuery {
  state: AdminReturnTab;
  q: string;
  sort: AdminReturnSort;
  page: number;
  limit: number;
}

/** ADM-RET-01: newest first (default), oldest first (work the queue), amount high to low. */
export type AdminReturnSort = 'requestedAt' | 'oldest' | 'amount';
export const RETURN_SORTS: { value: AdminReturnSort; label: string }[] = [
  { value: 'requestedAt', label: 'Mới nhất trước' },
  { value: 'oldest', label: 'Cũ nhất trước' },
  { value: 'amount', label: 'Số tiền giảm dần' },
];

export interface AdminReturnReceiveLine {
  variantId: string;
  acceptedQuantity: number;
  disposition?: ReturnDisposition;
  /** ADM-RET-05/08: accepted units to put back into stock (0..acceptedQuantity). */
  restockQuantity?: number;
}

export const RETURN_DEFAULT_LIMIT = 20;
export const RETURN_LIMITS = [20, 50] as const;
export const RETURN_MAX_SEARCH = 100;
export const RETURN_NOTE_MIN = 5;
export const RETURN_NOTE_MAX = 250;
export const RETURN_REFERENCE_MIN = 4;
export const RETURN_REFERENCE_MAX = 60;

export interface AdminReturnDeskApi {
  list(query: AdminReturnQuery): Observable<AdminReturnPage>;
  get(id: string): Observable<AdminReturn>;
  approve(
    id: string,
    input: { note?: string; carrier?: string; trackingNumber?: string },
  ): Observable<AdminReturn>;
  reject(id: string, note: string): Observable<AdminReturn>;
  receive(
    id: string,
    input: { lines: AdminReturnReceiveLine[]; note?: string },
  ): Observable<AdminReturn>;
  refund(id: string, input: { amount: number; refundReference: string }): Observable<AdminReturn>;
}

export const ADMIN_RETURN_DESK_API = new InjectionToken<AdminReturnDeskApi>(
  'ADMIN_RETURN_DESK_API',
);

@Injectable()
export class HttpAdminReturnDeskApi implements AdminReturnDeskApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${adminBase()}/returns`;

  list(query: AdminReturnQuery) {
    return this.http
      .get<AdminReturnPage>(this.base, {
        params: toParams({
          state: query.state === 'all' ? '' : query.state,
          q: query.q,
          sort: query.sort === 'requestedAt' ? '' : query.sort,
          page: query.page === 1 ? '' : query.page,
          limit: query.limit === RETURN_DEFAULT_LIMIT ? '' : query.limit,
        }),
      })
      .pipe(adminErrors());
  }
  get(id: string) {
    return this.http.get<AdminReturn>(`${this.base}/${encodeURIComponent(id)}`).pipe(adminErrors());
  }
  approve(id: string, input: { note?: string; carrier?: string; trackingNumber?: string }) {
    return this.post(id, 'approve', input);
  }
  reject(id: string, note: string) {
    return this.post(id, 'reject', { note });
  }
  receive(id: string, input: { lines: AdminReturnReceiveLine[]; note?: string }) {
    return this.post(id, 'receive', input);
  }
  refund(id: string, input: { amount: number; refundReference: string }) {
    return this.post(id, 'refund', input);
  }
  private post(id: string, action: string, body: object) {
    return this.http
      .post<AdminReturn>(`${this.base}/${encodeURIComponent(id)}/${action}`, body)
      .pipe(adminErrors());
  }
}

export const RETURN_STATE_LABELS: Record<AdminReturnState, string> = {
  requested: 'Chờ duyệt',
  approved: 'Chờ nhận hàng',
  received: 'Chờ hoàn tiền',
  refunded: 'Đã hoàn tiền',
  rejected: 'Đã từ chối / đóng',
  cancelled: 'Khách đã huỷ',
};

export const RETURN_TABS: { value: AdminReturnTab; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'requested', label: 'Chờ duyệt' },
  { value: 'approved', label: 'Chờ nhận hàng' },
  { value: 'received', label: 'Chờ hoàn tiền' },
  { value: 'refunded', label: 'Đã hoàn tiền' },
  { value: 'closed', label: 'Đã đóng' },
];

export const RETURN_REASON_LABELS: Record<AdminReturnReason, string> = {
  'wrong-size': 'Giao sai size',
  'wrong-color': 'Giao sai màu',
  'wrong-item': 'Giao sai sản phẩm',
  defective: 'Sản phẩm lỗi hoặc hư hỏng',
  'not-fit': 'Không vừa',
  'changed-mind': 'Không còn nhu cầu',
};

/**
 * One sentence per failure of the returns desk. A lost race (`invalid-transition`) tells the user
 * the request was handled by someone else; field errors are read from `error.fields`.
 */
export function returnDeskErrorMessage(error: unknown): string {
  if (!(error instanceof AdminApiError)) return defaultMessage('unavailable');
  switch (error.code) {
    case 'invalid-transition':
      return 'Yêu cầu đã được xử lý bởi người khác. Đã tải lại bản mới nhất.';
    case 'forbidden':
      return 'Chỉ quản trị viên được thực hiện thao tác này.';
    case 'rate-limited':
      return error.retryAfterSeconds
        ? `Bạn thao tác quá nhanh. Chờ ${error.retryAfterSeconds} giây rồi thử lại.`
        : defaultMessage('rate-limited');
    case 'not-found':
      return 'Không tìm thấy yêu cầu trả hàng.';
    case 'validation':
      return 'Vui lòng kiểm tra các thông tin được đánh dấu.';
    case 'unauthenticated':
      return defaultMessage('unauthenticated');
    default:
      return defaultMessage('unavailable');
  }
}
