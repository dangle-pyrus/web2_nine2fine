import type { SizeChart } from '@prisma/client';
import type { ProductDto, ProductVariantDto, ProductWithVariants, StockStatus } from './catalog.types';

export function stockStatusOf(qty: number): StockStatus {
  if (qty <= 0) return 'OUT_OF_STOCK';
  return qty <= 5 ? 'LOW_STOCK' : 'IN_STOCK';
}

export function toProductDto(p: ProductWithVariants, categorySlug: string): ProductDto {
  const price = Number(p.price);
  const compare = p.compareAtPrice === null ? null : Number(p.compareAtPrice);
  const colorMedia = (p.colorMedia ?? {}) as Record<string, string>;
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
    price,
    ...(compare !== null && compare > price ? { compareAtPrice: compare } : {}),
    mediaId: p.coverMediaId,
    gallery: p.galleryMediaIds,
    ...(Object.keys(colorMedia).length > 0 ? { colorMedia } : {}),
    variants,
    ...(p.badge ? { badge: p.badge } : {}),
    description: p.description,
    material: p.material,
    care: p.care,
    fit: { summary: p.fitSummary, model: p.fitModel },
    looks: (p.looks ?? []) as unknown[],
    createdAt: p.createdAt.toISOString().slice(0, 10),
    salesRank: p.salesRank,
  };
}

export function toSizeChartDto(row: SizeChart): unknown {
  return row.data;
}
