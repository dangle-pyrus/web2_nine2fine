import { getConfig } from '../config/env';
import type { MailMessage } from './mailer';
import type { OrderDto } from '../modules/order/order.mapper';

/**
 * Email đơn hàng (BR-CHK-28, 29), chỉ văn bản thuần: ảnh sản phẩm và nút bấm của CHK-CF-11 thay bằng link văn bản
 * (độ lệch đã ghi ở plan mục 5; HTML là việc riêng). Không in số tài khoản. Không log nội dung thư.
 */

const HOTLINE = '1900 6868 29';
const SCAM_NOTICE = 'nine2fine không yêu cầu chuyển khoản ngoài trang thanh toán của đơn và không hỏi mật khẩu hay mã OTP.';

export const money = (n: number): string => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}₫`;

const STATUS_TEXT: Record<string, string> = {
  to_pay: 'Chờ thanh toán',
  to_ship: 'Đang chuẩn bị hàng',
  to_receive: 'Đang giao hàng',
  completed: 'Hoàn thành',
  cancel_requested: 'Đã yêu cầu huỷ',
  cancelled: 'Đã huỷ',
};

const vnDateTime = (iso: string): string => {
  const d = new Date(new Date(iso).getTime() + 7 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} ${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
};
const vnDate = (iso: string): string => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

function orderBlock(o: OrderDto, isMember: boolean): string[] {
  const base = getConfig().appBaseUrl;
  const viewLink = isMember ? `${base}/account/orders/${o.id}` : `${base}/track-order?code=${o.id}`;
  const lines: string[] = [
    `Mã đơn: #${o.id}`,
    `Trạng thái: ${STATUS_TEXT[o.status] ?? o.status}`,
    '',
    'Sản phẩm:',
    ...o.items.map((i) => `- ${i.name} | ${i.color} | ${i.size} | SL ${i.quantity} | ${money(i.unitPrice)}`),
    '',
    `Tạm tính: ${money(o.pricing.subtotal)}`,
  ];
  if (o.pricing.discount > 0) {
    const code = o.vouchers.find((v) => v.kind === 'discount')?.code;
    lines.push(`Giảm giá${code ? ` (${code})` : ''}: -${money(o.pricing.discount)}`);
  }
  const shipCode = o.vouchers.find((v) => v.kind === 'free-shipping')?.code;
  lines.push(
    o.pricing.shippingDiscount > 0
      ? `Phí giao hàng: ${money(o.pricing.shippingFee)} (miễn phí${shipCode ? `, mã ${shipCode}` : ''})`
      : `Phí giao hàng: ${money(o.pricing.shippingFee)}`,
  );
  lines.push(`Tổng thanh toán: ${money(o.pricing.total)}`);
  lines.push(
    `Phương thức: ${o.paymentMethod === 'cod' ? 'Thanh toán khi nhận hàng (COD)' : 'Chuyển khoản ngân hàng (QR)'}`,
    '',
    `Người nhận: ${o.recipient.name} - ${o.recipient.phone}`,
    `Địa chỉ: ${o.shippingAddress.street}, ${o.shippingAddress.ward}, ${o.shippingAddress.province}`,
    `Dự kiến giao: ${vnDate(o.estimatedDelivery.from)} - ${vnDate(o.estimatedDelivery.to)}`,
  );
  if (o.invoice) {
    lines.push('', `Hoá đơn công ty: ${o.invoice.companyName} (MST ${o.invoice.taxCode})`);
  }
  lines.push('', `Xem / tra cứu đơn: ${viewLink}`);
  return lines;
}

const footer = (): string[] => [
  '',
  `Cần huỷ đơn? Vào link xem đơn ở trên và chọn "Huỷ đơn" khi đơn chưa giao. Chính sách đổi trả: ${getConfig().appBaseUrl}/policies/returns`,
  `Hotline CSKH: ${HOTLINE}`,
  '',
  SCAM_NOTICE,
  '',
  'nine2fine',
];

export function orderConfirmedMail(o: OrderDto, isMember: boolean): MailMessage {
  const lines = ['Xin chào,', '', `Cảm ơn bạn đã đặt hàng tại nine2fine. Đơn #${o.id} đã được ghi nhận.`, ''];
  if (o.willCallToConfirm) lines.push('nine2fine sẽ gọi xác nhận trong 2 giờ làm việc.', '');
  return {
    to: o.recipient.email,
    subject: `nine2fine – Xác nhận đơn hàng #${o.id}`,
    text: [...lines, ...orderBlock(o, isMember), ...footer()].join('\n'),
  };
}

export function orderAwaitingPaymentMail(o: OrderDto, isMember: boolean): MailMessage {
  const base = getConfig().appBaseUrl;
  const lines = [
    'Xin chào,',
    '',
    `Đơn #${o.id} đang chờ thanh toán. Số tiền cần chuyển: ${money(o.pricing.total)}.`,
    ...(o.paymentDueAt ? [`Hạn thanh toán: ${vnDateTime(o.paymentDueAt)} (giờ Việt Nam).`] : []),
    `Thanh toán ngay: ${base}/payment/${o.id}`,
    '',
  ];
  return {
    to: o.recipient.email,
    subject: `nine2fine – Đơn #${o.id} đang chờ thanh toán`,
    text: [...lines, ...orderBlock(o, isMember), ...footer()].join('\n'),
  };
}

export function paymentReceivedMail(o: OrderDto, isMember: boolean): MailMessage {
  return {
    to: o.recipient.email,
    subject: `nine2fine – Đã nhận thanh toán đơn #${o.id}`,
    text: ['Xin chào,', '', `nine2fine đã nhận đủ thanh toán cho đơn #${o.id}.`, '', ...orderBlock(o, isMember), ...footer()].join('\n'),
  };
}

export function orderCancelledMail(o: OrderDto, isMember: boolean): MailMessage {
  const lines = ['Xin chào,', '', `Đơn #${o.id} đã được huỷ${o.cancelReason ? `. Lý do: ${o.cancelReason}` : '.'}`];
  if (o.paymentStatus === 'paid') lines.push('Số tiền đã thanh toán sẽ được hoàn lại trong 1-3 ngày làm việc.');
  lines.push('');
  return {
    to: o.recipient.email,
    subject: `nine2fine – Đơn #${o.id} đã huỷ`,
    text: [...lines, ...orderBlock(o, isMember), ...footer()].join('\n'),
  };
}

/** Thư OTP tra cứu đơn khách (định dạng "...: 12345678" giống thư mã đăng nhập). */
export function lookupCodeMail(to: string, orderCode: string, code: string): MailMessage {
  return {
    to,
    subject: 'Mã tra cứu đơn hàng nine2fine',
    text: [
      'Xin chào,',
      '',
      `Mã xác thực để tra cứu đơn #${orderCode} tại nine2fine của bạn là: ${code}`,
      '',
      'Mã có hiệu lực trong 10 phút và chỉ dùng được một lần.',
      'Không chia sẻ mã này với bất kỳ ai, kể cả người tự xưng là nhân viên nine2fine.',
      'Nếu bạn không yêu cầu mã này, hãy bỏ qua thư.',
      '',
      'nine2fine',
    ].join('\n'),
  };
}

/** Báo CSKH khi gửi email xác nhận lỗi 3 lần. KHÔNG kèm email khách (BR-CHK-28). */
export function emailFailureSupportMail(to: string, orderCode: string): MailMessage {
  return {
    to,
    subject: `Không gửi được email xác nhận đơn ${orderCode}`,
    text: `Hệ thống không gửi được email xác nhận cho đơn ${orderCode} sau 3 lần thử. Vui lòng liên hệ khách hàng qua kênh khác.`,
  };
}

/** Chân thư Slice 4 (bàn giao, giao xong): chính sách đổi trả, hotline, câu chống lừa đảo (BR-ADM-35). */
const slice4Footer = (): string[] => [
  '',
  `Chính sách đổi trả: ${getConfig().appBaseUrl}/policies/returns`,
  `Hotline CSKH: ${HOTLINE}`,
  '',
  SCAM_NOTICE,
  '',
  'nine2fine',
];

/** BR-ADM-21: đã bàn giao cho đơn vị vận chuyển. */
export function orderShippedMail(o: OrderDto, isMember: boolean): MailMessage {
  const s = o.shipment;
  const lines = [
    'Xin chào,',
    '',
    `Đơn #${o.id} đã được giao cho đơn vị vận chuyển.`,
    ...(s ? [`Đơn vị vận chuyển: ${s.carrier}`, `Mã vận đơn: ${s.trackingNumber}`] : []),
    `Ngày giao dự kiến: ${vnDate(o.estimatedDelivery.from)} - ${vnDate(o.estimatedDelivery.to)}`,
    o.paymentMethod === 'cod' && o.paymentStatus !== 'paid'
      ? `Số tiền shipper thu khi giao: ${money(o.pricing.total)}`
      : `Tổng thanh toán: ${money(o.pricing.total)}`,
    '',
  ];
  return {
    to: o.recipient.email,
    subject: `nine2fine – Đơn #${o.id} đã được giao cho đơn vị vận chuyển`,
    text: [...lines, ...orderBlock(o, isMember), ...slice4Footer()].join('\n'),
  };
}

/** BR-ADM-23: giao thành công. Không có lời mời đánh giá. */
export function orderDeliveredMail(o: OrderDto, isMember: boolean): MailMessage {
  const base = getConfig().appBaseUrl;
  const viewLink = isMember ? `${base}/account/orders/${o.id}` : `${base}/track-order?code=${o.id}`;
  const lines = [
    'Xin chào,',
    '',
    `Đơn #${o.id} đã giao thành công${o.deliveredAt ? ` lúc ${vnDateTime(o.deliveredAt)}` : ''}. Cảm ơn bạn đã mua sắm tại nine2fine.`,
    '',
    `Mã đơn: #${o.id}`,
    'Sản phẩm:',
    ...o.items.map((i) => `- ${i.name} | ${i.color} | ${i.size} | SL ${i.quantity} | ${money(i.unitPrice)}`),
    `Tổng thanh toán: ${money(o.pricing.total)}`,
    '',
    `Xem đơn: ${viewLink}`,
  ];
  return {
    to: o.recipient.email,
    subject: `nine2fine – Đơn #${o.id} đã giao thành công`,
    text: [...lines, ...slice4Footer()].join('\n'),
  };
}

/** BR-ADM-30: yêu cầu huỷ đã được duyệt (đơn đã huỷ). COD / chưa thanh toán: không có đoạn hoàn tiền. */
export function cancelApprovedMail(o: OrderDto, isMember: boolean): MailMessage {
  const lines = ['Xin chào,', '', `nine2fine đã duyệt yêu cầu huỷ đơn #${o.id}. Đơn đã được huỷ.`];
  if (o.paymentStatus === 'paid') lines.push('Số tiền đã thanh toán sẽ được hoàn lại trong 1-3 ngày làm việc.');
  lines.push('');
  return {
    to: o.recipient.email,
    subject: `nine2fine – Yêu cầu huỷ đơn #${o.id} đã được duyệt`,
    text: [...lines, ...orderBlock(o, isMember), ...slice4Footer()].join('\n'),
  };
}

/** BR-ADM-31: yêu cầu huỷ chưa được chấp nhận: lý do, đơn vẫn được giao, gọi hotline nếu vẫn muốn huỷ (S4-Q6). */
export function cancelRejectedMail(o: OrderDto, isMember: boolean): MailMessage {
  const reason = o.cancelRequest?.rejectReason;
  const lines = [
    'Xin chào,',
    '',
    `Yêu cầu huỷ đơn #${o.id} của bạn chưa được chấp nhận.`,
    ...(reason ? [`Lý do: ${reason}`] : []),
    'Đơn vẫn được tiếp tục xử lý và giao đến bạn như bình thường.',
    `Nếu bạn vẫn muốn huỷ đơn, vui lòng gọi hotline ${HOTLINE} để được hỗ trợ.`,
    '',
  ];
  return {
    to: o.recipient.email,
    subject: `nine2fine – Yêu cầu huỷ đơn #${o.id} chưa được chấp nhận`,
    text: [...lines, ...orderBlock(o, isMember), ...slice4Footer()].join('\n'),
  };
}

/** Báo CSKH khi thư của một sự kiện đơn lỗi 3 lần. KHÔNG kèm email khách. */
export function eventEmailFailureSupportMail(to: string, orderCode: string): MailMessage {
  return {
    to,
    subject: `Không gửi được email đơn ${orderCode}`,
    text: `Hệ thống không gửi được email cập nhật cho đơn ${orderCode} sau 3 lần thử. Vui lòng liên hệ khách hàng qua kênh khác.`,
  };
}
