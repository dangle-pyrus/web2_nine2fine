/**
 * Toán số nguyên cho KPI (plan Slice 8 mục 4): không float cho tiền / tỉ lệ. Dùng BigInt bên trong để
 * `num * 10000` không vượt 2^53 (doanh thu hàng nghìn tỷ đồng vẫn đúng).
 */

/** floor((2a + b) / (2b)) = làm tròn half-up của a / b, a >= 0, b > 0. */
export function divRoundHalfUp(a: number, b: number): number {
  if (!(b > 0) || a < 0) throw new RangeError('divRoundHalfUp cần a >= 0, b > 0');
  const A = BigInt(Math.trunc(a));
  const B = BigInt(Math.trunc(b));
  return Number((2n * A + B) / (2n * B));
}

/** Tỉ lệ 0..1 làm tròn half-up 4 chữ số thập phân; mẫu 0 -> 0. */
export function ratio4(num: number, den: number): number {
  if (den <= 0) return 0;
  const N = BigInt(Math.trunc(num)) * 10_000n;
  const D = BigInt(Math.trunc(den));
  return Number((2n * N + D) / (2n * D)) / 10_000;
}

/** (cur - prev) / prev, half-up 4 chữ số theo giá trị tuyệt đối rồi gắn dấu; prev = 0 -> null; không bao giờ `-0`. */
export function changeRatio(cur: number, prev: number): number | null {
  if (prev <= 0) return null;
  const d = cur - prev;
  if (d === 0) return 0;
  const r = divRoundHalfUp(Math.abs(d) * 10_000, prev) / 10_000;
  return r === 0 ? 0 : d < 0 ? -r : r;
}
