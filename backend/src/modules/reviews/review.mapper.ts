import type { ProductReview } from '@prisma/client';
import { vnDateISO } from '../../lib/vn-time';

/** Dạng công khai (BR-REV-05): KHÔNG email / SĐT / id người dùng / tên nhân viên. */
export function toPublicReview(r: ProductReview) {
  return {
    id: r.review_id,
    author: r.authorDisplay,
    rating: r.rating,
    fit: r.fit,
    sizeBought: r.sizeBought,
    height: r.height,
    title: r.title,
    body: r.body,
    date: vnDateISO(r.createdAt),
    verified: true as const,
    ...(r.replyBody !== null && r.replyAt !== null ? { reply: { body: r.replyBody, at: r.replyAt.toISOString() } } : {}),
  };
}
export type PublicReviewDto = ReturnType<typeof toPublicReview>;

export type AdminReviewRow = ProductReview & {
  product: { name: string; slug: string; coverMediaId: string };
  hider: { role: string } | null;
};

export function toAdminReview(r: AdminReviewRow) {
  return {
    id: r.review_id,
    productId: r.productId,
    productName: r.product.name,
    productSlug: r.product.slug,
    productImage: r.product.coverMediaId,
    author: r.authorDisplay,
    rating: r.rating,
    fit: r.fit,
    sizeBought: r.sizeBought,
    height: r.height,
    title: r.title,
    body: r.body,
    date: vnDateISO(r.createdAt),
    createdAt: r.createdAt.toISOString(),
    verified: true as const,
    status: r.status as 'visible' | 'hidden',
    ...(r.status === 'hidden' && r.hiddenReason !== null ? { hiddenReason: r.hiddenReason } : {}),
    ...(r.status === 'hidden' && r.hiddenAt !== null ? { hiddenAt: r.hiddenAt.toISOString() } : {}),
    ...(r.status === 'hidden' && r.hiddenByName !== null
      ? { hiddenBy: { name: r.hiddenByName, role: r.hider?.role === 'admin' ? ('admin' as const) : ('staff' as const) } }
      : {}),
    ...(r.replyBody !== null && r.replyAt !== null
      ? { reply: { body: r.replyBody, at: r.replyAt.toISOString(), author: r.replyByName ?? '' } }
      : {}),
    updatedAt: r.updatedAt.toISOString(),
  };
}
export type AdminReviewDto = ReturnType<typeof toAdminReview>;
