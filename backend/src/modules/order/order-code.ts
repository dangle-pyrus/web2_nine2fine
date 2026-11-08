import { randomInt } from 'node:crypto';
import { vnYYMMDD } from '../../lib/vn-time';

/** Mã đơn = `N2F` + YYMMDD (ngày VN) + 4 số ngẫu nhiên bằng CSPRNG (BR-CHK-17). Duy nhất nhờ UNIQUE(code). */
export const ORDER_CODE_RE = /^N2F[0-9]{10}$/;

export const generateOrderCode = (at: Date): string =>
  `N2F${vnYYMMDD(at)}${String(randomInt(0, 10_000)).padStart(4, '0')}`;

/** Tra cứu không phân biệt hoa thường, có hoặc không dấu `#`. Trả `null` nếu sai dạng. */
export function normalizeOrderCode(raw: string): string | null {
  const code = raw.trim().replace(/^#/, '').toUpperCase();
  return ORDER_CODE_RE.test(code) ? code : null;
}
