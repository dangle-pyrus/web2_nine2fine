import { Prisma } from '@prisma/client';
import { P1_ASSUMPTIONS } from '../../config/assumptions';
import { DAY } from '../../lib/clock';
import type { Db } from '../../lib/sql';
import { ts } from '../../lib/sql';

export type EligibilityStatus = 'sign-in' | 'not-purchased' | 'reviewed' | 'eligible';
export interface Eligibility {
  status: EligibilityStatus;
  sizeBought?: string;
}

interface LineRow {
  order_id: string;
  delivered_at: Date;
  size: string;
  quantity: number;
  refunded: number;
}

/**
 * Điều kiện đủ đánh giá (BR-REV-01): MỘT hàm cho `GET /reviews/eligibility` và `POST /reviews`.
 * Đơn `completed`, `delivered_at` trong 365 ngày, chứa sản phẩm; `ordered = Σ quantity`; `refunded = Σ accepted_quantity` của yêu cầu
 * `refunded`; đủ khi `ordered > refunded`. `sizeBought` = size của dòng thuộc đơn GIAO MỚI NHẤT (hoà `order_id`) còn số lượng chưa trả hết.
 * Không xét "đã đánh giá" (người gọi kiểm trước).
 */
export async function purchaseEligibility(db: Db, userId: string, productId: string, at: Date): Promise<Eligibility> {
  const cutoff = new Date(at.getTime() - P1_ASSUMPTIONS.reviews.eligibleDays * DAY);
  const rows = await db.$queryRaw<LineRow[]>(Prisma.sql`
    SELECT o."order_id", o."delivered_at", oi."size", oi."quantity"::int AS "quantity",
           COALESCE((
             SELECT SUM(ri."accepted_quantity") FROM "order_return_items" ri JOIN "order_returns" r ON r."return_id" = ri."return_id"
             WHERE ri."order_item_id" = oi."order_item_id" AND r."state" = 'refunded'
           ), 0)::int AS "refunded"
    FROM "orders" o JOIN "order_items" oi ON oi."order_id" = o."order_id"
    WHERE o."user_id" = ${userId}::uuid AND o."status" = 'completed' AND o."delivered_at" IS NOT NULL
      AND o."delivered_at" >= ${ts(cutoff)} AND oi."product_id" = ${productId}::uuid
    ORDER BY o."delivered_at" DESC, o."order_id" DESC, oi."line_no" ASC`);
  const ordered = rows.reduce((n, r) => n + r.quantity, 0);
  const refunded = rows.reduce((n, r) => n + r.refunded, 0);
  if (rows.length === 0 || ordered <= refunded) return { status: 'not-purchased' };
  const line = rows.find((r) => r.quantity > r.refunded) ?? rows[0];
  return { status: 'eligible', sizeBought: line.size };
}
