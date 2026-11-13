/**
 * MỘT hàm giá hiệu lực cho cả hệ thống (Slice 10, BR-PROMO-02..04, plan mục 3). Không có biểu thức SQL thứ hai:
 * catalog (thẻ, chi tiết, lọc `maxPrice`, sắp theo giá, `sale=true`), giỏ, báo giá, đặt đơn, gợi ý, wishlist, bộ sưu tập đều gọi hàm này.
 * `now` là MỘT giá trị cho cả yêu cầu (người gọi truyền vào, thường `lib/clock.now()`).
 */

export interface SaleFields {
  /** Giá gốc (VND, nguyên). */
  price: number;
  /** Giá gạch nhập tay (có thể null / <= price). */
  compareAtPrice: number | null;
  salePrice: number | null;
  saleStartsAt: Date | null;
  saleEndsAt: Date | null;
}

export interface EffectivePrice {
  price: number;
  /** Chỉ có khi > price: trong đợt = giá gốc; ngoài đợt = giá gạch nhập tay. */
  compareAtPrice: number | null;
  /** Chỉ khi đợt đang chạy. */
  discountPercent?: number;
  /** Chỉ khi đợt đang chạy. */
  saleEndsAt?: Date;
}

export type SaleState = 'none' | 'upcoming' | 'running' | 'ended';

/** Đợt đang chạy: có đủ ba trường và `saleStartsAt <= now <= saleEndsAt` (cả hai đầu gồm). */
export function isSaleRunning(p: SaleFields, now: Date): boolean {
  if (p.salePrice === null || p.saleStartsAt === null || p.saleEndsAt === null) return false;
  const t = now.getTime();
  return p.saleStartsAt.getTime() <= t && t <= p.saleEndsAt.getTime();
}

export function saleState(p: SaleFields, now: Date): SaleState {
  if (p.salePrice === null || p.saleStartsAt === null || p.saleEndsAt === null) return 'none';
  const t = now.getTime();
  if (t < p.saleStartsAt.getTime()) return 'upcoming';
  return t <= p.saleEndsAt.getTime() ? 'running' : 'ended';
}

export function effectivePrice(p: SaleFields, now: Date): EffectivePrice {
  if (isSaleRunning(p, now)) {
    const sale = p.salePrice as number;
    return {
      price: sale,
      compareAtPrice: p.price,
      discountPercent: Math.floor(((p.price - sale) * 100) / p.price),
      saleEndsAt: p.saleEndsAt as Date,
    };
  }
  return { price: p.price, compareAtPrice: p.compareAtPrice !== null && p.compareAtPrice > p.price ? p.compareAtPrice : null };
}

/** "Đang giảm" (BR-PROMO-04): đợt đang chạy HOẶC có giá gạch nhập tay > giá. Voucher `excludeSaleItems` dùng định nghĩa này. */
export function isOnSale(p: SaleFields, now: Date): boolean {
  return isSaleRunning(p, now) || (p.compareAtPrice !== null && p.compareAtPrice > p.price);
}

/** Cột Prisma / raw (Decimal | number | string | null) -> số nguyên VND hoặc null. */
export const moneyOrNull = (v: { toString(): string } | number | string | null | undefined): number | null =>
  v === null || v === undefined ? null : Number(v);
