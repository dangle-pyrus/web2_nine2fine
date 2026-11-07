import dotenv from 'dotenv';
import { Prisma, PrismaClient } from '@prisma/client';
import { foldVi } from '../src/lib/text';
import rawData from './seed-data/catalog.json';

/**
 * Seed catalog idempotent (BR-CAT-05): một giao dịch, upsert theo slug / sku / category.
 * Không ghi đè inventory_qty và status của bản ghi đã có; không xoá bản ghi vắng trong JSON.
 */

export interface SeedVariant {
  sku: string;
  size: string;
  colorName: string;
  colorHex: string;
  inventoryQty: number;
  sortOrder: number;
}
export interface SeedProduct {
  slug: string;
  name: string;
  typeLabel: string;
  category: string;
  moments: ('work' | 'dinner' | 'event' | 'weekend')[];
  genders: ('nam' | 'nu')[];
  price: number;
  compareAtPrice: number | null;
  badge: string | null;
  coverMediaId: string;
  galleryMediaIds: string[];
  colorMedia: Record<string, string>;
  description: string;
  material: string;
  care: string[];
  fitSummary: string;
  fitModel: string;
  looks: unknown[];
  createdAt: string;
  salesRank: number;
  displayOrder: number;
  variants: SeedVariant[];
}
export interface CatalogSeedData {
  categories: { slug: string; name: string; sortOrder: number }[];
  products: SeedProduct[];
  sizeCharts: { category: string; data: unknown }[];
}

export const catalogSeedData = rawData as unknown as CatalogSeedData;

const MEDIA_RE = /^[a-z0-9-]+$/;

function validate(data: CatalogSeedData): void {
  for (const p of data.products) {
    if (!Number.isInteger(p.price)) throw new Error(`Giá không phải số nguyên: ${p.slug}`);
    if (p.compareAtPrice !== null && p.compareAtPrice <= p.price) throw new Error(`compareAtPrice <= price: ${p.slug}`);
    for (const m of [p.coverMediaId, ...p.galleryMediaIds]) {
      if (!MEDIA_RE.test(m)) throw new Error(`mediaId không hợp lệ: ${p.slug}`);
    }
    if (p.variants.length < 1) throw new Error(`Sản phẩm không có biến thể: ${p.slug}`);
  }
}

export async function seedCatalog(
  prisma: PrismaClient,
  data: CatalogSeedData = catalogSeedData,
): Promise<{ products: number; variants: number; sizeCharts: number; extraProducts: number }> {
  if (process.env.NODE_ENV === 'production' && process.env.CATALOG_SEED_ALLOW_PRODUCTION !== '1') {
    throw new Error('Từ chối seed catalog ở production: đặt CATALOG_SEED_ALLOW_PRODUCTION=1 nếu chủ ý.');
  }
  validate(data);

  return prisma.$transaction(
    async (tx) => {
      const categoryIds = new Map<string, string>();
      for (const c of data.categories) {
        const row = await tx.category.upsert({
          where: { slug: c.slug },
          create: { slug: c.slug, name: c.name, sortOrder: c.sortOrder },
          update: { name: c.name, sortOrder: c.sortOrder },
        });
        categoryIds.set(c.slug, row.category_id);
      }

      let variantCount = 0;
      for (const p of data.products) {
        const categoryId = categoryIds.get(p.category);
        if (!categoryId) throw new Error(`Không có danh mục ${p.category} cho ${p.slug}`);
        const content = {
          categoryId,
          name: p.name,
          typeLabel: p.typeLabel,
          price: new Prisma.Decimal(p.price),
          compareAtPrice: p.compareAtPrice === null ? null : new Prisma.Decimal(p.compareAtPrice),
          badge: p.badge,
          description: p.description,
          material: p.material,
          care: p.care,
          fitSummary: p.fitSummary,
          fitModel: p.fitModel,
          looks: p.looks as Prisma.InputJsonValue,
          coverMediaId: p.coverMediaId,
          galleryMediaIds: p.galleryMediaIds,
          colorMedia: p.colorMedia as Prisma.InputJsonValue,
          moments: p.moments,
          genders: p.genders,
          salesRank: p.salesRank,
          displayOrder: p.displayOrder,
          searchText: foldVi(`${p.name} ${p.typeLabel}`),
          createdAt: new Date(`${p.createdAt}T00:00:00.000Z`),
        };
        const product = await tx.product.upsert({
          where: { slug: p.slug },
          create: { slug: p.slug, status: 'ACTIVE', ...content },
          update: content, // không đụng status
        });
        for (const v of p.variants) {
          const vc = { size: v.size, colorName: v.colorName, colorHex: v.colorHex, sortOrder: v.sortOrder };
          await tx.productVariant.upsert({
            where: { sku: v.sku },
            create: { sku: v.sku, productId: product.product_id, inventoryQty: v.inventoryQty, ...vc },
            update: vc, // không đặt lại tồn kho
          });
          variantCount++;
        }
      }

      for (const s of data.sizeCharts) {
        const categoryId = categoryIds.get(s.category);
        if (!categoryId) throw new Error(`Không có danh mục ${s.category} cho bảng size`);
        await tx.sizeChart.upsert({
          where: { categoryId },
          create: { categoryId, data: s.data as Prisma.InputJsonValue },
          update: { data: s.data as Prisma.InputJsonValue },
        });
      }

      const extraProducts = await tx.product.count({ where: { slug: { notIn: data.products.map((p) => p.slug) } } });
      return { products: data.products.length, variants: variantCount, sizeCharts: data.sizeCharts.length, extraProducts };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}

if (require.main === module) {
  dotenv.config();
  const prisma = new PrismaClient();
  seedCatalog(prisma)
    .then((r) => {
      console.log(
        `Seed catalog xong: ${r.products} sản phẩm, ${r.variants} biến thể, ${r.sizeCharts} bảng size` +
          (r.extraProducts ? ` (${r.extraProducts} sản phẩm ngoài JSON được giữ nguyên)` : '') +
          '.',
      );
    })
    .catch((e: unknown) => {
      console.error('Seed catalog lỗi:', e instanceof Error ? e.message : 'unknown');
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
