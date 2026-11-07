import { execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { catalogSeedData, seedCatalog, type CatalogSeedData } from '../prisma/seed-catalog';
import { foldVi } from '../src/lib/text';
import { prisma, resetCatalog, resetState } from './helpers';
import { TEST_DB_URL } from './guard';

const clone = (): CatalogSeedData => JSON.parse(JSON.stringify(catalogSeedData));
const counts = async () => ({
  categories: await prisma.category.count(),
  products: await prisma.product.count(),
  variants: await prisma.productVariant.count(),
  charts: await prisma.sizeChart.count(),
});

async function resetEmpty() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "product_variants", "products", "size_charts", "categories" RESTART IDENTITY CASCADE',
  );
}

describe('seed catalog', () => {
  beforeEach(resetCatalog);

  it('T-CAT-08 seed vào DB trống: 8 sản phẩm, 64 biến thể, 4 bảng size, nội dung bằng JSON nguồn', async () => {
    expect(await counts()).toEqual({ categories: 4, products: 8, variants: 64, charts: 4 });
    const rows = await prisma.product.findMany({ include: { variants: true, category: true } });
    for (const src of catalogSeedData.products) {
      const row = rows.find((r) => r.slug === src.slug)!;
      expect(row.name).toBe(src.name);
      expect(Number(row.price)).toBe(src.price);
      expect(row.category.slug).toBe(src.category);
      expect(row.status).toBe('ACTIVE');
      expect(row.createdAt.toISOString().slice(0, 10)).toBe(src.createdAt);
      expect(row.searchText).toBe(foldVi(`${src.name} ${src.typeLabel}`)); // T-CAT-60
      expect(row.variants).toHaveLength(src.variants.length);
    }
    const charts = await prisma.sizeChart.findMany({ include: { category: true } });
    for (const s of catalogSeedData.sizeCharts) {
      expect(charts.find((c) => c.category.slug === s.category)!.data).toEqual(s.data);
    }
  });

  it('T-CAT-04 8 biến thể mỗi sản phẩm, sku duy nhất, size và hex hợp lệ', async () => {
    const products = await prisma.product.findMany({ include: { variants: true } });
    for (const p of products) expect(p.variants).toHaveLength(8);
    const all = products.flatMap((p) => p.variants);
    expect(new Set(all.map((v) => v.sku)).size).toBe(64);
    for (const v of all) {
      expect(['S', 'M', 'L', 'XL']).toContain(v.size);
      expect(v.colorHex).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('T-CAT-09 chạy lại giữ tồn kho, status, id', async () => {
    const before = await prisma.product.findMany({ include: { variants: true }, orderBy: { slug: 'asc' } });
    const v = before[0].variants[0];
    await prisma.productVariant.update({ where: { variant_id: v.variant_id }, data: { inventoryQty: 2 } });
    await prisma.product.update({ where: { slug: before[1].slug }, data: { status: 'DRAFT' } });
    await seedCatalog(prisma);
    expect(await counts()).toEqual({ categories: 4, products: 8, variants: 64, charts: 4 });
    expect((await prisma.productVariant.findUnique({ where: { variant_id: v.variant_id } }))!.inventoryQty).toBe(2);
    expect((await prisma.product.findUnique({ where: { slug: before[1].slug } }))!.status).toBe('DRAFT');
    const after = await prisma.product.findMany({ include: { variants: true }, orderBy: { slug: 'asc' } });
    expect(after.map((p) => p.product_id)).toEqual(before.map((p) => p.product_id));
    expect(after.flatMap((p) => p.variants.map((x) => x.variant_id)).sort()).toEqual(
      before.flatMap((p) => p.variants.map((x) => x.variant_id)).sort(),
    );
  });

  it('T-CAT-10 lỗi giữa chừng: rollback toàn bộ; chạy lại đủ 8', async () => {
    await resetEmpty();
    const bad = clone();
    bad.products[4].slug = 'Bad_Slug'; // vi phạm CHECK
    await expect(seedCatalog(prisma, bad)).rejects.toThrow();
    expect(await counts()).toEqual({ categories: 0, products: 0, variants: 0, charts: 0 });
    await seedCatalog(prisma);
    expect((await counts()).products).toBe(8);
  });

  it('T-CAT-02 ràng buộc sản phẩm bị DB từ chối', async () => {
    const base = (await prisma.product.findFirst())!;
    const { product_id: _id, ...rest } = base;
    void _id;
    const mk = (over: Record<string, unknown>) =>
      prisma.product.create({ data: { ...rest, slug: 'sp-moi', ...over } as never });
    await expect(mk({ slug: base.slug })).rejects.toThrow();
    await expect(mk({ slug: 'Chu-Hoa' })).rejects.toThrow();
    await expect(mk({ price: 0 })).rejects.toThrow();
    await expect(mk({ compareAtPrice: base.price })).rejects.toThrow();
    await expect(mk({ moments: [] })).rejects.toThrow();
    expect(await prisma.product.count()).toBe(8);
  });

  it('T-CAT-05 ràng buộc biến thể bị DB từ chối', async () => {
    const v = (await prisma.productVariant.findFirst())!;
    const { variant_id: _id, ...rest } = v;
    void _id;
    const mk = (over: Record<string, unknown>) => prisma.productVariant.create({ data: { ...rest, ...over } });
    await expect(mk({ sku: 'SKU-MOI' })).rejects.toThrow(); // trùng (sản phẩm, màu, size)
    await expect(mk({ size: 'XS', sku: 'SKU-MOI-2' })).rejects.toThrow();
    await expect(mk({ colorName: 'Tím' })).rejects.toThrow(); // sku trùng
    await expect(mk({ colorName: 'Tím', sku: 'SKU-MOI-3', inventoryQty: -1 })).rejects.toThrow();
    expect(await prisma.productVariant.count()).toBe(64);
  });
});

describe('T-CAT-53 migration chỉ cộng thêm', () => {
  it('không đổi dữ liệu cũ, migrate deploy lặp lại ổn, không lệnh phá huỷ, RLS bật', async () => {
    await resetState();
    await prisma.user.create({
      data: { email: 'mig@example.com', firstName: 'A', lastName: 'B', terms_accepted_at: new Date() },
    });
    const before = await prisma.user.count();
    const env = { ...process.env, DATABASE_URL: TEST_DB_URL, DIRECT_URL: TEST_DB_URL };
    execSync('npx prisma migrate deploy', { stdio: 'pipe', env });
    execSync('npx prisma migrate deploy', { stdio: 'pipe', env });
    expect(await prisma.user.count()).toBe(before);

    const dir = join(__dirname, '../prisma/migrations');
    const name = readdirSync(dir).find((d) => d.startsWith('20261107000400_'))!;
    const sql = readFileSync(join(dir, name, 'migration.sql'), 'utf8');
    expect(sql).not.toMatch(/\b(DROP|TRUNCATE|RENAME)\b|(?<!ON )\bDELETE\b|ALTER\s+COLUMN[^;]*TYPE/i);

    const rls = await prisma.$queryRawUnsafe<{ relname: string; relrowsecurity: boolean }[]>(
      `SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('categories','products','product_variants','size_charts')`,
    );
    expect(rls).toHaveLength(4);
    expect(rls.every((r) => r.relrowsecurity)).toBe(true);
    await resetState();
  });
});
