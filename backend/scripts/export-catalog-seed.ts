/**
 * Xuất dữ liệu mock catalog của FE thành backend/prisma/seed-data/catalog.json.
 * Chạy: npx tsx scripts/export-catalog-seed.ts (chỉ import kiểu + dữ liệu thuần, không kéo Angular).
 * Chạy lại khi mock đổi; review bằng diff JSON.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PRODUCTS } from '../../frontend/src/mocks/products';
import { SIZE_CHARTS } from '../../frontend/src/mocks/reviews';
import { CATEGORIES } from '../../frontend/src/app/features/catalog/models/product';

const data = {
  categories: CATEGORIES.map((c, i) => ({ slug: c.value, name: c.label, sortOrder: i + 1 })),
  products: PRODUCTS.map((p, i) => ({
    slug: p.slug,
    name: p.name,
    typeLabel: p.type,
    category: p.category,
    moments: p.moments,
    genders: p.genders,
    price: p.price,
    compareAtPrice: p.compareAtPrice ?? null,
    badge: p.badge ?? null,
    coverMediaId: p.mediaId,
    galleryMediaIds: p.gallery,
    colorMedia: {},
    description: p.description,
    material: p.material,
    care: p.care,
    fitSummary: p.fit.summary,
    fitModel: p.fit.model,
    looks: p.looks,
    createdAt: p.createdAt,
    salesRank: p.salesRank,
    displayOrder: i + 1,
    variants: (() => {
      const colors: string[] = [];
      return p.variants.map((v) => {
        if (!colors.includes(v.color.name)) colors.push(v.color.name);
        const sizeIndex = ['S', 'M', 'L', 'XL'].indexOf(v.size);
        return {
          sku: v.sku,
          size: v.size,
          colorName: v.color.name,
          colorHex: v.color.hex,
          inventoryQty: v.inventory,
          sortOrder: colors.indexOf(v.color.name) * 10 + sizeIndex,
        };
      });
    })(),
  })),
  sizeCharts: Object.entries(SIZE_CHARTS).map(([category, data]) => ({ category, data })),
};

const out = resolve(__dirname, '../prisma/seed-data/catalog.json');
writeFileSync(out, JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log(`Đã ghi ${data.products.length} sản phẩm, ${data.sizeCharts.length} bảng size.`);
