import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetCheckoutRateLimits } from '../src/middleware/rate-limit';
import { effectivePrice, isOnSale, isSaleRunning, saleState } from '../src/modules/pricing/effective-price';
import * as writer from '../src/modules/catalog-admin/product.write';
import {
  aGet, aPost, aPut, freshIp, get, loginAdmin, loginMember, loginStaff, makeVoucher, orderBody, post, prisma, resetCheckout, resetState, setStock,
  submitOrder, useClock, vid, vnAt,
} from './helpers';

/** Slice 10, lát 10.7: T-PROMO-01..10 (AC-PROMO-01..07). D = 2026-11-20 (ngày VN). */

type Json = Record<string, any>;
const D = '2026-11-20';
const START = vnAt(D, 0); // 00:00:00 VN
const END = vnAt(D, 2, '23:59', 59); // 23:59:59 VN, D + 2
const T = {
  before: vnAt(D, -1, '23:59', 59),
  start: vnAt(D, 0),
  end: vnAt(D, 2, '23:59', 59),
  after: vnAt(D, 3),
};

let admin: Awaited<ReturnType<typeof loginAdmin>>;
let staff: Awaited<ReturnType<typeof loginStaff>>;
let shirt: { id: string; slug: string; variant: string }; // weekend-shirt 550.000
let top: { id: string; slug: string; variant: string }; // off-duty-top 390.000

async function product(slug: string) {
  const p = await prisma.product.findUniqueOrThrow({ where: { slug }, include: { variants: { orderBy: { sortOrder: 'asc' } } } });
  return { id: p.product_id, slug, variant: p.variants[0].variant_id, price: Number(p.price) };
}
const setSale = (id: string, salePrice: number | null, s: Date | null = START, e: Date | null = END) =>
  prisma.product.update({ where: { product_id: id }, data: { salePrice, saleStartsAt: salePrice === null ? null : s, saleEndsAt: salePrice === null ? null : e } });

beforeAll(async () => {
  await resetState();
  await resetCheckout();
  admin = await loginAdmin('admin-promo@nine2fine.test', { firstName: 'Quản', lastName: 'Trị' });
  staff = await loginStaff('staff-promo@nine2fine.test');
});

beforeEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetCheckoutRateLimits();
  await resetCheckout();
  shirt = await product('weekend-shirt');
  top = await product('off-duty-top');
});

const A = () => admin.cookie;
const detail = async (slug: string): Promise<Json> => (await get(`/api/products/${slug}`, { ip: freshIp() })).body;
const quote = (items: Array<{ variantId: string; quantity: number }>, voucherCodes: string[] = [], cookie?: string) =>
  post('/api/checkout/quote', { items, voucherCodes }, { ip: freshIp(), cookie });
const adminDetail = async (id: string): Promise<Json> => (await aGet(`/products/${id}`, A())).body;
/** Body PUT từ chi tiết admin đọc được (như FE). */
const putBody = (d: Json, over: Json = {}): Json => ({
  slug: d.slug, name: d.name, type: d.type, description: d.description, status: d.status, category: d.category, genders: d.genders, moments: d.moments,
  price: d.price, compareAtPrice: d.compareAtPrice, material: d.material, care: d.care, fitSummary: d.fitSummary,
  images: d.images.map((i: Json) => ({ id: i.id, alt: i.alt, color: i.color })),
  variants: d.variants.map((v: Json) => ({ id: v.id, sku: v.sku, color: v.color, size: v.size, inventory: v.inventory })),
  updatedAt: d.updatedAt, ...over,
});
const put = async (id: string, over: Json, cookie = A()) => aPut(`/products/${id}`, putBody(await adminDetail(id), over), cookie);

describe('hàm giá hiệu lực (đơn vị)', () => {
  const base = { price: 500_000, compareAtPrice: null, salePrice: 350_000, saleStartsAt: START, saleEndsAt: END };
  it('ranh giới hai đầu GỒM: D-1 23:59:59 không, D 00:00:00 có, D+2 23:59:59 có, D+3 00:00:00 không', () => {
    expect(isSaleRunning(base, T.before)).toBe(false);
    expect(isSaleRunning(base, T.start)).toBe(true);
    expect(isSaleRunning(base, T.end)).toBe(true);
    expect(isSaleRunning(base, T.after)).toBe(false);
    expect(saleState(base, T.before)).toBe('upcoming');
    expect(saleState(base, T.end)).toBe('running');
    expect(saleState(base, T.after)).toBe('ended');
    expect(saleState({ ...base, salePrice: null }, T.start)).toBe('none');
  });
  it('trong đợt: giá giảm, gạch = giá gốc (đè gạch nhập tay), discountPercent floor; ngoài đợt: giá gốc + gạch nhập tay', () => {
    expect(effectivePrice({ ...base, compareAtPrice: 650_000 }, T.start)).toEqual({ price: 350_000, compareAtPrice: 500_000, discountPercent: 30, saleEndsAt: END });
    expect(effectivePrice({ ...base, compareAtPrice: 650_000 }, T.after)).toEqual({ price: 500_000, compareAtPrice: 650_000 });
    expect(effectivePrice({ ...base, compareAtPrice: 400_000 }, T.after)).toEqual({ price: 500_000, compareAtPrice: null });
    expect(effectivePrice({ ...base, salePrice: 499_000 }, T.start).discountPercent).toBe(0);
    expect(effectivePrice({ ...base, salePrice: 333_000 }, T.start).discountPercent).toBe(33);
  });
  it('isOnSale: đợt đang chạy HOẶC gạch nhập tay > giá', () => {
    expect(isOnSale(base, T.start)).toBe(true);
    expect(isOnSale(base, T.after)).toBe(false);
    expect(isOnSale({ ...base, compareAtPrice: 600_000 }, T.after)).toBe(true);
    expect(isOnSale({ ...base, compareAtPrice: 500_000 }, T.after)).toBe(false);
  });
});

describe('T-PROMO-01 đặt / gỡ đợt giảm (AC-PROMO-01)', () => {
  const today = () => new Date().toISOString().slice(0, 10);
  const plus = (n: number) => new Date(Date.parse(`${today()}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

  it('salePrice: = giá, 999, thập phân -> 422 salePrice; 499.000 và 350.000 hợp lệ; trả saleState + ISO UTC', async () => {
    for (const salePrice of [550_000, 999, 1500.5, 560_000]) {
      const r = await put(shirt.id, { salePrice, saleStartsAt: plus(0), saleEndsAt: plus(2) });
      expect(r.status, String(salePrice)).toBe(422);
      expect(r.body.error.field).toBe('salePrice');
    }
    const ok = await put(shirt.id, { salePrice: 499_000, saleStartsAt: plus(0), saleEndsAt: plus(2) });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body).toMatchObject({ salePrice: 499_000, saleState: 'running' });
    expect(new Date(ok.body.saleStartsAt).getTime()).toBe(Date.parse(`${plus(0)}T00:00:00+07:00`));
    expect(new Date(ok.body.saleEndsAt).getTime()).toBe(Date.parse(`${plus(2)}T23:59:59+07:00`));
    const over = await put(shirt.id, { salePrice: 350_000, saleStartsAt: plus(1), saleEndsAt: plus(3) });
    expect(over.body).toMatchObject({ salePrice: 350_000, saleState: 'upcoming' });
    expect((await prisma.product.count({ where: { salePrice: { not: null } } }))).toBe(1);
  });

  it('ngày: kết thúc D-1 sai; D và D+89 hợp lệ; D+90 sai; thiếu ngày / thiếu giá / một trong ba null: 422 theo trường', async () => {
    const d0 = plus(0);
    const r1 = await put(shirt.id, { salePrice: 350_000, saleStartsAt: d0, saleEndsAt: plus(-1) });
    expect(r1.status).toBe(422);
    expect(r1.body.error.field).toBe('saleEndsAt');
    expect((await put(shirt.id, { salePrice: 350_000, saleStartsAt: d0, saleEndsAt: d0 })).status).toBe(200);
    expect((await put(shirt.id, { salePrice: 350_000, saleStartsAt: d0, saleEndsAt: plus(89) })).status).toBe(200);
    const r90 = await put(shirt.id, { salePrice: 350_000, saleStartsAt: d0, saleEndsAt: plus(90) });
    expect(r90.status).toBe(422);
    expect(r90.body.error.field).toBe('saleEndsAt');
    const miss = await put(shirt.id, { salePrice: 350_000, saleStartsAt: d0 });
    expect(miss.body.error.field).toBe('saleEndsAt');
    const missPrice = await put(shirt.id, { saleStartsAt: d0, saleEndsAt: plus(1) });
    expect(missPrice.body.error.field).toBe('salePrice');
    const mixed = await put(shirt.id, { salePrice: 350_000, saleStartsAt: null, saleEndsAt: plus(1) });
    expect(mixed.status).toBe(422);
    expect(mixed.body.error.field).toBe('saleStartsAt');
    expect((await put(shirt.id, { salePrice: 350_000, saleStartsAt: '2026-02-30', saleEndsAt: '2026-03-01' })).body.error.field).toBe('saleStartsAt');
    expect((await put(shirt.id, { salePrice: 350_000, saleStartsAt: d0, saleEndsAt: 'abc' })).body.error.field).toBe('saleEndsAt');
  });

  it('ISO UTC phải đúng biên 00:00:00 / 23:59:59 giờ VN; lệch biên -> 422', async () => {
    const ok = await put(shirt.id, { salePrice: 350_000, saleStartsAt: '2026-12-01T17:00:00.000Z', saleEndsAt: '2026-12-03T16:59:59.000Z' });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.saleStartsAt).toBe('2026-12-01T17:00:00.000Z');
    expect(ok.body.saleEndsAt).toBe('2026-12-03T16:59:59.000Z');
    const bad = await put(shirt.id, { salePrice: 350_000, saleStartsAt: '2026-12-01T17:00:01.000Z', saleEndsAt: '2026-12-03T16:59:00.000Z' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.field).toBe('saleStartsAt');
  });

  it('khoá vắng giữ đợt; ba null gỡ đợt; staff -> 403 trước khi đọc thân', async () => {
    const d0 = plus(0);
    await put(shirt.id, { salePrice: 350_000, saleStartsAt: d0, saleEndsAt: plus(5) });
    const keep = await aPut(`/products/${shirt.id}`, putBody(await adminDetail(shirt.id), { name: 'Áo sơ mi đổi tên' }), A());
    expect(keep.body).toMatchObject({ salePrice: 350_000, name: 'Áo sơ mi đổi tên' });
    const cleared = await put(shirt.id, { salePrice: null, saleStartsAt: null, saleEndsAt: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body).toMatchObject({ salePrice: null, saleStartsAt: null, saleEndsAt: null, saleState: 'none' });
    const r = await aPut(`/products/${shirt.id}`, '{"khong json', staff.cookie);
    expect(r.status).toBe(403);
    const s = await aPut(`/products/${shirt.id}`, putBody(await adminDetail(shirt.id), { salePrice: 350_000, saleStartsAt: d0, saleEndsAt: plus(1) }), staff.cookie);
    expect(s.status).toBe(403);
    expect((await prisma.product.findUniqueOrThrow({ where: { product_id: shirt.id } })).salePrice).toBeNull();
  });

  it('tạo sản phẩm kèm đợt: hợp lệ; 422 theo trường; saleState trong danh sách admin', async () => {
    const base = putBody(await adminDetail(shirt.id));
    const created = await aPost('/products', { ...base, slug: 'ao-thu-giam-gia', name: 'Áo thử giảm giá', variants: [{ sku: 'PRM-NEW-S', color: { name: 'Đen', hex: '#000000' }, size: 'S', inventory: 3 }], images: base.images, updatedAt: undefined, salePrice: 400_000, saleStartsAt: plus(2), saleEndsAt: plus(4) }, A());
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body).toMatchObject({ salePrice: 400_000, saleState: 'upcoming' });
    const list = await aGet('/products?limit=100', A());
    expect(list.body.items.find((i: Json) => i.id === created.body.id).saleState).toBe('upcoming');
    expect(list.body.items.find((i: Json) => i.id === shirt.id).saleState).toBe('none');
  });
});

describe('T-PROMO-05 đổi giá khi có đợt (AC-PROMO-05)', () => {
  it('price mới <= salePrice -> 422 salePrice, không ghi; > salePrice hợp lệ; DRAFT có đợt không hiển thị', async () => {
    await setSale(shirt.id, 350_000);
    const bad = await put(shirt.id, { price: 350_000 });
    expect(bad.status).toBe(422);
    expect(bad.body.error.field).toBe('salePrice');
    expect((await put(shirt.id, { price: 300_000 })).body.error.field).toBe('salePrice');
    expect(Number((await prisma.product.findUniqueOrThrow({ where: { product_id: shirt.id } })).price)).toBe(550_000);
    expect((await put(shirt.id, { price: 360_000 })).status).toBe(200);
    // gỡ đợt cùng lúc đổi giá: hợp lệ
    expect((await put(shirt.id, { price: 200_000, salePrice: null, saleStartsAt: null, saleEndsAt: null })).status).toBe(200);
    // DRAFT có đợt: storefront không thấy
    await setSale(shirt.id, 150_000, new Date(Date.now() - 86_400_000), new Date(Date.now() + 86_400_000));
    await prisma.product.update({ where: { product_id: shirt.id }, data: { status: 'DRAFT' } });
    expect((await get(`/api/products/${shirt.slug}`, { ip: freshIp() })).status).toBe(404);
    expect((await get(`/api/products?ids=${shirt.id}`, { ip: freshIp() })).body.items).toEqual([]);
  });

  it('updatedAt cũ -> 409 version-conflict', async () => {
    await setSale(shirt.id, 350_000);
    const stale = putBody(await adminDetail(shirt.id));
    expect((await aPut(`/products/${shirt.id}`, { ...stale, name: 'Một' }, A())).status).toBe(200);
    const r = await aPut(`/products/${shirt.id}`, { ...stale, name: 'Hai', salePrice: null, saleStartsAt: null, saleEndsAt: null }, A());
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('version-conflict');
    expect((await prisma.product.findUniqueOrThrow({ where: { product_id: shirt.id } })).salePrice).not.toBeNull();
  });
});

describe('T-PROMO-02 giá hiệu lực ở catalog theo giờ (AC-PROMO-02)', () => {
  beforeEach(async () => {
    await setSale(shirt.id, 385_000); // 550.000 -> 385.000 = -30%
  });
  const at = async (when: Date) => {
    useClock(when.toISOString());
    return detail(shirt.slug);
  };

  it('chi tiết: D-1 23:59:59 giá gốc; D 00:00:00 giảm; D+2 23:59:59 giảm; D+3 00:00:00 giá gốc', async () => {
    for (const [when, running] of [[T.before, false], [T.start, true], [T.end, true], [T.after, false]] as const) {
      const d = await at(when);
      if (running) {
        expect(d, when.toISOString()).toMatchObject({ price: 385_000, compareAtPrice: 550_000, discountPercent: 30, saleEndsAt: END.toISOString() });
      } else {
        expect(d.price, when.toISOString()).toBe(550_000);
        expect(d.compareAtPrice).toBeUndefined();
        expect(d.discountPercent).toBeUndefined();
        expect(d.saleEndsAt).toBeUndefined();
      }
    }
  });

  it('gạch nhập tay trở lại sau đợt; trong đợt gạch = giá gốc', async () => {
    await prisma.product.update({ where: { product_id: shirt.id }, data: { compareAtPrice: 650_000 } });
    expect((await at(T.start)).compareAtPrice).toBe(550_000);
    expect((await at(T.after)).compareAtPrice).toBe(650_000);
  });

  it('maxPrice (so với giá hiệu lực, bằng là đạt) và sort price-asc / price-desc; total + phân trang đúng', async () => {
    const ids = [shirt.id, top.id].join(',');
    // trong đợt: shirt 385.000 < top 390.000
    useClock(T.start.toISOString());
    const asc = await get(`/api/products?ids=${ids}&sort=price-asc`, { ip: freshIp() });
    expect(asc.body.items.map((i: Json) => i.slug)).toEqual([shirt.slug, top.slug]);
    const desc = await get(`/api/products?ids=${ids}&sort=price-desc`, { ip: freshIp() });
    expect(desc.body.items.map((i: Json) => i.slug)).toEqual([top.slug, shirt.slug]);
    const max400 = await get(`/api/products?ids=${ids}&maxPrice=400000`, { ip: freshIp() });
    expect(max400.body.items.map((i: Json) => i.slug).sort()).toEqual([shirt.slug, top.slug].sort());
    expect(max400.body.total).toBe(2);
    expect((await get(`/api/products?ids=${ids}&maxPrice=385000`, { ip: freshIp() })).body.items.map((i: Json) => i.slug)).toEqual([shirt.slug]);
    expect((await get(`/api/products?ids=${ids}&maxPrice=384999`, { ip: freshIp() })).body.total).toBe(0);
    // ngoài đợt: giá gốc 550.000
    useClock(T.after.toISOString());
    const asc2 = await get(`/api/products?ids=${ids}&sort=price-asc`, { ip: freshIp() });
    expect(asc2.body.items.map((i: Json) => i.slug)).toEqual([top.slug, shirt.slug]);
    const max400b = await get(`/api/products?ids=${ids}&maxPrice=400000`, { ip: freshIp() });
    expect(max400b.body.items.map((i: Json) => i.slug)).toEqual([top.slug]);
    expect(max400b.body.total).toBe(1);
    // đúng ranh giới cuối đợt vẫn giảm
    useClock(T.end.toISOString());
    expect((await get(`/api/products?ids=${ids}&maxPrice=385000`, { ip: freshIp() })).body.total).toBe(1);
  });

  it('price-asc toàn danh sách: thứ tự theo giá hiệu lực, hoà theo slug; trang 2 nối tiếp trang 1', async () => {
    useClock(T.start.toISOString());
    const all = await get('/api/products?sort=price-asc&limit=48', { ip: freshIp() });
    const prices = all.body.items.map((i: Json) => i.price);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
    const tie = all.body.items.filter((i: Json, k: number, a: Json[]) => k > 0 && a[k - 1].price === i.price);
    for (const i of tie) {
      const idx = all.body.items.indexOf(i);
      expect(all.body.items[idx - 1].slug < i.slug).toBe(true);
    }
    const p1 = await get('/api/products?sort=price-asc&limit=3&page=1', { ip: freshIp() });
    const p2 = await get('/api/products?sort=price-asc&limit=3&page=2', { ip: freshIp() });
    expect([...p1.body.items, ...p2.body.items].map((i: Json) => i.slug)).toEqual(all.body.items.slice(0, 6).map((i: Json) => i.slug));
    expect(p1.body.total).toBe(all.body.total);
    const desc = await get('/api/products?sort=price-desc&limit=48', { ip: freshIp() });
    const dp = desc.body.items.map((i: Json) => i.price);
    expect([...dp].sort((a, b) => b - a)).toEqual(dp);
  });

  it('tìm kiếm trả giá hiệu lực; sort tính cả giá khi kết hợp lọc q', async () => {
    useClock(T.start.toISOString());
    const r = await get('/api/products?q=so%20mi', { ip: freshIp() });
    const hit = r.body.items.find((i: Json) => i.slug === shirt.slug);
    expect(hit).toMatchObject({ price: 385_000, compareAtPrice: 550_000 });
  });

  it('sale=true (Should): chỉ sản phẩm ĐANG chạy đợt; sale=false / vắng không lọc; giá trị lạ 422; dải ngoài đợt rỗng', async () => {
    useClock(T.start.toISOString());
    const on = await get('/api/products?sale=true', { ip: freshIp() });
    expect(on.body.items.map((i: Json) => i.slug)).toEqual([shirt.slug]);
    expect(on.body.total).toBe(1);
    expect((await get('/api/products?sale=false&limit=48', { ip: freshIp() })).body.total).toBeGreaterThan(1);
    const bad = await get('/api/products?sale=1', { ip: freshIp() });
    expect(bad.status).toBe(422);
    expect(bad.body.error.field).toBe('sale');
    useClock(T.before.toISOString());
    expect((await get('/api/products?sale=true', { ip: freshIp() })).body.items).toEqual([]);
    useClock(T.after.toISOString());
    expect((await get('/api/products?sale=true', { ip: freshIp() })).body.total).toBe(0);
  });
});

describe('T-PROMO-03 đặt đơn lưu giá lúc đặt (AC-PROMO-03)', () => {
  beforeEach(async () => {
    await setSale(shirt.id, 385_000);
  });
  const lines = (q = 1) => [{ variantId: shirt.variant, quantity: q }];

  it('đặt COD trong đợt: unit_price 385.000, compare_at_price 550.000, tổng đúng; đơn cũ không đổi sau hết đợt', async () => {
    useClock(T.start.toISOString());
    const body = await orderBody(lines(2));
    const r = await submitOrder(body);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const item = await prisma.orderItem.findFirstOrThrow({ where: { order: { code: r.body.order.id } } });
    expect(item).toMatchObject({ unitPrice: 385_000, compareAtPrice: 550_000, quantity: 2 });
    const order = await prisma.order.findUniqueOrThrow({ where: { code: r.body.order.id } });
    expect(order.subtotal).toBe(770_000);
    expect(order.total).toBe(order.subtotal - order.discount + order.shippingFee - order.shippingDiscount);
    useClock(T.after.toISOString());
    const again = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.order_id } });
    expect(again).toMatchObject({ unitPrice: 385_000, compareAtPrice: 550_000 });
    expect((await prisma.order.findUniqueOrThrow({ where: { code: r.body.order.id } })).subtotal).toBe(770_000);
  });

  it('hết đợt giữa báo giá và đặt -> 409 price-changed (không đặt ngầm giá cũ); báo giá mới 550.000', async () => {
    useClock(T.end.toISOString());
    const body = await orderBody(lines(1));
    expect(body.expected.lines[0].unitPrice).toBe(385_000);
    useClock(T.after.toISOString());
    const r = await submitOrder(body);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('price-changed');
    expect(await prisma.order.count()).toBe(0);
    const q = await quote(lines(1));
    expect(q.body.lines[0].unitPrice).toBe(550_000);
    const fresh = await submitOrder(await orderBody(lines(1)));
    expect(fresh.status).toBe(201);
    expect((await prisma.orderItem.findFirstOrThrow({ where: { order: { code: fresh.body.order.id } } }))).toMatchObject({ unitPrice: 550_000, compareAtPrice: null });
  });

  it('báo giá trước đợt rồi vào đợt giữa chừng: cũng 409 price-changed', async () => {
    useClock(T.before.toISOString());
    const body = await orderBody(lines(1));
    expect(body.expected.lines[0].unitPrice).toBe(550_000);
    useClock(T.start.toISOString());
    const r = await submitOrder(body);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('price-changed');
  });

  it('giỏ thành viên: làm tươi giá theo giờ (trong đợt giá giảm + gạch; sau đợt giá gốc)', async () => {
    const m = await loginMember('m-promo-cart@example.com');
    useClock(T.start.toISOString());
    const add = await post('/api/cart/lines', { variantId: shirt.variant, quantity: 1 }, { cookie: m.cookie, ip: freshIp() });
    expect(add.status, JSON.stringify(add.body)).toBe(200);
    expect(add.body.cart.lines[0]).toMatchObject({ unitPrice: 385_000, compareAtPrice: 550_000 });
    useClock(T.after.toISOString());
    const view = await get('/api/cart', { cookie: m.cookie, ip: freshIp() });
    expect(view.body.lines[0].unitPrice).toBe(550_000);
    expect(view.body.lines[0].compareAtPrice).toBeUndefined();
  });

  it('free-ship theo ngưỡng tính trên tiền hàng SAU giảm đợt', async () => {
    // 3 x 385.000 = 1.155.000 >= 1.000.000 miễn phí; 2 x 385.000 = 770.000 chưa tới ngưỡng (giá gốc 2 x 550.000 = 1.100.000 sẽ đạt)
    useClock(T.start.toISOString());
    const two = await quote(lines(2));
    expect(two.body.pricing).toMatchObject({ subtotal: 770_000, shippingFee: 30_000, shippingDiscount: 0 });
    const three = await quote(lines(3));
    expect(three.body.pricing).toMatchObject({ subtotal: 1_155_000, shippingDiscount: 30_000 });
    useClock(T.after.toISOString());
    expect((await quote(lines(2))).body.pricing).toMatchObject({ subtotal: 1_100_000, shippingDiscount: 30_000 });
  });
});

describe('T-PROMO-04 voucher và "đang giảm" (AC-PROMO-04)', () => {
  it('excludeSaleItems loại dòng đang trong đợt (và dòng có gạch nhập tay); voucher thường tính trên giá hiệu lực', async () => {
    await setSale(shirt.id, 385_000);
    const dress = await vid('after-hours-dress', 'Đỏ', 'S'); // 890.000, gạch 1.090.000 (đang giảm nhập tay)
    await makeVoucher({ code: 'XSALE', kind: 'percent', value: 10, excludeSaleItems: true });
    await makeVoucher({ code: 'ALLV', kind: 'percent', value: 10 });
    useClock(T.start.toISOString());
    const inSale = await quote([{ variantId: shirt.variant, quantity: 1 }], ['XSALE']);
    expect(inSale.body.rejectedVouchers[0].reason).toBe('excluded-sale-items');
    const mixed = await quote([{ variantId: shirt.variant, quantity: 1 }, { variantId: top.variant, quantity: 1 }], ['XSALE']);
    expect(mixed.body.pricing.discount).toBe(39_000); // chỉ trên off-duty-top 390.000
    const manual = await quote([{ variantId: dress, quantity: 1 }], ['XSALE']);
    expect(manual.body.rejectedVouchers[0].reason).toBe('excluded-sale-items');
    const all = await quote([{ variantId: shirt.variant, quantity: 1 }, { variantId: top.variant, quantity: 1 }], ['ALLV']);
    expect(all.body.pricing.subtotal).toBe(385_000 + 390_000);
    expect(all.body.pricing.discount).toBe(77_000); // 10% x 775.000 làm tròn xuống tới 1.000
    // sau đợt: dòng không còn "đang giảm" nên không bị loại
    useClock(T.after.toISOString());
    const after = await quote([{ variantId: shirt.variant, quantity: 1 }], ['XSALE']);
    expect(after.body.rejectedVouchers ?? []).toEqual([]);
    expect(after.body.pricing.discount).toBe(55_000);
  });
});

describe('T-PROMO-10 MỘT hàm: cùng một số ở mọi nơi', () => {
  it('danh sách, chi tiết, tìm kiếm, gợi ý (nếu có), giỏ, báo giá, đơn, admin: đều 385.000 trong đợt và 550.000 ngoài đợt', async () => {
    await setSale(shirt.id, 385_000);
    const m = await loginMember('m-promo-one@example.com');
    for (const [when, expected] of [[T.start, 385_000], [T.end, 385_000], [T.after, 550_000], [T.before, 550_000]] as const) {
      useClock(when.toISOString());
      const seen: Record<string, number> = {};
      seen.detail = (await detail(shirt.slug)).price;
      seen.list = (await get(`/api/products?ids=${shirt.id}`, { ip: freshIp() })).body.items[0].price;
      seen.search = (await get('/api/products?q=so%20mi&limit=48', { ip: freshIp() })).body.items.find((i: Json) => i.slug === shirt.slug).price;
      seen.sorted = (await get('/api/products?sort=price-asc&limit=48', { ip: freshIp() })).body.items.find((i: Json) => i.slug === shirt.slug).price;
      const reco = await get(`/api/recommendations?ids=${top.id}&limit=8`, { ip: freshIp() });
      const recoHit = reco.status === 200 ? (reco.body.items as Json[]).find((i) => i.slug === shirt.slug) : undefined;
      if (recoHit) seen.recommendations = recoHit.price;
      await post('/api/cart/lines', { variantId: shirt.variant, quantity: 1 }, { cookie: m.cookie, ip: freshIp() });
      seen.cart = (await get('/api/cart', { cookie: m.cookie, ip: freshIp() })).body.lines.find((l: Json) => l.variantId === shirt.variant).unitPrice;
      seen.quote = (await quote([{ variantId: shirt.variant, quantity: 1 }])).body.lines[0].unitPrice;
      for (const [k, v] of Object.entries(seen)) expect(v, `${when.toISOString()} ${k}`).toBe(expected);
      await prisma.cartLine.deleteMany({});
    }
    useClock(T.start.toISOString());
    const order = await submitOrder(await orderBody([{ variantId: shirt.variant, quantity: 1 }]));
    expect(order.status).toBe(201);
    expect((await prisma.orderItem.findFirstOrThrow({ where: { order: { code: order.body.order.id } } })).unitPrice).toBe(385_000);
    vi.useRealTimers();
    expect((await adminDetail(shirt.id)).saleState).toBe('upcoming'); // giờ thật trước D
  });
});

describe('T-PROMO-07 giảm hàng loạt (Should) (AC-PROMO-07)', () => {
  const bulk = (path: string, body: Json, cookie = A()) => aPost(`/sales/${path}`, body, cookie);
  const today = new Date().toISOString().slice(0, 10);
  const plus = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const input = (over: Json = {}) => ({ category: 'tops', percent: 30, startsOn: plus(0), endsOn: plus(6), ...over });

  it('xem trước: không ghi; áp: salePrice làm tròn XUỐNG bội 1.000; sản phẩm đang có đợt chạy bị bỏ qua và liệt kê', async () => {
    const tops = await prisma.product.findMany({ where: { status: 'ACTIVE', category: { slug: 'tops' } }, orderBy: { slug: 'asc' } });
    expect(tops.length).toBeGreaterThanOrEqual(2);
    const running = tops[0];
    await setSale(running.product_id, Math.floor(Number(running.price) * 0.5 / 1000) * 1000, new Date(Date.now() - 86_400_000), new Date(Date.now() + 86_400_000));
    const odd = await prisma.product.update({ where: { product_id: tops[1].product_id }, data: { price: 1_111_111 } });
    const prev = await bulk('bulk/preview', input());
    expect(prev.status, JSON.stringify(prev.body)).toBe(200);
    expect(prev.headers['cache-control']).toBe('no-store');
    expect(prev.body.applied).toBe(0);
    expect(prev.body.skipped).toEqual([expect.objectContaining({ productId: running.product_id, reason: 'sale-running' })]);
    expect(prev.body.applicable.map((i: Json) => i.slug)).toEqual(tops.slice(1).map((t) => t.slug)); // sắp theo slug
    const oddItem = prev.body.applicable.find((i: Json) => i.productId === odd.product_id);
    expect(oddItem.salePrice).toBe(Math.floor((1_111_111 * 70) / 100 / 1000) * 1000); // 777.000
    expect(oddItem.salePrice % 1000).toBe(0);
    expect(await prisma.product.count({ where: { salePrice: { not: null } } })).toBe(1);
    const applied = await bulk('bulk', input());
    expect(applied.status).toBe(200);
    expect(applied.body.applied).toBe(tops.length - 1);
    const row = await prisma.product.findUniqueOrThrow({ where: { product_id: odd.product_id } });
    expect(Number(row.salePrice)).toBe(777_000);
    expect(row.saleStartsAt!.getTime()).toBe(Date.parse(`${plus(0)}T00:00:00+07:00`));
    expect(row.saleEndsAt!.getTime()).toBe(Date.parse(`${plus(6)}T23:59:59+07:00`));
    expect(row.updatedById).toBe(admin.user.user_id);
    // sản phẩm đang chạy giữ nguyên
    expect(Number((await prisma.product.findUniqueOrThrow({ where: { product_id: running.product_id } })).salePrice)).toBe(Math.floor(Number(running.price) * 0.5 / 1000) * 1000);
    // sale=true thấy cả hai
    expect((await get('/api/products?sale=true&limit=48', { ip: freshIp() })).body.total).toBe(tops.length);
  });

  it('% 4 / 71 -> 422 percent; 5 / 70 hợp lệ; ngày sai; danh mục lạ; staff 403', async () => {
    for (const percent of [4, 71, 30.5, '30']) {
      const r = await bulk('bulk/preview', input({ percent }));
      expect(r.status, String(percent)).toBe(422);
      expect(r.body.error.field).toBe('percent');
    }
    expect((await bulk('bulk/preview', input({ percent: 5 }))).status).toBe(200);
    expect((await bulk('bulk/preview', input({ percent: 70 }))).status).toBe(200);
    expect((await bulk('bulk/preview', input({ endsOn: plus(-1) }))).body.error.field).toBe('endsOn');
    expect((await bulk('bulk/preview', input({ endsOn: plus(90) }))).body.error.field).toBe('endsOn');
    expect((await bulk('bulk/preview', input({ endsOn: plus(89) }))).status).toBe(200);
    expect((await bulk('bulk/preview', input({ startsOn: '2026-13-01' }))).body.error.field).toBe('startsOn');
    expect((await bulk('bulk/preview', input({ category: 'shoes' }))).body.error.field).toBe('category');
    expect((await bulk('bulk/preview', input(), staff.cookie)).status).toBe(403);
    expect((await bulk('bulk', input(), staff.cookie)).status).toBe(403);
    expect((await bulk('bulk', input(), '')).status).toBe(401);
  });

  it('giá dưới mức tối thiểu bị bỏ qua (below-minimum)', async () => {
    const cheap = await prisma.product.update({ where: { slug: 'weekend-shirt' }, data: { price: 1000 } });
    const r = await bulk('bulk/preview', input({ percent: 5 }));
    const item = r.body.skipped.find((i: Json) => i.productId === cheap.product_id);
    expect(item).toMatchObject({ reason: 'below-minimum', salePrice: null });
  });

  it('áp lúc một sản phẩm lỗi giữa chừng: KHÔNG sản phẩm nào đổi (tất cả hoặc không)', async () => {
    const real = writer.writeBulkSale;
    let calls = 0;
    vi.spyOn(writer, 'writeBulkSale').mockImplementation(async (tx, items, s, e, actor, at) => {
      calls++;
      // ghi sản phẩm đầu rồi ném lỗi
      await real(tx, items.slice(0, 1), s, e, actor, at);
      throw new Error('boom');
    });
    const r = await bulk('bulk', input());
    expect(calls).toBe(1);
    expect(r.status).toBe(500);
    expect(await prisma.product.count({ where: { salePrice: { not: null } } })).toBe(0);
  });
});
