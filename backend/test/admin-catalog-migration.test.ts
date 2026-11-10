import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { CATALOG_PERMISSIONS } from '../src/config/assumptions';
import { loadConfig } from '../src/config/env';
import prisma from '../src/config/prisma';
import { aGet, loginAdmin, loginStaff, makeProduct, resetCheckout, resetState } from './helpers';
import { assertLocalTestDb, TEST_DB_URL } from './guard';

const MIGRATION = '20261110000100_admin_catalog_schema';

describe('T-INV-05 migration admin_catalog_schema (AC-INV-09)', () => {
  const sql = readFileSync(path.resolve(__dirname, `../prisma/migrations/${MIGRATION}/migration.sql`), 'utf8');

  it('không xoá bảng / cột / dữ liệu, không đổi tên, không đổi kiểu; chỉ nới đúng 3 CHECK của Slice 2', () => {
    const stripped = sql.replace(/ON DELETE (RESTRICT|CASCADE|SET NULL)/g, '').replace(/^--.*$/gm, '');
    expect(stripped).not.toMatch(/\b(TRUNCATE|RENAME|DELETE\s+FROM|DROP\s+(TABLE|COLUMN|INDEX|TYPE|SCHEMA))\b/i);
    expect(stripped).not.toMatch(/ALTER\s+COLUMN[^;]*\bTYPE\b/i);
    const drops = [...stripped.matchAll(/DROP\s+CONSTRAINT\s+"([^"]+)"/gi)].map((m) => m[1]).sort();
    expect(drops).toEqual(['chk_products_cover_media', 'chk_products_gallery', 'chk_products_price']);
    expect(stripped.match(/\bUPDATE\s+"?\w+"?\s+SET\b/gi)).toHaveLength(1); // đúng một UPDATE (backfill published_at)
    for (const m of stripped.matchAll(/CREATE\s+(UNIQUE\s+)?INDEX\s+(?!IF NOT EXISTS)/gi)) expect.fail(`CREATE INDEX thiếu IF NOT EXISTS: ${m[0]}`);
  });

  it('migrate deploy lần 2 không có gì để áp; migrate diff với schema rỗng', () => {
    assertLocalTestDb();
    const env = { ...process.env, DATABASE_URL: TEST_DB_URL, DIRECT_URL: TEST_DB_URL };
    const out = execSync('npx prisma migrate deploy', { env, stdio: 'pipe', cwd: path.resolve(__dirname, '..') }).toString();
    expect(out).toMatch(/No pending migrations to apply/);
    const diff = execSync(
      `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url ${TEST_DB_URL.replace('n2f_test', 'n2f_shadow')}`,
      { env, stdio: 'pipe', cwd: path.resolve(__dirname, '..') },
    ).toString();
    expect(diff).toMatch(/No difference detected/);
  });

  it('mọi bảng public (trừ 5 bảng auth gốc từ baseline) bật RLS, gồm 2 bảng mới', async () => {
    const rows = await prisma.$queryRaw<Array<{ relname: string; relrowsecurity: boolean }>>`
      SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'`;
    expect(rows.map((r) => r.relname)).toEqual(expect.arrayContaining(['inventory_adjustments', 'media_assets']));
    const baseline = new Set(['users', 'sessions', 'auth_action_tokens', 'login_attempts', 'membership_tiers']); // không có RLS từ trước Slice 6
    expect(rows.filter((r) => !r.relrowsecurity && !baseline.has(r.relname)).map((r) => r.relname)).toEqual([]);
  });

  describe('dữ liệu và ràng buộc', () => {
    beforeAll(async () => {
      await resetState();
      await resetCheckout();
    });

    it('mọi sản phẩm ACTIVE có published_at; backfill chạy lại không đổi gì', async () => {
      expect(await prisma.product.count({ where: { status: 'ACTIVE', publishedAt: null } })).toBe(0);
      expect(await prisma.product.count({ where: { status: 'ACTIVE' } })).toBeGreaterThanOrEqual(8);
      const stmt = sql.split('\n').find((l) => l.startsWith('UPDATE "products" SET "published_at"'))!;
      expect(stmt).toBeTruthy();
      expect(await prisma.$executeRawUnsafe(stmt.replace(/;$/, ''))).toBe(0);
    });

    it('CHECK NOT VALID có chủ đích; CHECK mới chặn ghi sai', async () => {
      const cons = await prisma.$queryRaw<Array<{ conname: string; convalidated: boolean }>>`
        SELECT conname, convalidated FROM pg_constraint WHERE conname = ANY(${[
          'chk_products_compare_price', 'chk_products_gallery_max', 'chk_products_active_has_images', 'chk_variants_inventory_max',
          'chk_products_price', 'chk_products_cover_media', 'chk_inv_adj_sign', 'chk_media_content_type',
        ]})`;
      const by = Object.fromEntries(cons.map((c) => [c.conname, c.convalidated]));
      expect(by).toEqual({
        chk_products_compare_price: false, chk_products_gallery_max: false, chk_products_active_has_images: false, chk_variants_inventory_max: false,
        chk_products_price: true, chk_products_cover_media: true, chk_inv_adj_sign: true, chk_media_content_type: true,
      });
      const p = await makeProduct({ name: 'Ràng buộc', variants: [{ sku: 'MIG6-1', qty: 1 }] });
      const rejects = (q: string) => expect(prisma.$executeRawUnsafe(q)).rejects.toThrow();
      const upd = (set: string) => `UPDATE products SET ${set} WHERE product_id = '${p.id}'`;
      await rejects(upd('price = 999'));
      await rejects(upd('price = 100000001'));
      await expect(prisma.$executeRawUnsafe(upd('price = 1000'))).resolves.toBe(1);
      await expect(prisma.$executeRawUnsafe(upd('price = 100000000'))).resolves.toBe(1);
      await rejects(upd('compare_at_price = 100000000')); // = price
      await rejects(upd(`gallery_media_ids = ARRAY[${Array.from({ length: 13 }, (_, i) => `'a${i}'`).join(',')}]`));
      await expect(prisma.$executeRawUnsafe(upd(`cover_media_id = 'up-${'a'.repeat(32)}.png'`))).resolves.toBe(1);
      await rejects(upd(`cover_media_id = 'up-xyz.png'`));
      await expect(prisma.$executeRawUnsafe(upd(`cover_media_id = '', gallery_media_ids = '{}'`))).resolves.toBe(1); // nháp 0 ảnh
      await rejects(upd(`status = 'ACTIVE'`)); // ACTIVE cần ảnh (ghi mới)
      await rejects(`UPDATE product_variants SET inventory_qty = 1000001 WHERE product_id = '${p.id}'`);
      await rejects(`UPDATE product_variants SET low_stock_threshold = 1001 WHERE product_id = '${p.id}'`);
      await rejects(`UPDATE store_settings SET low_stock_default = -1`);
      expect((await prisma.storeSetting.findUniqueOrThrow({ where: { id: 1 } })).lowStockDefault).toBe(5);
    });

    it('inventory_adjustments: dấu delta khớp lý do; media_assets: loại, cỡ', async () => {
      const p = await makeProduct({ name: 'Nhật ký', variants: [{ sku: 'MIG6-2', qty: 1 }] });
      const v = p.variants[0].id;
      const adj = (reason: string, delta: number, after = 5) =>
        `INSERT INTO inventory_adjustments (variant_id, delta, available_after, reason, actor_name, actor_role) VALUES ('${v}', ${delta}, ${after}, '${reason}', 'x', 'staff')`;
      const rejects = (q: string) => expect(prisma.$executeRawUnsafe(q)).rejects.toThrow();
      await expect(prisma.$executeRawUnsafe(adj('received', 2))).resolves.toBe(1);
      await expect(prisma.$executeRawUnsafe(adj('return', 1))).resolves.toBe(1);
      await expect(prisma.$executeRawUnsafe(adj('damaged', -1))).resolves.toBe(1);
      await expect(prisma.$executeRawUnsafe(adj('count', -3))).resolves.toBe(1);
      await expect(prisma.$executeRawUnsafe(adj('correction', 3))).resolves.toBe(1);
      await rejects(adj('received', -2));
      await rejects(adj('return', -2));
      await rejects(adj('damaged', 2));
      await rejects(adj('count', 0));
      await rejects(adj('bogus', 1));
      await rejects(adj('received', 1, -1));
      const media = (type: string, size: number) =>
        `INSERT INTO media_assets (media_id, storage, content_type, byte_size, width, height) VALUES ('up-${'c'.repeat(32)}.png', 'local', '${type}', ${size}, 600, 800)`;
      await rejects(media('image/gif', 10));
      await rejects(media('image/png', 0));
      await rejects(media('image/png', 5242881));
      await expect(prisma.$executeRawUnsafe(media('image/png', 5242880))).resolves.toBe(1);
      // xoá biến thể -> nhật ký đi theo (CASCADE)
      await prisma.productVariant.delete({ where: { variant_id: v } });
      expect(await prisma.inventoryAdjustment.count({ where: { variantId: v } })).toBe(0);
    });
  });
});

describe('nền Slice 6: danh mục, ma trận quyền, cấu hình lưu trữ', () => {
  it('GET /admin/categories: 4 danh mục theo sort_order, staff + admin đọc được', async () => {
    await resetState();
    await resetCheckout();
    const admin = await loginAdmin('cat-admin@nine2fine.test');
    const staff = await loginStaff('cat-staff@nine2fine.test');
    for (const c of [admin.cookie, staff.cookie]) {
      const r = await aGet('/categories', c);
      expect(r.status).toBe(200);
      expect(r.headers['cache-control']).toBe('no-store');
      expect(r.body.map((x: { slug: string }) => x.slug)).toEqual(['tops', 'bottoms', 'dresses', 'outerwear']);
      expect(Object.keys(r.body[0]).sort()).toEqual(['id', 'name', 'slug']);
    }
  });

  it('CATALOG_PERMISSIONS: staff đọc + điều chỉnh tồn; admin đủ (BR-INV-02)', () => {
    expect([...CATALOG_PERMISSIONS.staff].sort()).toEqual(['catalog.read', 'stock.adjust']);
    expect([...CATALOG_PERMISSIONS.admin].sort()).toEqual(['catalog.read', 'media.upload', 'products.write', 'promotions.write', 'stock.adjust', 'stock.thresholds']);
  });

  it('cấu hình lưu trữ ảnh: mặc định local; supabase chỉ hợp lệ khi đủ biến', () => {
    const base = { DATABASE_URL: 'postgresql://x@127.0.0.1/db', OTP_HMAC_SECRET: 'x'.repeat(32) } as NodeJS.ProcessEnv;
    expect(loadConfig(base).media).toEqual({ storage: 'local', localDir: undefined, supabase: null });
    const partial = loadConfig({ ...base, MEDIA_STORAGE: 'supabase', SUPABASE_URL: 'https://a.supabase.co/' });
    expect(partial.media.supabase).toBeNull();
    const full = loadConfig({ ...base, MEDIA_STORAGE: 'supabase', SUPABASE_URL: 'https://a.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: 'k' });
    expect(full.media.supabase).toEqual({ url: 'https://a.supabase.co', serviceRoleKey: 'k', bucket: 'product-images' });
    expect(() => loadConfig({ ...base, MEDIA_STORAGE: 'ftp' })).toThrow();
  });
});
