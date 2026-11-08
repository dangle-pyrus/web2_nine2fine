import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AdminSession } from '../../app/admin/core/admin-session';
import { AdminApiError } from '../../app/admin/data-access/models';
import { defaultMessage } from '../../app/admin/data-access/http-support';
import type { AdminOrderDeskApi } from '../../app/admin/data-access/order-desk-api';
import {
  DESK_BUCKETS,
  DESK_MAX_SEARCH,
  type DeskAction,
  type DeskOrder,
  type DeskOrderCounts,
  type DeskOrderFilter,
  type DeskOrderPage,
  type DeskOrderQuery,
  type DeskOrderSummary,
} from '../../app/admin/data-access/order-desk-models';
import { fail, respond } from '../mock-latency';
import { buildDeskOrders } from './order-desk-fixtures';

/** `localStorage[FAIL_KEY]`: `list`, `detail` (every call) or `list-once`, `detail-once`. */
export const DESK_FAIL_KEY = 'n2f.e2e.orderDeskFail';

function failing(kind: 'list' | 'detail'): boolean {
  try {
    const flag = localStorage.getItem(DESK_FAIL_KEY);
    if (flag === `${kind}-once`) {
      localStorage.removeItem(DESK_FAIL_KEY);
      return true;
    }
    return flag === kind;
  } catch {
    return false;
  }
}

function invalid(field: string, message: string): AdminApiError {
  return new AdminApiError('validation', message, { [field]: message });
}

const stripDiacritics = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

/** Calendar day in Vietnam (GMT+7), `YYYY-MM-DD`. */
function vnDay(iso: string): string {
  return new Date(Date.parse(iso) + 7 * 3600_000).toISOString().slice(0, 10);
}

function phoneDigits(value: string): string {
  const digits = value.replace(/[^\d+]/g, '');
  return digits.startsWith('+84')
    ? `0${digits.slice(3)}`
    : digits.startsWith('84')
      ? `0${digits.slice(2)}`
      : digits;
}

/** BR-ADM-06: code prefix (>= 6), phone (>= 4 digits), email, name without diacritics. */
function matches(order: DeskOrder, raw: string): boolean {
  const q = raw.trim();
  if (!q) return true;
  const code = q.replace(/^#/, '').toLowerCase();
  if (code.length >= 6 && order.id.toLowerCase().startsWith(code)) return true;
  const digits = phoneDigits(q);
  if (/^\d{4,}$/.test(digits) && phoneDigits(order.recipient.phone).includes(digits)) return true;
  if (order.recipient.email.toLowerCase().includes(q.toLowerCase())) return true;
  return stripDiacritics(order.recipient.name).includes(stripDiacritics(q));
}

function summary(order: DeskOrder): DeskOrderSummary {
  return {
    id: order.id,
    placedAt: order.placedAt,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    recipientName: order.recipient.name,
    total: order.pricing.total,
    itemCount: order.items.reduce((sum, line) => sum + line.quantity, 0),
    needsCall: order.needsCall,
    hasCancelRequest: order.status === 'cancel_requested',
    tab: order.tab,
    overdue: order.overdue,
  };
}

/** What the caller may do now (role + status + condition), the same rules as the contract. */
function allowedFor(order: DeskOrder, admin: boolean): DeskAction[] {
  const actions: DeskAction[] = [];
  const toShip = order.status === 'to_ship';
  if (toShip && order.needsCall) {
    actions.push('call-attempt', 'confirm', 'cancel-declined-on-call');
    if (order.callAttempts.inFirstDay >= 3) actions.push('cancel-unreachable');
  }
  if (toShip && !order.needsCall) actions.push('ship');
  if (toShip) actions.push('cancel-customer-request');
  if (order.status === 'to_receive')
    actions.push('deliver', 'cancel-refused', 'cancel-undeliverable');
  if (order.status === 'cancel_requested') actions.push('approve-cancel', 'reject-cancel');
  if (order.returnHandling?.state === 'pending') actions.push('restock', 'write-off');
  if (admin && (toShip || order.status === 'to_receive')) actions.push('cancel-other');
  actions.push('add-note');
  if (toShip || order.status === 'to_receive') actions.push('print-slip');
  return actions;
}

/** Contract-faithful mock of `/admin/orders` (read side). Used by the e2e build only. */
@Injectable({ providedIn: 'root' })
export class MockAdminOrderDeskApi implements AdminOrderDeskApi {
  private readonly session = inject(AdminSession);
  private readonly orders = buildDeskOrders();

  list(query: DeskOrderQuery): Observable<DeskOrderPage> {
    if (failing('list'))
      return fail(new AdminApiError('unavailable', defaultMessage('unavailable')));
    const problem = this.check(query);
    if (problem) return fail(problem);
    const rows = this.filtered(query).filter(
      (order) => query.view === 'all' || order.tab === query.view,
    );
    const start = (query.page - 1) * query.limit;
    return respond({
      items: rows.slice(start, start + query.limit).map(summary),
      total: rows.length,
      page: query.page,
      limit: query.limit,
    });
  }

  counts(filter: DeskOrderFilter): Observable<DeskOrderCounts> {
    const problem = this.check(filter);
    if (problem) return fail(problem);
    const rows = this.filtered(filter);
    const counts = { all: rows.length } as DeskOrderCounts;
    for (const bucket of DESK_BUCKETS) {
      counts[bucket] = rows.filter((order) => order.tab === bucket).length;
    }
    return respond(counts);
  }

  get(orderCode: string): Observable<DeskOrder> {
    if (failing('detail'))
      return fail(new AdminApiError('unavailable', defaultMessage('unavailable')));
    const code = orderCode.trim().replace(/^#/, '').toUpperCase();
    const found = this.orders.find((order) => order.id === code);
    if (!found) return fail(new AdminApiError('not-found', defaultMessage('not-found')));
    const admin = this.session.user()?.role === 'admin';
    return respond({ ...found, allowedActions: allowedFor(found, admin) });
  }

  private check(query: Partial<DeskOrderQuery>): AdminApiError | null {
    if (query.q !== undefined && query.q.trim().length > DESK_MAX_SEARCH)
      return invalid('q', `Từ khoá tối đa ${DESK_MAX_SEARCH} ký tự.`);
    if (query.from && query.to && query.from > query.to)
      return invalid('from', 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
    if (query.limit !== undefined && (query.limit < 1 || query.limit > 50))
      return invalid('limit', 'Số dòng mỗi trang từ 1 đến 50.');
    return null;
  }

  private filtered(filter: DeskOrderFilter): DeskOrder[] {
    return this.orders
      .filter((order) => !filter.payment || order.paymentMethod === filter.payment)
      .filter((order) => !filter.from || vnDay(order.placedAt) >= filter.from)
      .filter((order) => !filter.to || vnDay(order.placedAt) <= filter.to)
      .filter((order) => matches(order, filter.q))
      .sort((a, b) => b.placedAt.localeCompare(a.placedAt));
  }
}
