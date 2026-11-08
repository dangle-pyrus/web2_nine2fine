import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { getConfig } from '../../config/env';
import { now as clockNow } from '../../lib/clock';
import { logger } from '../../lib/logger';
import { ts } from '../../lib/sql';
import { runInBackground, sendMail } from '../../mail/mailer';
import type { MailMessage } from '../../mail/mailer';
import {
  cancelApprovedMail, cancelRejectedMail, emailFailureSupportMail, eventEmailFailureSupportMail, orderAwaitingPaymentMail, orderCancelledMail, orderConfirmedMail,
  orderDeliveredMail, orderShippedMail,
} from '../../mail/order-templates';
import type { OrderDto } from './order.mapper';
import { ORDER_INCLUDE, toOrderDto } from './order.mapper';

/**
 * Email xác nhận đơn (BR-CHK-28): gửi nền sau commit, thử tối đa 3 lần (ngay, +10 giây, +60 giây, tổng < 5 phút),
 * mỗi lần tăng `email_attempts`. Sau lần 3 lỗi: báo CSKH (không kèm email khách) và log chỉ mã đơn + tên lỗi.
 * Đơn KHÔNG bao giờ bị huỷ vì email lỗi.
 */

const MAX_ATTEMPTS = 3;
let retryDelaysMs: number[] = [0, 10_000, 60_000];

/** Chỉ cho test: rút ngắn khoảng chờ giữa các lần thử. */
export function setEmailRetryDelays(delays: number[]): void {
  retryDelaysMs = delays;
}

const sleep = (ms: number) => new Promise<void>((r) => (ms > 0 ? setTimeout(r, ms) : r()));

type Attempt = 'sent' | 'failed' | 'skipped';

/** Một lần thử: tăng bộ đếm nguyên tử trước khi gửi (hai tiến trình không gửi trùng quá 3 lần). */
async function attemptOnce(orderId: string, at: Date): Promise<Attempt> {
  const claimed = await prisma.$queryRaw<Array<{ order_id: string }>>(Prisma.sql`
    UPDATE "orders" SET "email_attempts" = "email_attempts" + 1
    WHERE "order_id" = ${orderId}::uuid AND "confirmation_email_sent_at" IS NULL AND "email_attempts" < ${MAX_ATTEMPTS}
    RETURNING "order_id"`);
  if (claimed.length === 0) return 'skipped';
  const order = await prisma.order.findUnique({ where: { order_id: orderId }, include: ORDER_INCLUDE });
  if (!order) return 'skipped';
  if (order.status === 'cancelled') {
    // Đơn đã huỷ trước khi thư xác nhận kịp gửi: không gửi, đánh dấu để khỏi thử lại.
    await prisma.$executeRaw(Prisma.sql`UPDATE "orders" SET "confirmation_email_sent_at" = ${ts(at)} WHERE "order_id" = ${orderId}::uuid`);
    return 'skipped';
  }
  const dto = toOrderDto(order);
  const isMember = order.userId !== null;
  try {
    await sendMail(order.status === 'to_pay' ? orderAwaitingPaymentMail(dto, isMember) : orderConfirmedMail(dto, isMember));
  } catch (err) {
    logger.error('order-email-failed', { order: order.code, reason: err instanceof Error ? err.name : 'unknown' });
    return 'failed';
  }
  await prisma.$executeRaw(Prisma.sql`UPDATE "orders" SET "confirmation_email_sent_at" = ${ts(at)} WHERE "order_id" = ${orderId}::uuid`);
  return 'sent';
}

async function notifySupport(orderId: string): Promise<void> {
  const o = await prisma.order.findUnique({ where: { order_id: orderId }, select: { code: true } });
  if (!o) return;
  try {
    await sendMail(emailFailureSupportMail(getConfig().supportEmail, o.code));
  } catch (err) {
    logger.error('order-email-support-failed', { order: o.code, reason: err instanceof Error ? err.name : 'unknown' });
  }
}

/** Gọi sau khi giao dịch tạo đơn commit. Không chờ (chạy nền, `flushMail()` chờ được trong test). */
export function scheduleOrderEmail(orderId: string): void {
  runInBackground('order-email', async () => {
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await sleep(retryDelaysMs[i] ?? 0);
      const r = await attemptOnce(orderId, clockNow());
      if (r !== 'failed') return;
    }
    await notifySupport(orderId);
  });
}

/** Job nền: gửi lại thư cho đơn chưa gửi (tiến trình chết sau commit): 2 phút đến 1 giờ tuổi, chưa đủ 3 lần. */
export async function retryPendingEmails(at: Date = clockNow()): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ order_id: string }>>(Prisma.sql`
    SELECT "order_id" FROM "orders"
    WHERE "confirmation_email_sent_at" IS NULL AND "email_attempts" < ${MAX_ATTEMPTS}
      AND "created_at" BETWEEN ${ts(new Date(at.getTime() - 3_600_000))} AND ${ts(new Date(at.getTime() - 120_000))}
    ORDER BY "created_at" LIMIT 50`);
  let sent = 0;
  for (const r of rows) {
    const result = await attemptOnce(r.order_id, at);
    if (result === 'sent') sent++;
    if (result === 'failed') {
      const o = await prisma.order.findUnique({ where: { order_id: r.order_id }, select: { emailAttempts: true } });
      if ((o?.emailAttempts ?? 0) >= MAX_ATTEMPTS) await notifySupport(r.order_id);
    }
  }
  return sent;
}

/* ---------------- Thư theo sự kiện (Slice 4, BR-ADM-35; plan mục 8) ---------------- */

/** Tên thư lưu ở `order_events.email_template` -> nội dung. */
const EVENT_TEMPLATES: Record<string, (o: OrderDto, isMember: boolean) => MailMessage> = {
  'order-shipped': orderShippedMail,
  'order-delivered': orderDeliveredMail,
  'order-cancelled-shop': orderCancelledMail,
  'cancel-approved': cancelApprovedMail,
  'cancel-rejected': cancelRejectedMail,
};

/** Một lần thử: CAS `email_attempts` (ai thắng mới gửi, nên gửi nền và job bù không trùng; mỗi sự kiện tối đa 1 thư). */
async function attemptEventOnce(eventId: string, at: Date): Promise<Attempt> {
  const claimed = await prisma.$queryRaw<Array<{ order_id: string; email_template: string | null }>>(Prisma.sql`
    UPDATE "order_events" SET "email_attempts" = "email_attempts" + 1
    WHERE "event_id" = ${eventId}::uuid AND "email_sent_at" IS NULL AND "email_template" IS NOT NULL AND "email_attempts" < ${MAX_ATTEMPTS}
    RETURNING "order_id", "email_template"`);
  const c = claimed[0];
  if (!c || !c.email_template) return 'skipped';
  const build = EVENT_TEMPLATES[c.email_template];
  const order = await prisma.order.findUnique({ where: { order_id: c.order_id }, include: ORDER_INCLUDE });
  if (!build || !order) {
    // Mẫu lạ / đơn mất: đánh dấu để khỏi thử lại (không có thư).
    await prisma.$executeRaw(Prisma.sql`UPDATE "order_events" SET "email_sent_at" = ${ts(at)} WHERE "event_id" = ${eventId}::uuid`);
    return 'skipped';
  }
  try {
    await sendMail(build(toOrderDto(order), order.userId !== null));
  } catch (err) {
    logger.error('order-event-email-failed', { order: order.code, eventId, reason: err instanceof Error ? err.name : 'unknown' });
    return 'failed';
  }
  await prisma.$executeRaw(Prisma.sql`UPDATE "order_events" SET "email_sent_at" = ${ts(at)} WHERE "event_id" = ${eventId}::uuid`);
  return 'sent';
}

async function notifySupportForEvent(eventId: string): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ code: string }>>(Prisma.sql`
    SELECT o."code" FROM "order_events" e JOIN "orders" o ON o."order_id" = e."order_id" WHERE e."event_id" = ${eventId}::uuid`);
  const code = rows[0]?.code;
  if (!code) return;
  try {
    await sendMail(eventEmailFailureSupportMail(getConfig().supportEmail, code));
  } catch (err) {
    logger.error('order-event-email-support-failed', { order: code, reason: err instanceof Error ? err.name : 'unknown' });
  }
}

/** Gọi SAU commit của hành động admin: lần 1 ngay, lần 2 +10 giây, lần 3 +60 giây; vẫn lỗi -> báo CSKH. Không chờ. */
export function scheduleEventEmail(eventId: string): void {
  runInBackground('order-event-email', async () => {
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await sleep(retryDelaysMs[i] ?? 0);
      const r = await attemptEventOnce(eventId, clockNow());
      if (r !== 'failed') return; // 'skipped': đã gửi / người khác đang giữ lượt
    }
    await notifySupportForEvent(eventId);
  });
}

/** Job nền: bù thư của sự kiện chưa gửi (tiến trình chết sau commit): 2 phút đến 1 giờ tuổi, chưa đủ 3 lần. */
export async function retryPendingEventEmails(at: Date = clockNow()): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ event_id: string }>>(Prisma.sql`
    SELECT "event_id" FROM "order_events"
    WHERE "email_template" IS NOT NULL AND "email_sent_at" IS NULL AND "email_attempts" < ${MAX_ATTEMPTS}
      AND "at" BETWEEN ${ts(new Date(at.getTime() - 3_600_000))} AND ${ts(new Date(at.getTime() - 120_000))}
    ORDER BY "at" LIMIT 50`);
  let sent = 0;
  for (const r of rows) {
    const result = await attemptEventOnce(r.event_id, at);
    if (result === 'sent') sent++;
    if (result === 'failed') {
      const [e] = await prisma.$queryRaw<Array<{ email_attempts: number }>>(Prisma.sql`
        SELECT "email_attempts" FROM "order_events" WHERE "event_id" = ${r.event_id}::uuid`);
      if ((e?.email_attempts ?? 0) >= MAX_ATTEMPTS) await notifySupportForEvent(r.event_id);
    }
  }
  return sent;
}
