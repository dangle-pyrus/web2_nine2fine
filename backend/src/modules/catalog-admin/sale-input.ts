import { P1_ASSUMPTIONS } from '../../config/assumptions';
import { addCalendarDays, daysBetween, isRealDate, vnStartOfDay } from '../../lib/vn-time';

/**
 * Kiểm + đổi 3 trường đợt giảm giá của `PUT|POST /admin/products` (BR-PROMO-01, 05). Một nơi, dùng ở Zod (422) và ở ghi.
 * Khoá vắng = giữ; cả ba `null` = gỡ; cả ba có giá trị = đặt (ghi đè).
 */
export interface SaleInput {
  price: number;
  salePrice?: number | null | undefined;
  saleStartsAt?: string | null | undefined;
  saleEndsAt?: string | null | undefined;
}

export type SaleChange =
  | { kind: 'keep' }
  | { kind: 'clear' }
  | { kind: 'set'; salePrice: number; startsAt: Date; endsAt: Date };

export interface SaleIssue {
  path: 'salePrice' | 'saleStartsAt' | 'saleEndsAt';
  message: string;
}

const DAY_MS = 86_400_000;
const VN_OFFSET_MS = 7 * 3_600_000;
const { minSalePrice, maxDays } = P1_ASSUMPTIONS.promo;

export const SALE_KEYS = ['salePrice', 'saleStartsAt', 'saleEndsAt'] as const;
export const hasSaleKey = (body: unknown): boolean =>
  typeof body === 'object' && body !== null && SALE_KEYS.some((k) => k in (body as Record<string, unknown>));

const MSG_PRICE = `Giá giảm phải là số nguyên từ ${minSalePrice.toLocaleString('vi-VN')} đồng và nhỏ hơn giá bán.`;
const MSG_START = 'Ngày bắt đầu không hợp lệ (YYYY-MM-DD).';
const MSG_END = 'Ngày kết thúc không hợp lệ (YYYY-MM-DD).';

/** `YYYY-MM-DD` (giờ VN) hoặc ISO UTC đúng biên 00:00:00 / 23:59:59 giờ VN -> thời điểm UTC. null = sai. */
function parseBoundary(v: string, end: boolean): Date | null {
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    if (!isRealDate(s)) return null;
    return end ? new Date(vnStartOfDay(addCalendarDays(s, 1)).getTime() - 1000) : vnStartOfDay(s);
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(s)) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const msOfDayVn = (((d.getTime() + VN_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS;
  return msOfDayVn === (end ? DAY_MS - 1000 : 0) ? d : null;
}

export function evaluateSale(v: SaleInput): { change: SaleChange; issues: SaleIssue[] } {
  const present = { salePrice: v.salePrice !== undefined, saleStartsAt: v.saleStartsAt !== undefined, saleEndsAt: v.saleEndsAt !== undefined };
  if (!present.salePrice && !present.saleStartsAt && !present.saleEndsAt) return { change: { kind: 'keep' }, issues: [] };
  const hasValue = { salePrice: typeof v.salePrice === 'number', saleStartsAt: typeof v.saleStartsAt === 'string', saleEndsAt: typeof v.saleEndsAt === 'string' };
  const nValues = Object.values(hasValue).filter(Boolean).length;
  const issues: SaleIssue[] = [];

  if (nValues === 0) {
    // Gỡ đợt: cả ba phải cùng `null` (không có khoá nào vắng).
    for (const k of SALE_KEYS) if (!present[k]) issues.push({ path: k, message: 'Gỡ đợt giảm giá cần để trống cả ba trường.' });
    return issues.length > 0 ? { change: { kind: 'keep' }, issues } : { change: { kind: 'clear' }, issues };
  }
  if (nValues < 3) {
    const missing: Record<(typeof SALE_KEYS)[number], string> = {
      salePrice: 'Nhập giá giảm.',
      saleStartsAt: 'Nhập ngày bắt đầu.',
      saleEndsAt: 'Nhập ngày kết thúc.',
    };
    for (const k of SALE_KEYS) if (!hasValue[k]) issues.push({ path: k, message: missing[k] });
  }

  let salePrice: number | undefined;
  if (hasValue.salePrice) {
    const p = v.salePrice as number;
    if (!Number.isInteger(p) || p < minSalePrice || p >= v.price) issues.push({ path: 'salePrice', message: MSG_PRICE });
    else salePrice = p;
  }
  const startsAt = hasValue.saleStartsAt ? parseBoundary(v.saleStartsAt as string, false) : null;
  const endsAt = hasValue.saleEndsAt ? parseBoundary(v.saleEndsAt as string, true) : null;
  if (hasValue.saleStartsAt && !startsAt) issues.push({ path: 'saleStartsAt', message: MSG_START });
  if (hasValue.saleEndsAt && !endsAt) issues.push({ path: 'saleEndsAt', message: MSG_END });
  if (startsAt && endsAt) {
    if (endsAt.getTime() < startsAt.getTime()) issues.push({ path: 'saleEndsAt', message: 'Ngày kết thúc không được trước ngày bắt đầu.' });
    else if (endsAt.getTime() - startsAt.getTime() >= maxDays * DAY_MS) {
      issues.push({ path: 'saleEndsAt', message: `Đợt giảm giá tối đa ${maxDays} ngày.` });
    }
  }
  if (issues.length > 0 || salePrice === undefined || !startsAt || !endsAt) return { change: { kind: 'keep' }, issues };
  return { change: { kind: 'set', salePrice, startsAt, endsAt }, issues };
}

/** Số ngày VN giữa hai ngày (dùng cho bulk): `endsOn <= startsOn + 89`. */
export const daysApart = daysBetween;
