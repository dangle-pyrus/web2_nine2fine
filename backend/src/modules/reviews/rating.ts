import { Prisma } from '@prisma/client';
import type { Db } from '../../lib/sql';

/** Điểm trung bình đánh giá `visible` (BR-REV-06): một nơi tính cho PLP, PDP, `summary`, admin. */
export interface RatingSummary {
  average: number;
  count: number;
}

/** Σ sao / count làm tròn 1 chữ số thập phân half-up, bằng số nguyên (không sai số nhị phân): 13/3 -> 4,3; 16/4 -> 4,0; 17/4 -> 4,3. */
export function averageOf(sum: number, count: number): number | null {
  if (count <= 0) return null;
  return Math.floor((sum * 20 + count) / (2 * count)) / 10;
}

/** Một truy vấn cho cả trang sản phẩm (không N+1). Sản phẩm không có đánh giá `visible` không có phần tử. */
export async function loadRatings(db: Db, productIds: readonly string[]): Promise<Map<string, RatingSummary>> {
  const out = new Map<string, RatingSummary>();
  if (productIds.length === 0) return out;
  const rows = await db.$queryRaw<Array<{ product_id: string; n: bigint; s: bigint }>>(Prisma.sql`
    SELECT "product_id", count(*)::bigint AS n, sum("rating")::bigint AS s
    FROM "product_reviews"
    WHERE "status" = 'visible' AND "product_id" = ANY(${productIds as string[]}::uuid[])
    GROUP BY "product_id"`);
  for (const r of rows) {
    const count = Number(r.n);
    out.set(r.product_id, { average: averageOf(Number(r.s), count) as number, count });
  }
  return out;
}
