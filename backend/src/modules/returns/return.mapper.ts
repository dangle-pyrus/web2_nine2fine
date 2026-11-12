import { RETURNS_ASSUMPTIONS } from '../../config/assumptions';
import { Errors } from '../../lib/errors';
import { now as clockNow } from '../../lib/clock';
import type { Db } from '../../lib/sql';
import { decryptAccountNumber } from './account-secret';
import { addWorkingDays, vnDateISO } from '../../lib/vn-time';
import { loadHolidays } from '../checkout/delivery';
import { getPublicSettings } from '../store/settings.service';
import { loadAccountCipher, loadReturn, type ReturnRow } from './return.query';
import { allowedActions, type ReturnAction, type ReturnFault, type ReturnReason, type ReturnState } from './return-rules';

/** DTO khách (`ReturnRequest`) và dạng ảnh. KHÔNG có số tài khoản đầy đủ, `refundReference`, `disposition`, tên nhân viên, ghi chú nội bộ. */

export type PhotoAudience = { kind: 'member' } | { kind: 'admin' } | { kind: 'guest'; orderCode: string };

export const photoUrl = (a: PhotoAudience, id: string): string =>
  a.kind === 'member' ? `/api/account/return-photos/${id}` : a.kind === 'admin' ? `/api/admin/return-photos/${id}` : `/api/orders/${a.orderCode}/return/photos/${id}`;

export interface ReturnPhotoDto {
  id: string;
  url: string;
  width: number;
  height: number;
  size: number;
  contentType: string;
}

export const toPhotoDto = (p: { photo_id: string; width: number; height: number; byteSize: number; contentType: string }, a: PhotoAudience): ReturnPhotoDto => ({
  id: p.photo_id,
  url: photoUrl(a, p.photo_id),
  width: p.width,
  height: p.height,
  size: p.byteSize,
  contentType: p.contentType,
});

export interface ReturnAmountDto {
  goodsAmount: number;
  shippingRefund: number;
  returnShippingFee: number;
  amount: number;
  final: boolean;
}

export const amountOf = (r: Pick<ReturnRow, 'goodsAmount' | 'shippingRefund' | 'returnShippingFee' | 'amount' | 'amountFinal'>): ReturnAmountDto => ({
  goodsAmount: r.goodsAmount,
  shippingRefund: r.shippingRefund,
  returnShippingFee: r.returnShippingFee,
  amount: r.amount,
  final: r.amountFinal,
});

export interface ReturnLineDto {
  variantId: string;
  name: string;
  color: string;
  size: string;
  sku: string;
  mediaId: string;
  quantity: number;
  acceptedQuantity?: number;
  goodsAmount: number;
}

export const toLineDto = (i: ReturnRow['items'][number]): ReturnLineDto => ({
  variantId: i.orderItem.variantId,
  name: i.orderItem.name,
  color: i.orderItem.colorName,
  size: i.orderItem.size,
  sku: i.orderItem.sku,
  mediaId: i.orderItem.mediaId,
  quantity: i.quantity,
  ...(i.acceptedQuantity !== null ? { acceptedQuantity: i.acceptedQuantity } : {}),
  goodsAmount: i.goodsAmount,
});

export interface ReturnRefundToDto {
  type: 'account' | 'original';
  bank?: string;
  last4?: string;
  accountName?: string;
}

export function refundToOf(r: Pick<ReturnRow, 'bankName' | 'accountLast4' | 'accountName'>, paymentMethod: 'cod' | 'bank_transfer'): ReturnRefundToDto {
  if (paymentMethod === 'bank_transfer' || !r.bankName || !r.accountLast4 || !r.accountName) return { type: 'original' };
  return { type: 'account', bank: r.bankName, last4: r.accountLast4, accountName: r.accountName };
}

const iso = (d: Date): string => d.toISOString();

/** "Dự kiến hoàn tiền": <= N ngày làm việc sau `receivedAt` (cùng hàm ngày làm việc của ngày giao dự kiến, có ngày lễ). */
export async function expectedRefundBy(db: Db, receivedAt: Date): Promise<string> {
  const holidays = await loadHolidays(db, receivedAt);
  return addWorkingDays(vnDateISO(receivedAt), RETURNS_ASSUMPTIONS.refundWorkingDays, holidays);
}

export interface ReturnRequestDto {
  id: string;
  state: ReturnState;
  reason: ReturnReason;
  fault: ReturnFault;
  detail: string;
  conditionAck: boolean;
  requestedAt: string;
  approvedAt?: string;
  receivedAt?: string;
  refundedAt?: string;
  rejectedAt?: string;
  cancelledAt?: string;
  lines: ReturnLineDto[];
  photos: ReturnPhotoDto[];
  amount: ReturnAmountDto;
  refundedAmount?: number;
  expectedRefundBy?: string;
  approveNote?: string;
  rejectNote?: string;
  carrier?: string;
  trackingNumber?: string;
  instructions?: string;
  refundTo: ReturnRefundToDto;
  canCancel: boolean;
}

/** `ReturnRequest` của khách (cũng là `Order.return`). Tải địa chỉ cửa hàng / ngày lễ chỉ khi cần (approved / received). */
export async function toReturnRequest(
  db: Db,
  r: ReturnRow,
  paymentMethod: 'cod' | 'bank_transfer',
  audience: PhotoAudience = { kind: 'member' },
): Promise<ReturnRequestDto> {
  const state = r.state as ReturnState;
  const dto: ReturnRequestDto = {
    id: r.return_id,
    state,
    reason: r.reason as ReturnReason,
    fault: r.fault as ReturnFault,
    detail: r.detail,
    conditionAck: r.conditionAck,
    requestedAt: iso(r.requestedAt),
    lines: r.items.map(toLineDto),
    photos: r.photos.map((p) => toPhotoDto(p, audience)),
    amount: amountOf(r),
    refundTo: refundToOf(r, paymentMethod),
    canCancel: state === 'requested',
  };
  if (r.approvedAt) dto.approvedAt = iso(r.approvedAt);
  if (r.receivedAt) dto.receivedAt = iso(r.receivedAt);
  if (r.refundedAt) dto.refundedAt = iso(r.refundedAt);
  if (r.rejectedAt) dto.rejectedAt = iso(r.rejectedAt);
  if (r.cancelledAt) dto.cancelledAt = iso(r.cancelledAt);
  if (state === 'refunded') dto.refundedAmount = r.amount;
  if (state === 'received' && r.receivedAt) dto.expectedRefundBy = await expectedRefundBy(db, r.receivedAt);
  if (r.approveNote) dto.approveNote = r.approveNote;
  if (state === 'rejected' && r.rejectNote) dto.rejectNote = r.rejectNote;
  if (r.carrier) dto.carrier = r.carrier;
  if (r.trackingNumber) dto.trackingNumber = r.trackingNumber;
  if (state === 'approved') {
    const address = (await getPublicSettings(db)).info.address;
    dto.instructions = `Vui lòng đóng gói sản phẩm cần trả (còn nguyên tem nhãn, kèm hoá đơn / mã đơn) và gửi về: ${address}.${r.approveNote ? ` ${r.approveNote}` : ''}`;
  }
  return dto;
}

/* ------------------------------ Dạng admin (`AdminReturn`) ------------------------------ */

export interface AdminReturnDto extends Omit<ReturnRequestDto, 'lines' | 'photos' | 'refundTo' | 'canCancel' | 'instructions'> {
  orderCode: string;
  recipient: { name: string; phone: string; email: string };
  paymentMethod: 'cod' | 'bank-transfer';
  lines: Array<ReturnLineDto & { disposition?: 'restock' | 'writeoff' }>;
  photos: ReturnPhotoDto[];
  receiveNote?: string;
  refundReference?: string;
  refundTo: ReturnRefundToDto & { accountNumber?: string };
  history: Array<{ at: string; kind: string; actor: { type: string; name?: string; role?: 'staff' | 'admin' }; note?: string }>;
  allowedActions: ReturnAction[];
  overdue: boolean;
}

/** Quá 24 giờ kể từ `requestedAt` khi còn `requested` (tính khi đọc, không tác vụ nền). */
export const isOverdue = (state: string, requestedAt: Date, at: Date): boolean =>
  state === 'requested' && at.getTime() - requestedAt.getTime() > RETURNS_ASSUMPTIONS.overdueHours * 3_600_000;

/**
 * `AdminReturn` (cũng là `AdminOrder.return`). Số tài khoản đầy đủ CHỈ khi người xem là admin VÀ `state = received` VÀ đơn COD VÀ còn bản mã:
 * giải mã tại đây (không từ truy vấn); mọi trường hợp khác chỉ bản che. Trả null nếu không có yêu cầu.
 */
export async function buildAdminReturn(db: Db, returnId: string, role: 'staff' | 'admin', showAccountNumber = true): Promise<AdminReturnDto | null> {
  const r = await loadReturn(db, returnId);
  if (!r) return null;
  const order = await db.order.findUniqueOrThrow({
    where: { order_id: r.orderId },
    select: { code: true, recipientName: true, recipientPhone: true, email: true, paymentMethod: true },
  });
  const events = await db.orderEvent.findMany({
    where: { returnId }, orderBy: [{ at: 'asc' }, { event_id: 'asc' }],
    select: { at: true, kind: true, actor: true, actorName: true, actorRole: true, detail: true },
  });
  const base = await toReturnRequest(db, r, order.paymentMethod, { kind: 'admin' });
  const { canCancel: _c, instructions: _i, ...rest } = base;
  void _c;
  void _i;
  const state = r.state as ReturnState;
  const refundTo: AdminReturnDto['refundTo'] = { ...base.refundTo };
  if (showAccountNumber && role === 'admin' && state === 'received' && order.paymentMethod === 'cod') {
    const enc = await loadAccountCipher(db, returnId);
    if (enc) {
      try {
        refundTo.accountNumber = decryptAccountNumber(enc, returnId);
      } catch {
        // Mất khoá / bản mã hỏng: chỉ bản che (không lộ lỗi, không log nội dung).
      }
    }
  }
  const dto: AdminReturnDto = {
    ...rest,
    orderCode: order.code,
    recipient: { name: order.recipientName, phone: order.recipientPhone, email: order.email },
    paymentMethod: order.paymentMethod === 'bank_transfer' ? 'bank-transfer' : 'cod',
    lines: r.items.map((i) => ({ ...toLineDto(i), ...(i.disposition ? { disposition: i.disposition as 'restock' | 'writeoff' } : {}) })),
    refundTo,
    history: events.map((e) => ({
      at: iso(e.at),
      kind: String(e.kind),
      actor: e.actor === 'shop' ? { type: 'staff', name: e.actorName ?? 'Nhân viên', role: e.actorRole === 'admin' ? 'admin' : 'staff' } : { type: e.actor },
      ...(e.detail ? { note: e.detail } : {}),
    })),
    allowedActions: allowedActions(state, role),
    overdue: isOverdue(state, r.requestedAt, clockNow()),
  };
  if (r.receiveNote) dto.receiveNote = r.receiveNote;
  if (state === 'refunded' && r.refundReference) dto.refundReference = r.refundReference;
  if (state === 'rejected' && r.rejectNote) dto.rejectNote = r.rejectNote;
  return dto;
}

export async function loadAdminReturnOr404(db: Db, returnId: string, role: 'staff' | 'admin'): Promise<AdminReturnDto> {
  const d = await buildAdminReturn(db, returnId, role);
  if (!d) throw Errors.notFound();
  return d;
}
