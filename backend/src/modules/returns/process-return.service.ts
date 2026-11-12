import { Prisma } from '@prisma/client';
import type { order_status, payment_status } from '@prisma/client';
import prisma from '../../config/prisma';
import { now as clockNow } from '../../lib/clock';
import { AppError, Errors } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { isRetryable } from '../../lib/retry';
import type { Db } from '../../lib/sql';
import { ts } from '../../lib/sql';
import { restockVariantTx } from '../catalog-admin/inventory.service';
import { normalizeOrderCode } from '../order/order-code';
import { scheduleEventEmail } from '../order/order-email.service';
import type { EventActorUser } from '../order/order-event';
import { UUID_RE } from '../../lib/validate';
import { computeReturnAmount } from './return-amount';
import { emitReturnEvent } from './return-events';
import { buildAdminReturn, toReturnRequest, type AdminReturnDto, type ReturnRequestDto } from './return.mapper';
import { loadReturn } from './return.query';

/** Chuyển trạng thái yêu cầu trả hàng. Mọi chuyển là so-sánh-rồi-đổi nguyên tử (plan mục 4); thua cuộc đua -> `invalid-transition`. */

export const TX = { timeout: 10_000, maxWait: 5_000 } as const;

/** Chạy giao dịch, thử lại lỗi xung đột (như `adjustStock`), không thử lại lỗi nghiệp vụ. */
export async function runTx<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction((tx) => fn(tx), TX);
    } catch (err) {
      if (!(err instanceof AppError) && attempt < 3 && isRetryable(err)) continue;
      throw err;
    }
  }
}

/** Trạng thái hiện tại (đọc lại sau khi CAS thua) -> `409 invalid-transition` kèm `currentReturnState`. */
export async function conflictOf(tx: Db, returnId: string): Promise<AppError> {
  const [r] = await tx.$queryRaw<Array<{ state: string }>>(Prisma.sql`SELECT "state" FROM "order_returns" WHERE "return_id" = ${returnId}::uuid`);
  return r ? Errors.invalidReturnTransition(r.state) : Errors.notFound();
}

/**
 * Khách huỷ (plan mục 6.2): `requested -> cancelled` + xoá số tài khoản + mở lại quyền tạo (`active_order_id = NULL`).
 * Không có yêu cầu nào của đơn -> 404; có nhưng không còn `requested` (đã duyệt / đã cancelled / ...) -> 409 `invalid-transition`.
 */
export async function cancelByCustomer(userId: string, rawCode: string): Promise<ReturnRequestDto> {
  const code = normalizeOrderCode(rawCode);
  const order = code ? await prisma.order.findUnique({ where: { code }, select: { order_id: true, userId: true } }) : null;
  if (!order || order.userId !== userId) throw Errors.notFound();

  const result = await runTx(async (tx) => {
    const at = clockNow();
    // Yêu cầu mới nhất của đơn (sống trước); khoá dòng để các bước sau thấy trạng thái thật.
    const [cur] = await tx.$queryRaw<Array<{ return_id: string; state: string }>>(Prisma.sql`
      SELECT "return_id", "state" FROM "order_returns" WHERE "order_id" = ${order.order_id}::uuid
      ORDER BY ("active_order_id" IS NOT NULL) DESC, "requested_at" DESC, "return_id" DESC LIMIT 1 FOR UPDATE`);
    if (!cur) throw Errors.notFound();
    const [done] = await tx.$queryRaw<Array<{ return_id: string }>>(Prisma.sql`
      UPDATE "order_returns" SET "state" = 'cancelled', "cancelled_at" = ${ts(at)}, "active_order_id" = NULL, "account_number_enc" = NULL
      WHERE "return_id" = ${cur.return_id}::uuid AND "state" = 'requested'
      RETURNING "return_id"`);
    if (!done) throw Errors.invalidReturnTransition(cur.state);
    const [o] = await tx.$queryRaw<Array<{ status: string; payment_status: string; payment_method: string }>>(Prisma.sql`
      SELECT "status"::text AS status, "payment_status"::text AS payment_status, "payment_method"::text AS payment_method FROM "orders" WHERE "order_id" = ${order.order_id}::uuid`);
    await emitReturnEvent(tx, {
      orderId: order.order_id, returnId: cur.return_id, orderStatus: o.status as order_status, paymentStatus: o.payment_status as payment_status, kind: 'return_cancelled', actor: 'customer', at,
    });
    const row = await loadReturn(tx, cur.return_id);
    return toReturnRequest(tx, row!, o.payment_method as 'cod' | 'bank_transfer');
  });
  logger.info('return-cancelled', { returnId: result.id, orderCode: code!, userId, action: 'cancel' });
  return result;
}

/* ------------------------------ Admin (plan mục 6.3 - 6.6) ------------------------------ */

export interface ReturnActor extends EventActorUser {
  role: 'staff' | 'admin';
}

interface Locked {
  return_id: string;
  order_id: string;
  state: string;
  amount: number;
}

/** Khoá dòng yêu cầu (trước mọi bước phụ: tồn kho, payment_status) để chúng chạy đúng một lần dưới đua. */
async function lockReturn(tx: Db, returnId: string): Promise<Locked> {
  const [r] = await tx.$queryRaw<Locked[]>(Prisma.sql`
    SELECT "return_id"::text AS return_id, "order_id"::text AS order_id, "state", "amount" FROM "order_returns" WHERE "return_id" = ${returnId}::uuid FOR UPDATE`);
  if (!r) throw Errors.notFound();
  return r;
}

async function orderOf(tx: Db, orderId: string): Promise<{ code: string; status: order_status; payment_status: payment_status }> {
  const [o] = await tx.$queryRaw<Array<{ code: string; status: order_status; payment_status: payment_status }>>(Prisma.sql`
    SELECT "code", "status"::text AS status, "payment_status"::text AS payment_status FROM "orders" WHERE "order_id" = ${orderId}::uuid`);
  return o;
}

const finish = async (id: string, actor: ReturnActor, action: string, code: string, eventId: string | null): Promise<AdminReturnDto> => {
  if (eventId) scheduleEventEmail(eventId);
  logger.info(`return-${action}`, { returnId: id, orderCode: code, userId: actor.id, action });
  return (await buildAdminReturn(prisma, id, actor.role))!;
};

const notFoundIfBad = (id: string): void => {
  if (!UUID_RE.test(id)) throw Errors.notFound();
};

export async function approveReturn(actor: ReturnActor, returnId: string, input: { note?: string; carrier?: string; trackingNumber?: string }): Promise<AdminReturnDto> {
  notFoundIfBad(returnId);
  const r = await runTx(async (tx) => {
    const at = clockNow();
    const cur = await lockReturn(tx, returnId);
    const upd = await tx.$queryRaw<Array<{ x: number }>>(Prisma.sql`
      UPDATE "order_returns" SET "state" = 'approved', "approved_at" = ${ts(at)}, "approved_by" = ${actor.id}::uuid, "approve_note" = ${input.note || null},
        "carrier" = ${input.carrier || null}, "tracking_number" = ${input.trackingNumber || null}
      WHERE "return_id" = ${returnId}::uuid AND "state" = 'requested' RETURNING 1 AS x`);
    if (upd.length === 0) throw Errors.invalidReturnTransition(cur.state);
    const o = await orderOf(tx, cur.order_id);
    const eventId = await emitReturnEvent(tx, {
      orderId: cur.order_id, returnId, orderStatus: o.status, paymentStatus: o.payment_status, kind: 'return_approved', actor: 'shop', actorUser: actor, at, detail: input.note || null,
    });
    return { eventId, code: o.code };
  });
  return finish(returnId, actor, 'approved', r.code, r.eventId);
}

export async function rejectReturn(actor: ReturnActor, returnId: string, input: { note: string }): Promise<AdminReturnDto> {
  notFoundIfBad(returnId);
  const r = await runTx(async (tx) => {
    const at = clockNow();
    const cur = await lockReturn(tx, returnId);
    const upd = await tx.$queryRaw<Array<{ x: number }>>(Prisma.sql`
      UPDATE "order_returns" SET "state" = 'rejected', "rejected_at" = ${ts(at)}, "rejected_by" = ${actor.id}::uuid, "reject_note" = ${input.note},
        "account_number_enc" = NULL
      WHERE "return_id" = ${returnId}::uuid AND "state" IN ('requested', 'approved') RETURNING 1 AS x`);
    if (upd.length === 0) throw Errors.invalidReturnTransition(cur.state);
    const o = await orderOf(tx, cur.order_id);
    const eventId = await emitReturnEvent(tx, {
      orderId: cur.order_id, returnId, orderStatus: o.status, paymentStatus: o.payment_status, kind: 'return_rejected', actor: 'shop', actorUser: actor, at, detail: input.note,
    });
    return { eventId, code: o.code };
  });
  return finish(returnId, actor, 'rejected', r.code, r.eventId);
}

export interface ReceiveInput {
  lines: Array<{ variantId: string; acceptedQuantity: number; disposition?: 'restock' | 'writeoff' }>;
  note?: string;
}

const BAD_LINES = 'Danh sách sản phẩm nhận chưa hợp lệ.';

/**
 * Nhận hàng và kiểm (6.5). Số chốt theo số lượng ĐẠT. Tổng đạt = 0 hoặc `amount <= 0` -> đóng thẳng `approved -> rejected`
 * (một sự kiện `return_rejected`, không đổi tồn / `payment_status`). Ngược lại `approved -> received` + nhập kho từng dòng `restock`.
 */
export async function receiveReturn(actor: ReturnActor, returnId: string, input: ReceiveInput): Promise<AdminReturnDto> {
  notFoundIfBad(returnId);
  const r = await runTx(async (tx) => {
    const at = clockNow();
    const cur = await lockReturn(tx, returnId);
    if (cur.state !== 'approved') throw Errors.invalidReturnTransition(cur.state);
    const items = await tx.orderReturnItem.findMany({ where: { returnId }, include: { orderItem: true } });
    const orderRow = await tx.order.findUniqueOrThrow({ where: { order_id: cur.order_id }, include: { items: true } });
    const rr = await tx.orderReturn.findUniqueOrThrow({ where: { return_id: returnId }, select: { fault: true } });

    const by = new Map(items.map((i) => [i.orderItem.variantId.toLowerCase(), i]));
    const seen = new Set<string>();
    for (const l of input.lines) {
      const key = l.variantId.toLowerCase();
      const it = by.get(key);
      if (!it || seen.has(key) || l.acceptedQuantity > it.quantity || (l.acceptedQuantity > 0 && !l.disposition)) throw Errors.validation(BAD_LINES, 'lines');
      seen.add(key);
    }
    if (seen.size !== items.length) throw Errors.validation(BAD_LINES, 'lines');
    const note = input.note ?? '';
    const shortfall = input.lines.some((l) => l.acceptedQuantity < by.get(l.variantId.toLowerCase())!.quantity);
    if (shortfall && (note.length < 5 || note.length > 250)) throw Errors.validation('Cần ghi chú từ 5 đến 250 ký tự khi có sản phẩm không đạt.', 'note');

    const acc = new Map(input.lines.map((l) => [by.get(l.variantId.toLowerCase())!.orderItemId, l]));
    const qty = new Map([...acc].map(([id, l]) => [id, l.acceptedQuantity]));
    const amt = computeReturnAmount({
      orderLines: orderRow.items.map((i) => ({ orderItemId: i.order_item_id, unitPrice: i.unitPrice, quantity: i.quantity, lineDiscount: i.lineDiscount })),
      qtyByItem: qty, fault: rr.fault as 'shop' | 'customer', shippingFee: orderRow.shippingFee, shippingDiscount: orderRow.shippingDiscount,
    });
    const sumAccepted = [...qty.values()].reduce((a, b) => a + b, 0);
    const o = await orderOf(tx, cur.order_id);

    if (sumAccepted === 0 || amt.amount <= 0) {
      for (const [orderItemId, l] of acc) {
        await tx.orderReturnItem.update({ where: { returnId_orderItemId: { returnId, orderItemId } }, data: { acceptedQuantity: l.acceptedQuantity, disposition: null } });
      }
      const upd = await tx.$queryRaw<Array<{ x: number }>>(Prisma.sql`
        UPDATE "order_returns" SET "state" = 'rejected', "rejected_at" = ${ts(at)}, "rejected_by" = ${actor.id}::uuid, "reject_note" = ${note},
          "received_at" = ${ts(at)}, "received_by" = ${actor.id}::uuid, "receive_note" = ${note || null}, "account_number_enc" = NULL
        WHERE "return_id" = ${returnId}::uuid AND "state" = 'approved' RETURNING 1 AS x`);
      if (upd.length === 0) throw Errors.invalidReturnTransition(cur.state);
      const eventId = await emitReturnEvent(tx, {
        orderId: cur.order_id, returnId, orderStatus: o.status, paymentStatus: o.payment_status, kind: 'return_rejected', actor: 'shop', actorUser: actor, at, detail: note,
      });
      return { eventId, code: o.code };
    }

    for (const [orderItemId, l] of acc) {
      await tx.orderReturnItem.update({
        where: { returnId_orderItemId: { returnId, orderItemId } },
        data: { acceptedQuantity: l.acceptedQuantity, disposition: l.acceptedQuantity > 0 ? l.disposition! : null, goodsAmount: amt.lines.get(orderItemId) ?? 0 },
      });
    }
    // Nhập kho theo variant_id tăng dần (thứ tự khoá toàn hệ thống), sau khi đã khoá dòng yêu cầu.
    const restocks = [...acc]
      .filter(([, l]) => l.acceptedQuantity > 0 && l.disposition === 'restock')
      .map(([id, l]) => ({ v: orderRow.items.find((i) => i.order_item_id === id)!.variantId, q: l.acceptedQuantity }));
    restocks.sort((a, b) => (a.v < b.v ? -1 : 1));
    for (const x of restocks) await restockVariantTx(tx, { variantId: x.v, qty: x.q, at, actor, note: `Trả hàng #${o.code}` });

    const upd = await tx.$queryRaw<Array<{ x: number }>>(Prisma.sql`
      UPDATE "order_returns" SET "state" = 'received', "received_at" = ${ts(at)}, "received_by" = ${actor.id}::uuid, "receive_note" = ${note || null},
        "goods_amount" = ${amt.goodsAmount}, "shipping_refund" = ${amt.shippingRefund}, "return_shipping_fee" = ${amt.returnShippingFee}, "amount" = ${amt.amount}, "amount_final" = TRUE
      WHERE "return_id" = ${returnId}::uuid AND "state" = 'approved' RETURNING 1 AS x`);
    if (upd.length === 0) throw Errors.invalidReturnTransition(cur.state);
    const eventId = await emitReturnEvent(tx, {
      orderId: cur.order_id, returnId, orderStatus: o.status, paymentStatus: o.payment_status, kind: 'return_received', actor: 'shop', actorUser: actor, at, detail: null,
    });
    return { eventId, code: o.code };
  });
  return finish(returnId, actor, 'received', r.code, r.eventId);
}

/**
 * Xác nhận đã hoàn tiền (6.6, chỉ admin). `amount` PHẢI bằng số đã chốt (kiểm SAU khi biết trạng thái). Đây là chỗ DUY NHẤT ghi
 * `payment_status = refunded | partially_refunded`.
 */
export async function refundReturn(actor: ReturnActor, returnId: string, input: { amount: number; refundReference: string }): Promise<AdminReturnDto> {
  notFoundIfBad(returnId);
  const r = await runTx(async (tx) => {
    const at = clockNow();
    const cur = await lockReturn(tx, returnId);
    if (cur.state !== 'received') throw Errors.invalidReturnTransition(cur.state);
    if (input.amount !== cur.amount) throw Errors.validation('Số tiền không khớp số đã chốt. Vui lòng tải lại.', 'amount');
    const upd = await tx.$queryRaw<Array<{ x: number }>>(Prisma.sql`
      UPDATE "order_returns" SET "state" = 'refunded', "refunded_at" = ${ts(at)}, "refunded_by" = ${actor.id}::uuid, "refund_reference" = ${input.refundReference},
        "account_number_enc" = NULL
      WHERE "return_id" = ${returnId}::uuid AND "state" = 'received' RETURNING 1 AS x`);
    if (upd.length === 0) throw Errors.invalidReturnTransition(cur.state);
    const [o] = await tx.$queryRaw<Array<{ code: string; payment_status: payment_status }>>(Prisma.sql`
      UPDATE "orders" SET "payment_status" = (CASE WHEN
          (SELECT COALESCE(SUM("accepted_quantity"), 0) FROM "order_return_items" WHERE "return_id" = ${returnId}::uuid)
          = (SELECT COALESCE(SUM("quantity"), 0) FROM "order_items" WHERE "order_id" = ${cur.order_id}::uuid)
        THEN 'refunded' ELSE 'partially_refunded' END)::"payment_status"
      WHERE "order_id" = ${cur.order_id}::uuid AND "status" = 'completed' AND "payment_status" = 'paid'
      RETURNING "code", "payment_status"::text AS payment_status`);
    if (!o) throw Errors.unavailable(); // bất biến bị phá: rollback trọn gói
    const eventId = await emitReturnEvent(tx, {
      orderId: cur.order_id, returnId, orderStatus: 'completed', paymentStatus: o.payment_status, kind: 'return_refunded', actor: 'shop', actorUser: actor, at, detail: null,
    });
    return { eventId, code: o.code };
  });
  return finish(returnId, actor, 'refunded', r.code, r.eventId);
}
