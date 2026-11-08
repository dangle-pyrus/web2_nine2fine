import { Prisma } from '@prisma/client';
import type { order_event_kind, order_status, payment_status } from '@prisma/client';
import prisma from '../../config/prisma';
import { customerCancellableFrom } from '../../config/assumptions';
import { now as clockNow } from '../../lib/clock';
import { Errors } from '../../lib/errors';
import type { Db } from '../../lib/sql';
import { ts } from '../../lib/sql';
import { runInBackground, sendMail } from '../../mail/mailer';
import { orderCancelledMail } from '../../mail/order-templates';
import { EventActorUser, insertOrderEvent } from './order-event';
import { ORDER_INCLUDE, toOrderDto } from './order.mapper';

/**
 * Huỷ đơn / hết hạn: hoàn tồn đúng số đã trừ và trả lượt voucher còn hạn, đúng MỘT lần (BR-CHK-14, 23; BR-VOU-12).
 * Thứ tự khoá toàn hệ thống: dòng `orders` đích -> `vouchers` (theo voucher_id) -> `product_variants` (theo variant_id).
 */

export type CancelActor = 'customer' | 'shop' | 'system';

export interface CancelledInfo {
  orderId: string;
  eventId: string;
  fromStatus: order_status;
}

/** Tham số dịch vụ huỷ dùng chung (plan mục 6.4). */
export interface CancelOptions {
  orderId: string;
  at: Date;
  /** Actor của sự kiện. */
  actor: CancelActor;
  /** Cột `cancelled_by` (`customer_request` = 'customer' dù actor = 'shop'). Mặc định = actor. */
  cancelledBy?: CancelActor;
  actorUser?: EventActorUser;
  allowedFrom: readonly string[];
  /** Cộng lại tồn ngay (đặt `stock_restored_at`). Huỷ từ `to_receive` (hai bước) = false. */
  restoreStock: boolean;
  /** Cột `cancel_reason`: chuỗi hiển thị cho khách. */
  reason: string | null;
  reasonCode?: string | null;
  /** Ghi chú nội bộ của huỷ do shop (`cancel_note` + `internal_note` của sự kiện); không bao giờ vào DTO khách / email. */
  cancelNote?: string | null;
  markReturned?: boolean;
  markRefused?: boolean;
  eventKind?: Extract<order_event_kind, 'cancelled' | 'cancel_approved'>;
  /** Phần khách thấy ở timeline; mặc định = reason. */
  eventDetail?: string | null;
  emailTemplate?: string | null;
}

/** Cộng lại đúng số đã trừ của từng dòng, theo variant_id tăng dần (thứ tự khoá toàn hệ thống). */
async function addBackStock(tx: Db, orderId: string, at: Date): Promise<void> {
  const items = await tx.$queryRaw<Array<{ variant_id: string; quantity: number }>>(Prisma.sql`
    SELECT "variant_id", "quantity" FROM "order_items" WHERE "order_id" = ${orderId}::uuid ORDER BY "variant_id"`);
  for (const i of items) {
    await tx.$executeRaw(Prisma.sql`
      UPDATE "product_variants" SET "inventory_qty" = "inventory_qty" + ${i.quantity}, "updated_at" = ${ts(at)}
      WHERE "variant_id" = ${i.variant_id}::uuid`);
  }
}

/** Trả lượt voucher của đơn (mã còn hạn), khoá voucher theo voucher_id tăng dần. Mỗi lượt trả đúng một lần (`released_at`). */
async function releaseVouchers(tx: Db, orderId: string, at: Date): Promise<void> {
  const held = await tx.$queryRaw<Array<{ voucher_id: string }>>(Prisma.sql`
    SELECT "voucher_id" FROM "voucher_redemptions" WHERE "order_id" = ${orderId}::uuid AND "released_at" IS NULL ORDER BY "voucher_id"`);
  if (held.length === 0) return;
  await tx.$queryRaw(Prisma.sql`
    SELECT 1 FROM "vouchers" WHERE "voucher_id" = ANY(${held.map((h) => h.voucher_id)}::uuid[]) ORDER BY "voucher_id" FOR UPDATE`);
  // Mã đã hết hạn lúc huỷ thì KHÔNG trả lượt (released_at giữ NULL, vẫn tính lượt riêng của khách).
  const released = await tx.$queryRaw<Array<{ voucher_id: string }>>(Prisma.sql`
    UPDATE "voucher_redemptions" r SET "released_at" = ${ts(at)}
    FROM "vouchers" v
    WHERE r."order_id" = ${orderId}::uuid AND r."released_at" IS NULL AND v."voucher_id" = r."voucher_id"
      AND (v."ends_at" IS NULL OR v."ends_at" > ${ts(at)})
    RETURNING r."voucher_id"`);
  for (const r of released.sort((a, b) => (a.voucher_id < b.voucher_id ? -1 : 1))) {
    await tx.$executeRaw(Prisma.sql`
      UPDATE "vouchers" SET "used_count" = "used_count" - 1, "updated_at" = ${ts(at)} WHERE "voucher_id" = ${r.voucher_id}::uuid`);
  }
}

/**
 * Dịch vụ huỷ dùng chung (khách, hết hạn, shop). Trong giao dịch `tx`; khoá dòng đơn. Trả `null` nếu đơn không ở trạng thái
 * cho phép hoặc đã hoàn tồn: không đổi gì. `stock_restored_at` chỉ đặt khi thật sự cộng tồn (một dấu cho mọi đường).
 */
export async function cancelOrderWith(tx: Db, p: CancelOptions): Promise<CancelledInfo | null> {
  const { orderId, at } = p;
  const [row] = await tx.$queryRaw<Array<{ status: string; stock_restored_at: Date | null }>>(Prisma.sql`
    SELECT "status"::text AS "status", "stock_restored_at" FROM "orders" WHERE "order_id" = ${orderId}::uuid FOR UPDATE`);
  if (!row || !p.allowedFrom.includes(row.status) || row.stock_restored_at !== null) return null;

  const cancelledBy = p.cancelledBy ?? p.actor;
  const [updated] = await tx.$queryRaw<Array<{ payment_status: string }>>(Prisma.sql`
    UPDATE "orders" SET "status" = 'cancelled', "cancelled_at" = ${ts(at)}, "cancelled_by" = ${cancelledBy}::"order_actor",
      "cancel_reason" = ${p.reason},
      "cancel_reason_code" = ${p.reasonCode ?? null},
      "cancel_note" = ${p.cancelNote ?? null},
      "stock_restored_at" = ${p.restoreStock ? ts(at) : Prisma.sql`NULL`},
      "returned_from_transit" = ${p.markReturned === true},
      "delivery_refused_at" = ${p.markRefused ? ts(at) : Prisma.sql`"delivery_refused_at"`},
      "active_tracking_number" = NULL
    WHERE "order_id" = ${orderId}::uuid AND "status" = ANY(${p.allowedFrom as string[]}::"order_status"[]) AND "stock_restored_at" IS NULL
    RETURNING "payment_status"::text AS "payment_status"`);
  if (!updated) return null;

  await releaseVouchers(tx, orderId, at);
  if (p.restoreStock) await addBackStock(tx, orderId, at);

  const eventId = await insertOrderEvent(tx, {
    orderId,
    at,
    fromStatus: row.status as order_status,
    toStatus: 'cancelled',
    paymentStatus: updated.payment_status as payment_status,
    actor: p.actor,
    actorUser: p.actorUser,
    kind: p.eventKind ?? 'cancelled',
    detail: p.eventDetail === undefined ? p.reason : p.eventDetail,
    reasonCode: p.reasonCode ?? null,
    internalNote: p.cancelNote ?? null,
    emailTemplate: p.emailTemplate ?? null,
  });
  return { orderId, eventId, fromStatus: row.status as order_status };
}

/** Chữ ký Slice 3 (khách / hết hạn): luôn hoàn tồn, `cancelled_by` = actor. Giữ nguyên hành vi đã nghiệm thu (R1). */
export function cancelOrderTx(
  tx: Db,
  orderId: string,
  actor: CancelActor,
  reason: string | null,
  allowedFrom: readonly string[],
  at: Date,
): Promise<CancelledInfo | null> {
  return cancelOrderWith(tx, { orderId, at, actor, allowedFrom, restoreStock: true, reason });
}

/**
 * Hàng hoàn về kho (T11, S4-Q2): đơn `cancelled` từ `to_receive`, chưa xử lý, chưa hoàn tồn. Đặt `stock_restored_at` +
 * `return_*` rồi cộng tồn, đúng một lần (đai: `WHERE ... IS NULL`). Dòng đơn phải đã được khoá bởi người gọi.
 * Trả false nếu không còn hợp lệ (không đổi gì).
 */
export async function restockReturnedTx(tx: Db, orderId: string, by: string, note: string | null, at: Date): Promise<boolean> {
  const n = await tx.$executeRaw(Prisma.sql`
    UPDATE "orders" SET "stock_restored_at" = ${ts(at)}, "return_handled_at" = ${ts(at)}, "return_handled_by" = ${by}::uuid,
      "return_decision" = 'restocked', "return_note" = ${note}
    WHERE "order_id" = ${orderId}::uuid AND "status" = 'cancelled' AND "returned_from_transit"
      AND "return_handled_at" IS NULL AND "stock_restored_at" IS NULL`);
  if (n !== 1) return false;
  await addBackStock(tx, orderId, at);
  return true;
}

/** Email "đơn đã huỷ" gửi nền sau commit; lỗi chỉ log (không bảng theo dõi). */
export function scheduleCancelEmail(orderId: string): void {
  runInBackground('order-cancel-email', async () => {
    const o = await prisma.order.findUnique({ where: { order_id: orderId }, include: ORDER_INCLUDE });
    if (!o) return;
    await sendMail(orderCancelledMail(toOrderDto(o), o.userId !== null));
  });
}

/** Khách / chủ đơn huỷ (đã kiểm quyền). Trả `Errors.notCancellable()` nếu không huỷ được. */
export async function cancelByCustomer(orderId: string, reason: string | null, at: Date = clockNow()): Promise<void> {
  const done = await prisma.$transaction(
    (tx) => cancelOrderTx(tx, orderId, 'customer', reason, customerCancellableFrom(), at),
    { timeout: 10_000, maxWait: 5_000 },
  );
  if (!done) throw Errors.notCancellable();
  scheduleCancelEmail(orderId);
}
