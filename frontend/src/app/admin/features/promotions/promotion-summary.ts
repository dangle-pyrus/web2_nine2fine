import { CATEGORIES } from '../../../features/catalog/models/product';
import { money } from '../../core/format';
import type { PromotionInput } from '../../data-access/models';

/** One-line plain-language description, shared by the list and the form's summary card. */
export function promotionSummary(
  promo: Pick<PromotionInput, 'type' | 'value' | 'maxDiscount' | 'minSubtotal' | 'categories'>,
): string {
  const scope = promo.categories.length
    ? CATEGORIES.filter((item) => promo.categories.includes(item.value))
        .map((item) => item.label.toLowerCase())
        .join(', ')
    : '';
  const what =
    promo.type === 'percent'
      ? `Giảm ${promo.value || 0}%${scope ? ' cho ' + scope : ''}${promo.maxDiscount ? `, tối đa ${money(promo.maxDiscount)}` : ''}`
      : promo.type === 'fixed'
        ? `Giảm ${money(promo.value || 0)}${scope ? ' cho ' + scope : ''}`
        : 'Miễn phí vận chuyển';
  return promo.minSubtotal > 0 ? `${what}, cho đơn từ ${money(promo.minSubtotal)}` : what;
}

const TIER_LABELS: Record<string, string> = { member: 'Đồng', silver: 'Bạc', gold: 'Vàng' };

/** Who can use the code, in a few words for the list. */
export function promotionAudience(
  promo: Pick<PromotionInput, 'audience' | 'tiers' | 'customerIds'>,
): string {
  switch (promo.audience) {
    case 'tiers':
      return `Hạng ${promo.tiers.map((tier) => TIER_LABELS[tier] ?? tier).join(', ')}`;
    case 'customers':
      return `${promo.customerIds.length} khách được chọn`;
    case 'private':
      return 'Phát riêng';
    default:
      return 'Tất cả khách';
  }
}
