import { VoucherRejection } from './checkout-models';

const money = (amount: number | undefined) => (amount ?? 0).toLocaleString('vi-VN');

function startsAt(iso: string | undefined): string {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** BR-VOU-04 wording for every `VoucherReason` of the contract. */
export const VOUCHER_MESSAGES: Record<VoucherRejection['reason'], (r: VoucherRejection) => string> =
  {
    'not-found': () => 'Mã giảm giá không tồn tại.',
    'not-started': (r) => `Mã này áp dụng từ ${startsAt(r.startsAt)}.`,
    expired: () => 'Mã giảm giá đã hết hạn.',
    exhausted: () => 'Mã giảm giá đã hết lượt sử dụng.',
    'login-required': () => 'Đăng nhập để dùng mã này.',
    'per-user-limit': () => 'Bạn đã dùng mã này đủ số lần cho phép.',
    'first-order-only': () => 'Mã chỉ áp dụng cho đơn hàng đầu tiên.',
    'min-spend': (r) =>
      `Mua thêm ${money(r.missingAmount)}₫ để dùng mã này (đơn tối thiểu ${money(r.minSubtotal)}₫).`,
    'shipping-already-free': () => 'Đơn của bạn đã được miễn phí giao hàng.',
    'category-mismatch': (r) => `Mã chỉ áp dụng cho ${r.categoryName ?? 'danh mục này'}.`,
    'excluded-sale-items': () => 'Mã không áp dụng cho sản phẩm đang giảm giá.',
  };

export function voucherMessage(rejection: VoucherRejection): string {
  return (VOUCHER_MESSAGES[rejection.reason] ?? (() => 'Mã giảm giá không dùng được.'))(rejection);
}
