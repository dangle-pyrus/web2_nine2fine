import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { Errors } from '../../lib/errors';
import { UUID_RE, parseBodyAll } from '../../lib/validate';
import { Eligibility, purchaseEligibility } from './eligibility';
import { toPublicReview } from './review.mapper';
import { parsePublicQuery, PublicReviewQuery, reviewCreateSchema } from './review.schemas';
import { averageOf } from './rating';

async function activeProductOrThrow(productId: string): Promise<void> {
  if (!UUID_RE.test(productId)) throw Errors.notFound();
  const p = await prisma.product.findFirst({ where: { product_id: productId, status: 'ACTIVE' }, select: { product_id: true } });
  if (!p) throw Errors.notFound();
}

/** `summary` trên MỌI đánh giá `visible` của sản phẩm (không theo bộ lọc `rating`): một truy vấn GROUP BY (BR-REV-06). */
async function summaryOf(productId: string) {
  const rows = await prisma.$queryRaw<Array<{ rating: number; fit: number; n: bigint }>>(Prisma.sql`
    SELECT "rating"::int AS "rating", "fit"::int AS "fit", count(*)::bigint AS n
    FROM "product_reviews" WHERE "product_id" = ${productId}::uuid AND "status" = 'visible' GROUP BY "rating", "fit"`);
  const distribution = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  const fit = { small: 0, true: 0, large: 0 };
  let count = 0;
  let sum = 0;
  for (const r of rows) {
    const n = Number(r.n);
    count += n;
    sum += n * r.rating;
    distribution[String(r.rating) as keyof typeof distribution] += n;
    if (r.fit < 0) fit.small += n;
    else if (r.fit > 0) fit.large += n;
    else fit.true += n;
  }
  return { count, average: averageOf(sum, count), distribution, fit };
}

/** GET /products/{productId}/reviews (công khai, BR-REV-05, 06, 09). Thứ tự: 422 tham số -> 404 sản phẩm. */
export async function listPublicReviews(productId: string, rawQuery: Record<string, unknown>) {
  const q: PublicReviewQuery = parsePublicQuery(rawQuery);
  await activeProductOrThrow(productId);
  const where: Prisma.ProductReviewWhereInput = { productId, status: 'visible', ...(q.rating !== undefined ? { rating: q.rating } : {}) };
  const [total, rows, summary] = await Promise.all([
    prisma.productReview.count({ where }),
    prisma.productReview.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { review_id: 'desc' }],
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
    summaryOf(productId),
  ]);
  return { items: rows.map(toPublicReview), total, page: q.page, limit: q.limit, summary };
}

/** GET /reviews/eligibility. `userId` undefined = không phiên. Thứ tự: 422 productId -> 404 -> trạng thái. */
export async function getEligibility(userId: string | undefined, rawProductId: unknown, at: Date): Promise<Eligibility> {
  if (typeof rawProductId !== 'string' || !UUID_RE.test(rawProductId)) throw Errors.validation('Mã sản phẩm không hợp lệ.', 'productId');
  const productId = rawProductId.toLowerCase();
  await activeProductOrThrow(productId);
  if (!userId) return { status: 'sign-in' };
  const reviewed = await prisma.productReview.findUnique({
    where: { userId_productId: { userId, productId } },
    select: { review_id: true },
  });
  if (reviewed) return { status: 'reviewed' };
  return purchaseEligibility(prisma, userId, productId, at);
}

/** "Họ + chữ cái đầu của tên" (D3): `lastName` + ' ' + chữ đầu `firstName` in hoa + '.'; chụp lúc gửi. */
export function authorDisplayOf(u: { firstName: string; lastName: string }): string {
  const last = u.lastName.normalize('NFC').replace(/\s+/g, ' ').trim();
  const initial = [...u.firstName.normalize('NFC').trim()][0]?.toUpperCase() ?? '';
  const name = [last, initial ? `${initial}.` : ''].filter(Boolean).join(' ');
  return (name || 'Khách hàng').slice(0, 60);
}

const isUniqueViolation = (e: unknown): boolean =>
  (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') || (e instanceof Error && /23505/.test(e.message));

/**
 * POST /reviews. Thứ tự (người gọi đã qua 401 / 429): 422 thân (mọi lỗi) -> 404 sản phẩm -> giao dịch: `already-reviewed` -> `not-eligible` -> INSERT.
 * UNIQUE (user, product) là lưới an toàn khi gửi đồng thời (-> `already-reviewed`).
 */
export async function createReview(user: { user_id: string; firstName: string; lastName: string }, rawBody: unknown, at: Date) {
  const input = parseBodyAll(reviewCreateSchema, rawBody);
  const productId = input.productId.toLowerCase();
  await activeProductOrThrow(productId);
  try {
    const row = await prisma.$transaction(async (tx) => {
      const existing = await tx.productReview.findUnique({
        where: { userId_productId: { userId: user.user_id, productId } },
        select: { review_id: true },
      });
      if (existing) throw Errors.alreadyReviewed();
      const elig = await purchaseEligibility(tx, user.user_id, productId, at);
      if (elig.status !== 'eligible' || !elig.sizeBought) throw Errors.notEligible();
      const order = await tx.$queryRaw<Array<{ order_id: string }>>(Prisma.sql`
        SELECT o."order_id" FROM "orders" o JOIN "order_items" oi ON oi."order_id" = o."order_id"
        WHERE o."user_id" = ${user.user_id}::uuid AND o."status" = 'completed' AND oi."product_id" = ${productId}::uuid AND o."delivered_at" IS NOT NULL
        ORDER BY o."delivered_at" DESC, o."order_id" DESC LIMIT 1`);
      return tx.productReview.create({
        data: {
          productId,
          userId: user.user_id,
          orderId: order[0]?.order_id ?? null,
          authorDisplay: authorDisplayOf(user),
          rating: input.rating,
          fit: input.fit,
          sizeBought: elig.sizeBought,
          height: input.height ?? '',
          title: input.title,
          body: input.body,
          status: 'visible',
          createdAt: at,
          updatedAt: at,
        },
      });
    });
    return toPublicReview(row);
  } catch (e) {
    if (isUniqueViolation(e)) throw Errors.alreadyReviewed();
    throw e;
  }
}
