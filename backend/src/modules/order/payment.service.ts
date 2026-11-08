import type { Request } from 'express';
import { getConfig } from '../../config/env';
import prisma from '../../config/prisma';
import { Errors } from '../../lib/errors';
import { getSettings } from '../store/settings.service';
import { expireIfDue, loadAccessibleOrder } from './order.service';

/**
 * Trang thanh toán chuyển khoản QR (BR-CHK-21, G2). QR chưa bật (mặc định) hoặc đơn COD -> 404 not-found.
 * Điểm mở rộng đối soát webhook (SePay) chưa làm: lát 3.8 chờ Thắng xác nhận câu hỏi 2.
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
  const qs = new URLSearchParams({ amount: String(o.total), addInfo: o.code, accountName: bank.accountName });
  return {
    orderId: o.code,
    amount: o.total,
    status,
    expiresAt: o.paymentDueAt!.toISOString(),
    ...(o.paidAt ? { paidAt: o.paidAt.toISOString() } : {}),
    transferContent: o.code,
    account: { bank: bank.name, accountName: bank.accountName, accountNumber: bank.accountNumber },
    qrImageUrl: `https://img.vietqr.io/image/${encodeURIComponent(bank.name)}-${encodeURIComponent(bank.accountNumber)}-compact2.png?${qs.toString()}`,
  };
}
