import type { SizeChart } from '@prisma/client';
import { now as clockNow } from '../../lib/clock';
import { effectivePrice, moneyOrNull } from '../pricing/effective-price';
import type { RatingSummary } from '../reviews/rating';
import type { ProductDto, ProductVariantDto, ProductWithVariants, StockStatus } from './catalog.types';

export function stockStatusOf(qty: number): StockStatus {
  if (qty <= 0) return 'OUT_OF_STOCK';
  return qty <= 5 ? 'LOW_STOCK' : 'IN_STOCK';
}

export interface ProductDtoCtx {
  /** Một giá trị "bây giờ" cho cả yêu cầu (mặc định `lib/clock.now()`). */
  now?: Date;
  /** Điểm trung bình theo product_id (từ `reviews/rating.loadRatings`); vắng = không có `rating`. */
  ratings?: ReadonlyMap<string, RatingSummary>;
}

export function toProductDto(p: ProductWithVariants, categorySlug: string, ctx: ProductDtoCtx = {}): ProductDto {
  const at = ctx.now ?? clockNow();
  const eff = effectivePrice(
    {
      price: Number(p.price),
      compareAtPrice: moneyOrNull(p.compareAtPrice),
      salePrice: moneyOrNull(p.salePrice),
      saleStartsAt: p.saleStartsAt,
      saleEndsAt: p.saleEndsAt,
    },
    at,
  );
  const rating = ctx.ratings?.get(p.product_id);
  const colorMedia = (p.colorMedia ?? {}) as Record<string, string>;
  const meta = (p.imageMeta ?? {}) as Record<string, { color?: string } | undefined>;
  const galleryColors = Object.fromEntries(p.galleryMediaIds.flatMap((id) => (meta[id]?.color ? [[id, meta[id]!.color!]] : [])));
  const variants: ProductVariantDto[] = [...p.variants]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((v) => ({
      id: v.variant_id,
      sku: v.sku,
      size: v.size,
      color: { name: v.colorName, hex: v.colorHex },
      inventory: v.inventoryQty,
      stockStatus: stockStatusOf(v.inventoryQty),
    }));
  return {
    id: p.product_id,
    slug: p.slug,
    name: p.name,
    type: p.typeLabel,
    category: categorySlug,
    moments: p.moments,
    genders: p.genders,
    price: eff.price,
    ...(eff.compareAtPrice !== null ? { compareAtPrice: eff.compareAtPrice } : {}),
    mediaId: p.coverMediaId,
    gallery: p.galleryMediaIds,
    ...(Object.keys(colorMedia).length > 0 ? { colorMedia } : {}),
    ...(Object.keys(galleryColors).length > 0 ? { galleryColors } : {}),
    variants,
    ...(p.badge ? { badge: p.badge } : {}),
    description: p.description,
    material: p.material,
    care: p.care,
    fit: { summary: p.fitSummary, model: p.fitModel },
    looks: (p.looks ?? []) as unknown[],
    createdAt: p.createdAt.toISOString().slice(0, 10),
    salesRank: p.salesRank,
    ...(rating ? { rating: { average: rating.average, count: rating.count } } : {}),
    ...(eff.discountPercent !== undefined ? { discountPercent: eff.discountPercent } : {}),
    ...(eff.saleEndsAt ? { saleEndsAt: eff.saleEndsAt.toISOString() } : {}),
  };
}

/** `updatedAt` chỉ khi admin đã sửa qua API (updated_by_name <> '' ở lát 10.3). */
export function toSizeChartDto(row: SizeChart): unknown {
  const data = row.data as Record<string, unknown>;
  return row.updatedByName !== '' ? { ...data, updatedAt: row.updatedAt.toISOString() } : data;
}
