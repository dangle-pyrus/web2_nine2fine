import { ASSUMPTIONS } from '../../config/assumptions';
import { allocateByWeight, floorTo } from '../../lib/money';

/** Tính tiền thuần, không DB (plan mục 4.2). Tiền là số nguyên VND. */

export interface PricingLine {
  variantId: string;
  unitPrice: number;
  /** Số lượng hiệu lực (> 0). */
  quantity: number;
}

export interface DiscountVoucherDef {
  kind: 'percent' | 'fixed';
  value: number;
  maxDiscount: number | null;
}

export interface PricingInput {
  lines: readonly PricingLine[];
  /** Mã giảm tiền đã qua bộ lọc điều kiện + các dòng đủ điều kiện của nó. */
  discount?: { voucher: DiscountVoucherDef; eligibleVariantIds: ReadonlySet<string> };
  /** Mã free-ship đã qua bộ lọc điều kiện (chỉ áp khi chưa miễn phí theo ngưỡng). */
  freeShipVoucher: boolean;
  settings: { shippingFee: number; freeShippingThreshold: number };
}

export interface Pricing {
  subtotal: number;
  discount: number;
  shippingFee: number;
  shippingDiscount: number;
  total: number;
}

export interface PricingResult {
  pricing: Pricing;
  lineDiscounts: Array<{ variantId: string; amount: number }>;
  shipping: { fee: number; freeReason: 'threshold' | 'voucher' | null };
}

export const lineValue = (l: PricingLine): number => l.unitPrice * l.quantity;
export const sumValue = (lines: readonly PricingLine[]): number => lines.reduce((a, l) => a + lineValue(l), 0);

/** Phần giảm của mã trên tiền hàng đủ điều kiện `base` (BR-VOU-05). Mã %: làm tròn xuống tới 1.000 ₫ (Q1). */
export function discountAmount(v: DiscountVoucherDef, base: number): number {
  let d: number;
  if (v.kind === 'percent') {
    d = floorTo(Math.floor((base * v.value) / 100), ASSUMPTIONS.percentRoundStep);
    if (v.maxDiscount !== null) d = Math.min(d, v.maxDiscount);
  } else {
    d = Math.min(v.value, base);
  }
  return Math.max(0, Math.min(d, base));
}

export function computePricing(input: PricingInput): PricingResult {
  const subtotal = sumValue(input.lines);
  const empty = subtotal === 0;
  const fee = empty ? 0 : input.settings.shippingFee;

  const thresholdFree = !empty && subtotal >= input.settings.freeShippingThreshold; // trước voucher (BR-VOU-05)
  const freeReason: 'threshold' | 'voucher' | null = thresholdFree
    ? 'threshold'
    : input.freeShipVoucher && !empty
      ? 'voucher'
      : null;
  const shippingDiscount = freeReason ? fee : 0;

  let discount = 0;
  let lineDiscounts: Array<{ variantId: string; amount: number }> = [];
  if (input.discount) {
    const eligibleIds = input.discount.eligibleVariantIds;
    const eligible = input.lines.filter((l) => eligibleIds.has(l.variantId));
    discount = discountAmount(input.discount.voucher, sumValue(eligible));
    if (discount > 0) {
      lineDiscounts = allocateByWeight(
        discount,
        eligible.map((l) => ({ id: l.variantId, weight: lineValue(l) })),
      )
        .filter((a) => a.amount > 0)
        .map((a) => ({ variantId: a.id, amount: a.amount }));
    }
  }

  return {
    pricing: {
      subtotal,
      discount,
      shippingFee: fee,
      shippingDiscount,
      total: subtotal - discount + fee - shippingDiscount,
    },
    lineDiscounts,
    shipping: { fee: input.settings.shippingFee, freeReason },
  };
}
