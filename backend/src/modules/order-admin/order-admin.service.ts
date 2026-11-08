import { Prisma } from '@prisma/client';
import type { order_status, payment_status, user_role } from '@prisma/client';
import { ADMIN_ASSUMPTIONS } from '../../config/assumptions';
import prisma from '../../config/prisma';
import { now as clockNow } from '../../lib/clock';
import { AppError, Errors } from '../../lib/errors';
import { logger } from '../../lib/logger';
import type { Db } from '../../lib/sql';
import { ts } from '../../lib/sql';
import { cancelOrderWith } from '../order/cancel-order.service';
import { acquireIdempotency, completeIdempotency, requestHash } from '../order/idempotency';
import { EventActorUser, insertOrderEvent, staffDisplayName } from '../order/order-event';
import { scheduleEventEmail } from '../order/order-email.service';
import { ADMIN_ORDER_INCLUDE, toAdminOrder } from './order-admin.mapper';
import type { CallAttemptBody, CancelBody } from './order-admin.schemas';
import {
  AdminAction, AdminCancelReason, callStatsOf, cancelActionOf, checkTransition, SHOP_CANCEL_REASON_TEXT, StateOrder,
} from './order-state';

/**
 * Khuôn MỘT hành động admin (plan mục 6.1): một giao dịch = khoá dòng đơn -> idempotency -> so `expectedStatus` ->
 * kiểm `TRANSITIONS` -> UPDATE + hiệu ứng phụ -> đúng 1 `order_events` -> (khoá idempotency) -> đọc lại AdminOrder.
 * Thư lên lịch SAU commit. Thứ tự khoá: orders -> vouchers -> product_variants -> chỉ INSERT.
 */

export interface Actor {
  id: string;
  role: user_role;
  firstName: string;
  lastName: string;
}

export type ActionInput =
  | { kind: 'call-attempt'; body: CallAttemptBody }
  | { kind: 'confirm'; body: { expectedStatus: order_status } }
  | { kind: 'cancel'; body: CancelBody };

interface LockedOrder {
  order_id: string;
  code: string;
  status: order_status;
  payment_status: payment_status;
  payment_method: 'cod' | 'bank_transfer';
  needs_confirm_call: boolean;
  confirmed_at: Date | null;
  returned_from_transit: boolean;
  return_handled_at: Date | null;
  stock_restored_at: Date | null;
}

interface Ctx {
  tx: Db;
  o: LockedOrder;
  at: Date;
  actor: Actor;
  user: EventActorUser;
}

/** Kết quả một hành động: `event_id` vừa ghi (có thư thì lên lịch sau commit). */
interface Done {
  eventId: string;
  emailTemplate: string | null;
}

export interface ActionResult {
  order: unknown;
  replayed: boolean;
}

const actionOf = (a: ActionInput): AdminAction => {
  switch (a.kind) {
    case 'cancel':
      return cancelActionOf(a.body.reason as AdminCancelReason);
    default:
      return a.kind;
  }
};

async function loadAdminOrder(db: Db, orderId: string, role: user_role) {
  const row = await db.order.findUniqueOrThrow({ where: { order_id: orderId }, include: ADMIN_ORDER_INCLUDE });
  return toAdminOrder(row, role);
}

async function callTimes(tx: Db, orderId: string): Promise<Date[]> {
  const rows = await tx.$queryRaw<Array<{ at: Date }>>(Prisma.sql`
    SELECT "at" FROM "order_events" WHERE "order_id" = ${orderId}::uuid AND "kind" = 'call_attempt' ORDER BY "at"`);
  return rows.map((r) => r.at);
}

/** 0 dòng sau khoá (không nên xảy ra) = người khác đã đổi đơn. */
async function stateChanged(c: Ctx): Promise<never> {
  const [now] = await c.tx.$queryRaw<Array<{ status: string }>>(Prisma.sql`SELECT "status"::text AS "status" FROM "orders" WHERE "order_id" = ${c.o.order_id}::uuid`);
  throw Errors.orderStateChanged(await loadAdminOrder(c.tx, c.o.order_id, c.actor.role), now?.status ?? c.o.status);
}

/* ---------------- Từng hành động (bảng mục 4) ---------------- */

async function doCallAttempt(c: Ctx, b: CallAttemptBody): Promise<Done> {
  const eventId = await insertOrderEvent(c.tx, {
    orderId: c.o.order_id, at: c.at, fromStatus: 'to_ship', toStatus: 'to_ship', paymentStatus: c.o.payment_status,
    actor: 'shop', actorUser: c.user, kind: 'call_attempt', internalNote: b.note ?? null,
  });
  return { eventId, emailTemplate: null };
}

async function doConfirm(c: Ctx): Promise<Done> {
  const n = await c.tx.$executeRaw(Prisma.sql`
    UPDATE "orders" SET "confirmed_at" = ${ts(c.at)}, "confirmed_by" = ${c.user.id}::uuid
    WHERE "order_id" = ${c.o.order_id}::uuid AND "status" = 'to_ship' AND "confirmed_at" IS NULL`);
  if (n !== 1) await stateChanged(c);
  const eventId = await insertOrderEvent(c.tx, {
    orderId: c.o.order_id, at: c.at, fromStatus: 'to_ship', toStatus: 'to_ship', paymentStatus: c.o.payment_status,
    actor: 'shop', actorUser: c.user, kind: 'confirmed',
  });
  return { eventId, emailTemplate: null };
}

async function doCancel(c: Ctx, b: CancelBody): Promise<Done> {
  const reason = b.reason as AdminCancelReason;
  const fromTransit = c.o.status === 'to_receive';
  const twoStep = ADMIN_ASSUMPTIONS.returnStockMode === 'two-step';
  const text = SHOP_CANCEL_REASON_TEXT[reason];
  const r = await cancelOrderWith(c.tx, {
    orderId: c.o.order_id,
    at: c.at,
    actor: 'shop',
    cancelledBy: reason === 'customer_request' ? 'customer' : 'shop',
    actorUser: c.user,
    allowedFrom: [c.o.status],
    // Từ `to_ship`: hoàn tồn ngay. Từ `to_receive` (S4-Q2 hai bước): chưa cộng, chờ `returned-stock`.
    restoreStock: !fromTransit || !twoStep,
    reason: text,
    reasonCode: reason,
    cancelNote: b.note ?? null,
    markReturned: fromTransit && twoStep,
    markRefused: reason === 'refused',
    eventKind: 'cancelled',
    eventDetail: text,
    emailTemplate: 'order-cancelled-shop',
  });
  if (!r) return stateChanged(c);
  return { eventId: r.eventId, emailTemplate: 'order-cancelled-shop' };
}

/* ---------------- Khuôn chung ---------------- */

const isRetryable = (err: unknown): boolean => {
  const e = err as { code?: string; meta?: { code?: string }; message?: string };
  return e?.code === 'P2034' || e?.meta?.code === '40P01' || e?.meta?.code === '40001' || /\b40P01\b/.test(String(e?.message ?? ''));
};

export async function runAction(p: {
  code: string;
  actor: Actor;
  input: ActionInput;
  /** Idempotency-Key (đã kiểm dạng) hoặc undefined. */
  key?: string;
  /** Đường dẫn của yêu cầu (vào request_hash: cùng khoá, khác đường dẫn -> conflict). */
  path: string;
}): Promise<ActionResult> {
  const action = actionOf(p.input);
  const user: EventActorUser = {
    id: p.actor.id,
    name: staffDisplayName(p.actor),
    role: p.actor.role === 'admin' ? 'admin' : 'staff',
  };
  const hash = p.key ? requestHash({ method: 'POST', path: p.path, body: p.input.body }, p.actor.id) : '';

  for (let attempt = 1; ; attempt++) {
    try {
      const out = await prisma.$transaction(
        async (tx) => {
          const at = clockNow();
          // 1. Khoá dòng đơn.
          const [o] = await tx.$queryRaw<LockedOrder[]>(Prisma.sql`
            SELECT "order_id", "code", "status"::text AS "status", "payment_status"::text AS "payment_status",
                   "payment_method"::text AS "payment_method", "needs_confirm_call", "confirmed_at",
                   "returned_from_transit", "return_handled_at", "stock_restored_at"
            FROM "orders" WHERE "code" = ${p.code} FOR UPDATE`);
          if (!o) throw Errors.notFound('Không tìm thấy đơn hàng.');

          // 2. Idempotency (sau khoá đơn: yêu cầu trùng khoá chạy tuần tự trên dòng đơn).
          if (p.key) {
            const acq = await acquireIdempotency(tx, 'admin-action', p.key, hash, at);
            if (acq.kind === 'replay') return { order: acq.snapshot, replayed: true, done: null };
          }

          // 3. expectedStatus.
          if (p.input.body.expectedStatus !== o.status) {
            throw Errors.orderStateChanged(await loadAdminOrder(tx, o.order_id, p.actor.role), o.status);
          }

          // 4. Máy trạng thái (cùng bảng với allowedActions).
          const state: StateOrder = {
            status: o.status, paymentMethod: o.payment_method, needsConfirmCall: o.needs_confirm_call, confirmedAt: o.confirmed_at,
            returnedFromTransit: o.returned_from_transit, returnHandledAt: o.return_handled_at, stockRestoredAt: o.stock_restored_at,
          };
          const stats = callStatsOf(action === 'cancel-unreachable' ? await callTimes(tx, o.order_id) : []);
          const v = checkTransition(action, state, p.actor.role, stats);
          if (!v.ok) {
            if (v.kind === 'forbidden') throw Errors.forbidden();
            if (v.kind === 'condition-not-met') throw Errors.conditionNotMet(v.message, o.status);
            throw Errors.invalidTransition(o.status);
          }

          // 5-7. Thực hiện + đúng 1 sự kiện.
          const c: Ctx = { tx, o, at, actor: p.actor, user };
          const i = p.input;
          const done =
            i.kind === 'call-attempt' ? await doCallAttempt(c, i.body)
            : i.kind === 'confirm' ? await doConfirm(c)
            : await doCancel(c, i.body);

          // 9. Đọc lại (cùng tx); 8. lưu khoá idempotency với bản chụp.
          const order = await loadAdminOrder(tx, o.order_id, p.actor.role);
          if (p.key) await completeIdempotency(tx, 'admin-action', p.key, { orderId: o.order_id, snapshot: order });
          return { order, replayed: false, done };
        },
        { timeout: 10_000, maxWait: 5_000 },
      );
      if (out.done) {
        logger.info('admin-order-action', { order: p.code, action, userId: p.actor.id });
        if (out.done.emailTemplate) scheduleEventEmail(out.done.eventId);
      }
      return { order: out.order, replayed: out.replayed };
    } catch (err) {
      if (!(err instanceof AppError) && attempt < 3 && isRetryable(err)) {
        await new Promise((r) => setTimeout(r, 20 * attempt));
        continue;
      }
      throw err;
    }
  }
}
