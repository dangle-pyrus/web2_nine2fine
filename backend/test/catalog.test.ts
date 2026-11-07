import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { catalogSeedData } from '../prisma/seed-catalog';
import { queryLog } from '../src/config/prisma';
import { stockStatusOf } from '../src/modules/catalog/catalog.mapper';
import { foldVi } from '../src/lib/text';
import {
  A, advance, app, cookieFrom, createUser, freshIp, get, loginPassword, ORIGIN, prisma, resetCatalog, resetState,
  useClock,
} from './helpers';

const DAY = 24 * 60 * 60 * 1000;
const g = (path: string, cookie?: string) => get(path, { ip: freshIp(), cookie });
const slugs = (res: request.Response) => (res.body.items as { slug: string }[]).map((i) => i.slug);
const ALL = catalogSeedData.products.map((p) => p.slug);

interface Extra {
  name?: string;
  type?: string;
  price?: number;
  compareAtPrice?: number;
  salesRank?: number;
  displayOrder?: number;
  createdAt?: Date;
  status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  category?: string;
  variants?: { size: string; colorName: string; inventoryQty: number }[];
}
async function addProduct(slug: string, o: Extra = {}) {
  const cat = await prisma.category.findUniqueOrThrow({ where: { slug: o.category ?? 'tops' } });
  const name = o.name ?? slug;
  const type = o.type ?? 'Áo';
  return prisma.product.create({
    data: {
      slug,
      name,
      typeLabel: type,
      categoryId: cat.category_id,
      price: o.price ?? 500000,
      compareAtPrice: o.compareAtPrice,
      coverMediaId: 'catalog-placeholder',
      galleryMediaIds: ['catalog-placeholder'],
      moments: ['work'],
      genders: ['nam'],
      salesRank: o.salesRank ?? 50,
      displayOrder: o.displayOrder ?? 100,
      searchText: foldVi(`${name} ${type}`),
      status: o.status ?? 'ACTIVE',
      createdAt: o.createdAt,
      variants: {
        create: (o.variants ?? [{ size: 'M', colorName: 'Đen', inventoryQty: 10 }]).map((v, i) => ({
          sku: `SKU-${slug}-${i}`,
          size: v.size,
          colorName: v.colorName,
          colorHex: '#000000',
          inventoryQty: v.inventoryQty,
          sortOrder: i,
        })),
      },
    },
  });
}

describe('catalog đọc (dữ liệu seed, chỉ đọc)', () => {
  beforeAll(resetCatalog);

  it('T-CAT-01 8 slug: chi tiết 200, giá số nguyên, enum hợp lệ, compareAtPrice', async () => {
    for (const src of catalogSeedData.products) {
      const res = await g(`/api/products/${src.slug}`);
      expect(res.status).toBe(200);
      expect(res.body.price).toBe(src.price);
      expect(Number.isInteger(res.body.price)).toBe(true);
      expect(res.body.category).toBe(src.category);
      expect(res.body.moments).toEqual(src.moments);
      expect(res.body.genders).toEqual(src.genders);
      expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    }
    expect((await g('/api/products/after-hours-dress')).body.compareAtPrice).toBe(1090000);
    expect((await g('/api/products/the-everyday-blazer')).body).not.toHaveProperty('compareAtPrice');
  });

  it('T-CAT-04/06 chi tiết có 8 biến thể sắp theo màu rồi size; stockStatus theo ngưỡng', async () => {
    const v = (await g('/api/products/the-everyday-blazer')).body.variants;
    expect(v).toHaveLength(8);
    expect(v.map((x: { size: string }) => x.size)).toEqual(['S', 'M', 'L', 'XL', 'S', 'M', 'L', 'XL']);
    expect(v[0]).toMatchObject({ inventory: 5, stockStatus: 'LOW_STOCK' });
    expect(v[3]).toMatchObject({ inventory: 0, stockStatus: 'OUT_OF_STOCK' });
    expect(v[4]).toMatchObject({ inventory: 6, stockStatus: 'IN_STOCK' });
    expect([0, 1, 5, 6].map(stockStatusOf)).toEqual(['OUT_OF_STOCK', 'LOW_STOCK', 'LOW_STOCK', 'IN_STOCK']);
  });

  it('T-CAT-11 gender', async () => {
    const nam = await g('/api/products?gender=nam');
    expect(nam.body.total).toBe(5);
    expect(slugs(nam)).not.toContain('after-hours-dress');
    expect(nam.body.items.every((i: { genders: string[] }) => i.genders.includes('nam'))).toBe(true);
    expect(slugs(await g('/api/products?gender=nu'))).toContain('after-hours-dress');
  });

  it('T-CAT-12/13 category và moment', async () => {
    const d = await g('/api/products?category=dresses');
    expect(d.body.total).toBe(1);
    const e = await g('/api/products?moment=event');
    expect(e.body.items.every((i: { moments: string[] }) => i.moments.includes('event'))).toBe(true);
    expect(slugs(e)).toContain('after-hours-dress');
  });

  it('T-CAT-14 size và available', async () => {
    expect((await g('/api/products?size=XL')).body.total).toBe(8);
    expect((await g('/api/products?size=xl')).body.total).toBe(8);
    const none = await g('/api/products?size=XL&available=true');
    expect(none.body).toMatchObject({ items: [], total: 0 });
    expect((await g('/api/products?available=true')).body.total).toBe(8);
  });

  it('T-CAT-15 maxPrice', async () => {
    const n = async (q: string) => (await g(`/api/products?${q}`)).body.total;
    expect(await n('maxPrice=589999')).toBe(2);
    expect(await n('maxPrice=590000')).toBe(3);
    expect(await n('maxPrice=500000')).toBe(1);
    expect(await n('maxPrice=0')).toBe(8);
  });

  it('T-CAT-17 giá trị lạ -> 200 rỗng; maxPrice sai -> 422', async () => {
    expect((await g('/api/products?category=xyz')).body).toMatchObject({ items: [], total: 0 });
    for (const bad of ['-5', 'abc', '1.5']) {
      const res = await g(`/api/products?maxPrice=${bad}`);
      expect(res.status).toBe(422);
      expect(res.body.error).toMatchObject({ code: 'validation', field: 'maxPrice' });
    }
    for (const q of ['gender=x', 'moment=x', 'size=x', 'color=x']) {
      const res = await g(`/api/products?${q}`);
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(0);
    }
    const av = await g('/api/products?available=maybe');
    expect(av.body.error.field).toBe('available');
  });

  it('T-CAT-19 sắp xếp theo giá', async () => {
    const asc = slugs(await g('/api/products?sort=price-asc'));
    expect(asc[0]).toBe('off-duty-top');
    expect(asc[asc.length - 1]).toBe('the-everyday-blazer');
    expect(slugs(await g('/api/products?sort=price-desc'))).toEqual([...asc].reverse());
  });

  it('T-CAT-20/21 bestselling, newest, featured mặc định', async () => {
    expect(slugs(await g('/api/products?sort=bestselling'))[0]).toBe('nine-to-fine-shirt');
    expect(slugs(await g('/api/products?sort=newest'))[0]).toBe('the-straight-trousers');
    const def = slugs(await g('/api/products'));
    expect(def[0]).toBe('the-everyday-blazer');
    expect(slugs(await g('/api/products?sort=featured'))).toEqual(def);
    const bad = await g('/api/products?sort=hot');
    expect(bad.status).toBe(422);
    expect(bad.body.error.field).toBe('sort');
  });

  it('T-CAT-22/23 phân trang', async () => {
    const all: string[] = [];
    for (const [page, n] of [[1, 3], [2, 3], [3, 2]] as const) {
      const res = await g(`/api/products?sort=price-asc&limit=3&page=${page}`);
      expect(res.body.items).toHaveLength(n);
      expect(res.body.total).toBe(8);
      all.push(...slugs(res));
    }
    expect(new Set(all).size).toBe(8);
    const beyond = await g('/api/products?page=4&limit=3');
    expect(beyond.status).toBe(200);
    expect(beyond.body).toMatchObject({ items: [], total: 8, page: 4, limit: 3 });
    const def = await g('/api/products');
    expect(def.body.items).toHaveLength(8);
    expect(def.body.limit).toBe(24);
  });

  it('T-CAT-24 page/limit sai -> 422 đúng field', async () => {
    for (const [q, f] of [
      ['limit=0', 'limit'], ['limit=49', 'limit'], ['limit=abc', 'limit'], ['limit=1e1', 'limit'],
      ['page=0', 'page'], ['page=1.5', 'page'], ['limit=1&limit=2', 'limit'],
    ]) {
      const res = await g(`/api/products?${q}`);
      expect(res.status, q).toBe(422);
      expect(res.body.error.field, q).toBe(f);
    }
    expect((await g('/api/products?limit=48')).status).toBe(200);
  });

  it('T-CAT-25/26/27 chi tiết: chuẩn hoá slug, 404, slug độc hại', async () => {
    const ok = await g('/api/products/The-Everyday-Blazer%20');
    expect(ok.status).toBe(200);
    expect(ok.body.slug).toBe('the-everyday-blazer');
    const nf = await g('/api/products/khong-co-san-pham');
    expect(nf.status).toBe(404);
    expect(nf.body.error.code).toBe('not-found');
    for (const bad of ['a'.repeat(300), '..%2Fetc', "a'b", '%00', '%']) {
      const res = await g(`/api/products/${bad}`);
      expect(res.status, bad).toBe(404);
      expect(res.body.error.code).toBe('not-found');
      expect(JSON.stringify(res.body)).not.toMatch(/stack|select|prisma/i);
    }
  });

  it('T-CAT-29/45 nội dung đủ, không null, không trường người dùng', async () => {
    const page = (await g('/api/products?limit=48')).body;
    const walk = (v: unknown) => {
      expect(v).not.toBeNull();
      if (Array.isArray(v)) v.forEach(walk);
      else if (typeof v === 'object' && v) Object.values(v).forEach(walk);
    };
    walk(page);
    for (const p of page.items) {
      expect(p.gallery.length).toBeGreaterThanOrEqual(1);
      expect(typeof p.description).toBe('string');
      expect(Array.isArray(p.care)).toBe(true);
      expect(p.fit).toHaveProperty('summary');
      expect(p.fit).toHaveProperty('model');
      expect(p.looks.length).toBeGreaterThan(0);
      expect(p).not.toHaveProperty('rating');
      expect(Object.keys(p).join()).not.toMatch(/user|email|session/i);
    }
  });

  it('T-CAT-31/32 bảng size', async () => {
    for (const s of catalogSeedData.sizeCharts) {
      const res = await g(`/api/size-charts/${s.category}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(s.data);
      expect(res.body.body.map((r: { size: string }) => r.size)).toEqual(['S', 'M', 'L', 'XL']);
      expect(res.body.garment).toHaveLength(4);
    }
    const nf = await g('/api/size-charts/shoes');
    expect(nf.status).toBe(404);
    expect(nf.body.error.code).toBe('not-found');
  });

  it('T-CAT-33/34/36/37 tìm kiếm', async () => {
    const a = await g('/api/products?q=BLAZER');
    const b = await g('/api/products?q=blazer');
    const c = await g('/api/products?q=%20%20blazer%20%20');
    expect(a.body.total).toBe(b.body.total);
    expect(c.body.total).toBe(b.body.total);
    expect(slugs(b)).toContain('the-everyday-blazer');
    const nfc = 'đầm'.normalize('NFC');
    const nfd = 'đầm'.normalize('NFD');
    const dam = slugs(await g('/api/products?q=dam'));
    expect(dam).toContain('after-hours-dress');
    expect(slugs(await g(`/api/products?q=${encodeURIComponent(nfc)}`))).toEqual(dam);
    expect(slugs(await g(`/api/products?q=${encodeURIComponent(nfd)}`))).toEqual(dam);
    expect(slugs(await g('/api/products?q=blazer%20everyday'))).toContain('the-everyday-blazer');
    expect(slugs(await g('/api/products?q=midi%20dam'))).toEqual(slugs(await g('/api/products?q=dam%20midi')));
    expect((await g('/api/products?q=')).body.total).toBe(8);
    expect((await g('/api/products?q=%20%20%20')).body.total).toBe(8);
    expect((await g(`/api/products?q=${'a'.repeat(100)}`)).status).toBe(200);
    const long = await g(`/api/products?q=${'a'.repeat(101)}`);
    expect(long.status).toBe(422);
    expect(long.body.error.field).toBe('q');
    expect((await g('/api/products?q=blazer&maxPrice=1000000')).body.total).toBe(0);
    const combo = await g('/api/products?q=blazer&maxPrice=1300000&sort=price-asc&limit=1');
    expect(slugs(combo)).toEqual(['the-everyday-blazer']);
    expect(combo.body.total).toBe(1);
  });

  it('T-CAT-35 ký tự đặc biệt trong q là ký tự thường, không lỗi, không SQL injection', async () => {
    for (const q of ['%', '_', '\\', "'", "a'; DROP TABLE products;--"]) {
      const res = await g(`/api/products?q=${encodeURIComponent(q)}`);
      expect(res.status, q).toBe(200);
      expect(res.body.total, q).toBe(0);
    }
    expect(await prisma.product.count()).toBe(8);
  });

  it('T-CAT-39 panel gợi ý limit=5', async () => {
    const res = await g('/api/products?q=e&limit=5');
    expect(res.body.items.length).toBeLessThanOrEqual(5);
    expect(res.body.total).toBeGreaterThanOrEqual(res.body.items.length);
  });

  it('T-CAT-42 ids', async () => {
    const all = (await g('/api/products')).body.items as { id: string }[];
    const three = [all[7].id, all[0].id, all[3].id];
    const res = await g(`/api/products?ids=${three.join(',')}`);
    expect(res.body.items).toHaveLength(3);
    const junk = await g(`/api/products?ids=${all[0].id},00000000-0000-4000-8000-000000000000,khong-phai-uuid`);
    expect(junk.body.items).toHaveLength(1);
    expect((await g('/api/products?ids=abc,def')).body).toMatchObject({ items: [], total: 0 });
    const many = Array.from({ length: 49 }, () => all[0].id).join(',');
    const bad = await g(`/api/products?ids=${many}`);
    expect(bad.status).toBe(422);
    expect(bad.body.error.field).toBe('ids');
    const withCat = await g(`/api/products?ids=${all.map((p) => p.id).join(',')}&category=dresses`);
    expect(withCat.body.total).toBe(1);
  });

  it('T-CAT-43 đánh giá luôn [], các đường dẫn khác 404', async () => {
    const before = queryLog.length;
    const res = await g('/api/products/bat-ky-id/reviews');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(queryLog.length).toBe(before);
    expect((await g('/api/products/x/reviews/eligibility')).status).toBe(404);
    const sa = await g('/api/stock-alerts');
    expect(sa.status).toBe(404);
    expect(sa.body.error.code).toBe('not-found');
  });

  it('T-CAT-45 không cần cookie / header; T-CAT-46 phương thức ghi -> 404', async () => {
    for (const path of ['/api/products', '/api/products/city-vest', '/api/products/x/reviews', '/api/size-charts/tops']) {
      const res = await request(app).get(path).set('X-Forwarded-For', freshIp());
      expect(res.status, path).toBe(200);
      expect(res.headers['set-cookie']).toBeUndefined();
    }
    const total = await prisma.product.count();
    for (const method of ['post', 'put', 'delete'] as const) {
      for (const withOrigin of [true, false]) {
        const r = request(app)[method]('/api/products/city-vest').set('X-Forwarded-For', freshIp());
        if (withOrigin) r.set('Origin', ORIGIN).set('X-Requested-With', 'n2f');
        const res = await r;
        expect(res.status, `${method} ${withOrigin}`).toBe(404);
        expect(res.body.error.code).toBe('not-found');
      }
    }
    expect((await request(app).post('/api/products').set('X-Forwarded-For', freshIp())).status).toBe(404);
    expect(await prisma.product.count()).toBe(total);
  });

  it('T-CAT-48 mã lỗi riêng, không lộ stack/SQL, lỗi no-store', async () => {
    const cases: [string, number, string][] = [
      ['/api/products?sort=hot', 422, 'validation'],
      ['/api/products?limit=0', 422, 'validation'],
      ['/api/products/lạ-hoắc', 404, 'not-found'],
      ['/api/size-charts/shoes', 404, 'not-found'],
    ];
    for (const [path, status, code] of cases) {
      const res = await g(encodeURI(path));
      expect(res.status, path).toBe(status);
      expect(res.body.error.code).toBe(code);
      expect(res.headers['cache-control']).toBe('no-store');
    }
    const spy = vi.spyOn(prisma.product, 'findMany').mockRejectedValue(new Error('select * from products secret'));
    try {
      const res = await g('/api/products');
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('unavailable');
      expect(JSON.stringify(res.body)).not.toMatch(/select|products|stack/i);
      expect(res.headers['cache-control']).toBe('no-store');
    } finally {
      spy.mockRestore();
    }
  });

  it('T-CAT-61 header cache, ETag, 304, route lạ', async () => {
    const ip = freshIp();
    for (const path of ['/api/products', '/api/products/city-vest', '/api/products/x/reviews']) {
      expect((await get(path, { ip })).headers['cache-control']).toBe('public, max-age=10');
    }
    expect((await get('/api/size-charts/tops', { ip })).headers['cache-control']).toBe('public, max-age=3600');
    const first = await get('/api/products', { ip });
    expect(first.headers.etag).toBeTruthy();
    const second = await request(app).get('/api/products').set('X-Forwarded-For', ip).set('If-None-Match', first.headers.etag);
    expect(second.status).toBe(304);
    const nf = await get('/api/khong-co', { ip });
    expect(nf.status).toBe(404);
    expect(nf.body.error.code).toBe('not-found');
  });

  it('T-CAT-52 số truy vấn không phụ thuộc số sản phẩm', async () => {
    const run = async (path: string) => {
      await g(path); // làm nóng cache danh mục
      queryLog.length = 0;
      const res = await g(path);
      expect(res.status).toBe(200);
      return queryLog.length;
    };
    const one = await run('/api/products?limit=1');
    const eight = await run('/api/products?limit=8');
    expect(one).toBeLessThanOrEqual(3);
    expect(eight).toBe(one);
    expect(await run('/api/products/city-vest')).toBeLessThanOrEqual(2);
    expect(await run('/api/size-charts/tops')).toBeLessThanOrEqual(1);
    expect(await run('/api/products/x/reviews')).toBe(0);
  });
});

describe('catalog với dữ liệu sửa đổi', () => {
  beforeEach(async () => {
    await resetCatalog();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('T-CAT-03 DRAFT / ARCHIVED không lộ ra ở danh sách, tổng, tìm kiếm, ids, chi tiết', async () => {
    const t1 = await addProduct('thu-ban-nhap', { name: 'Áo thu', status: 'DRAFT' });
    await addProduct('thu-luu-tru', { name: 'Áo thu', status: 'ARCHIVED' });
    const list = await g('/api/products?limit=48');
    expect(list.body.total).toBe(8);
    expect((await g('/api/products?q=thu')).body.total).toBe(0);
    expect((await g(`/api/products?ids=${t1.product_id}`)).body.items).toEqual([]);
    for (const s of ['thu-ban-nhap', 'thu-luu-tru']) {
      const res = await g(`/api/products/${s}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('not-found');
    }
  });

  it('T-CAT-16 màu/size/tồn kho áp lên cùng một biến thể', async () => {
    await addProduct('ao-tong-hop', {
      variants: [
        { size: 'S', colorName: 'Đen', inventoryQty: 0 },
        { size: 'S', colorName: 'Trắng', inventoryQty: 3 },
      ],
    });
    const black = await g(`/api/products?color=${encodeURIComponent('Đen')}&size=S&available=true`);
    expect(slugs(black)).not.toContain('ao-tong-hop');
    const white = await g(`/api/products?color=${encodeURIComponent('trắng')}&size=S&available=true`);
    expect(slugs(white)).toContain('ao-tong-hop');
    // sản phẩm khớp trả đủ biến thể
    expect(white.body.items.find((i: { slug: string }) => i.slug === 'ao-tong-hop').variants).toHaveLength(2);
  });

  it('T-CAT-20 cùng giá hoà bằng slug, ổn định', async () => {
    await addProduct('hoa-b', { price: 100000 });
    await addProduct('hoa-a', { price: 100000 });
    const a = slugs(await g('/api/products?sort=price-asc'));
    expect(a.slice(0, 2)).toEqual(['hoa-a', 'hoa-b']);
    expect(slugs(await g('/api/products?sort=price-asc'))).toEqual(a);
  });

  it('T-CAT-35 "100% cotton": % và _ là ký tự thường', async () => {
    await addProduct('ao-cotton', { name: '100% cotton', type: 'Áo' });
    expect(slugs(await g(`/api/products?q=${encodeURIComponent('100%')}`))).toEqual(['ao-cotton']);
    expect((await g('/api/products?q=1_0')).body.total).toBe(0);
    expect((await g('/api/products?q=1%250')).body.total).toBe(0);
  });

  it('T-CAT-30 giá và tồn kho phản ánh DB, không cache máy chủ', async () => {
    useClock('2026-05-01T00:00:00Z');
    const ip = freshIp();
    const before = await get('/api/products/city-vest', { ip });
    expect(before.body.price).toBe(790000);
    await prisma.product.update({ where: { slug: 'city-vest' }, data: { price: 700000 } });
    await prisma.productVariant.updateMany({ where: { sku: before.body.variants[0].sku }, data: { inventoryQty: 1 } });
    advance(11_000);
    const after = await get('/api/products/city-vest', { ip });
    expect(after.body.price).toBe(700000);
    expect(after.body.variants[0]).toMatchObject({ inventory: 1, stockStatus: 'LOW_STOCK' });
  });

  it('T-CAT-41 30 sản phẩm: trang 1 có 24, trang 2 có 6', async () => {
    for (let i = 0; i < 22; i++) await addProduct(`them-${String(i).padStart(2, '0')}`, { displayOrder: 200 + i });
    const p1 = await g('/api/products');
    const p2 = await g('/api/products?page=2');
    expect(p1.body.items).toHaveLength(24);
    expect(p1.body.total).toBe(30);
    expect(p2.body.items).toHaveLength(6);
    expect(new Set([...slugs(p1), ...slugs(p2)]).size).toBe(30);
  });

  it('T-CAT-47 giới hạn tần suất 120/60 giây/IP', async () => {
    useClock('2026-05-01T00:00:00Z');
    const ip = freshIp();
    for (let i = 0; i < 120; i++) expect((await get('/api/products/city-vest', { ip })).status).toBe(200);
    const limited = await get('/api/products', { ip });
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('rate-limited');
    const retry = limited.body.error.retryAfterSeconds;
    expect(retry).toBeGreaterThanOrEqual(1);
    expect(retry).toBeLessThanOrEqual(60);
    expect(limited.headers['retry-after']).toBe(String(retry));
    expect((await get('/api/products', { ip: freshIp() })).status).toBe(200);
    advance(61_000);
    expect((await get('/api/products', { ip })).status).toBe(200);
  });

  it('T-CAT-47 không đụng bộ đếm auth', async () => {
    useClock('2026-05-01T00:00:00Z');
    const ip = freshIp();
    for (let i = 0; i < 121; i++) await get('/api/products/city-vest', { ip });
    const res = await request(app)
      .post('/api/auth/lookup')
      .set('X-Forwarded-For', ip)
      .set('Origin', ORIGIN)
      .set('X-Requested-With', 'n2f')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'ai-do@example.com' }));
    expect(res.status).toBe(200);
  });

  it('T-CAT-44 cookie phiên giả, hết hạn hoặc đã thu hồi bị bỏ qua: không 401, không Set-Cookie', async () => {
    await resetState();
    await createUser({ email: A.email, password: A.password });
    useClock('2026-01-01T00:00:00Z');
    const revoked = cookieFrom(await loginPassword(A.email, A.password), 'n2f_sid')!;
    await prisma.session.updateMany({ data: { revoked_at: new Date(), revoke_reason: 'test' } });
    const c = cookieFrom(await loginPassword(A.email, A.password, freshIp()), 'n2f_sid')!;
    advance(31 * DAY);
    const cookies = ['n2f_sid=gia-mao', 'n2f_asid=gia-mao', c, revoked, `${c}; n2f_asid=x`];
    for (const cookie of cookies) {
      for (const path of ['/api/products', '/api/products/city-vest', '/api/products/x/reviews', '/api/size-charts/tops']) {
        const res = await get(path, { ip: freshIp(), cookie });
        expect(res.status, path).toBe(200);
        expect(res.headers['set-cookie']).toBeUndefined();
      }
    }
    await resetState();
  });
});
