import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AdminSession } from '../../app/admin/core/admin-session';
import { defaultMessage } from '../../app/admin/data-access/http-support';
import {
  DeskApiError,
  rateLimitedText,
  type AdminOrderDeskApi,
} from '../../app/admin/data-access/order-desk-api';
import {
  DESK_BUCKETS,
  DESK_CARRIER_MAX,
  DESK_CARRIER_MIN,
  DESK_INTERNAL_NOTE_MAX,
  DESK_MAX_SEARCH,
  DESK_NOTE_MAX,
  DESK_NOTE_MIN,
  DESK_TRACKING_MAX,
  DESK_TRACKING_MIN,
  DESK_TRACKING_PATTERN,
  type DeskAction,
  type DeskBucket,
  type DeskCancelReasonCode,
  type DeskCommand,
  type DeskEventKind,
  type DeskOrder,
  type DeskOrderCounts,
  type DeskOrderFilter,
  type DeskOrderPage,
  type DeskOrderQuery,
  type DeskOrderSummary,
  type DeskOverdueFlag,
  type DeskStaffRef,
  type DeskTimelineEntry,
} from '../../app/admin/data-access/order-desk-models';
import { fail, respond } from '../mock-latency';
import { buildDeskOrders } from './order-desk-fixtures';

/** `localStorage[FAIL_KEY]`: `list`, `detail` (every call) or `list-once`, `detail-once`. */
export const DESK_FAIL_KEY = 'n2f.e2e.orderDeskFail';
/**
 * `localStorage[CLOCK_KEY]`: ISO instant the mock treats as "now" when it works out the overdue
 * flags (BR-ADM-40); empty = the real clock. Events it writes still carry the real time.
 */
export const DESK_CLOCK_KEY = 'n2f.e2e.orderDeskNow';
/**
 * `localStorage[ACTION_FAIL_KEY]`, one write only (the flag is removed when it fires):
 * - `conflict-once`: another staff member changes the order first (ship / deliver / restock), so
 *   the write meets `order-state-changed` (or `invalid-transition` when the status did not move);
 * - `network-before-once`: the request never reaches the server (nothing changes);
 * - `network-after-once`: the server does the work, the answer is lost;
 * - `condition-once`: the server answers `condition-not-met` (a condition drifted meanwhile);
 * - `forbidden-once`;
 * - `rate-limited-once` (BR-ADM-41): `429 rate-limited`, `retryAfterSeconds` 30; `rate-limited-once:<n>`
 *   sets the seconds. The write changes nothing; the next one goes through.
 * Reads: `DESK_FAIL_KEY` = `list-rate-limited-once` / `detail-rate-limited-once` (`retryAfterSeconds` 30).
 */
export const DESK_ACTION_FAIL_KEY = 'n2f.e2e.orderDeskActionFail';
/** `localStorage[CALLS_KEY]`: JSON list of every write that reached the mock `{ code, action, key, body }`. */
export const DESK_CALLS_KEY = 'n2f.e2e.orderDeskCalls';
/** `localStorage[STOCK_KEY]`: JSON `{ variantId: onHand }` after every stock change (blazer starts at 3). */
export const DESK_STOCK_KEY = 'n2f.e2e.orderDeskStock';

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

function limited(kind: 'list' | 'detail'): boolean {
  try {
    const flag = localStorage.getItem(DESK_FAIL_KEY);
    if (flag === `${kind}-rate-limited-once`) {
      localStorage.removeItem(DESK_FAIL_KEY);
      return true;
    }
  } catch {
    /* storage unavailable: no forced answer */
  }
  return false;
}

function mockNow(): number {
  try {
    const value = Date.parse(localStorage.getItem(DESK_CLOCK_KEY) ?? '');
    if (Number.isFinite(value)) return value;
  } catch {
    /* storage unavailable: real clock */
  }
  return Date.now();
}

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const GMT7 = 7 * HOUR;

/** Milliseconds of working time (08:00-18:00 GMT+7, Monday to Saturday) between two instants. */
export function workingMillis(from: number, to: number): number {
  let total = 0;
  for (let day = Math.floor((from + GMT7) / DAY) * DAY - GMT7; day < to; day += DAY) {
    if (new Date(day + GMT7).getUTCDay() === 0) continue;
    total += Math.max(0, Math.min(to, day + 18 * HOUR) - Math.max(from, day + 8 * HOUR));
  }
  return total;
}

/** BR-ADM-40 (S4-Q3): only flags; nothing here ever changes a status. */
function overdueOf(order: DeskOrder, now: number): DeskOverdueFlag[] {
  const flags: DeskOverdueFlag[] = [];
  if (
    order.status === 'to_ship' &&
    order.needsCall &&
    workingMillis(Date.parse(order.placedAt), now) > 2 * HOUR
  )
    flags.push('confirm-call');
  if (
    order.status === 'cancel_requested' &&
    order.cancelRequest &&
    now - Date.parse(order.cancelRequest.requestedAt) > DAY
  )
    flags.push('cancel-request');
  if (
    order.status === 'to_receive' &&
    vnDay(new Date(now).toISOString()) > order.estimatedDelivery.to
  )
    flags.push('delivery');
  return flags;
}

function takeActionFlag(): string {
  try {
    const flag = localStorage.getItem(DESK_ACTION_FAIL_KEY) ?? '';
    if (flag) localStorage.removeItem(DESK_ACTION_FAIL_KEY);
    return flag;
  } catch {
    return '';
  }
}

function invalid(field: string, message: string): DeskApiError {
  return new DeskApiError('validation', message, { [field]: message });
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
  const overdue = overdueOf(order, mockNow());
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
    overdue,
  };
}

const WINDOW_MS = 24 * 3600_000;

/** "Không liên lạc được" counts (BR-ADM-16, 18): `inFirstDay` is the best run inside any 24 h 00 m window. */
function attemptsOf(order: DeskOrder): DeskOrder['callAttempts'] {
  const times = order.timeline
    .filter((entry) => entry.kind === 'call_attempt')
    .map((entry) => Date.parse(entry.at))
    .sort((a, b) => a - b);
  let best = 0;
  times.forEach((start, index) => {
    best = Math.max(best, times.filter((t, j) => j >= index && t - start <= WINDOW_MS).length);
  });
  return times.length
    ? {
        total: times.length,
        inFirstDay: best,
        firstAt: new Date(times[0]).toISOString(),
        lastAt: new Date(times[times.length - 1]).toISOString(),
      }
    : { total: 0, inFirstDay: 0 };
}

function tabOf(order: DeskOrder): DeskBucket {
  switch (order.status) {
    case 'to_pay':
      return 'pending-payment';
    case 'to_ship':
      return order.needsCall ? 'to-confirm' : 'to-fulfil';
    case 'to_receive':
      return 'in-transit';
    case 'cancel_requested':
      return 'cancel-requests';
    case 'completed':
      return 'completed';
    case 'cancelled':
      return order.returnHandling?.state === 'pending' ? 'returning' : 'cancelled';
  }
}

/** What the caller may do now (role + status + condition), the same rules as the contract. */
function allowedFor(order: DeskOrder, admin: boolean): DeskAction[] {
  const actions: DeskAction[] = [];
  const toShip = order.status === 'to_ship';
  if (toShip && order.needsCall) {
    actions.push('call-attempt', 'confirm', 'cancel-declined-on-call');
    if (attemptsOf(order).inFirstDay >= 3) actions.push('cancel-unreachable');
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

/** BR-ADM-28: the sentence the shopper reads (= `Order.cancelReason`). */
const REASON_TEXT: Record<DeskCancelReasonCode, string> = {
  unreachable: 'Chúng tôi không liên lạc được với bạn để xác nhận đơn.',
  declined_on_call: 'Bạn đã báo không muốn nhận đơn.',
  customer_request: 'Đơn đã được huỷ theo yêu cầu của bạn.',
  refused: 'Đơn không được nhận khi giao hàng.',
  undeliverable: 'Giao hàng không thành công.',
  other: 'nine2fine không thể thực hiện đơn này.',
};
const REASONS = Object.keys(REASON_TEXT) as DeskCancelReasonCode[];

const INITIAL_STOCK: Record<string, number> = {
  '11111111-1111-4111-8111-111111111111': 3,
  '22222222-2222-4222-8222-222222222222': 10,
  '33333333-3333-4333-8333-333333333333': 10,
};

/**
 * Contract-faithful mock of `/admin/orders` (read side and the writes of lát 4.3-4.4: state
 * machine, 24 h call window, unique tracking number, stock, role gate, idempotency, 409 answers
 * with the current order). Used by the e2e build only.
 */
@Injectable({ providedIn: 'root' })
export class MockAdminOrderDeskApi implements AdminOrderDeskApi {
  private readonly session = inject(AdminSession);
  private orders = buildDeskOrders();
  private readonly stock = new Map(Object.entries(INITIAL_STOCK));
  private readonly replays = new Map<string, { hash: string; order: DeskOrder }>();

  constructor() {
    this.publishStock();
  }

  list(query: DeskOrderQuery): Observable<DeskOrderPage> {
    if (limited('list')) return fail(new DeskApiError('rate-limited', rateLimitedText(30), {}, 30));
    if (failing('list'))
      return fail(new DeskApiError('unavailable', defaultMessage('unavailable')));
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
    if (limited('detail'))
      return fail(new DeskApiError('rate-limited', rateLimitedText(30), {}, 30));
    if (failing('detail'))
      return fail(new DeskApiError('unavailable', defaultMessage('unavailable')));
    const found = this.find(orderCode);
    if (!found) return fail(new DeskApiError('not-found', defaultMessage('not-found')));
    return respond(this.present(found));
  }

  perform(orderCode: string, command: DeskCommand, key: string): Observable<DeskOrder> {
    this.logCall(orderCode, command, key);
    const flag = takeActionFlag();
    if (flag === 'network-before-once')
      return fail(new DeskApiError('unavailable', defaultMessage('unavailable')));
    if (flag === 'forbidden-once')
      return fail(new DeskApiError('forbidden', defaultMessage('forbidden')));
    if (flag.startsWith('rate-limited-once')) {
      const seconds = Number(flag.split(':')[1]) || 30;
      return fail(new DeskApiError('rate-limited', rateLimitedText(seconds), {}, seconds));
    }
    if (flag === 'conflict-once') this.otherStaffActs(orderCode);
    if (flag === 'condition-once')
      return fail(
        new DeskApiError(
          'condition-not-met',
          'Đơn chưa đủ điều kiện cho thao tác này.',
          {},
          undefined,
          undefined,
          this.find(orderCode)?.status,
        ),
      );
    let result: DeskOrder;
    try {
      result = this.run(orderCode, command, key);
    } catch (error) {
      return fail(error as DeskApiError);
    }
    if (flag === 'network-after-once')
      return fail(new DeskApiError('unavailable', defaultMessage('unavailable')));
    return respond(result);
  }

  // ---- writes -------------------------------------------------------------------------------

  /** Contract order of checks: 403 -> 422 -> 404 -> replay / 409 key -> expectedStatus -> state -> condition -> unique code. */
  private run(orderCode: string, command: DeskCommand, key: string): DeskOrder {
    const admin = this.session.user()?.role === 'admin';
    if (command.action === 'cancel' && command.reason === 'other' && !admin)
      throw new DeskApiError('forbidden', defaultMessage('forbidden'));
    this.validate(command);
    const order = this.find(orderCode);
    if (!order) throw new DeskApiError('not-found', defaultMessage('not-found'));
    const hash = JSON.stringify({ code: order.id, command });
    const seen = this.replays.get(key);
    if (seen) {
      if (seen.hash !== hash)
        throw new DeskApiError(
          'conflict',
          'Khoá thao tác này đã dùng cho nội dung khác. Thử lại để tạo khoá mới.',
        );
      return seen.order;
    }
    if (command.action !== 'add-note' && command.expectedStatus !== order.status)
      throw new DeskApiError(
        'order-state-changed',
        'Đơn vừa được cập nhật bởi người khác.',
        {},
        undefined,
        this.present(order),
        order.status,
      );
    this.guard(order, command);
    const next = this.apply(order, command);
    const presented = this.present(next);
    this.replays.set(key, { hash, order: presented });
    return presented;
  }

  private validate(command: DeskCommand): void {
    const noteLength = (command as { note?: string }).note?.trim().length ?? 0;
    const tooLong = noteLength > DESK_NOTE_MAX;
    const range = `Ghi chú từ ${DESK_NOTE_MIN} đến ${DESK_NOTE_MAX} ký tự.`;
    switch (command.action) {
      case 'call-attempt':
        if (tooLong) throw invalid('note', `Ghi chú tối đa ${DESK_NOTE_MAX} ký tự.`);
        break;
      case 'ship': {
        const carrier = command.carrier.trim();
        const code = command.trackingNumber.trim();
        if (carrier.length < DESK_CARRIER_MIN || carrier.length > DESK_CARRIER_MAX)
          throw invalid(
            'carrier',
            `Đơn vị vận chuyển từ ${DESK_CARRIER_MIN} đến ${DESK_CARRIER_MAX} ký tự.`,
          );
        if (
          code.length < DESK_TRACKING_MIN ||
          code.length > DESK_TRACKING_MAX ||
          !DESK_TRACKING_PATTERN.test(code)
        )
          throw invalid(
            'trackingNumber',
            `Mã vận đơn từ ${DESK_TRACKING_MIN} đến ${DESK_TRACKING_MAX} ký tự, chỉ gồm chữ, số và dấu gạch ngang.`,
          );
        break;
      }
      case 'cancel':
        if (!REASONS.includes(command.reason)) throw invalid('reason', 'Lý do huỷ không hợp lệ.');
        if (
          (command.reason === 'other' || command.reason === 'customer_request') &&
          (noteLength < DESK_NOTE_MIN || tooLong)
        )
          throw invalid('note', range);
        if (tooLong) throw invalid('note', `Ghi chú tối đa ${DESK_NOTE_MAX} ký tự.`);
        break;
      case 'add-note': {
        const length = command.note.trim().length;
        if (length < 1 || length > DESK_INTERNAL_NOTE_MAX)
          throw invalid('note', `Ghi chú từ 1 đến ${DESK_INTERNAL_NOTE_MAX} ký tự.`);
        break;
      }
      case 'reject-cancel': {
        const length = command.reason.trim().length;
        if (length < DESK_NOTE_MIN || length > DESK_NOTE_MAX)
          throw invalid('reason', `Lý do từ chối từ ${DESK_NOTE_MIN} đến ${DESK_NOTE_MAX} ký tự.`);
        break;
      }
      case 'returned-stock':
        if (command.decision === 'written_off' && (noteLength < DESK_NOTE_MIN || tooLong))
          throw invalid('note', range);
        if (tooLong) throw invalid('note', `Ghi chú tối đa ${DESK_NOTE_MAX} ký tự.`);
        break;
      default:
        break;
    }
  }

  /** `invalid-transition` / `condition-not-met` (BR-ADM-13, 18, 20), then a duplicate tracking code. */
  private guard(order: DeskOrder, command: DeskCommand): void {
    const wrong = (): never => {
      throw new DeskApiError(
        'invalid-transition',
        'Thao tác này không hợp lệ ở trạng thái hiện tại của đơn.',
        {},
        undefined,
        undefined,
        order.status,
      );
    };
    const unmet = (message: string): never => {
      throw new DeskApiError('condition-not-met', message, {}, undefined, undefined, order.status);
    };
    const toShip = order.status === 'to_ship';
    switch (command.action) {
      case 'call-attempt':
      case 'confirm':
        if (!(toShip && order.needsCall)) wrong();
        break;
      case 'ship':
        if (!toShip) wrong();
        if (order.needsCall) unmet('Đơn cần gọi xác nhận, khách chưa xác nhận nên chưa bàn giao.');
        break;
      case 'deliver':
        if (order.status !== 'to_receive') wrong();
        break;
      case 'cancel':
        switch (command.reason) {
          case 'unreachable':
            if (!(toShip && order.needsCall)) wrong();
            if (attemptsOf(order).inFirstDay < 3)
              unmet('Chưa đủ 3 lần không liên lạc được liên tiếp trong 24 giờ.');
            break;
          case 'declined_on_call':
            if (!(toShip && order.needsCall)) wrong();
            break;
          case 'customer_request':
            if (!toShip) wrong();
            break;
          case 'refused':
          case 'undeliverable':
            if (order.status !== 'to_receive') wrong();
            break;
          case 'other':
            if (!toShip && order.status !== 'to_receive') wrong();
            break;
        }
        break;
      case 'approve-cancel':
      case 'reject-cancel':
        if (order.status !== 'cancel_requested') wrong();
        break;
      case 'returned-stock':
        if (!(order.status === 'cancelled' && order.returnHandling?.state === 'pending')) wrong();
        break;
    }
    if (command.action === 'ship') {
      const code = command.trackingNumber.trim().toUpperCase();
      const clash = this.orders.some(
        (other) =>
          other.id !== order.id &&
          other.status !== 'cancelled' &&
          other.shipment?.trackingNumber === code,
      );
      if (clash) throw invalid('trackingNumber', 'Mã vận đơn này đã dùng cho đơn khác.');
    }
  }

  private staff(): DeskStaffRef {
    const user = this.session.user();
    return { name: user?.name ?? 'Nhân viên', role: user?.role ?? 'staff' };
  }

  private event(
    order: DeskOrder,
    kind: DeskEventKind,
    title: string,
    extra: Partial<DeskTimelineEntry> = {},
    next: Pick<DeskOrder, 'status' | 'paymentStatus'> = order,
    staff: DeskStaffRef = this.staff(),
  ): DeskTimelineEntry {
    return {
      at: new Date().toISOString(),
      kind,
      fromStatus: order.status,
      toStatus: next.status,
      paymentStatus: next.paymentStatus,
      actor: { type: 'staff', name: staff.name, role: staff.role },
      title,
      ...extra,
    };
  }

  /** Exactly one event per success (BR-ADM-11); the order is replaced, never edited in place. */
  private apply(order: DeskOrder, command: DeskCommand, staff = this.staff()): DeskOrder {
    const now = new Date().toISOString();
    let next: DeskOrder = { ...order };
    let entry: DeskTimelineEntry;
    switch (command.action) {
      case 'call-attempt': {
        const note = command.note?.trim();
        entry = this.event(
          order,
          'call_attempt',
          'Ghi nhận không liên lạc được',
          note ? { note } : {},
          order,
          staff,
        );
        break;
      }
      case 'confirm':
        next = {
          ...next,
          needsCall: false,
          confirmation: { confirmedAt: now, confirmedBy: staff },
        };
        entry = this.event(order, 'confirmed', 'Khách xác nhận đơn', {}, next, staff);
        break;
      case 'ship': {
        const carrier = command.carrier.trim();
        const trackingNumber = command.trackingNumber.trim().toUpperCase();
        next = {
          ...next,
          status: 'to_receive',
          shipment: { carrier, trackingNumber, handedOverAt: now, handedOverBy: staff },
        };
        entry = this.event(
          order,
          'shipped',
          'Bàn giao vận chuyển',
          { detail: `${carrier} - ${trackingNumber}` },
          next,
          staff,
        );
        break;
      }
      case 'deliver':
        next = {
          ...next,
          status: 'completed',
          paymentStatus: 'paid',
          paidAt: order.paidAt ?? now,
          deliveredAt: now,
        };
        entry = this.event(order, 'delivered', 'Giao hàng thành công', {}, next, staff);
        break;
      case 'cancel': {
        const fromTransit = order.status === 'to_receive';
        const note = command.note?.trim();
        next = {
          ...next,
          status: 'cancelled',
          needsCall: false,
          cancellation: {
            by: command.reason === 'customer_request' ? 'customer' : 'shop',
            at: now,
            reasonCode: command.reason,
            reason: REASON_TEXT[command.reason],
            ...(note ? { note } : {}),
          },
        };
        if (fromTransit) {
          next.returnHandling = { state: 'pending' };
          if (command.reason === 'refused') next.deliveryRefusedAt = now;
        } else {
          this.addStock(order, 1);
          next.stockRestoredAt = now;
        }
        entry = this.event(
          order,
          'cancelled',
          'Huỷ đơn',
          {
            detail: REASON_TEXT[command.reason],
            reasonCode: command.reason,
            ...(note ? { note } : {}),
          },
          next,
          staff,
        );
        break;
      }
      case 'add-note':
        entry = this.event(
          order,
          'note',
          'Ghi chú nội bộ',
          { note: command.note.trim() },
          order,
          staff,
        );
        break;
      case 'approve-cancel':
        next = {
          ...next,
          status: 'cancelled',
          needsCall: false,
          cancellation: { by: 'customer', at: now },
          cancelRequest: order.cancelRequest && {
            ...order.cancelRequest,
            outcome: 'approved',
            decidedAt: now,
            decidedBy: staff,
          },
          stockRestoredAt: now,
        };
        this.addStock(order, 1);
        entry = this.event(
          order,
          'cancel_approved',
          'Duyệt yêu cầu huỷ',
          { detail: order.cancelRequest?.reason },
          next,
          staff,
        );
        break;
      case 'reject-cancel': {
        const reason = command.reason.trim();
        next = {
          ...next,
          status: 'to_ship',
          cancelRequest: order.cancelRequest && {
            ...order.cancelRequest,
            outcome: 'rejected',
            decidedAt: now,
            decidedBy: staff,
            rejectReason: reason,
          },
        };
        entry = this.event(
          order,
          'cancel_rejected',
          'Từ chối yêu cầu huỷ',
          { detail: reason },
          next,
          staff,
        );
        break;
      }
      case 'returned-stock': {
        const restock = command.decision === 'restocked';
        const note = command.note?.trim();
        next.returnHandling = {
          state: command.decision,
          decidedAt: now,
          decidedBy: staff,
          ...(note ? { note } : {}),
        };
        if (restock) {
          this.addStock(order, 1);
          next.stockRestoredAt = now;
        }
        entry = this.event(
          order,
          restock ? 'stock_restocked' : 'stock_written_off',
          restock ? 'Hàng hoàn đã về kho' : 'Hàng hoàn bị loại bỏ',
          { reasonCode: command.decision, ...(note ? { note } : {}) },
          next,
          staff,
        );
        break;
      }
    }
    next.timeline = [entry, ...order.timeline];
    next.callAttempts = attemptsOf(next);
    next.tab = tabOf(next);
    this.orders = this.orders.map((item) => (item.id === next.id ? next : item));
    return next;
  }

  /** `conflict-once`: a colleague got there first. */
  private otherStaffActs(orderCode: string): void {
    const order = this.find(orderCode);
    if (!order) return;
    const colleague: DeskStaffRef = { name: 'Phạm Đồng Nghiệp', role: 'staff' };
    if (order.status === 'to_ship') {
      // Needs a call: the colleague only confirms (the status stays `to_ship`); otherwise they ship.
      if (order.needsCall)
        this.apply(order, { action: 'confirm', expectedStatus: 'to_ship' }, colleague);
      else
        this.apply(
          order,
          {
            action: 'ship',
            expectedStatus: 'to_ship',
            carrier: 'GHN',
            trackingNumber: `GHN-RACE-${order.id.slice(-4)}`,
          },
          colleague,
        );
    } else if (order.status === 'cancel_requested') {
      this.apply(
        order,
        { action: 'approve-cancel', expectedStatus: 'cancel_requested' },
        colleague,
      );
    } else if (order.status === 'to_receive') {
      this.apply(order, { action: 'deliver', expectedStatus: 'to_receive' }, colleague);
    } else if (order.returnHandling?.state === 'pending') {
      this.apply(
        order,
        { action: 'returned-stock', expectedStatus: 'cancelled', decision: 'restocked' },
        colleague,
      );
    }
  }

  private addStock(order: DeskOrder, sign: 1 | -1): void {
    for (const line of order.items)
      this.stock.set(line.variantId, (this.stock.get(line.variantId) ?? 0) + sign * line.quantity);
    this.publishStock();
  }

  private publishStock(): void {
    try {
      localStorage.setItem(DESK_STOCK_KEY, JSON.stringify(Object.fromEntries(this.stock)));
    } catch {
      /* storage unavailable: the stock stays in memory */
    }
  }

  private logCall(orderCode: string, command: DeskCommand, key: string): void {
    try {
      const calls = JSON.parse(localStorage.getItem(DESK_CALLS_KEY) ?? '[]') as unknown[];
      const { action, ...body } = command;
      calls.push({ code: orderCode, action, key, body });
      localStorage.setItem(DESK_CALLS_KEY, JSON.stringify(calls));
    } catch {
      /* storage unavailable: nothing to record */
    }
  }

  // ---- reads --------------------------------------------------------------------------------

  private find(orderCode: string): DeskOrder | undefined {
    const code = orderCode.trim().replace(/^#/, '').toUpperCase();
    return this.orders.find((order) => order.id === code);
  }

  private present(order: DeskOrder): DeskOrder {
    const admin = this.session.user()?.role === 'admin';
    return {
      ...order,
      callAttempts: attemptsOf(order),
      overdue: overdueOf(order, mockNow()),
      allowedActions: allowedFor(order, admin),
    };
  }

  private check(query: Partial<DeskOrderQuery>): DeskApiError | null {
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
