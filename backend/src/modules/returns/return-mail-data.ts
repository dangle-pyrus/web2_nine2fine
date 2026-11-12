import type { Db } from '../../lib/sql';
import type { ReturnMailData } from '../../mail/return-templates';
import { getPublicSettings } from '../store/settings.service';
import { loadReturn } from './return.query';
import { REASON_LABELS, type ReturnReason } from './return-rules';

/**
 * Dữ liệu thư trả hàng. Đọc qua `loadReturn` (cột bản mã số tài khoản bị `omit`): số tài khoản đầy đủ KHÔNG BAO GIỜ vào thư.
 * Trả null nếu yêu cầu đã mất.
 */
export async function loadReturnMailData(db: Db, returnId: string, paymentMethod: 'cod' | 'bank_transfer'): Promise<ReturnMailData | null> {
  const r = await loadReturn(db, returnId);
  if (!r) return null;
  return {
    returnId,
    reasonLabel: REASON_LABELS[r.reason as ReturnReason] ?? r.reason,
    lines: r.items.map((i) => ({ name: i.orderItem.name, color: i.orderItem.colorName, size: i.orderItem.size, quantity: i.quantity, acceptedQuantity: i.acceptedQuantity })),
    amount: { goodsAmount: r.goodsAmount, shippingRefund: r.shippingRefund, returnShippingFee: r.returnShippingFee, amount: r.amount, final: r.amountFinal },
    refundTo: paymentMethod === 'cod' && r.bankName && r.accountLast4 ? { bank: r.bankName, last4: r.accountLast4 } : null,
    approveNote: r.approveNote,
    rejectNote: r.state === 'rejected' ? r.rejectNote : null,
    refundReference: r.state === 'refunded' ? r.refundReference : null,
    carrier: r.carrier,
    trackingNumber: r.trackingNumber,
    storeAddress: (await getPublicSettings(db)).info.address,
    refundedAt: r.refundedAt ? r.refundedAt.toISOString() : null,
  };
}
