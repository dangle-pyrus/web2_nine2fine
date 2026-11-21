import dotenv from 'dotenv';
import { Prisma, PrismaClient } from '@prisma/client';
import { CATALOG_ASSUMPTIONS } from '../src/config/assumptions';
import { MEDIA_ID_RE } from '../src/lib/storage/types';
import { foldVi } from '../src/lib/text';
import sizeChartsJson from './seed-data/size-charts.json';
import rawData from './seed-data/zara-products.json';

/**
 * Nhập dữ liệu sản phẩm thật (file Excel Zara, ảnh đã nằm trên Cloudinary) từ `seed-data/zara-products.json`
 * (sinh bởi `scripts/zara-xlsx-to-json.py`). Idempotent: upsert ảnh theo id, sản phẩm theo slug, biến thể theo sku.
 * Chạy lại: nội dung (tên, giá, ảnh, mô tả) lấy lại theo file, tức ghi đè chỉnh sửa ở admin; KHÔNG đụng `status`,
 * `inventory_qty`, và giá của sản phẩm thiếu giá (giá admin đã điền được giữ). Không xoá sản phẩm / biến thể nào.
 * Sản phẩm thiếu giá trong file đã được điền giá (`priceFilled`, xem scripts/zara-xlsx-to-json.py) và mở bán; `needsPrice`
 * (cũ) vẫn được hiểu: tạo ở Nháp. Biến thể có trong DB mà không còn trong file (đổi màu / size) bị xoá trước khi upsert;
 * biến thể đã có đơn hàng thì dừng và báo (gỡ dữ liệu demo trước: `npm run seed:demo:remove`).
 */

interface ZaraMedia { id: string; url: string; width: number; height: number; bytes: number; contentType: string }
interface ZaraVariant { sku: string; size: string; colorName: string; colorHex: string; sortOrder: number }
interface ZaraProduct {
  slug: string; name: string; typeLabel: string; category: string;
  moments: ('work' | 'dinner' | 'event' | 'weekend')[]; genders: ('nam' | 'nu')[];
  price: number; compareAtPrice: number | null; description: string; material: string; care: string[];
  fitSummary: string; fitModel: string; coverMediaId: string; galleryMediaIds: string[];
  colorMedia: Record<string, string>; imageMeta: Record<string, { alt: string; color: string }>;
  displayOrder: number; needsPrice?: boolean; priceFilled?: boolean; variants: ZaraVariant[];
}
interface ZaraData { source: string; media: ZaraMedia[]; products: ZaraProduct[] }

export const zaraData = rawData as unknown as ZaraData;
/** 8 danh mục web theo dữ liệu thật (2026-11-21); upsert tên + thứ tự. Khớp `CATEGORIES` ở FE (features/catalog/models/product.ts). */
export const ZARA_CATEGORIES = [
  { slug: 'shirts', name: 'Áo sơ mi', sortOrder: 1 },
  { slug: 'tshirts', name: 'Áo thun', sortOrder: 2 },
  { slug: 'knitwear', name: 'Áo len', sortOrder: 3 },
  { slug: 'blazers', name: 'Áo blazer', sortOrder: 4 },
  { slug: 'outerwear', name: 'Áo khoác', sortOrder: 5 },
  { slug: 'dresses', name: 'Đầm', sortOrder: 6 },
  { slug: 'trousers', name: 'Quần', sortOrder: 7 },
  { slug: 'skirts', name: 'Chân váy', sortOrder: 8 },
];
/** Bảng size mẫu (seed-data/size-charts.json) cho danh mục mới chưa có bảng: chỉ tạo, không ghi đè bảng admin đã sửa. */
const CHART_FROM: Record<string, string> = {
  shirts: 'tops', tshirts: 'tops', knitwear: 'tops', blazers: 'tops', outerwear: 'outerwear', dresses: 'dresses', trousers: 'bottoms', skirts: 'bottoms',
};
/** Tồn kho ban đầu mỗi biến thể (file không có cột tồn kho). Chỉ đặt khi tạo mới. */
export const ZARA_INITIAL_QTY = 20;

function validate(data: ZaraData): void {
  const media = new Set(data.media.map((m) => m.id));
  const sizes = new Set(CATALOG_ASSUMPTIONS.variant.sizes);
  for (const m of data.media) {
    if (!MEDIA_ID_RE.test(m.id)) throw new Error(`id ảnh không hợp lệ: ${m.id}`);
    if (!m.url.startsWith('https://res.cloudinary.com/')) throw new Error(`link ảnh không phải Cloudinary: ${m.id}`);
  }
  for (const p of data.products) {
    if (!Number.isInteger(p.price)) throw new Error(`Giá không phải số nguyên: ${p.slug}`);
    for (const id of [p.coverMediaId, ...p.galleryMediaIds]) if (!media.has(id)) throw new Error(`Thiếu ảnh ${id}: ${p.slug}`);
    if (p.galleryMediaIds.length > CATALOG_ASSUMPTIONS.image.maxPerProduct) throw new Error(`Quá nhiều ảnh: ${p.slug}`);
    if (p.variants.length < 1 || p.variants.length > CATALOG_ASSUMPTIONS.variant.maxVariants) throw new Error(`Số biến thể sai: ${p.slug}`);
    for (const v of p.variants) if (!sizes.has(v.size)) throw new Error(`Size ${v.size} không hợp lệ: ${p.slug}`);
  }
}

export async function seedZara(prisma: PrismaClient, data: ZaraData = zaraData) {
  validate(data);
  return prisma.$transaction(
    async (tx) => {
      for (const m of data.media) {
        const row = { storage: 'cloudinary', sourceUrl: m.url, contentType: m.contentType, byteSize: m.bytes, width: m.width, height: m.height };
        await tx.mediaAsset.upsert({ where: { mediaId: m.id }, create: { mediaId: m.id, ...row }, update: row });
      }
      const categoryIds = new Map<string, string>();
      for (const c of ZARA_CATEGORIES) {
        const row = await tx.category.upsert({ where: { slug: c.slug }, create: c, update: { name: c.name, sortOrder: c.sortOrder } });
        categoryIds.set(c.slug, row.category_id);
      }
      const charts = new Map((sizeChartsJson as { category: string; data: unknown }[]).map((c) => [c.category, c.data]));
      for (const [slug, categoryId] of categoryIds) {
        const data = charts.get(CHART_FROM[slug]);
        if (data) await tx.sizeChart.upsert({ where: { categoryId }, create: { categoryId, data: data as Prisma.InputJsonValue }, update: {} });
      }
      const existingRank = await tx.product.aggregate({ _max: { salesRank: true } });
      let created = 0;
      let variants = 0;
      const drafts: string[] = [];
      let removed = 0;
      for (const [i, p] of data.products.entries()) {
        const categoryId = categoryIds.get(p.category);
        if (!categoryId) throw new Error(`Không có danh mục ${p.category}`);
        const content = {
          categoryId,
          name: p.name,
          typeLabel: p.typeLabel,
          price: new Prisma.Decimal(p.price),
          compareAtPrice: p.compareAtPrice === null ? null : new Prisma.Decimal(p.compareAtPrice),
          description: p.description,
          material: p.material,
          care: p.care,
          fitSummary: p.fitSummary,
          fitModel: p.fitModel,
          coverMediaId: p.coverMediaId,
          galleryMediaIds: p.galleryMediaIds,
          colorMedia: p.colorMedia as Prisma.InputJsonValue,
          imageMeta: p.imageMeta as Prisma.InputJsonValue,
          moments: p.moments,
          genders: p.genders,
          displayOrder: p.displayOrder,
          searchText: foldVi(`${p.name} ${p.typeLabel}`),
        };
        const before = await tx.product.findUnique({ where: { slug: p.slug }, select: { product_id: true } });
        const status = p.needsPrice ? 'DRAFT' : 'ACTIVE';
        const product = await tx.product.upsert({
          where: { slug: p.slug },
          create: {
            slug: p.slug, status, publishedAt: status === 'ACTIVE' ? new Date() : null,
            salesRank: (existingRank._max.salesRank ?? 0) + i + 1, ...content,
          },
          // không đụng status / salesRank; sản phẩm thiếu giá: giữ giá admin đã điền.
          // Sản phẩm được điền giá (`priceFilled`, trước là Nháp vì thiếu giá) -> mở bán.
          update: p.needsPrice
            ? { ...content, price: undefined, compareAtPrice: undefined }
            : p.priceFilled
              ? { ...content, status: 'ACTIVE', publishedAt: new Date() }
              : content,
        });
        const skus = p.variants.map((v) => v.sku);
        const stale = await tx.productVariant.findMany({ where: { productId: product.product_id, sku: { notIn: skus } }, select: { variant_id: true, sku: true, _count: { select: { orderItems: true } } } });
        const ordered = stale.filter((v) => v._count.orderItems > 0);
        if (ordered.length) throw new Error(`Biến thể cũ đã có đơn, không xoá được (${ordered.map((v) => v.sku).join(', ')}): gỡ dữ liệu demo trước.`);
        if (stale.length) {
          const ids = stale.map((v) => v.variant_id);
          await tx.cartLine.deleteMany({ where: { variantId: { in: ids } } });
          await tx.inventoryAdjustment.deleteMany({ where: { variantId: { in: ids } } });
          await tx.productVariant.deleteMany({ where: { variant_id: { in: ids } } });
          removed += stale.length;
        }
        // Đổi màu giữa các biến thể còn giữ (vd. A->B, B->C) đụng UNIQUE (sản phẩm, màu, size) giữa chừng: đặt tên tạm trước.
        await tx.$executeRaw`UPDATE product_variants SET color_name = '~' || left(variant_id::text, 30) WHERE product_id = ${product.product_id}::uuid AND sku = ANY(${skus})`;
        if (!before) created++;
        if (p.needsPrice) drafts.push(p.name);
        for (const v of p.variants) {
          const vc = { size: v.size, colorName: v.colorName, colorHex: v.colorHex, sortOrder: v.sortOrder };
          await tx.productVariant.upsert({
            where: { sku: v.sku },
            create: { sku: v.sku, productId: product.product_id, inventoryQty: ZARA_INITIAL_QTY, ...vc },
            update: vc, // không đặt lại tồn kho
          });
          variants++;
        }
      }
      return { media: data.media.length, products: data.products.length, created, variants, removed, drafts };
    },
    { timeout: 180_000, maxWait: 10_000 },
  );
}

if (require.main === module) {
  dotenv.config();
  if (process.env.NODE_ENV === 'production' && process.env.CATALOG_SEED_ALLOW_PRODUCTION !== '1') {
    console.error('Từ chối nhập ở production: đặt CATALOG_SEED_ALLOW_PRODUCTION=1 nếu chủ ý.');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  // `--if-empty` (Docker entrypoint): chỉ nhập khi DB chưa có sản phẩm, để khởi động lại không ghi đè chỉnh sửa ở admin.
  const ifEmpty = process.argv.includes('--if-empty');
  (ifEmpty ? prisma.product.count() : Promise.resolve(0))
    .then((n) => {
      if (n > 0) {
        console.log(`Bỏ qua nhập sản phẩm: DB đã có ${n} sản phẩm.`);
        return null;
      }
      return seedZara(prisma);
    })
    .then((r) => {
      if (!r) return;
      console.log(`Nhập xong ${zaraData.source}: ${r.products} sản phẩm (${r.created} mới), ${r.variants} biến thể (${r.removed} biến thể cũ đã xoá), ${r.media} ảnh Cloudinary.`);
      if (r.drafts.length) console.log(`${r.drafts.length} sản phẩm thiếu giá để ở Nháp (giá tạm, cần điền giá thật): ${r.drafts.join(', ')}`);
    })
    .catch((e: unknown) => {
      console.error('Nhập lỗi:', e instanceof Error ? e.message.trim().split(/\n/).slice(-3).join(' | ') : 'unknown');
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
