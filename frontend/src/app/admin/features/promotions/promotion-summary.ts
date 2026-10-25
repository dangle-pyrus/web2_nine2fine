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
  return promo.minSubtotal > 0 ? `${what} · đơn từ ${money(promo.minSubtotal)}` : what;
}
