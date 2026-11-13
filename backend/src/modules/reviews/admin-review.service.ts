import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { Errors } from '../../lib/errors';
import type { Db } from '../../lib/sql';
import { ts } from '../../lib/sql';
import { parseBodyAll, UUID_RE } from '../../lib/validate';
import { averageOf } from './rating';
import { AdminReviewRow, toAdminReview } from './review.mapper';
import { AdminReviewQuery, hideSchema, replySchema, showSchema } from './review.schemas';

export interface ReviewActor {
  id: string;
  name: string;
}

const INCLUDE = { product: { select: { name: true, slug: true, coverMediaId: true } }, hider: { select: { role: true } } } as const;

/** Danh sách kiểm duyệt (BR-REV-07). `counts` cố định cho thanh tab (không theo view / rating / productId). */
export async function listAdminReviews(q: AdminReviewQuery) {
  const and: Prisma.ProductReviewWhereInput[] = [];
  if (q.view === 'unanswered') and.push({ status: 'visible', replyBody: null });
  else if (q.view === 'low') and.push({ rating: { lte: 2 } });
  else if (q.view === 'hidden') and.push({ status: 'hidden' });
  if (q.rating !== undefined) and.push({ rating: q.rating });
  if (q.productId) and.push({ productId: q.productId.toLowerCase() });
  const where: Prisma.ProductReviewWhereInput = and.length > 0 ? { AND: and } : {};

  const [total, rows, counts, agg] = await Promise.all([
    prisma.productReview.count({ where }),
    prisma.productReview.findMany({
      where,
      include: INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { review_id: 'desc' }],
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
    prisma.$queryRaw<Array<{ al: bigint; un: bigint; lo: bigint; hi: bigint }>>(Prisma.sql`
      SELECT count(*)::bigint AS al,
             count(*) FILTER (WHERE "status" = 'visible' AND "reply_body" IS NULL)::bigint AS un,
             count(*) FILTER (WHERE "rating" <= 2)::bigint AS lo,
             count(*) FILTER (WHERE "status" = 'hidden')::bigint AS hi
      FROM "product_reviews"`),
    prisma.$queryRaw<Array<{ n: bigint; s: bigint | null }>>(Prisma.sql`
      SELECT count(*)::bigint AS n, sum("rating")::bigint AS s FROM "product_reviews" WHERE "status" = 'visible'`),
  ]);
  const c = counts[0];
  return {
    items: rows.map((r) => toAdminReview(r as AdminReviewRow)),
    total,
    page: q.page,
    limit: q.limit,
    counts: { all: Number(c.al), unanswered: Number(c.un), low: Number(c.lo), hidden: Number(c.hi) },
    average: averageOf(Number(agg[0].s ?? 0), Number(agg[0].n)),
  };
}

const TX = { timeout: 10_000, maxWait: 5_000 } as const;

async function lockReview(tx: Db, id: string) {
  if (!UUID_RE.test(id)) throw Errors.notFound('Không tìm thấy đánh giá.');
  const rows = await tx.$queryRaw<Array<{ status: string; updated_ms: number }>>(Prisma.sql`
    SELECT "status", floor(extract(epoch FROM "updated_at") * 1000)::float8 AS updated_ms
    FROM "product_reviews" WHERE "review_id" = ${id}::uuid FOR UPDATE`);
  if (rows.length === 0) throw Errors.notFound('Không tìm thấy đánh giá.');
  return rows[0];
}

const reload = async (tx: Db, id: string) =>
  toAdminReview((await tx.productReview.findUniqueOrThrow({ where: { review_id: id }, include: INCLUDE })) as AdminReviewRow);

/** `updatedAt` tăng ngặt: max(now, cũ + 1ms). */
const nextUpdatedAt = (at: Date, oldMs: number): Date => new Date(Math.max(at.getTime(), Math.floor(oldMs) + 1));
const sameVersion = (token: string, ms: number): boolean => Math.floor(new Date(token).getTime()) === Math.floor(ms);

/** Thứ tự: 422 thân -> 404 -> 409 -> ghi. `id` sai dạng -> 404 (sau 422 của thân). */
export async function hideReview(actor: ReviewActor, id: string, rawBody: unknown, at: Date) {
  const body = parseBodyAll(hideSchema, rawBody);
  return prisma.$transaction(async (tx) => {
    const cur = await lockReview(tx, id);
    if (!sameVersion(body.updatedAt, cur.updated_ms)) throw Errors.versionConflict();
    if (cur.status === 'hidden') return reload(tx, id); // đã ẩn: 200 không đổi, không đè lý do
    const next = nextUpdatedAt(at, cur.updated_ms);
    await tx.$executeRaw(Prisma.sql`
      UPDATE "product_reviews" SET "status" = 'hidden', "hidden_at" = ${ts(at)}, "hidden_by" = ${actor.id}::uuid, "hidden_by_name" = ${actor.name},
             "hidden_reason" = ${body.reason}, "updated_at" = ${ts(next)} WHERE "review_id" = ${id}::uuid`);
    return reload(tx, id);
  }, TX);
}

export async function showReview(_actor: ReviewActor, id: string, rawBody: unknown, at: Date) {
  const body = parseBodyAll(showSchema, rawBody);
  return prisma.$transaction(async (tx) => {
    const cur = await lockReview(tx, id);
    if (!sameVersion(body.updatedAt, cur.updated_ms)) throw Errors.versionConflict();
    if (cur.status === 'visible') return reload(tx, id);
    const next = nextUpdatedAt(at, cur.updated_ms);
    await tx.$executeRaw(Prisma.sql`
      UPDATE "product_reviews" SET "status" = 'visible', "hidden_at" = NULL, "hidden_by" = NULL, "hidden_by_name" = NULL, "hidden_reason" = NULL,
             "updated_at" = ${ts(next)} WHERE "review_id" = ${id}::uuid`);
    return reload(tx, id);
  }, TX);
}

export async function replyReview(actor: ReviewActor, id: string, rawBody: unknown, at: Date) {
  const body = parseBodyAll(replySchema, rawBody);
  return prisma.$transaction(async (tx) => {
    const cur = await lockReview(tx, id);
    if (!sameVersion(body.updatedAt, cur.updated_ms)) throw Errors.versionConflict();
    const next = nextUpdatedAt(at, cur.updated_ms);
    if (body.body === null) {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "product_reviews" SET "reply_body" = NULL, "reply_at" = NULL, "reply_by" = NULL, "reply_by_name" = NULL, "updated_at" = ${ts(next)}
        WHERE "review_id" = ${id}::uuid`);
    } else {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "product_reviews" SET "reply_body" = ${body.body}, "reply_at" = ${ts(at)}, "reply_by" = ${actor.id}::uuid, "reply_by_name" = ${actor.name},
               "updated_at" = ${ts(next)} WHERE "review_id" = ${id}::uuid`);
    }
    return reload(tx, id);
  }, TX);
}
