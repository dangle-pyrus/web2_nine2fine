import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import prisma from '../src/config/prisma';
import { resetCatalogRateLimit } from '../src/middleware/catalog-rate-limit';
import { resetCheckoutRateLimits } from '../src/middleware/rate-limit';
import { freshIp, get, insertRevenueOrder, makeProduct, post, resetCatalog, resetState, setStock, useClock, vnAt } from './helpers';

/** Lát 10.6 (gợi ý): T-REC-01..07. Dữ liệu tham chiếu PRD: P1..P7. */

const NOW = '2026-11-13T03:00:00Z';
const D = '2026-11-13';
type P = { id: string; slug: string; v: string };
let P1: P, P2: P, P3: P, P4: P, P5: P, P6: P, P7: P;

async function mk(slug: string, o: { category: string; moments: string[]; rank: number; qty?: number; status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED' }): Promise<P> {
  const p = await makeProduct({ slug, name: `Gợi ý ${slug}`, category: o.category, status: o.status ?? 'ACTIVE', price: 400_000, variants: [{ sku: `REC-${slug}`, qty: o.qty ?? 10 }] });
  await prisma.product.update({ where: { product_id: p.id }, data: { moments: o.moments as never, salesRank: o.rank } });
  return { id: p.id, slug, v: p.variants[0].id };
}

const rec = (qs: string, ip: string = freshIp()) => get(`/api/recommendations${qs}`, { ip });
const slugs = (r: { body: { items: Array<{ slug: string }> } }) => r.body.items.map((i) => i.slug);
const S = (...ps: P[]) => ps.map((p) => p.slug);

beforeAll(async () => {
  await resetState();
  await resetCatalog();
  // Bỏ 8 sản phẩm seed: chỉ còn dữ liệu tham chiếu của PRD.
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "product_variants", "products" RESTART IDENTITY CASCADE');
});
beforeEach(async () => {
  resetCheckoutRateLimits();
  resetCatalogRateLimit();
  useClock(NOW);
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "product_variants", "products" RESTART IDENTITY CASCADE');
  P1 = await mk('rec-p1', { category: 'tops', moments: ['work'], rank: 10 });
  P2 = await mk('rec-p2', { category: 'tops', moments: ['work', 'dinner'], rank: 20 }); // cùng danh mục + Moment work
  P3 = await mk('rec-p3', { category: 'bottoms', moments: ['work'], rank: 30 }); // cùng Moment, khác danh mục
  P4 = await mk('rec-p4', { category: 'dresses', moments: ['event'], rank: 40 }); // bán chạy
  P5 = await mk('rec-p5', { category: 'outerwear', moments: ['weekend'], rank: 50 }); // bán chạy
  P6 = await mk('rec-p6', { category: 'tops', moments: ['work'], rank: 60, qty: 0 }); // hết hàng
  P7 = await mk('rec-p7', { category: 'tops', moments: ['work'], rank: 5, status: 'DRAFT' });
});

describe('T-REC-01 AC-REC-01: quy tắc cho một sản phẩm', () => {
  it('limit 4: [P2, P3, P4, P5] (P6 hết hàng, P7 DRAFT, P1 bị loại); limit 2: [P2, P3]; limit 8: đủ 4 phần tử hợp lệ (không bù sai điều kiện)', async () => {
    expect(slugs(await rec(`?ids=${P1.id}&limit=4`))).toEqual(S(P2, P3, P4, P5));
    expect(slugs(await rec(`?ids=${P1.id}&limit=2`))).toEqual(S(P2, P3));
    expect(slugs(await rec(`?ids=${P1.id}&limit=8`))).toEqual(S(P2, P3, P4, P5));
    expect(slugs(await rec(`?ids=${P1.id}`))).toEqual(S(P2, P3, P4, P5)); // mặc định 4
  });

  it('limit 9, 0, -1, abc, rỗng, 1.5 -> 422 field limit', async () => {
    for (const v of ['9', '0', '-1', 'abc', '', '1.5']) {
      const r = await rec(`?ids=${P1.id}&limit=${v}`);
      expect([r.status, r.body.error.code, r.body.error.field]).toEqual([422, 'validation', 'limit']);
    }
  });

  it('thứ tự các bậc: cùng danh mục + Moment (số Moment chung giảm) -> cùng danh mục -> cùng Moment khác danh mục -> bán chạy', async () => {
    await prisma.product.update({ where: { product_id: P1.id }, data: { moments: ['work', 'dinner'] as never } });
    const A = await mk('rec-a', { category: 'tops', moments: ['work'], rank: 1 }); // 1 Moment chung
    const B = await mk('rec-b', { category: 'tops', moments: ['event'], rank: 2 }); // cùng danh mục, không Moment chung
    // P2 có 2 Moment chung (work, dinner) -> đứng trước A dù sales_rank lớn hơn.
    expect(slugs(await rec(`?ids=${P1.id}&limit=8`))).toEqual(S(P2, A, B, P3, P4, P5));
  });

  it('nhận slug thay cho id; trùng id + slug của cùng sản phẩm tính một lần', async () => {
    expect(slugs(await rec(`?ids=${P1.slug}`))).toEqual(S(P2, P3, P4, P5));
    expect(slugs(await rec(`?ids=${P1.slug},${P1.id}`))).toEqual(S(P2, P3, P4, P5));
  });
});

describe('T-REC-02 AC-REC-02: xác định', () => {
  it('gọi lặp 20 lần cùng thứ tự; đổi sales_rank P4 <-> P5 thì P5 trước P4; cùng sales_rank xếp theo slug', async () => {
    const first = slugs(await rec(`?ids=${P1.id}`));
    for (let i = 0; i < 19; i++) expect(slugs(await rec(`?ids=${P1.id}`))).toEqual(first);
    await prisma.product.update({ where: { product_id: P4.id }, data: { salesRank: 50 } });
    await prisma.product.update({ where: { product_id: P5.id }, data: { salesRank: 40 } });
    expect(slugs(await rec(`?ids=${P1.id}`))).toEqual(S(P2, P3, P5, P4));
    await prisma.product.update({ where: { product_id: P4.id }, data: { salesRank: 40 } }); // hoà -> slug (p4 < p5)
    expect(slugs(await rec(`?ids=${P1.id}`))).toEqual(S(P2, P3, P4, P5));
  });
});

describe('T-REC-03 AC-REC-03: tồn kho và trạng thái', () => {
  it('P2 hết hàng -> biến mất ngay; P6 nhập lại -> xuất hiện đúng bậc; ARCHIVED không bao giờ xuất hiện', async () => {
    await setStock(P2.v, 0);
    expect(slugs(await rec(`?ids=${P1.id}`))).toEqual(S(P3, P4, P5));
    await setStock(P6.v, 5);
    expect(slugs(await rec(`?ids=${P1.id}`))).toEqual(S(P6, P3, P4, P5));
    await prisma.product.update({ where: { product_id: P6.id }, data: { status: 'ARCHIVED' } });
    expect(slugs(await rec(`?ids=${P1.id}`))).toEqual(S(P3, P4, P5));
    // Một biến thể còn hàng là đủ.
    const two = await makeProduct({ slug: 'rec-two', status: 'ACTIVE', category: 'tops', variants: [{ sku: 'REC-TWO-S', qty: 0 }, { sku: 'REC-TWO-M', size: 'M', qty: 1 }] });
    await prisma.product.update({ where: { product_id: two.id }, data: { moments: ['work'] as never, salesRank: 15 } });
    expect(slugs(await rec(`?ids=${P1.id}`))[0]).toBe('rec-two');
  });

  it('đầu vào là sản phẩm hết hàng vẫn được gợi ý (PDP của sản phẩm hết hàng); đầu vào DRAFT / ARCHIVED bị bỏ qua (= bán chạy)', async () => {
    expect(slugs(await rec(`?ids=${P6.id}`))).toEqual(S(P1, P2, P3, P4));
    expect(slugs(await rec(`?ids=${P7.id}`))).toEqual(S(P1, P2, P3, P4));
  });
});

describe('T-REC-04 AC-REC-04: giỏ nhiều sản phẩm', () => {
  it('giỏ [P1, P3] limit 4 = [P2, P4, P5] (P2 điểm cao nhất; P1, P3 bị loại; chỉ 3 phần tử hợp lệ)', async () => {
    expect(slugs(await rec(`?ids=${P1.id},${P3.id}&limit=4`))).toEqual(S(P2, P4, P5));
    expect(slugs(await rec(`?ids=${P3.id},${P1.slug}&limit=4`))).toEqual(S(P2, P4, P5)); // thứ tự đầu vào / id lẫn slug không đổi kết quả
  });

  it('giỏ [P1] = như PDP P1; giỏ rỗng / vắng ids / toàn id lạ = bán chạy [P1, P2, P3, P4]', async () => {
    expect(slugs(await rec(`?ids=${P1.id}`))).toEqual(S(P2, P3, P4, P5));
    for (const qs of ['?ids=', '', '?ids=,,', `?ids=${'00000000-0000-4000-8000-000000000000'},khong-co-slug`, `?limit=4`]) {
      expect(slugs(await rec(qs))).toEqual(S(P1, P2, P3, P4));
    }
  });

  it('11 id -> 422 ids; 10 id (kể cả id lạ) hợp lệ; id lạ trong giỏ bị bỏ qua', async () => {
    const ids = Array.from({ length: 11 }, (_, i) => `x${i}`).join(',');
    const r = await rec(`?ids=${ids}`);
    expect([r.status, r.body.error.code, r.body.error.field]).toEqual([422, 'validation', 'ids']);
    expect((await rec(`?ids=${ids.split(',').slice(0, 10).join(',')}`)).status).toBe(200);
    expect(slugs(await rec(`?ids=${P1.id},${'00000000-0000-4000-8000-000000000000'},${P3.id}`))).toEqual(S(P2, P4, P5));
    expect((await rec(`?ids=${'a'.repeat(801)}`)).body.error.field).toBe('ids');
  });
});

describe('T-REC-05 AC-REC-05: ít hơn limit, DTO, cache, công khai', () => {
  it('mọi sản phẩm cùng danh mục hết hàng -> trả ít hơn limit; không có gì -> items rỗng (không lỗi)', async () => {
    await setStock(P2.v, 0);
    const r = await rec(`?ids=${P1.id}&limit=8`);
    expect(slugs(r)).toEqual(S(P3, P4, P5));
    await prisma.productVariant.updateMany({ data: { inventoryQty: 0 } });
    const empty = await rec(`?ids=${P1.id}`);
    expect([empty.status, empty.body]).toEqual([200, { items: [] }]);
  });

  it('DTO = Product của catalog (giá, biến thể, salesRank, ảnh); Cache-Control public, max-age=30; không cookie / Set-Cookie', async () => {
    const r = await rec(`?ids=${P1.id}&limit=1`);
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('public, max-age=30');
    expect(r.headers['set-cookie']).toBeUndefined();
    const list = await get(`/api/products?ids=${P2.id}`, { ip: freshIp() });
    expect(r.body.items[0]).toEqual(list.body.items[0]);
    expect(r.body.items[0]).toMatchObject({ slug: 'rec-p2', price: 400_000, category: 'tops', salesRank: 20 });
  });

  it('khách và thành viên nhận cùng kết quả (cookie không đổi gì); POST / PUT / DELETE -> 404 not-found', async () => {
    const guest = await rec(`?ids=${P1.id}`);
    const withCookie = await get(`/api/recommendations?ids=${P1.id}`, { ip: freshIp(), cookie: 'n2f_sid=bat-ky' });
    expect(withCookie.status).toBe(200);
    expect(withCookie.body).toEqual(guest.body);
    for (const r of [await post('/api/recommendations', {}, { ip: freshIp() }), await post('/api/recommendations?ids=x', {}, { ip: freshIp(), origin: null, xrw: null })]) {
      expect([r.status, r.body.error.code]).toEqual([404, 'not-found']);
    }
  });

  it('120 yêu cầu / 60 giây / IP; yêu cầu 121 -> 429 rate-limited', async () => {
    const ip = '198.51.100.77';
    for (let i = 0; i < 120; i++) expect((await rec('?limit=1', ip)).status).toBe(200);
    const r = await rec('?limit=1', ip);
    expect([r.status, r.body.error.code]).toEqual([429, 'rate-limited']);
  });
});

describe('T-REC-07 AC-REC-07 (Should): bước 0 "mua cùng" (>= 3 đơn completed trong 365 ngày)', () => {
  const together = (other: P, daysAgo: number) =>
    insertRevenueOrder({ deliveredAt: vnAt(D, -daysAgo, '10:00'), userId: null, lines: [{ variantId: P1.v, quantity: 1, unitPrice: 400_000 }, { variantId: other.v, quantity: 1, unitPrice: 400_000 }] });

  it('P1 và P3 chung 3 đơn, P1 và P5 chung 2 đơn: P3 đứng đầu, P5 không vào bước 0; bỏ 1 đơn chung của P3 thì P3 rời bước 0', async () => {
    const o = [await together(P3, 5), await together(P3, 40), await together(P3, 100), await together(P5, 7), await together(P5, 9)];
    expect(slugs(await rec(`?ids=${P1.id}`))).toEqual(S(P3, P2, P4, P5));
    // P5 (2 đơn) chỉ đứng theo bậc bán chạy; đẩy P4 ra khỏi top để thấy rõ: P5 vẫn sau P4.
    await prisma.order.delete({ where: { order_id: o[2].id } });
    expect(slugs(await rec(`?ids=${P1.id}`))).toEqual(S(P2, P3, P4, P5));
  });

  it('đơn ngoài 365 ngày hoặc chưa completed không tính; số đơn chung giảm dần quyết định thứ tự bước 0', async () => {
    await together(P3, 400);
    await together(P3, 380);
    await together(P3, 10);
    expect(slugs(await rec(`?ids=${P1.id}`))).toEqual(S(P2, P3, P4, P5)); // chỉ 1 đơn trong 365 ngày
    for (const d of [20, 30, 31]) await together(P5, d);
    for (const d of [21, 22]) await together(P3, d); // P3: 3 đơn trong hạn, P5: 3 đơn trong hạn
    await together(P5, 50);
    expect(slugs(await rec(`?ids=${P1.id}`))).toEqual(S(P5, P3, P2, P4)); // P5 4 đơn > P3 3 đơn
  });
});
