import type { Prisma, product_status } from '@prisma/client';
import { CATALOG_ASSUMPTIONS } from '../../config/assumptions';
import { staffDisplayName } from '../order/order-event';
import { mediaUrlOf } from './media.service';

export const ADMIN_PRODUCT_INCLUDE = {
  category: true,
  variants: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
  updatedBy: true,
} satisfies Prisma.ProductInclude;

export type ProductFull = Prisma.ProductGetPayload<{ include: typeof ADMIN_PRODUCT_INCLUDE }>;

export type AdminStatus = 'active' | 'draft' | 'hidden';
export const toAdminStatus = (s: product_status | string): AdminStatus => (s === 'ACTIVE' ? 'active' : s === 'ARCHIVED' ? 'hidden' : 'draft');
export const toDbStatus = (s: AdminStatus): product_status => (s === 'active' ? 'ACTIVE' : s === 'hidden' ? 'ARCHIVED' : 'DRAFT');

export interface ImageMeta {
  alt?: string;
  color?: string;
}

export interface AdminImageDto {
  id: string;
  url: string | null;
  alt: string;
  color: string;
}

/** Ảnh của sản phẩm theo thứ tự hiển thị. Sản phẩm seed chưa có `image_meta`: suy màu ngược từ `color_media`. */
export function imagesOf(p: { coverMediaId: string; galleryMediaIds: string[]; colorMedia: unknown; imageMeta: unknown }): AdminImageDto[] {
  const meta = (p.imageMeta ?? {}) as Record<string, ImageMeta>;
  const colorMedia = (p.colorMedia ?? {}) as Record<string, string>;
  const reverse = new Map<string, string>();
  for (const [color, id] of Object.entries(colorMedia)) if (!reverse.has(id)) reverse.set(id, color);
  const ids = p.galleryMediaIds.length > 0 ? p.galleryMediaIds : p.coverMediaId ? [p.coverMediaId] : [];
  return ids.map((id) => ({ id, url: mediaUrlOf(id), alt: meta[id]?.alt ?? '', color: meta[id]?.color ?? reverse.get(id) ?? '' }));
}

export function toAdminProduct(p: ProductFull, orderedVariantIds: ReadonlySet<string>, updatedAtMs: number) {
  const colors: Array<{ name: string; hex: string }> = [];
  for (const v of p.variants) if (!colors.some((c) => c.name === v.colorName)) colors.push({ name: v.colorName, hex: v.colorHex.toUpperCase() });
  const present = new Set(p.variants.map((v) => v.size));
  const sizes = CATALOG_ASSUMPTIONS.variant.sizes.filter((s) => present.has(s));
  const published = p.publishedAt !== null;
  return {
    id: p.product_id,
    slug: p.slug,
    name: p.name,
    type: p.typeLabel,
    description: p.description,
    status: toAdminStatus(p.status),
    category: p.category.slug,
    genders: p.genders as string[],
    moments: p.moments as string[],
    price: Number(p.price),
    compareAtPrice: p.compareAtPrice === null ? null : Number(p.compareAtPrice),
    material: p.material,
    care: p.care,
    fitSummary: p.fitSummary,
    images: imagesOf(p),
    colors,
    sizes,
    variants: p.variants.map((v) => ({
      id: v.variant_id,
      sku: v.sku,
      color: { name: v.colorName, hex: v.colorHex.toUpperCase() },
      size: v.size,
      inventory: v.inventoryQty,
      hasOrders: orderedVariantIds.has(v.variant_id),
    })),
    published,
    slugLocked: CATALOG_ASSUMPTIONS.lockSlugAfterPublish && published,
    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: new Date(updatedAtMs).toISOString(),
    updatedBy: p.updatedBy ? { name: staffDisplayName(p.updatedBy) } : null,
  };
}
export type AdminProductDto = ReturnType<typeof toAdminProduct>;

export interface SummaryRow {
  product_id: string;
  slug: string;
  name: string;
  cover_media_id: string;
  status: string;
  category: string;
  category_name: string;
  price: Prisma.Decimal | number | string;
  compare_at_price: Prisma.Decimal | number | string | null;
  inventory: number;
  variant_count: number;
  updated_ms: number;
}

export function toAdminSummary(r: SummaryRow) {
  return {
    id: r.product_id,
    slug: r.slug,
    name: r.name,
    coverImage: r.cover_media_id ? { id: r.cover_media_id, url: mediaUrlOf(r.cover_media_id) } : null,
    status: toAdminStatus(r.status),
    category: r.category,
    categoryName: r.category_name,
    price: Number(r.price),
    compareAtPrice: r.compare_at_price === null ? null : Number(r.compare_at_price),
    inventory: Number(r.inventory),
    variantCount: Number(r.variant_count),
    updatedAt: new Date(Number(r.updated_ms)).toISOString(),
  };
}
