import { timingSafeEqual, createHash } from 'node:crypto';
import express, { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { getConfig } from '../../config/env';
import { now as clockNow } from '../../lib/clock';
import { Errors } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { parseBody } from '../../lib/validate';
import { noStore } from '../../middleware/no-store';
import { applyIncomingTransfer } from '../order/payment.service';

/**
 * Webhook SePay (BR-CHK-21, plan cart-checkout mục 4.8): SePay gọi mỗi khi tài khoản nhận có giao dịch.
 * Gắn TRƯỚC originGuard / cookieParser (máy chủ gọi máy chủ, không Origin, không cookie). Xác thực bằng
 * `Authorization: Apikey <SEPAY_WEBHOOK_KEY>` (so sánh hằng thời gian). Trả `200 {success:true}` khi đã ghi nhận
 * (kể cả giao dịch trùng / không khớp đơn) để SePay không gửi lại; lỗi máy chủ trả 5xx để SePay thử lại.
 */

const sepayPayloadSchema = z.object({
  id: z.union([z.number().int(), z.string().regex(/^\d{1,30}$/)]).transform(String),
  gateway: z.string().max(100).optional().nullable(),
  transactionDate: z.string().max(40).optional().nullable(),
  accountNumber: z.string().max(40).optional().nullable(),
  code: z.string().max(100).optional().nullable(),
  content: z.string().max(1000).optional().nullable(),
  transferType: z.enum(['in', 'out']),
  transferAmount: z.number().int().nonnegative(),
  referenceCode: z.string().max(100).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
});

const digest = (s: string) => createHash('sha256').update(s).digest();

function authorized(req: Request): boolean {
  const key = getConfig().sepayWebhookKey;
  if (!key) return false;
  const header = req.get('authorization') ?? '';
  const m = /^Apikey\s+(.+)$/i.exec(header.trim());
  if (!m) return false;
  // Băm hai phía để độ dài bằng nhau (timingSafeEqual cần cùng độ dài, không lộ độ dài khoá).
  return timingSafeEqual(digest(m[1].trim()), digest(key));
}

/** `transactionDate` SePay = "YYYY-MM-DD HH:mm:ss" giờ Việt Nam. Sai dạng -> lúc nhận webhook. */
export function parseSepayDate(v: string | null | undefined, fallback: Date): Date {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/.exec((v ?? '').trim());
  if (!m) return fallback;
  const d = new Date(`${m[1]}T${m[2]}+07:00`);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

export const sepayWebhookRouter = Router();

sepayWebhookRouter.post(
  '/webhook',
  noStore,
  (req: Request, _res: Response, next: NextFunction) => {
    if (!authorized(req)) {
      logger.warn('sepay-webhook-unauthorized', { ip: req.ip ?? 'unknown' });
      return next(Errors.unauthenticated());
    }
    next();
  },
  express.json({ limit: '16kb' }),
  (req: Request, res: Response, next: NextFunction) => {
    const p = parseBody(sepayPayloadSchema, req.body ?? {});
    // Tiền ra hoặc 0 ₫: không liên quan đơn hàng, chỉ xác nhận đã nhận webhook.
    if (p.transferType !== 'in' || p.transferAmount <= 0) {
      res.status(200).json({ success: true });
      return;
    }
    const at = clockNow();
    applyIncomingTransfer({
      provider: 'sepay',
      providerTxId: p.id,
      content: [p.content, p.description].filter(Boolean).join(' ').slice(0, 500),
      code: p.code ?? null,
      amount: p.transferAmount,
      receivedAt: parseSepayDate(p.transactionDate, at),
      reference: p.referenceCode ?? null,
    }, at)
      .then(() => res.status(200).json({ success: true }))
      .catch(next);
  },
);
