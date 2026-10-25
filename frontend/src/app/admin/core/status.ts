/**
 * The single place that maps admin states to badge labels and tones (guideline 3.3, 5.4;
 * Phụ lục A.3–A.4). Order labels come from the storefront so shopper and staff read the same words.
 */
import { ORDER_STATUS } from '../../features/orders/order-status';
import type {
  CustomerTier,
  OrderStatus,
  PaymentMethod,
  PaymentState,
  ProductStatus,
  Promotion,
  PromotionState,
  ReturnReason,
  ReturnSummary,
} from '../data-access/models';

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'critical';

export interface BadgeSpec {
  label: string;
  tone: Tone;
}

const ORDER_TONES: Record<OrderStatus, Tone> = {
  'pending-payment': 'warning',
  'pending-confirmation': 'warning',
  processing: 'info',
  shipping: 'info',
  delivering: 'info',
  'delivery-failed': 'critical',
  'returned-to-sender': 'neutral',
  completed: 'success',
  cancelled: 'neutral',
  'return-requested': 'warning',
  returned: 'neutral',
};

export function orderBadge(status: OrderStatus): BadgeSpec {
  return { label: ORDER_STATUS[status].label, tone: ORDER_TONES[status] };
}

export const ORDER_STATUS_OPTIONS = (Object.keys(ORDER_TONES) as OrderStatus[]).map((value) => ({
  value,
  label: ORDER_STATUS[value].label,
}));

const PAYMENT: Record<PaymentState, BadgeSpec> = {
  paid: { label: 'Đã thanh toán', tone: 'success' },
  unpaid: { label: 'Chưa thanh toán', tone: 'warning' },
  cod: { label: 'Thu khi giao', tone: 'neutral' },
  refunded: { label: 'Đã hoàn tiền', tone: 'neutral' },
  void: { label: 'Không thu tiền', tone: 'neutral' },
};

export function paymentBadge(state: PaymentState): BadgeSpec {
  return PAYMENT[state];
}

export const PAYMENT_METHODS: Record<PaymentMethod, string> = {
  cod: 'COD',
  'bank-transfer': 'Chuyển khoản',
  card: 'Thẻ',
};

const PRODUCT: Record<ProductStatus, BadgeSpec> = {
  active: { label: 'Đang bán', tone: 'success' },
  draft: { label: 'Nháp', tone: 'neutral' },
  hidden: { label: 'Đã ẩn', tone: 'neutral' },
};

export function productBadge(status: ProductStatus): BadgeSpec {
  return PRODUCT[status];
}

export const PRODUCT_STATUS_OPTIONS: { value: ProductStatus; label: string; help: string }[] = [
  {
    value: 'active',
    label: 'Đang bán',
    help: 'Hiển thị trên cửa hàng, khách tìm thấy và mua được.',
  },
  { value: 'draft', label: 'Nháp', help: 'Chưa hiển thị. Dùng khi đang chuẩn bị nội dung và ảnh.' },
  {
    value: 'hidden',
    label: 'Đã ẩn',
    help: 'Không hiện trong danh mục và tìm kiếm; đơn cũ vẫn giữ nguyên liên kết.',
  },
];

/** Stock badge: "Hết hàng" at 0 or below, "Sắp hết" at or below the threshold. */
export function stockBadge(available: number, threshold: number): BadgeSpec | null {
  if (available <= 0) return { label: 'Hết hàng', tone: 'critical' };
  if (available <= threshold) return { label: 'Sắp hết', tone: 'warning' };
  return null;
}

const PROMOTION: Record<PromotionState, BadgeSpec> = {
  running: { label: 'Đang chạy', tone: 'success' },
  scheduled: { label: 'Đã lên lịch', tone: 'info' },
  expired: { label: 'Đã hết hạn', tone: 'neutral' },
  disabled: { label: 'Đã tắt', tone: 'neutral' },
};

export function promotionBadge(state: PromotionState): BadgeSpec {
  return PROMOTION[state];
}

const RETURN: Record<ReturnSummary['state'], BadgeSpec> = {
  pending: { label: 'Chờ duyệt', tone: 'warning' },
  approved: { label: 'Đã duyệt, chờ nhận hàng', tone: 'info' },
  rejected: { label: 'Đã từ chối', tone: 'neutral' },
  completed: { label: 'Đã hoàn tiền', tone: 'neutral' },
};

export function returnBadge(state: ReturnSummary['state']): BadgeSpec {
  return RETURN[state];
}

export const RETURN_REASONS: Record<ReturnReason, string> = {
  'wrong-size': 'Sai size',
  'wrong-color': 'Sai màu',
  'wrong-item': 'Giao nhầm sản phẩm',
  defective: 'Lỗi sản phẩm',
  'not-fit': 'Không vừa form',
  'changed-mind': 'Đổi ý',
};

const TIER: Record<CustomerTier, BadgeSpec> = {
  member: { label: 'Thành viên', tone: 'neutral' },
  silver: { label: 'Bạc', tone: 'neutral' },
  gold: { label: 'Vàng', tone: 'warning' },
};

export function tierBadge(tier: CustomerTier): BadgeSpec {
  return TIER[tier];
}

/** Derived state; the backend should return the same rule so lists filter consistently. */
export function promotionState(
  promotion: Pick<Promotion, 'enabled' | 'startsAt' | 'endsAt' | 'usageLimit' | 'used'>,
  now = Date.now(),
): PromotionState {
  if (!promotion.enabled) return 'disabled';
  if (Date.parse(promotion.startsAt) > now) return 'scheduled';
  if (
    (promotion.endsAt && Date.parse(promotion.endsAt) < now) ||
    (promotion.usageLimit !== null && promotion.used >= promotion.usageLimit)
  )
    return 'expired';
  return 'running';
}
