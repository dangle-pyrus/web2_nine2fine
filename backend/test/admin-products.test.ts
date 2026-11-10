import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { foldVi } from '../src/lib/text';
import { resetCheckoutRateLimits } from '../src/middleware/rate-limit';
import { writeHooks } from '../src/modules/catalog-admin/product.write';
import {
  aDel, aGet, aPost, aPut, createUser, freshIp, get, loginAdmin, loginMember, loginStaff, makeOrder, makeProduct, post, prisma, resetCheckout, resetState, vid,
} from './helpers';

const LIB = 'catalog-placeholder'; // id thư viện có sẵn trên sản phẩm seed
let admin: Awaited<ReturnType<typeof loginAdmin>>;
let staff: Awaited<ReturnType<typeof loginStaff>>;

beforeAll(async () => {
  await resetState();
  await resetCheckout();
  admin = await loginAdmin('admin-p@nine2fine.test', { firstName: 'Quản', lastName: 'Trị' });
  staff = await loginStaff('staff-p@nine2fine.test');
});
beforeEach(() => {
  vi.useRealTimers();
  resetCheckoutRateLimits();
});

const A = () => admin.cookie;
const variant = (sku: string, color = 'Đen', hex = '#000000', size = 'S', inventory = 0) => ({ sku, color: { name: color, hex }, size, inventory });
let skuSeq = 0;
const body = (over: Record<string, unknown> = {}) => ({
  name: 'Áo Len Cổ Lọ',
  type: 'Áo len',
  category: 'tops',
  price: 450000,
  images: [{ id: LIB }],
  variants: [variant(`ALCL-${++skuSeq}-S`, 'Đen', '#000000', 'S', 5)],
  ...over,
});
type Detail = Record<string, any>;
/** Body PUT từ chi tiết đọc được (như FE). */
const putBody = (d: Detail, over: Record<string, unknown> = {}) => ({
  slug: d.slug,
  name: d.name,
  type: d.type,
  description: d.description,
  status: d.status,
  category: d.category,
  genders: d.genders,
  moments: d.moments,
  price: d.price,
  compareAtPrice: d.compareAtPrice,
  material: d.material,
  care: d.care,
  fitSummary: d.fitSummary,
  images: d.images.map((i: Detail) => ({ id: i.id, alt: i.alt, color: i.color })),
  variants: d.variants.map((v: Detail) => ({ id: v.id, sku: v.sku, color: v.color, size: v.size, inventory: v.inventory })),
  updatedAt: d.updatedAt,
  ...over,
});
const create = async (over: Record<string, unknown> = {}) => {
  const r = await aPost('/products', body(over), A());
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body as Detail;
};
const count = () => prisma.product.count();

describe('T-INV-01 / 02 / 03 phiên và phân quyền', () => {
  it('không cookie / chỉ n2f_sid / tài khoản bị khoá -> 401 no-store', async () => {
    const member = await loginMember('mem-p@example.com');
    const dead = await loginStaff('dead-p@nine2fine.test');
    await prisma.user.update({ where: { user_id: dead.user.user_id }, data: { isActive: false } });
    for (const cookie of [undefined, member.cookie, dead.cookie]) {
      for (const r of [
        await aGet('/products', cookie),
        await aGet('/categories', cookie),
        await aPost('/inventory/00000000-0000-4000-8000-000000000000/adjustments', {}, cookie),
        await aPost('/promotions', {}, cookie),
        await aPost('/products', body(), cookie),
      ]) {
        expect(r.status).toBe(401);
        expect(r.headers['cache-control']).toBe('no-store');
        expect(r.body.error.code).toBe('unauthenticated');
      }
    }
  });

  it('staff: đọc được; mọi ghi sản phẩm / ảnh -> 403, DB không đổi', async () => {
    const p = await makeProduct({ name: 'Staff Test', status: 'DRAFT' });
    const before = await count();
    expect((await aGet('/products', staff.cookie)).status).toBe(200);
    expect((await aGet(`/products/${p.id}`, staff.cookie)).status).toBe(200);
    expect((await aGet('/categories', staff.cookie)).status).toBe(200);
    const S = staff.cookie;
    // body sai cũng nhận 403 (không rò thông tin)
    for (const r of [
      await aPost('/products', {}, S),
      await aPost('/products', body(), S),
      await aPut(`/products/${p.id}`, 'rác', S),
      await aDel(`/products/${p.id}`, S),
      await aPost('/products/bulk-status', { ids: [p.id], status: 'hidden' }, S),
    ]) {
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe('forbidden');
      expect(r.headers['cache-control']).toBe('no-store');
    }
    expect(await count()).toBe(before);
    expect(await prisma.product.findUniqueOrThrow({ where: { product_id: p.id } })).toMatchObject({ status: 'DRAFT', name: 'Staff Test' });
    expect(await prisma.inventoryAdjustment.count()).toBe(await prisma.inventoryAdjustment.count());
  });

  it('hạ admin xuống staff bằng SQL -> PUT kế tiếp 403 (vai trò đọc từ DB mỗi yêu cầu)', async () => {
    const tmp = await loginAdmin('tmp-admin@nine2fine.test');
    const p = await makeProduct({ name: 'Hạ quyền' });
    const d = (await aGet(`/products/${p.id}`, tmp.cookie)).body;
    expect((await aPut(`/products/${p.id}`, putBody(d, { description: 'x' }), tmp.cookie)).status).toBe(200);
    await prisma.user.update({ where: { user_id: tmp.user.user_id }, data: { role: 'staff' } });
    const r = await aPut(`/products/${p.id}`, putBody(d, { description: 'y' }), tmp.cookie);
    expect(r.status).toBe(403);
    expect((await aGet(`/products/${p.id}`, tmp.cookie)).status).toBe(200);
  });
});

describe('T-INV-04 giới hạn tần suất', () => {
  it('61 ghi / 60 giây -> 429 + retryAfterSeconds + Retry-After', async () => {
    const lim = await loginAdmin('lim-admin@nine2fine.test');
    resetCheckoutRateLimits();
    let last: any;
    for (let i = 0; i < 61; i++) last = await aPost('/products/bulk-status', { ids: [], status: 'active' }, lim.cookie);
    expect(last.status).toBe(429);
    expect(last.body.error.code).toBe('rate-limited');
    expect(last.body.error.retryAfterSeconds).toBeGreaterThan(0);
    expect(last.headers['retry-after']).toBeDefined();
  });
});

describe('T-INV-06 / AC-INV-47 hình dạng lỗi', () => {
  it('mọi lỗi chính: {error:{code,message}} đúng mã, không stack / SQL', async () => {
    const p = await makeProduct({ name: 'Shape', slug: 'shape-one' });
    const d = (await aGet(`/products/${p.id}`, A())).body;
    const cases: Array<[any, number, string]> = [
      [await aGet('/products/abc', A()), 404, 'not-found'],
      [await aGet('/products?limit=0', A()), 422, 'validation'],
      [await aPost('/products', body({ price: 1 }), A()), 422, 'validation'],
      [await aPost('/products', body({ slug: 'shape-one' }), A()), 409, 'duplicate'],
      [await aPut(`/products/${p.id}`, putBody(d, { updatedAt: '2020-01-01T00:00:00.000Z' }), A()), 409, 'version-conflict'],
      [await aPut(`/products/${p.id}`, putBody(d, { status: 'active', images: [] }), A()), 422, 'publish-incomplete'],
      [await aPost('/products/bulk-status', { ids: [], status: 'active' }, A()), 422, 'validation'],
    ];
    for (const [r, status, code] of cases) {
      expect(r.status).toBe(status);
      expect(r.body.error.code).toBe(code);
      expect(typeof r.body.error.message).toBe('string');
      const text = JSON.stringify(r.body);
      expect(text).not.toMatch(/\bat\s+\S+\s+\(|SELECT|prisma|node_modules/i);
    }
  });

  it('JSON hỏng hoặc quá 64 KB -> 422 validation', async () => {
    expect((await aPost('/products', '{"name":', A())).body.error.code).toBe('validation');
    const big = await aPost('/products', body({ description: 'a'.repeat(70_000) }), A());
    expect(big.status).toBe(422);
    expect(big.body.error.code).toBe('validation');
  });
});

describe('T-INV-10 / 11 / 12 danh sách và chi tiết', () => {
  it('tìm không dấu, tìm SKU, tab và counts khớp số dòng', async () => {
    const shirt = await makeProduct({ name: 'Áo Sơ Mi Lụa', type: 'Áo sơ mi', status: 'ACTIVE', variants: [{ sku: 'SML-ZZ-S', qty: 3 }] });
    const draft = await makeProduct({ name: 'Nháp Zebra', status: 'DRAFT', variants: [{ sku: 'ZEB-1', qty: 0 }] });
    await makeProduct({ name: 'Ẩn Zebra', status: 'ARCHIVED', variants: [{ sku: 'ZEB-2', qty: 4 }] });
    const q1 = (await aGet('/products?q=ao%20so%20mi%20lua', A())).body;
    expect(q1.items.map((i: Detail) => i.id)).toEqual([shirt.id]);
    expect(q1.items[0]).toMatchObject({ name: 'Áo Sơ Mi Lụa', status: 'active', category: 'tops', inventory: 3, variantCount: 1 });
    expect((await aGet('/products?q=sml-zz', A())).body.items[0].id).toBe(shirt.id); // theo SKU
    expect((await aGet('/products?q=%25', A())).body.items).toHaveLength(0); // ký tự LIKE bị thoát
    const z = (await aGet('/products?q=zebra', A())).body;
    expect(z.counts).toEqual({ all: 2, active: 0, draft: 1, hidden: 1, 'out-of-stock': 1 });
    for (const [view, key] of [['all', 'all'], ['draft', 'draft'], ['hidden', 'hidden'], ['out-of-stock', 'out-of-stock'], ['active', 'active']] as const) {
      const v = (await aGet(`/products?q=zebra&view=${view}`, A())).body;
      expect(v.items.length).toBe(z.counts[key]);
      expect(v.total).toBe(z.counts[key]);
    }
    expect((await aGet('/products?q=zebra&view=draft', A())).body.items[0].id).toBe(draft.id);
    expect((await aGet('/products?category=khong-co', A())).body.items).toHaveLength(0);
  });

  it('phân trang và sắp updatedAt giảm', async () => {
    const t0 = Date.now();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push((await makeProduct({ name: `Sort ${i}`, slug: `sort-${i}`, updatedAt: new Date(t0 + 60_000 * (i + 1)) })).id);
    const page = (await aGet('/products?limit=2&page=1', A())).body;
    expect(page.items.map((i: Detail) => i.id)).toEqual([ids[2], ids[1]]);
    expect(page.limit).toBe(2);
    expect(page.page).toBe(1);
    expect((await aGet('/products?limit=2&page=2', A())).body.items[0].id).toBe(ids[0]);
  });

  it('q 101 ký tự, limit 101 / 0, page 0 -> 422 đúng field', async () => {
    const r1 = await aGet(`/products?q=${'a'.repeat(101)}`, A());
    expect([r1.status, r1.body.error.field]).toEqual([422, 'q']);
    expect((await aGet(`/products?q=${'a'.repeat(100)}`, A())).status).toBe(200);
    for (const [qs, field] of [['limit=101', 'limit'], ['limit=0', 'limit'], ['page=0', 'page'], ['limit=abc', 'limit'], ['view=zzz', 'view']]) {
      const r = await aGet(`/products?${qs}`, A());
      expect([r.status, r.body.error.field]).toEqual([422, field]);
    }
  });

  it('chi tiết đủ trường, không có tags / cost / seo; 404 id lạ', async () => {
    const p = await makeProduct({ name: 'Chi Tiết', status: 'ACTIVE', variants: [{ sku: 'CT-1', qty: 7 }, { sku: 'CT-2', size: 'M', qty: 2 }] });
    await makeOrder({ items: [{ variantId: p.variants[0].id, quantity: 1 }] });
    const d = (await aGet(`/products/${p.id}`, staff.cookie)).body;
    expect(Object.keys(d).sort()).toEqual(
      ['category', 'care', 'colors', 'compareAtPrice', 'createdAt', 'description', 'fitSummary', 'genders', 'id', 'images', 'material', 'moments', 'name', 'price', 'published', 'publishedAt', 'sizes', 'slug', 'slugLocked', 'status', 'type', 'updatedAt', 'updatedBy', 'variants'].sort(),
    );
    expect(d).toMatchObject({ published: true, slugLocked: true, status: 'active', sizes: ['S', 'M'], colors: [{ name: 'Đen', hex: '#000000' }] });
    expect(d.variants.map((v: Detail) => [v.sku, v.inventory, v.hasOrders])).toEqual([['CT-1', 7, true], ['CT-2', 2, false]]);
    expect(d.images).toEqual([{ id: 'pexels-test-image', url: null, alt: '', color: '' }]);
    for (const id of ['00000000-0000-4000-8000-000000000000', 'abc', '../x']) {
      const r = await aGet(`/products/${id}`, A());
      expect([r.status, r.body.error.code]).toEqual([404, 'not-found']);
    }
  });
});

describe('T-INV-20 .. 24 tạo / sửa', () => {
  it('T-INV-20 dữ liệu sai -> 422 đúng field, không tạo gì', async () => {
    const n = await count();
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ price: 999 }, 'price'],
      [{ price: 100_000_001 }, 'price'],
      [{ price: 450000.5 }, 'price'],
      [{ compareAtPrice: 450000 }, 'compareAtPrice'],
      [{ name: 'a'.repeat(121) }, 'name'],
      [{ name: '   ' }, 'name'],
      [{ category: 'khong-co' }, 'category'],
      [{ genders: ['kid'] }, 'genders'],
      [{ moments: ['sleep'] }, 'moments'],
      [{ genders: [] }, 'genders'],
      [{ care: Array.from({ length: 11 }, (_, i) => `d${i}`) }, 'care'],
      [{ description: 'a'.repeat(5001) }, 'description'],
    ];
    for (const [over, field] of cases) {
      const r = await aPost('/products', body(over), A());
      expect([r.status, r.body.error.code, r.body.error.field], JSON.stringify(over)).toEqual([422, 'validation', field]);
    }
    expect(await count()).toBe(n);
  });

  it('chuẩn hoá chuỗi (NFC, gộp khoảng trắng) và tạo mặc định', async () => {
    const d = await create({ name: '  Áo   Len  Cổ  Lọ  ', care: ['  Giặt  tay ', '', 'Phơi   râm'], description: ' dòng 1 \n\n  dòng   2 ' });
    expect(d).toMatchObject({ name: 'Áo Len Cổ Lọ', status: 'draft', care: ['Giặt tay', 'Phơi râm'], description: 'dòng 1\n\ndòng 2', published: false, slugLocked: false, publishedAt: null });
    const row = await prisma.product.findUniqueOrThrow({ where: { product_id: d.id } });
    expect(row).toMatchObject({ badge: null, fitModel: '', looks: [], searchText: foldVi('Áo Len Cổ Lọ Áo len') });
    expect(d.updatedBy).toEqual({ name: 'Trị Quản' });
  });

  it('T-INV-21 sửa giữ badge / looks / fit_model / rank; sản phẩm mới đứng cuối', async () => {
    const p = await makeProduct({ name: 'Giữ nguyên', status: 'ACTIVE' });
    await prisma.product.update({ where: { product_id: p.id }, data: { badge: 'new', fitModel: 'Cao 175', looks: [{ a: 1 }], salesRank: 7, displayOrder: 9 } });
    const d = (await aGet(`/products/${p.id}`, A())).body;
    const r = await aPut(`/products/${p.id}`, putBody(d, { description: 'Mô tả mới' }), A());
    expect(r.status).toBe(200);
    expect(r.body.description).toBe('Mô tả mới');
    const row = await prisma.product.findUniqueOrThrow({ where: { product_id: p.id } });
    expect(row).toMatchObject({ badge: 'new', fitModel: 'Cao 175', looks: [{ a: 1 }], salesRank: 7, displayOrder: 9 });
    const created = await create({ name: 'Cuối hàng' });
    const maxOther = await prisma.product.aggregate({ where: { product_id: { not: created.id } }, _max: { salesRank: true, displayOrder: true } });
    const c = await prisma.product.findUniqueOrThrow({ where: { product_id: created.id } });
    expect(c.salesRank).toBe(maxOther._max.salesRank! + 1);
    expect(c.displayOrder).toBe(maxOther._max.displayOrder! + 1);
  });

  it('T-INV-22 slug: sinh từ tên, -2, trùng 409, sai dạng 422', async () => {
    const a = await create({ name: 'Áo Len Hai Màu', variants: [variant('SLUG-A-S')] });
    const b = await create({ name: 'Áo Len Hai Màu', variants: [variant('SLUG-B-S')] });
    expect([a.slug, b.slug]).toEqual(['ao-len-hai-mau', 'ao-len-hai-mau-2']);
    const dup = await aPost('/products', body({ slug: 'ao-len-hai-mau', variants: [variant('SLUG-C-S')] }), A());
    expect([dup.status, dup.body.error.code, dup.body.error.field]).toEqual([409, 'duplicate', 'slug']);
    const bad = await aPost('/products', body({ slug: 'Ao_Len', variants: [variant('SLUG-D-S')] }), A());
    expect([bad.status, bad.body.error.field]).toEqual([422, 'slug']);
    expect((await aPost('/products', body({ slug: '-ab-', variants: [variant('SLUG-E-S')] }), A())).body.error.field).toBe('slug');
  });

  it('T-INV-23 khoá slug sau công khai; nháp đổi được', async () => {
    const pub = await makeProduct({ name: 'Công khai', slug: 'cong-khai', status: 'ACTIVE' });
    const dr = await makeProduct({ name: 'Nháp', slug: 'nhap-slug', status: 'DRAFT' });
    const dp = (await aGet(`/products/${pub.id}`, A())).body;
    const r1 = await aPut(`/products/${pub.id}`, putBody(dp, { slug: 'doi-slug' }), A());
    expect([r1.status, r1.body.error.field]).toEqual([422, 'slug']);
    expect((await prisma.product.findUniqueOrThrow({ where: { product_id: pub.id } })).slug).toBe('cong-khai');
    expect((await aPut(`/products/${pub.id}`, putBody(dp, { slug: 'cong-khai' }), A())).status).toBe(200); // gửi lại slug cũ: ổn
    const dd = (await aGet(`/products/${dr.id}`, A())).body;
    const r2 = await aPut(`/products/${dr.id}`, putBody(dd, { slug: 'nhap-moi' }), A());
    expect([r2.status, r2.body.slug]).toEqual([200, 'nhap-moi']);
    const r3 = await aPut(`/products/${dr.id}`, putBody(r2.body, { slug: 'cong-khai' }), A());
    expect([r3.status, r3.body.error.code]).toEqual([409, 'duplicate']);
  });

  it('T-INV-24 vào active cần đủ điều kiện, ghi published_at, storefront thấy', async () => {
    const d0 = await makeProduct({ name: 'Chờ ảnh', slug: 'cho-anh', status: 'DRAFT', gallery: [], variants: [{ sku: 'CHO-1', qty: 0 }] });
    const d = (await aGet(`/products/${d0.id}`, A())).body;
    expect(d.images).toEqual([]);
    const r1 = await aPut(`/products/${d0.id}`, putBody(d, { status: 'active' }), A());
    expect([r1.status, r1.body.error.code, r1.body.error.missing]).toEqual([422, 'publish-incomplete', ['images']]);
    expect((await prisma.product.findUniqueOrThrow({ where: { product_id: d0.id } })).status).toBe('DRAFT');
    expect((await get('/api/products/cho-anh', { ip: freshIp() })).status).toBe(404);
    const r2 = await aPut(`/products/${d0.id}`, putBody(d, { status: 'active', images: [{ id: LIB }] }), A());
    expect(r2.status, JSON.stringify(r2.body)).toBe(200);
    expect(r2.body).toMatchObject({ status: 'active', published: true, slugLocked: true });
    expect(r2.body.publishedAt).not.toBeNull();
    const pdp = await get('/api/products/cho-anh', { ip: freshIp() });
    expect(pdp.status).toBe(200);
    expect(pdp.body.variants[0].stockStatus).toBe('OUT_OF_STOCK');
    // về nháp rồi lên lại: published_at giữ nguyên
    const back = await aPut(`/products/${d0.id}`, putBody(r2.body, { status: 'hidden' }), A());
    expect(back.body.publishedAt).toBe(r2.body.publishedAt);
    const none = await aPut(`/products/${d0.id}`, putBody(back.body, { status: 'active', variants: [] }), A());
    expect(none.body.error.missing).toEqual(['variants']);
  });

  it('T-INV-25 đổi trạng thái hàng loạt: tất cả hoặc không', async () => {
    const P = await makeProduct({ name: 'Bulk P', status: 'ACTIVE' });
    const D = await makeProduct({ name: 'Bulk D', status: 'DRAFT', gallery: [] });
    const E = await makeProduct({ name: 'Bulk E', status: 'DRAFT' });
    const statuses = async () => (await prisma.product.findMany({ where: { product_id: { in: [P.id, D.id, E.id] } }, orderBy: { name: 'asc' } })).map((p) => p.status);
    const r1 = await aPost('/products/bulk-status', { ids: [P.id, D.id, E.id], status: 'active' }, A());
    expect([r1.status, r1.body.error.code, r1.body.error.productId, r1.body.error.missing]).toEqual([422, 'publish-incomplete', D.id, ['images']]);
    expect(await statuses()).toEqual(['DRAFT', 'DRAFT', 'ACTIVE']); // theo tên: D, E, P
    expect((await aPost('/products/bulk-status', { ids: Array.from({ length: 51 }, () => crypto.randomUUID()), status: 'hidden' }, A())).body.error.field).toBe('ids');
    const r2 = await aPost('/products/bulk-status', { ids: [P.id, crypto.randomUUID()], status: 'hidden' }, A());
    expect([r2.status, r2.body.error.code]).toEqual([404, 'not-found']);
    expect(await statuses()).toEqual(['DRAFT', 'DRAFT', 'ACTIVE']); // theo tên: D, E, P
    const r3 = await aPost('/products/bulk-status', { ids: [P.id, E.id, E.id], status: 'active' }, A()); // trùng id được gộp; P đã active không tính
    expect([r3.status, r3.body]).toEqual([200, { updated: 1 }]);
    const e = await prisma.product.findUniqueOrThrow({ where: { product_id: E.id } });
    expect([e.status, e.publishedAt !== null]).toEqual(['ACTIVE', true]);
    expect((await aPost('/products/bulk-status', { ids: [P.id], status: 'hidden' }, A())).body).toEqual({ updated: 1 });
  });
});

describe('T-INV-26 / 27 hiệu lực với storefront', () => {
  it('T-INV-26 ẩn sản phẩm: catalog 404, giỏ discontinued, đơn cũ vẫn đọc được', async () => {
    const m = await loginMember('hide-p@example.com');
    const q = await makeProduct({ name: 'Áo Shop Ẩn', slug: 'ao-shop-an', status: 'ACTIVE', price: 300000, variants: [{ sku: 'SAN-1', qty: 9 }] });
    const order = await makeOrder({ items: [{ variantId: q.variants[0].id, quantity: 1 }] });
    expect((await post('/api/cart/lines', { variantId: q.variants[0].id, quantity: 1 }, { cookie: m.cookie })).status).toBe(200);
    expect((await get('/api/products/ao-shop-an', { ip: freshIp() })).status).toBe(200);
    const total0 = (await get('/api/products?limit=1', { ip: freshIp() })).body.total;

    expect((await aPost('/products/bulk-status', { ids: [q.id], status: 'hidden' }, A())).body).toEqual({ updated: 1 });
    expect((await get('/api/products/ao-shop-an', { ip: freshIp() })).status).toBe(404);
    const list = (await get('/api/products?limit=48', { ip: freshIp() })).body;
    expect(list.items.some((i: Detail) => i.slug === 'ao-shop-an')).toBe(false);
    expect(list.total).toBe(total0 - 1);
    const cart = (await get('/api/cart', { cookie: m.cookie })).body;
    expect(cart.lines.find((l: Detail) => l.variantId === q.variants[0].id).availability).toBe('discontinued');
    // đơn cũ giữ nguyên, admin đọc đủ
    const o = await get(`/api/admin/orders/${order.code}`, { cookie: A(), ip: freshIp() });
    expect(o.status).toBe(200);
    expect(JSON.stringify(o.body)).toContain('Áo Shop Ẩn');
  });

  it('T-INV-27 đổi giá: giỏ và báo giá dùng giá mới; đơn đã đặt giữ giá cũ', async () => {
    const m = await loginMember('price-p@example.com');
    const p = await makeProduct({ name: 'Áo Đổi Giá', slug: 'ao-doi-gia', status: 'ACTIVE', price: 500000, variants: [{ sku: 'DG-1', qty: 9 }] });
    const order = await makeOrder({ items: [{ variantId: p.variants[0].id, quantity: 1 }] });
    await post('/api/cart/lines', { variantId: p.variants[0].id, quantity: 1 }, { cookie: m.cookie });
    const d = (await aGet(`/products/${p.id}`, A())).body;
    expect((await aPut(`/products/${p.id}`, putBody(d, { price: 450000 }), A())).status).toBe(200);
    const cart = (await get('/api/cart', { cookie: m.cookie })).body;
    expect(cart.lines.find((l: Detail) => l.variantId === p.variants[0].id).unitPrice).toBe(450000);
    const quote = await post('/api/checkout/quote', { items: [{ variantId: p.variants[0].id, quantity: 1 }], voucherCodes: [], contact: { phone: '0912345678', email: 'a@b.co' } }, { ip: freshIp() });
    expect(quote.body.lines[0].unitPrice).toBe(450000);
    expect((await prisma.orderItem.findFirstOrThrow({ where: { order: { code: order.code } } })).unitPrice).toBe(500000);
  });
});

describe('T-INV-28 .. 31 xoá, biến thể', () => {
  it('T-INV-28 xoá: nháp sạch 204 (kèm biến thể, nhật ký); đã công khai / có đơn 409', async () => {
    const created = await create({ name: 'Sắp xoá', variants: [variant('XOA-1-S', 'Đen', '#000000', 'S', 4)] });
    const vId = created.variants[0].id;
    expect(await prisma.inventoryAdjustment.count({ where: { variantId: vId } })).toBe(1);
    expect((await aDel(`/products/${created.id}`, A())).status).toBe(204);
    expect(await prisma.productVariant.count({ where: { variant_id: vId } })).toBe(0);
    expect(await prisma.inventoryAdjustment.count({ where: { variantId: vId } })).toBe(0);
    expect((await aDel(`/products/${created.id}`, A())).status).toBe(404);

    const pub = await makeProduct({ name: 'Đã công khai', status: 'ACTIVE' });
    const r1 = await aDel(`/products/${pub.id}`, A());
    expect([r1.status, r1.body.error.code]).toEqual([409, 'product-in-use']);
    const sold = await makeProduct({ name: 'Đã bán', status: 'DRAFT', publishedAt: null });
    await makeOrder({ items: [{ variantId: sold.variants[0].id, quantity: 1 }] });
    expect((await aDel(`/products/${sold.id}`, A())).body.error.code).toBe('product-in-use');
    expect(await prisma.product.count({ where: { product_id: { in: [pub.id, sold.id] } } })).toBe(2);
  });

  it('T-INV-29 thêm màu x size: tồn ban đầu + nhật ký; SKU trùng 409; quy tắc 422', async () => {
    const p = await makeProduct({ name: 'Thêm màu', status: 'DRAFT', variants: [{ sku: 'TM-DEN-S', qty: 3 }] });
    const d = (await aGet(`/products/${p.id}`, A())).body;
    const be = (sku: string, size: string) => variant(sku, 'Be', '#f5f5dc', size, 5);
    const ok = await aPut(`/products/${p.id}`, putBody(d, { variants: [...putBody(d).variants, be('TM-BE-S', 'S'), be('TM-BE-M', 'M')] }), A());
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.variants.map((v: Detail) => [v.sku, v.color.hex, v.inventory])).toEqual([['TM-DEN-S', '#000000', 3], ['TM-BE-S', '#F5F5DC', 5], ['TM-BE-M', '#F5F5DC', 5]]);
    expect(ok.body.colors.map((c: Detail) => c.name)).toEqual(['Đen', 'Be']);
    const logs = await prisma.inventoryAdjustment.findMany({ where: { variantId: { in: ok.body.variants.slice(1).map((v: Detail) => v.id) } } });
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({ reason: 'received', note: 'Tồn ban đầu', delta: 5, availableAfter: 5, actorRole: 'admin', actorName: 'Trị Quản' });
    // SKU trùng sản phẩm khác
    const other = await aPut(`/products/${p.id}`, putBody(ok.body, { variants: [...putBody(ok.body).variants, variant('N2F-01-0-S', 'Xanh', '#0000ff', 'L')] }), A());
    expect([other.status, other.body.error.code, other.body.error.field]).toEqual([409, 'duplicate', 'variants[3].sku']);
    const dupCreate = await aPost('/products', body({ variants: [variant('TM-BE-M')] }), A());
    expect([dupCreate.status, dupCreate.body.error.field]).toEqual([409, 'variants[0].sku']);
    // 422: 9 màu, size XXL, hex #FFF, Đen/đen, (màu,size) lặp, SKU lặp, hex khác cùng màu
    const nine = Array.from({ length: 9 }, (_, i) => variant(`NINE-${i}`, `Mau${i}`, '#111111'));
    const rules: Array<[unknown[], string]> = [
      [nine, 'variants[8].color.name'],
      [[variant('XXL-1', 'Đen', '#000000', 'XXL')], 'variants[0].size'],
      [[variant('HEX-1', 'Đen', '#FFF')], 'variants[0].color.hex'],
      [[variant('DD-1', 'Đen'), variant('DD-2', 'đen', '#000000', 'M')], 'variants[1].color.name'],
      [[variant('DUP-1', 'Đen'), variant('DUP-2', 'Đen')], 'variants[1].size'],
      [[variant('SAME-1', 'Đen'), variant('same-1', 'Đen', '#000000', 'M')], 'variants[1].sku'],
      [[variant('HX-1', 'Đen', '#000000'), variant('HX-2', 'Đen', '#111111', 'M')], 'variants[1].color.hex'],
      [Array.from({ length: 33 }, (_, i) => variant(`BIG-${i}`, `M${i % 8}`, '#222222', ['S', 'M', 'L', 'XL'][Math.floor(i / 8) % 4])), 'variants'],
    ];
    for (const [variants, field] of rules) {
      const r = await aPost('/products', body({ variants }), A());
      expect([r.status, r.body.error.code, r.body.error.field]).toEqual([422, 'validation', field]);
    }
  });

  it('T-INV-30 tồn gửi lên bị bỏ qua; SKU có đơn khoá; đổi tên màu áp mọi biến thể', async () => {
    const p = await makeProduct({
      name: 'Khoá SKU', status: 'ACTIVE', gallery: ['pexels-test-image'],
      variants: [{ sku: 'KS-DEN-S', qty: 10 }, { sku: 'KS-DEN-M', size: 'M', qty: 10 }, { sku: 'KS-TRG-S', color: 'Trắng', hex: '#ffffff', qty: 4 }],
    });
    await makeOrder({ items: [{ variantId: p.variants[0].id, quantity: 1 }] });
    const d = (await aGet(`/products/${p.id}`, A())).body;
    const withInv = putBody(d);
    withInv.variants[0].inventory = 999;
    expect((await aPut(`/products/${p.id}`, withInv, A())).body.variants[0].inventory).toBe(10);
    const cur = (await aGet(`/products/${p.id}`, A())).body;
    const sku = putBody(cur);
    sku.variants[0].sku = 'KS-NEW-S';
    const r1 = await aPut(`/products/${p.id}`, sku, A());
    expect([r1.status, r1.body.error.field]).toEqual([422, 'variants[0].sku']);
    const size = putBody(cur);
    size.variants[0].size = 'L';
    expect((await aPut(`/products/${p.id}`, size, A())).body.error.field).toBe('variants[0].size');
    // SKU của biến thể không có đơn đổi được; tên màu đổi áp mọi biến thể màu đó, color_media theo tên mới
    await prisma.product.update({ where: { product_id: p.id }, data: { colorMedia: { Đen: 'pexels-test-image' } } });
    const c2 = (await aGet(`/products/${p.id}`, A())).body;
    const ren = putBody(c2, { images: [{ id: 'pexels-test-image', alt: 'Ảnh đen', color: 'Đen nhám' }] });
    ren.variants[1].sku = 'KS-DEN-M2';
    for (const v of ren.variants) if (v.color.name === 'Đen') v.color = { name: 'Đen nhám', hex: '#101010' };
    const r2 = await aPut(`/products/${p.id}`, ren, A());
    expect(r2.status, JSON.stringify(r2.body)).toBe(200);
    expect(r2.body.variants.filter((v: Detail) => v.color.name === 'Đen nhám')).toHaveLength(2);
    expect(r2.body.images[0]).toMatchObject({ alt: 'Ảnh đen', color: 'Đen nhám' });
    expect(r2.body.variants.find((v: Detail) => v.sku === 'KS-DEN-M2')).toBeTruthy();
    const row = await prisma.product.findUniqueOrThrow({ where: { product_id: p.id } });
    expect(row.colorMedia).toEqual({ 'Đen nhám': 'pexels-test-image' });
    const oi = await prisma.orderItem.findFirstOrThrow({ where: { variantId: p.variants[0].id } });
    expect(oi.colorName).toBe('Đen'); // dòng đơn giữ tên màu đã chụp
  });

  it('T-INV-31 bỏ biến thể: có đơn 409 variant-in-use; chưa có đơn xoá, giỏ thành viên mất, giỏ khách discontinued', async () => {
    const p = await makeProduct({
      name: 'Bỏ size', status: 'ACTIVE',
      variants: [{ sku: 'BS-DEN-S', qty: 5 }, { sku: 'BS-DEN-M', size: 'M', qty: 5 }, { sku: 'BS-DEN-XL', size: 'XL', qty: 5 }],
    });
    await makeOrder({ items: [{ variantId: p.variants[2].id, quantity: 1 }] });
    const m = await loginMember('bs-p@example.com');
    await post('/api/cart/lines', { variantId: p.variants[1].id, quantity: 1 }, { cookie: m.cookie });
    const d = (await aGet(`/products/${p.id}`, A())).body;
    const dropXl = putBody(d, { name: 'Bỏ size đổi', variants: putBody(d).variants.filter((v: Detail) => v.sku !== 'BS-DEN-XL') });
    const r1 = await aPut(`/products/${p.id}`, dropXl, A());
    expect([r1.status, r1.body.error.code, r1.body.error.sku]).toEqual([409, 'variant-in-use', 'BS-DEN-XL']);
    expect((await prisma.product.findUniqueOrThrow({ where: { product_id: p.id } })).name).toBe('Bỏ size'); // không đổi gì
    expect(await prisma.productVariant.count({ where: { productId: p.id } })).toBe(3);
    const dropM = putBody(d, { variants: putBody(d).variants.filter((v: Detail) => v.sku !== 'BS-DEN-M') });
    const r2 = await aPut(`/products/${p.id}`, dropM, A());
    expect(r2.status).toBe(200);
    expect(r2.body.variants.map((v: Detail) => v.sku)).toEqual(['BS-DEN-S', 'BS-DEN-XL']);
    expect(await prisma.cartLine.count({ where: { variantId: p.variants[1].id } })).toBe(0);
    // giỏ khách (không DB) mang variantId đã xoá: báo giá coi như không còn kinh doanh
    const q = await post('/api/checkout/quote', { items: [{ variantId: p.variants[1].id, quantity: 1 }], voucherCodes: [], contact: { phone: '0912345678', email: 'a@b.co' } }, { ip: freshIp() });
    expect(JSON.stringify(q.body)).toContain('discontinued');
  });
});

describe('T-INV-32 / 33 search_text', () => {
  it('T-INV-32 đổi tên / loại thì tìm theo tên mới; mọi dòng search_text đúng công thức', async () => {
    const p = await makeProduct({ name: 'Áo Thun Basic', type: 'Thun basic', status: 'ACTIVE' });
    const d = (await aGet(`/products/${p.id}`, A())).body;
    expect((await aPut(`/products/${p.id}`, putBody(d, { name: 'Áo Phông Trơn', type: 'Phông trơn' }), A())).status).toBe(200);
    const hit = (await aGet('/products?q=phong%20tron', A())).body.items.map((i: Detail) => i.id);
    expect(hit).toContain(p.id);
    expect((await aGet('/products?q=thun%20basic', A())).body.items.map((i: Detail) => i.id)).not.toContain(p.id);
    await create({ name: 'Đầm Lụa Đỏ', type: 'Đầm midi', variants: [variant('SEARCH-1-S')] });
    const rows = await prisma.product.findMany({ select: { name: true, typeLabel: true, searchText: true } });
    expect(rows.length).toBeGreaterThan(8);
    for (const r of rows) expect(r.searchText).toBe(foldVi(`${r.name} ${r.typeLabel}`));
  });

  it('T-INV-33 không có đường ghi products ngoài product.write.ts; lỗi giữa chừng rollback tất cả', async () => {
    const root = path.resolve(__dirname, '../src');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const full = path.join(dir, f);
        if (statSync(full).isDirectory()) walk(full);
        else if (full.endsWith('.ts')) files.push(full);
      }
    };
    walk(root);
    const forbidden = /product\.update\(|product\.updateMany\(|INSERT INTO "products"|UPDATE "products"|product\.upsert\(|product\.create\(/;
    const offenders = files.filter((f) => !/product\.write\.ts$/.test(f) && forbidden.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);

    // ghi biến thể throw giữa chừng -> name, search_text, biến thể không đổi
    const p = await makeProduct({ name: 'Rollback Một', type: 'Áo', status: 'DRAFT', variants: [{ sku: 'RB-1-S', qty: 2 }] });
    const d = (await aGet(`/products/${p.id}`, A())).body;
    writeHooks.beforeVariants = () => {
      throw new Error('boom');
    };
    try {
      const withSku = putBody(d, { name: 'Rollback Hai', type: 'Áo mới' });
      withSku.variants[0].sku = 'RB-1-NEW';
      const r = await aPut(`/products/${p.id}`, withSku, A());
      expect(r.status).toBe(500);
    } finally {
      writeHooks.beforeVariants = undefined;
    }
    const row = await prisma.product.findUniqueOrThrow({ where: { product_id: p.id }, include: { variants: true } });
    expect([row.name, row.typeLabel, row.searchText, row.variants.map((v) => v.sku)]).toEqual(['Rollback Một', 'Áo', foldVi('Rollback Một Áo'), ['RB-1-S']]);
  });
});

describe('T-INV-34 chống ghi chồng', () => {
  it('A lưu giá; A2 lưu tên với updatedAt cũ -> 409 version-conflict', async () => {
    const p = await makeProduct({ name: 'Phiên bản', status: 'DRAFT' });
    const a = (await aGet(`/products/${p.id}`, A())).body;
    const a2 = (await aGet(`/products/${p.id}`, A())).body;
    const r1 = await aPut(`/products/${p.id}`, putBody(a, { price: 300000 }), A());
    expect(r1.status).toBe(200);
    expect(r1.body.updatedAt).not.toBe(a.updatedAt);
    const r2 = await aPut(`/products/${p.id}`, putBody(a2, { name: 'Tên khác' }), A());
    expect([r2.status, r2.body.error.code]).toEqual([409, 'version-conflict']);
    const row = await prisma.product.findUniqueOrThrow({ where: { product_id: p.id } });
    expect([row.name, Number(row.price)]).toEqual(['Phiên bản', 300000]);
    // updatedAt thiếu / sai dạng
    expect((await aPut(`/products/${p.id}`, { ...putBody(r1.body), updatedAt: undefined }, A())).body.error.field).toBe('updatedAt');
    expect((await aPut(`/products/${p.id}`, putBody(r1.body, { updatedAt: 'hôm qua' }), A())).body.error.field).toBe('updatedAt');
    // dùng lại bản mới: thành công
    expect((await aPut(`/products/${p.id}`, putBody(r1.body, { name: 'Tên mới' }), A())).status).toBe(200);
  });

  it('ba PUT đồng thời cùng phiên: đúng một bên thắng', async () => {
    const p = await makeProduct({ name: 'Đồng thời', status: 'DRAFT' });
    const d = (await aGet(`/products/${p.id}`, A())).body;
    const rs = await Promise.all([1, 2, 3].map((i) => aPut(`/products/${p.id}`, putBody(d, { description: `bản ${i}` }), A())));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 409).every((r) => r.body.error.code === 'version-conflict')).toBe(true);
  });
});

void createUser;
void vid;
