import { Product } from './product';

type Priced = Pick<Product, 'price' | 'compareAtPrice' | 'discountPercent'>;

/**
 * "-X%" of a product: the server's `discountPercent` while a sale runs (BR-PROMO-06, so the label
 * never disagrees with the price), otherwise from the hand-entered struck-through price. 0 = no
 * label (a 1.000 d cut on 500.000 d floors to 0).
 */
export function discountPercentOf(product: Priced): number {
  if (product.discountPercent !== undefined) return product.discountPercent;
  return product.compareAtPrice
    ? Math.max(0, Math.round((1 - product.price / product.compareAtPrice) * 100))
    : 0;
}

/** "Giảm giá đến dd/MM" while a sale with an end date runs (BR-PROMO-07), in Vietnam time. */
export function saleEndLabel(product: Pick<Product, 'saleEndsAt'>): string {
  if (!product.saleEndsAt) return '';
  const parts = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
  }).formatToParts(new Date(product.saleEndsAt));
  const day = parts.find((part) => part.type === 'day')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return day && month ? `Giảm giá đến ${day}/${month}` : '';
}
