import { getConfig } from '../config/env';
import type { MailContact } from './order-templates';
import { money } from './order-templates';
import type { MailMessage } from './mailer';
import type { OrderDto } from '../modules/order/order.mapper';

/**
 * Thư trả hàng (BR-RET-41), chỉ văn bản thuần, đến email của ĐƠN. Chữ do PO soạn (G10: Thắng sửa sau khi đọc thử).
 * KHÔNG BAO GIỜ in số tài khoản đầy đủ: chỉ ngân hàng + 4 số cuối hoặc "tài khoản đã thanh toán". Không log nội dung thư.
 */

export interface ReturnMailData {
  returnId: string;
  reasonLabel: string;
  lines: Array<{ name: string; color: string; size: string; quantity: number; acceptedQuantity: number | null }>;
  amount: { goodsAmount: number; shippingRefund: number; returnShippingFee: number; amount: number; final: boolean };
  /** `bank` + `last4` (đơn COD) hoặc null = hoàn về tài khoản đã thanh toán. */
  refundTo: { bank: string; last4: string } | null;
  /** Hướng dẫn của nhân viên khi duyệt. */
  approveNote: string | null;
  /** Lý do từ chối / đóng (hiện cho khách). */
  rejectNote: string | null;
  refundReference: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  /** Địa chỉ nhận hàng trả (cài đặt cửa hàng). */
  storeAddress: string;
  refundedAt: string | null;
}

export type ReturnMailBuilder = (o: OrderDto, data: ReturnMailData, contact: MailContact) => MailMessage;

const vnDate = (iso: string): string => {
  const d = new Date(new Date(iso).getTime() + 7 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
};

const refundWhere = (d: ReturnMailData): string => (d.refundTo ? `${d.refundTo.bank} (số tài khoản kết thúc ${d.refundTo.last4})` : 'tài khoản đã thanh toán đơn hàng');

function block(o: OrderDto, d: ReturnMailData): string[] {
  const base = getConfig().appBaseUrl;
  return [
    `Mã đơn: #${o.id}`,
    `Lý do trả: ${d.reasonLabel}`,
    'Sản phẩm trả:',
    ...d.lines.map((l) => `- ${l.name} | ${l.color} | ${l.size} | SL ${l.quantity}${l.acceptedQuantity !== null ? ` (đạt ${l.acceptedQuantity})` : ''}`),
    '',
    `Xem đơn: ${base}/account/orders/${o.id}`,
  ];
}

const footer = (c: MailContact): string[] => ['', `Hotline CSKH: ${c.hotline}`, '', 'Trân trọng,', 'nine2fine'];

export const returnRequestedMail: ReturnMailBuilder = (o, d, c) => ({
  to: o.recipient.email,
  subject: `nine2fine – Đã nhận yêu cầu trả hàng đơn #${o.id}`,
  text: [
    'Xin chào,',
    '',
    `nine2fine đã nhận yêu cầu trả hàng cho đơn #${o.id}. Chúng tôi sẽ xem xét và phản hồi trong vòng 24 giờ (dự kiến).`,
    `Số tiền hoàn dự kiến: ${money(d.amount.amount)} (số chính thức được chốt sau khi chúng tôi nhận và kiểm tra hàng).`,
    ...(d.refundTo ? [`Tiền sẽ được hoàn về: ${refundWhere(d)}.`] : ['Tiền sẽ được hoàn về tài khoản bạn đã dùng để thanh toán.']),
    '',
    ...block(o, d),
    ...footer(c),
  ].join('\n'),
});

export const returnApprovedMail: ReturnMailBuilder = (o, d, c) => ({
  to: o.recipient.email,
  subject: `nine2fine – Yêu cầu trả hàng đơn #${o.id} đã được duyệt`,
  text: [
    'Xin chào,',
    '',
    `Yêu cầu trả hàng cho đơn #${o.id} đã được duyệt. Vui lòng gửi hàng về:`,
    d.storeAddress,
    ...(d.approveNote ? ['', `Hướng dẫn: ${d.approveNote}`] : []),
    ...(d.carrier || d.trackingNumber ? ['', `Đơn vị vận chuyển: ${d.carrier ?? '-'}`, `Mã vận đơn: ${d.trackingNumber ?? '-'}`] : []),
    '',
    `Sau khi nhận và kiểm tra hàng, nine2fine sẽ chốt số tiền hoàn (dự kiến ${money(d.amount.amount)}) và hoàn tiền trong 1-3 ngày làm việc (dự kiến).`,
    '',
    ...block(o, d),
    ...footer(c),
  ].join('\n'),
});

export const returnRejectedMail: ReturnMailBuilder = (o, d, c) => ({
  to: o.recipient.email,
  subject: `nine2fine – Yêu cầu trả hàng đơn #${o.id} không được chấp nhận`,
  text: [
    'Xin chào,',
    '',
    `Rất tiếc, yêu cầu trả hàng cho đơn #${o.id} không được chấp nhận.`,
    ...(d.rejectNote ? [`Lý do: ${d.rejectNote}`] : []),
    'Đơn hàng của bạn vẫn ở trạng thái hoàn thành. Nếu cần hỗ trợ thêm, vui lòng liên hệ hotline bên dưới.',
    '',
    ...block(o, d),
    ...footer(c),
  ].join('\n'),
});

export const returnReceivedMail: ReturnMailBuilder = (o, d, c) => ({
  to: o.recipient.email,
  subject: `nine2fine – Đã nhận hàng trả đơn #${o.id}`,
  text: [
    'Xin chào,',
    '',
    `nine2fine đã nhận và kiểm tra hàng trả của đơn #${o.id}.`,
    `Số tiền hoàn đã chốt: ${money(d.amount.amount)}. Chúng tôi sẽ hoàn tiền trong 1-3 ngày làm việc (dự kiến).`,
    '',
    ...block(o, d),
    ...footer(c),
  ].join('\n'),
});

export const returnRefundedMail: ReturnMailBuilder = (o, d, c) => ({
  to: o.recipient.email,
  subject: `nine2fine – Đã hoàn tiền đơn #${o.id}`,
  text: [
    'Xin chào,',
    '',
    `nine2fine đã hoàn tiền cho đơn #${o.id}${d.refundedAt ? ` ngày ${vnDate(d.refundedAt)}` : ''}.`,
    `Số tiền hoàn: ${money(d.amount.amount)}`,
    `Hoàn về: ${refundWhere(d)}`,
    ...(d.refundReference ? [`Mã giao dịch: ${d.refundReference}`] : []),
    '',
    ...block(o, d),
    ...footer(c),
  ].join('\n'),
});

/** `order_events.email_template` -> nội dung. */
export const RETURN_TEMPLATES: Record<string, ReturnMailBuilder> = {
  'return-requested': returnRequestedMail,
  'return-approved': returnApprovedMail,
  'return-rejected': returnRejectedMail,
  'return-received': returnReceivedMail,
  'return-refunded': returnRefundedMail,
};
