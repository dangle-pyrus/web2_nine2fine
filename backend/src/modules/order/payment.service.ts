import { randomUUID } from 'node:crypto';
import { Prisma, type payment_status } from '@prisma/client';
import type { Request } from 'express';
import { getConfig } from '../../config/env';
import prisma from '../../config/prisma';
import { now as clockNow } from '../../lib/clock';
import { Errors } from '../../lib/errors';
import { logger } from '../../lib/logger';
import type { Db } from '../../lib/sql';
import { ts } from '../../lib/sql';
import { estimateDeliveryFromDb } from '../checkout/delivery';
import { getSettings } from '../store/settings.service';
import { scheduleEventEmail } from './order-email.service';
import { insertOrderEvent } from './order-event';
import { expireIfDue, loadAccessibleOrder } from './order.service';

/**
 * Chuyển khoản QR tự đối soát (BR-CHK-21, plan cart-checkout mục 4.8).
 * - `getPaymentSession`: trang thanh toán của đơn (QR SePay động: số tiền + nội dung = mã đơn).
 * - `applyIncomingTransfer`: SePay báo tiền về (webhook) -> ghi `payment_transactions` (idempotent theo mã giao dịch),
 *   đủ tiền thì `to_pay` -> `to_ship` + `paid`; thiếu giữ `to_pay` (trang báo số còn thiếu); thừa / trùng / sau huỷ
 *   ghi sự kiện để kế toán hoàn tay (1-3 ngày làm việc).
 * QR chưa bật (thiếu cờ DB, tài khoản hoặc khoá webhook) hoặc đơn COD -> 404 not-found.
 */
export interface PaymentSessionDto {
  orderId: string;
  amount: number;
  status: 'awaiting' | 'paid' | 'expired';
  expiresAt: string;
  paidAt?: string;
  transferContent: string;
  account: { bank: string; accountName: string; accountNumber: string };
  qrImageUrl: string;
  shortfall?: number;
  /** Chế độ giả lập (PAYMENT_SIMULATOR): FE hiện nút giả lập tiền về. */
  simulated?: boolean;
}

/** Ảnh QR động của SePay (chuẩn VietQR/Napas 247): nhúng số tài khoản, số tiền và nội dung = mã đơn. */
export function sepayQrUrl(bank: { name: string; accountNumber: string }, amount: number, content: string): string {
  const qs = new URLSearchParams({ acc: bank.accountNumber, bank: bank.name, amount: String(amount), des: content, template: 'compact' });
  return `https://qr.sepay.vn/img?${qs.toString()}`;
}

/** Tổng tiền đã nhận (khớp đơn) của một đơn. */
async function receivedTotal(db: Db, orderId: string): Promise<number> {
  const [r] = await db.$queryRaw<Array<{ sum: number }>>(Prisma.sql`
    SELECT COALESCE(SUM("amount"), 0)::int AS sum FROM "payment_transactions" WHERE "order_id" = ${orderId}::uuid AND "matched"`);
  return r?.sum ?? 0;
}

export async function getPaymentSession(req: Request, rawCode: string): Promise<PaymentSessionDto> {
  const found = await loadAccessibleOrder(req, rawCode);
  const settings = await getSettings(prisma);
  const bank = getConfig().bank;
  if (!settings.bankTransferEnabled || !bank || found.paymentMethod !== 'bank_transfer' || !found.paymentDueAt) {
    throw Errors.notFound();
  }
  const o = await expireIfDue(found);
  const status = o.paymentStatus === 'paid' ? 'paid' : o.status === 'cancelled' ? 'expired' : 'awaiting';
  const received = status === 'awaiting' ? await receivedTotal(prisma, o.order_id) : 0;
  const shortfall = received > 0 && received < o.total ? o.total - received : undefined;
  return {
    orderId: o.code,
    // Đã chuyển thiếu: QR mới nhúng đúng số còn thiếu (cùng nội dung), số tiền đơn vẫn là tổng.
    amount: o.total,
    status,
    expiresAt: o.paymentDueAt!.toISOString(),
    ...(o.paidAt ? { paidAt: o.paidAt.toISOString() } : {}),
    transferContent: o.code,
    account: { bank: bank.name, accountName: bank.accountName, accountNumber: bank.accountNumber },
    qrImageUrl: sepayQrUrl(bank, shortfall ?? o.total, o.code),
    ...(shortfall ? { shortfall } : {}),
    ...(getConfig().paymentSimulator ? { simulated: true } : {}),
  };
}

/* ======================= Đối soát tiền về ======================= */

export interface IncomingTransfer {
  provider: 'sepay' | 'simulator';
  /** Mã giao dịch phía nhà cung cấp (SePay `id`): khoá idempotent. */
  providerTxId: string;
  /** Nội dung chuyển khoản (và `code` SePay tách sẵn, nếu có). */
  content: string;
  code?: string | null;
  amount: number;
  receivedAt: Date;
  reference?: string | null;
}

export type TransferOutcome = 'duplicate' | 'unmatched' | 'partial' | 'paid' | 'overpaid' | 'after_paid' | 'after_cancel';

export interface TransferResult {
  outcome: TransferOutcome;
  orderCode?: string;
}

const CODE_IN_TEXT = /N2F\d{10}/i;

/** Mã đơn trong `code` (SePay tách theo tiền tố) hoặc nội dung chuyển khoản; ngân hàng có thể chèn tiền tố / dấu chấm quanh. */
export function extractOrderCode(code: string | null | undefined, content: string): string | null {
  for (const s of [code ?? '', content]) {
    const m = CODE_IN_TEXT.exec(s.replace(/\s+/g, ''));
    if (m) return m[0].toUpperCase();
  }
  return null;
}

const money = (n: number) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}₫`;

interface LockedOrder {
  order_id: string;
  code: string;
  status: 'to_pay' | 'to_ship' | 'to_receive' | 'completed' | 'cancel_requested' | 'cancelled';
  payment_status: payment_status; // kiểu enum Prisma: SePay không đặt giá trị hoàn (chỉ returns ghi, BR-RET-50)
  payment_method: 'cod' | 'bank_transfer';
  total: number;
}

/**
 * Một giao dịch tiền về. Thứ tự: khoá dòng đơn (FOR UPDATE) -> chèn giao dịch ON CONFLICT DO NOTHING (trùng = đã xử lý,
 * thoát) -> cộng tổng đã nhận -> chuyển trạng thái. Đơn còn `to_pay` (kể cả vừa quá hạn mà job chưa huỷ) thì nhận tiền;
 * đơn đã huỷ không khôi phục (hoàn 100%). Email "đã nhận thanh toán" gửi sau commit qua hàng đợi thư sự kiện (thử 3 lần).
 */
export async function applyIncomingTransfer(t: IncomingTransfer, at: Date = clockNow()): Promise<TransferResult> {
  const code = extractOrderCode(t.code, t.content);
  const result = await prisma.$transaction(
    async (tx) => {
      const [order] = code
        ? await tx.$queryRaw<LockedOrder[]>(Prisma.sql`
            SELECT "order_id", "code", "status", "payment_status", "payment_method", "total"
            FROM "orders" WHERE "code" = ${code} FOR UPDATE`)
        : [];
      const matchable = order && order.payment_method === 'bank_transfer' ? order : undefined;

      if (!matchable) {
        const ins = await tx.$queryRaw<Array<{ tx_id: string }>>(Prisma.sql`
          INSERT INTO "payment_transactions" ("provider", "provider_tx_id", "order_id", "amount", "content", "reference", "received_at", "matched", "outcome")
          VALUES (${t.provider}, ${t.providerTxId}, NULL, ${t.amount}, ${t.content.slice(0, 500)}, ${t.reference?.slice(0, 100) ?? null},
            ${ts(t.receivedAt)}, false, 'unmatched')
          ON CONFLICT ("provider", "provider_tx_id") DO NOTHING RETURNING "tx_id"`);
        return { outcome: ins.length ? 'unmatched' : 'duplicate', eventId: null } as const;
      }

      const o = matchable;
      const before = await receivedTotal(tx, o.order_id);
      const after = before + t.amount;
      let outcome: Exclude<TransferOutcome, 'duplicate' | 'unmatched'>;
      if (o.status === 'cancelled') outcome = 'after_cancel';
      else if (o.status !== 'to_pay' || o.payment_status === 'paid') outcome = 'after_paid';
      else if (after < o.total) outcome = 'partial';
      else outcome = after > o.total ? 'overpaid' : 'paid';

      const ins = await tx.$queryRaw<Array<{ tx_id: string }>>(Prisma.sql`
        INSERT INTO "payment_transactions" ("provider", "provider_tx_id", "order_id", "amount", "content", "reference", "received_at", "matched", "outcome")
        VALUES (${t.provider}, ${t.providerTxId}, ${o.order_id}::uuid, ${t.amount}, ${t.content.slice(0, 500)}, ${t.reference?.slice(0, 100) ?? null},
          ${ts(t.receivedAt)}, true, ${outcome})
        ON CONFLICT ("provider", "provider_tx_id") DO NOTHING RETURNING "tx_id"`);
      if (!ins.length) return { outcome: 'duplicate', orderCode: o.code, eventId: null } as const;

      if (outcome === 'partial') {
        await insertOrderEvent(tx, {
          orderId: o.order_id, at, fromStatus: 'to_pay', toStatus: 'to_pay', paymentStatus: 'pending', actor: 'system', kind: 'note',
          detail: `Đã nhận ${money(t.amount)}, còn thiếu ${money(o.total - after)}.`,
        });
        return { outcome, orderCode: o.code, eventId: null } as const;
      }

      if (outcome === 'after_cancel' || outcome === 'after_paid') {
        const why = outcome === 'after_cancel' ? 'sau khi đơn đã huỷ' : 'sau khi đơn đã thanh toán đủ';
        await insertOrderEvent(tx, {
          orderId: o.order_id, at, fromStatus: o.status, toStatus: o.status, paymentStatus: o.payment_status, actor: 'system', kind: 'note',
          detail: `Đã nhận thêm ${money(t.amount)} ${why}. Số tiền này sẽ được hoàn lại trong 1-3 ngày làm việc.`,
          internalNote: `Kế toán: hoàn ${money(t.amount)} (giao dịch SePay ${t.providerTxId}).`,
        });
        return { outcome, orderCode: o.code, eventId: null } as const;
      }

      // Đủ (hoặc thừa) tiền: to_pay -> to_ship, tính lại ngày giao từ lúc nhận tiền (BR-CHK-11).
      const settings = await getSettings(tx);
      const window = await estimateDeliveryFromDb(tx, at, settings);
      await tx.$executeRaw(Prisma.sql`
        UPDATE "orders" SET "status" = 'to_ship', "payment_status" = 'paid', "paid_at" = ${ts(at)},
          "estimated_from" = ${window.from}::date, "estimated_to" = ${window.to}::date
        WHERE "order_id" = ${o.order_id}::uuid`);
      const extra = after - o.total;
      const eventId = await insertOrderEvent(tx, {
        orderId: o.order_id, at, fromStatus: 'to_pay', toStatus: 'to_ship', paymentStatus: 'paid', actor: 'system', kind: 'payment_received',
        detail: extra > 0
          ? `Đã nhận đủ thanh toán (${money(after)}). Phần thừa ${money(extra)} sẽ được hoàn lại trong 1-3 ngày làm việc.`
          : `Đã nhận đủ thanh toán (${money(after)}).`,
        internalNote: extra > 0 ? `Kế toán: hoàn phần thừa ${money(extra)}.` : null,
        emailTemplate: 'payment-received',
      });
      return { outcome, orderCode: o.code, eventId } as const;
    },
    { timeout: 15_000, maxWait: 5_000 },
  );
  if (result.eventId) scheduleEventEmail(result.eventId);
  logger.info('payment-transfer', { provider: t.provider, outcome: result.outcome, ...(result.orderCode ? { order: result.orderCode } : {}) });
  return { outcome: result.outcome, ...(result.orderCode ? { orderCode: result.orderCode } : {}) };
}

/* ======================= Chế độ giả lập (PAYMENT_SIMULATOR) ======================= */

export type SimulateAction = 'pay' | 'pay-partial' | 'expire';

/**
 * Giả lập cho đồ án (không liên kết ngân hàng): chủ đơn / khách có quyền xem đơn bấm trên trang QR.
 * `pay` = chuyển đúng số còn thiếu, `pay-partial` = chuyển một nửa số còn thiếu (làm tròn xuống 1.000 ₫, tối thiểu 1.000 ₫),
 * cả hai đi qua `applyIncomingTransfer` (cùng luồng với webhook SePay, provider `simulator`). `expire` = hết hạn ngay.
 * Chế độ tắt -> 404 not-found (như route không tồn tại).
 */
export async function simulatePayment(req: Request, rawCode: string, action: SimulateAction): Promise<PaymentSessionDto> {
  if (!getConfig().paymentSimulator) throw Errors.notFound();
  const session = await getPaymentSession(req, rawCode); // kiểm quyền + QR bật + đơn chuyển khoản; lười hết hạn
  if (session.status === 'awaiting') {
    if (action === 'expire') {
      const at = clockNow();
      await prisma.order.updateMany({ where: { code: session.orderId, status: 'to_pay' }, data: { paymentDueAt: new Date(at.getTime() - 1000) } });
    } else {
      const remaining = session.shortfall ?? session.amount;
      const amount = action === 'pay' ? remaining : Math.max(1000, Math.floor(remaining / 2 / 1000) * 1000);
      await applyIncomingTransfer({
        provider: 'simulator',
        providerTxId: `sim-${randomUUID()}`,
        content: `GIA LAP ${session.orderId}`,
        amount: Math.min(amount, remaining),
        receivedAt: clockNow(),
      });
    }
  }
  return getPaymentSession(req, rawCode);
}
