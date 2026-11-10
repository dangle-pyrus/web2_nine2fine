import type { Db } from './sql';
import { foldVi } from './text';

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SLUG_MAX = 80;

/** Tên -> slug: bỏ dấu (foldVi, đ -> d), ký tự khác a-z0-9 -> '-', gộp, cắt tối đa 80, tối thiểu 3. */
export function slugify(name: string): string {
  let s = foldVi(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (s.length > SLUG_MAX) s = s.slice(0, SLUG_MAX).replace(/-+$/g, '');
  if (s === '') return 'san-pham';
  if (s.length < 3) s = `${s}-sp`;
  return s;
}

/** Slug chưa dùng: `base`, `base-2`, `base-3`... (cùng giao dịch; đua nhau thì P2002 ở người gọi, thử lại). */
export async function nextFreeSlug(tx: Db, base: string): Promise<string> {
  for (let n = 1; n < 1000; n++) {
    const suffix = n === 1 ? '' : `-${n}`;
    const candidate = `${base.slice(0, SLUG_MAX - suffix.length).replace(/-+$/g, '')}${suffix}`;
    const hit = await tx.product.findUnique({ where: { slug: candidate }, select: { product_id: true } });
    if (!hit) return candidate;
  }
  throw new Error('slug-exhausted');
}
