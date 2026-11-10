import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sniffImage } from '../src/lib/image-info';
import { setImageStorage } from '../src/lib/storage';
import { LocalImageStorage } from '../src/lib/storage/local';
import { SupabaseImageStorage } from '../src/lib/storage/supabase';
import { resetCheckoutRateLimits } from '../src/middleware/rate-limit';
import {
  aGet, aPost, aPut, freshIp, get, loginAdmin, loginStaff, makeJpeg, makeOrder, makePng, makeProduct, makeWebp, post, prisma, resetCheckout, resetState, uploadRaw,
} from './helpers';

let admin: Awaited<ReturnType<typeof loginAdmin>>;
let staff: Awaited<ReturnType<typeof loginStaff>>;
const A = () => admin.cookie;
type Detail = Record<string, any>;

beforeAll(async () => {
  await resetState();
  await resetCheckout();
  admin = await loginAdmin('admin-m@nine2fine.test', { firstName: 'Quản', lastName: 'Trị' });
  staff = await loginStaff('staff-m@nine2fine.test');
});
beforeEach(() => {
  vi.useRealTimers();
  resetCheckoutRateLimits();
});
afterEach(() => setImageStorage(undefined));

const upload = async (buf: Buffer = makeWebp(1200, 1600), contentType?: string) => {
  const r = await uploadRaw(A(), buf, contentType);
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body as { id: string; url: string; width: number; height: number; size: number; contentType: string };
};
const variant = (sku: string, color = 'Đen', hex = '#000000', size = 'S', inventory = 5) => ({ sku, color: { name: color, hex }, size, inventory });
let seq = 0;
const productBody = (images: unknown[], over: Record<string, unknown> = {}) => ({
  name: `Ảnh thử ${++seq}`,
  type: 'Áo',
  category: 'tops',
  price: 300000,
  images,
  variants: [variant(`IMG-${seq}-D-S`), variant(`IMG-${seq}-T-S`, 'Trắng', '#FFFFFF')],
  ...over,
});
const putBody = (d: Detail, over: Record<string, unknown> = {}) => ({
  slug: d.slug, name: d.name, type: d.type, category: d.category, price: d.price, status: d.status,
  images: d.images.map((i: Detail) => ({ id: i.id, alt: i.alt, color: i.color })),
  variants: d.variants.map((v: Detail) => ({ id: v.id, sku: v.sku, color: v.color, size: v.size, inventory: v.inventory })),
  updatedAt: d.updatedAt,
  ...over,
});

describe('T-INV-40 tải ảnh', () => {
  it('JPG 6 MB -> size; .exe đổi đuôi -> format; PNG 400x500 -> dimensions; WebP 1200x1600 -> 201 mở được', async () => {
    const big = Buffer.concat([makeJpeg(800, 1000), Buffer.alloc(6 * 1024 * 1024)]);
    const r1 = await uploadRaw(A(), big, 'image/jpeg');
    expect([r1.status, r1.body.error.code, r1.body.error.reason]).toEqual([422, 'invalid-image', 'size']);
    expect(r1.headers['cache-control']).toBe('no-store');

    const exe = Buffer.concat([Buffer.from('MZ\x90\x00'), Buffer.alloc(2000)]);
    const r2 = await uploadRaw(A(), exe, 'image/png');
    expect([r2.status, r2.body.error.reason]).toEqual([422, 'format']);

    const r3 = await uploadRaw(A(), makePng(400, 500));
    expect([r3.status, r3.body.error.code, r3.body.error.reason]).toEqual([422, 'invalid-image', 'dimensions']);
    expect((await uploadRaw(A(), makePng(600, 6001))).body.error.reason).toBe('dimensions');
    expect((await uploadRaw(A(), makePng(6000, 600))).status).toBe(201);
    expect((await uploadRaw(A(), makePng(599, 2000))).body.error.reason).toBe('dimensions');

    const ok = await upload(makeWebp(1200, 1600));
    expect(ok.id.length).toBeLessThanOrEqual(100);
    expect(ok.id).toMatch(/^up-[0-9a-f]{32}\.webp$/);
    expect(ok).toMatchObject({ url: `/api/media/${ok.id}`, width: 1200, height: 1600, contentType: 'image/webp', alt: '', color: '' });
    expect(ok.size).toBe(makeWebp(1200, 1600).length);
    const file = await get(ok.url, { ip: freshIp() });
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('image/webp');
    expect(file.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(Buffer.compare(file.body, makeWebp(1200, 1600))).toBe(0);
    expect(await prisma.mediaAsset.findUniqueOrThrow({ where: { mediaId: ok.id } })).toMatchObject({ storage: 'local', contentType: 'image/webp', byteSize: ok.size, width: 1200, height: 1600 });
  });

  it('thân rỗng / ảnh cụt / quyền / phiên / giới hạn tần suất', async () => {
    expect((await uploadRaw(A(), Buffer.alloc(0))).body.error.reason).toBe('format');
    expect((await uploadRaw(A(), makeJpeg(800, 1000).subarray(0, 8))).body.error.reason).toBe('format');
    expect((await uploadRaw(A(), makePng(800, 800).subarray(0, 20))).body.error.reason).toBe('format');
    const s = await uploadRaw(staff.cookie, makeWebp(1200, 1600));
    expect([s.status, s.body.error.code]).toEqual([403, 'forbidden']);
    const n = await uploadRaw(undefined, makeWebp(1200, 1600));
    expect([n.status, n.headers['cache-control']]).toEqual([401, 'no-store']);
    // origin sai -> 403 origin-not-allowed
    const bad = await post('/api/admin/uploads/product-images', '', { cookie: A(), origin: null });
    expect(bad.status).toBe(403);
  });

  it('T-INV-04 (upload) 31 tệp / 10 phút -> 429 + Retry-After', async () => {
    const lim = await loginAdmin('lim-up@nine2fine.test');
    resetCheckoutRateLimits();
    let last: any;
    for (let i = 0; i < 31; i++) last = await uploadRaw(lim.cookie, Buffer.alloc(0));
    expect(last.status).toBe(429);
    expect(last.body.error.code).toBe('rate-limited');
    expect(last.body.error.retryAfterSeconds).toBeGreaterThan(0);
    expect(last.headers['retry-after']).toBeDefined();
  });
});

describe('T-INV-41 ảnh của sản phẩm', () => {
  it('thứ tự, bìa, color_media; màu lạ / id bịa / lặp / 13 ảnh -> 422 images', async () => {
    const [i1, i2, i3, i4] = [await upload(), await upload(), await upload(), await upload()];
    const images = [
      { id: i1.id, alt: 'Đen trước', color: 'Đen' },
      { id: i2.id },
      { id: i3.id, color: 'trắng' },
      { id: i4.id, color: 'Đen' },
    ];
    const r = await aPost('/products', productBody(images), A());
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.images).toEqual([
      { id: i1.id, url: i1.url, alt: 'Đen trước', color: 'Đen' },
      { id: i2.id, url: i2.url, alt: '', color: '' },
      { id: i3.id, url: i3.url, alt: '', color: 'Trắng' },
      { id: i4.id, url: i4.url, alt: '', color: 'Đen' },
    ]);
    const row = await prisma.product.findUniqueOrThrow({ where: { product_id: r.body.id } });
    expect(row.coverMediaId).toBe(i1.id);
    expect(row.galleryMediaIds).toEqual([i1.id, i2.id, i3.id, i4.id]);
    expect(row.colorMedia).toEqual({ Đen: i1.id, Trắng: i3.id });

    const rules: Array<[unknown[], string]> = [
      [[{ id: i1.id, color: 'Xanh' }], 'images'],
      [[{ id: 'up-00000000000000000000000000000000.png' }], 'images'],
      [[{ id: 'khong-co-that' }], 'images'],
      [[{ id: i1.id }, { id: i1.id }], 'images'],
      [Array.from({ length: 13 }, (_, k) => ({ id: `lib-${k}` })), 'images'],
      [[{ id: i1.id, alt: 'a'.repeat(126) }], 'images[0].alt'],
    ];
    const before = await prisma.product.count();
    for (const [imgs, field] of rules) {
      const x = await aPost('/products', productBody(imgs), A());
      expect([x.status, x.body.error.code, x.body.error.field]).toEqual([422, 'validation', field]);
    }
    expect(await prisma.product.count()).toBe(before);
  });
});

describe('T-INV-42 / 43 storefront và đơn cũ', () => {
  it('ảnh tải lên đi qua PLP / PDP / giỏ / báo giá; đổi bìa, bỏ ảnh: đơn cũ giữ id; /media vẫn 200', async () => {
    const [i1, i2] = [await upload(), await upload()];
    const created = await aPost('/products', productBody([{ id: i1.id }, { id: i2.id }], { status: 'active', slug: 'ao-anh-tai-len' }), A());
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const q = created.body as Detail;
    const variantId = q.variants[0].id;
    const order = await makeOrder({ items: [{ variantId, quantity: 1 }] });
    expect((await prisma.orderItem.findFirstOrThrow({ where: { order: { code: order.code } } })).mediaId).toBe(i1.id);

    const pdp = await get('/api/products/ao-anh-tai-len', { ip: freshIp() });
    expect([pdp.body.mediaId, pdp.body.gallery]).toEqual([i1.id, [i1.id, i2.id]]);
    const plp = await get('/api/products?q=anh%20thu', { ip: freshIp() }).then((r) => r.body.items);
    expect(plp.map((i: Detail) => i.mediaId)).toContain(i1.id);
    const quote = await post('/api/checkout/quote', { items: [{ variantId, quantity: 1 }], voucherCodes: [], contact: { phone: '0912345678', email: 'a@b.co' } }, { ip: freshIp() });
    expect(quote.body.lines[0].mediaId).toBe(i1.id);

    // đổi bìa: i2 lên đầu
    const swapped = await aPut(`/products/${q.id}`, putBody(q, { images: [{ id: i2.id }, { id: i1.id }] }), A());
    expect(swapped.status).toBe(200);
    expect((await get('/api/products/ao-anh-tai-len', { ip: freshIp() })).body.mediaId).toBe(i2.id);
    expect((await prisma.orderItem.findFirstOrThrow({ where: { order: { code: order.code } } })).mediaId).toBe(i1.id);

    // bỏ i1 khỏi sản phẩm: tệp vẫn còn, đơn vẫn mang i1
    const dropped = await aPut(`/products/${q.id}`, putBody(swapped.body, { images: [{ id: i2.id }] }), A());
    expect(dropped.body.images.map((i: Detail) => i.id)).toEqual([i2.id]);
    expect((await get(`/api/media/${i1.id}`, { ip: freshIp() })).status).toBe(200);
    expect((await prisma.orderItem.findFirstOrThrow({ where: { order: { code: order.code } } })).mediaId).toBe(i1.id);

    // ảnh đã bỏ không còn "đã dùng" ở sản phẩm nào nhưng vẫn là ảnh đã tải lên: gắn lại được
    expect((await aPut(`/products/${q.id}`, putBody(dropped.body, { images: [{ id: i2.id }, { id: i1.id }] }), A())).status).toBe(200);
  });

  it('ảnh thư viện: lưu sản phẩm không đổi giữ nguyên id và url null; sản phẩm khác dùng lại id thư viện được', async () => {
    const p = await makeProduct({ name: 'Thư viện', status: 'ACTIVE', gallery: ['pexels-lib-a', 'pexels-lib-b'] });
    const d = (await aGet(`/products/${p.id}`, A())).body;
    expect(d.images.map((i: Detail) => [i.id, i.url])).toEqual([['pexels-lib-a', null], ['pexels-lib-b', null]]);
    const r = await aPut(`/products/${p.id}`, putBody(d, { name: 'Thư viện 2' }), A());
    expect(r.body.images.map((i: Detail) => i.id)).toEqual(['pexels-lib-a', 'pexels-lib-b']);
    const other = await aPost('/products', productBody([{ id: 'pexels-lib-b' }]), A());
    expect(other.status).toBe(201);
    expect(other.body.images[0].url).toBeNull();
  });
});

describe('T-INV-44 lớp lưu trữ', () => {
  it('local: ghi / đọc / không ghi đè / key sai bị chặn', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'n2f-local-'));
    const s = new LocalImageStorage(dir);
    const key = `up-${'a'.repeat(32)}.png`;
    await s.put(key, Buffer.from('abc'), 'image/png');
    expect(readFileSync(path.join(dir, key), 'utf8')).toBe('abc');
    expect(await s.read(key)).toEqual({ data: Buffer.from('abc'), contentType: 'image/png' });
    await expect(s.put(key, Buffer.from('xyz'), 'image/png')).rejects.toThrow();
    expect(readFileSync(path.join(dir, key), 'utf8')).toBe('abc');
    for (const bad of ['../evil.png', 'up-../x.png', `up-${'a'.repeat(32)}.exe`, 'a/b', '']) {
      await expect(s.put(bad, Buffer.from('x'), 'image/png')).rejects.toThrow();
      expect(await s.read(bad)).toBeNull();
    }
    expect(existsSync(path.join(dir, '..', 'evil.png'))).toBe(false);
    expect(await s.read(`up-${'b'.repeat(32)}.png`)).toBeNull();
    expect(s.publicUrl(key)).toBe(`/api/media/${key}`);
  });

  it('supabase (fetch giả): đúng URL + header, GET /media -> 302, không lộ khoá; đổi driver không đổi API', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const secret = 'srv-role-key-xyz';
    const driver = new SupabaseImageStorage({ url: 'https://abc.supabase.co/', serviceRoleKey: secret, bucket: 'product-images' }, fake);
    setImageStorage(driver);
    const local = await upload(makeJpeg(800, 1000), 'image/jpeg'); // đi qua driver giả
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`https://abc.supabase.co/storage/v1/object/product-images/${local.id}`);
    const h = calls[0].init.headers as Record<string, string>;
    expect(calls[0].init.method).toBe('POST');
    expect(h).toMatchObject({ Authorization: `Bearer ${secret}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'false' });
    expect(local).toMatchObject({ url: `/api/media/${local.id}`, contentType: 'image/jpeg' }); // API không đổi theo driver
    expect(await prisma.mediaAsset.findUniqueOrThrow({ where: { mediaId: local.id } })).toMatchObject({ storage: 'supabase' });
    const red = await get(`/api/media/${local.id}`, { ip: freshIp() });
    expect(red.status).toBe(302);
    expect(red.headers.location).toBe(`https://abc.supabase.co/storage/v1/object/public/product-images/${local.id}`);
    expect(red.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(JSON.stringify(red.headers)).not.toContain(secret);

    // lỗi từ Supabase: unavailable, không lộ khoá, không có dòng media
    const before = await prisma.mediaAsset.count();
    setImageStorage(new SupabaseImageStorage({ url: 'https://abc.supabase.co', serviceRoleKey: secret, bucket: 'b' }, (async () => new Response('no', { status: 500 })) as unknown as typeof fetch));
    const fail = await uploadRaw(A(), makeJpeg(800, 1000));
    expect([fail.status, fail.body.error.code]).toEqual([500, 'unavailable']);
    expect(JSON.stringify(fail.body)).not.toContain(secret);
    expect(await prisma.mediaAsset.count()).toBe(before);
  });

  it('GET /media: mẫu sai / không có -> 404; ghi -> 404', async () => {
    for (const id of ['abc.png', 'up-xyz.png', `up-${'f'.repeat(32)}.png`, `up-${'f'.repeat(32)}.gif`]) {
      const r = await get(`/api/media/${id}`, { ip: freshIp() });
      expect([r.status, r.body.error.code]).toEqual([404, 'not-found']);
    }
    expect((await post(`/api/media/up-${'f'.repeat(32)}.png`, {}, { cookie: A(), ip: freshIp() })).status).toBe(404);
  });
});

describe('T-INV-45 nhận dạng theo nội dung', () => {
  it('tên lưu không chứa tên gốc / đuôi của client; loại theo nội dung', async () => {
    const r = await uploadRaw(A(), makePng(900, 1200), 'image/jpeg');
    expect(r.status).toBe(201);
    expect(r.body.id).toMatch(/^up-[0-9a-f]{32}\.png$/);
    expect(r.body.contentType).toBe('image/png');
    const r2 = await uploadRaw(A(), makeJpeg(900, 1200), 'application/octet-stream');
    expect(r2.body.id).toMatch(/\.jpg$/);
    expect(r2.body.id).not.toBe(r.body.id);
  });

  it('JPEG / PNG / WebP (VP8X, VP8, VP8L) đo đúng kích thước', () => {
    const table: Array<[Buffer, string, number, number]> = [
      [makeJpeg(640, 960), 'image/jpeg', 640, 960],
      [makeJpeg(6000, 4000), 'image/jpeg', 6000, 4000],
      [makePng(1000, 1500), 'image/png', 1000, 1500],
      [makeWebp(1200, 1600, 'VP8X'), 'image/webp', 1200, 1600],
      [makeWebp(800, 1000, 'VP8 '), 'image/webp', 800, 1000],
      [makeWebp(700, 900, 'VP8L'), 'image/webp', 700, 900],
      [makeWebp(16383, 16384, 'VP8L'), 'image/webp', 16383, 16384],
    ];
    for (const [buf, type, w, h] of table) expect(sniffImage(buf)).toMatchObject({ type, width: w, height: h });
    // JPEG có marker APP0 / DHT trước SOF
    const withApp = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc4, 0x00, 0x03, 0x00]), makeJpeg(500, 700).subarray(2)]);
    expect(sniffImage(withApp)).toMatchObject({ width: 500, height: 700 });
    for (const bad of [Buffer.alloc(0), Buffer.from('GIF89a......'), makeWebp(10, 10, 'VP8X').subarray(0, 20), makePng(0, 10), makeJpeg(0, 10)]) {
      expect(sniffImage(bad)).toBeNull();
    }
  });
});
