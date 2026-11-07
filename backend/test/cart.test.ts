import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { del, get, loginMember, post, prisma, put, resetCheckout, resetState, setStock, useClock, vid } from './helpers';

let member: Awaited<ReturnType<typeof loginMember>>;
let blackS: string; // blazer Đen/S tồn 5
let blackM: string; // blazer Đen/M tồn 5
let top: string;

beforeEach(async () => {
  vi.useRealTimers();
  await resetState();
  await resetCheckout();
  member = await loginMember('cart@example.com');
  blackS = await vid('the-everyday-blazer', 'Đen', 'S');
  blackM = await vid('the-everyday-blazer', 'Đen', 'M');
  top = await vid('off-duty-top', 'Trắng', 'S');
});

const c = () => ({ cookie: member.cookie });
const add = (variantId: string, quantity: number) => post('/api/cart/lines', { variantId, quantity }, c());
const key = () => randomUUID();
const merge = (lines: unknown[], k = key()) => post('/api/cart/merge', { lines }, { ...c(), headers: { 'Idempotency-Key': k } });
const qtyOf = (body: { cart: { lines: Array<{ variantId: string; requestedQuantity: number }> } }, id: string) =>
  body.cart.lines.find((l) => l.variantId === id)?.requestedQuantity;

describe('T-CART-01 thao tác giỏ', () => {
  it('401 khi không có phiên', async () => {
    expect((await get('/api/cart')).status).toBe(401);
    expect((await post('/api/cart/lines', { variantId: top, quantity: 1 })).body.error.code).toBe('unauthenticated');
  });

  it('thêm: cộng dồn, cắt 5, không có notice khi đủ', async () => {
    const a = await add(blackS, 2);
    expect(a.status).toBe(200);
    expect(a.headers['cache-control']).toBe('no-store');
    expect(a.body.notice).toBeNull();
    expect(qtyOf(a.body, blackS)).toBe(2);
    const b = await add(blackS, 2);
    expect(qtyOf(b.body, blackS)).toBe(4);
    const cut = await add(blackS, 3);
    expect(qtyOf(cut.body, blackS)).toBe(5);
    expect(cut.body.notice).toEqual({ code: 'per-variant-limit', variantId: blackS, adjustedTo: 5 });
    expect(cut.body.cart.policy).toMatchObject({ maxCartLines: 30, cartRetentionDays: 30 });
  });

  it('cắt theo tồn có notice stock-limit; hết hàng / ngừng bán -> 409 stock-changed', async () => {
    await setStock(top, 2);
    const a = await add(top, 4);
    expect(qtyOf(a.body, top)).toBe(2);
    expect(a.body.notice).toEqual({ code: 'stock-limit', variantId: top, adjustedTo: 2 });
    await setStock(top, 0);
    const b = await add(top, 1);
    expect(b.status).toBe(409);
    expect(b.body.error).toMatchObject({ code: 'stock-changed', stockIssues: [{ variantId: top, available: 0 }] });
    expect((await add('11111111-1111-4111-8111-111111111111', 1)).status).toBe(409);
    expect((await post('/api/cart/lines', { variantId: 'abc', quantity: 1 }, c())).body.error.field).toBe('variantId');
    expect((await post('/api/cart/lines', { variantId: top, quantity: 6 }, c())).status).toBe(422);
  });

  it('đặt số lượng, 404 khi dòng không có, xoá idempotent', async () => {
    expect((await put(`/api/cart/lines/${top}`, { quantity: 2 }, c())).status).toBe(404);
    await add(top, 1);
    const s = await put(`/api/cart/lines/${top}`, { quantity: 3 }, c());
    expect(qtyOf(s.body, top)).toBe(3);
    await setStock(top, 4);
    const cut = await put(`/api/cart/lines/${top}`, { quantity: 5 }, c());
    expect(cut.body.notice).toEqual({ code: 'stock-limit', variantId: top, adjustedTo: 4 });
    const rm = await del(`/api/cart/lines/${top}`, c());
    expect(rm.status).toBe(200);
    expect(rm.body.cart.lines).toEqual([]);
    expect(rm.body.cart.expiresAt).toBeNull();
    expect((await del(`/api/cart/lines/${top}`, c())).status).toBe(200);
  });

  it('dòng thứ 31 -> 422 validation field variantId', async () => {
    const variants = await prisma.productVariant.findMany({ where: { inventoryQty: { gt: 0 } }, orderBy: { sku: 'asc' }, take: 31 });
    for (const v of variants.slice(0, 30)) expect((await add(v.variant_id, 1)).status).toBe(200);
    const r = await add(variants[30].variant_id, 1);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatchObject({ code: 'validation', field: 'variantId', message: 'Giỏ hàng tối đa 30 sản phẩm khác nhau.' });
    expect((await add(variants[0].variant_id, 1)).status).toBe(200); // dòng đã có vẫn cộng được
  });

  it('change-variant: cùng sản phẩm, 422 khác sản phẩm, 409 hết hàng', async () => {
    await add(blackS, 2);
    const r = await post(`/api/cart/lines/${blackS}/change-variant`, { toVariantId: blackM }, c());
    expect(r.status).toBe(200);
    expect(r.body.notice).toBeNull();
    expect(qtyOf(r.body, blackM)).toBe(2);
    expect(qtyOf(r.body, blackS)).toBeUndefined();
    const other = await post(`/api/cart/lines/${blackM}/change-variant`, { toVariantId: top }, c());
    expect(other.status).toBe(422);
    expect(other.body.error.field).toBe('toVariantId');
    const xl = await vid('the-everyday-blazer', 'Đen', 'XL');
    expect((await post(`/api/cart/lines/${blackM}/change-variant`, { toVariantId: xl }, c())).status).toBe(409);
    expect((await post(`/api/cart/lines/${blackS}/change-variant`, { toVariantId: blackM }, c())).status).toBe(404);
  });
});

describe('T-CART-02 change-variant gộp', () => {
  it('Đen/S x4 + Đen/M x3 -> Đen/S = 5, notice merged adjustedTo 5', async () => {
    await add(blackS, 4);
    await add(blackM, 3);
    const r = await post(`/api/cart/lines/${blackM}/change-variant`, { toVariantId: blackS }, c());
    expect(r.body.notice).toEqual({ code: 'merged', variantId: blackS, adjustedTo: 5 });
    expect(r.body.cart.lines).toHaveLength(1);
    expect(qtyOf(r.body, blackS)).toBe(5);
  });
});

describe('T-CART-03 GET /cart làm tươi, không sửa', () => {
  it('giá đổi, tồn giảm, DRAFT, id lạ: trả trạng thái mới nhưng giữ requestedQuantity', async () => {
    await add(blackS, 4);
    await add(top, 3);
    const shirt = await vid('weekend-shirt', 'Trắng', 'S');
    await add(shirt, 1);
    await prisma.product.update({ where: { slug: 'off-duty-top' }, data: { price: 400000 } });
    await setStock(blackS, 2);
    await prisma.product.update({ where: { slug: 'weekend-shirt' }, data: { status: 'DRAFT' } });
    const r = await get('/api/cart', c());
    const by = Object.fromEntries(r.body.lines.map((l: { variantId: string }) => [l.variantId, l]));
    expect(by[top]).toMatchObject({ unitPrice: 400000, requestedQuantity: 3, effectiveQuantity: 3 });
    expect(by[blackS]).toMatchObject({ requestedQuantity: 4, effectiveQuantity: 2, maxQuantity: 2, limitedBy: 'stock', availability: 'low-stock' });
    expect(by[shirt]).toMatchObject({ availability: 'discontinued', effectiveQuantity: 0, maxQuantity: 0 });
    const stored = await prisma.cartLine.findFirstOrThrow({ where: { variantId: blackS } });
    expect(stored.quantity).toBe(4); // GET không sửa
  });
});

describe('T-CART-04 hạn 30 ngày, nhiều thiết bị', () => {
  it('giỏ 31 ngày rỗng, 29 ngày còn; hai thiết bị cùng thấy 2 dòng', async () => {
    useClock('2026-11-01T03:00:00Z');
    await add(blackS, 1);
    await add(top, 1);
    const again = await get('/api/cart', c()); // "thiết bị 2" dùng cùng tài khoản
    expect(again.body.lines).toHaveLength(2);
    expect(again.body.expiresAt).toBe('2026-12-01T03:00:00.000Z');
    useClock('2026-11-30T03:00:00Z'); // 29 ngày
    expect((await get('/api/cart', c())).body.lines).toHaveLength(2);
    useClock('2026-12-02T03:00:01Z'); // 31 ngày
    const gone = await get('/api/cart', c());
    expect(gone.body).toMatchObject({ lines: [], expiresAt: null });
    expect(await prisma.cartLine.count()).toBe(0);
  });

  it('thao tác ghi sau 31 ngày bắt đầu từ giỏ rỗng', async () => {
    useClock('2026-11-01T03:00:00Z');
    await add(blackS, 1);
    useClock('2026-12-05T03:00:00Z');
    const r = await add(top, 1);
    expect(r.body.cart.lines.map((l: { variantId: string }) => l.variantId)).toEqual([top]);
  });
});

describe('T-CART-05..07 merge', () => {
  it('T-CART-05: X x2 + Y; khách X x2 + Z + id lạ -> X = 4, Y, Z', async () => {
    const x = blackS;
    const y = blackM;
    const z = top;
    await add(x, 2);
    await add(y, 1);
    const unknown = '22222222-2222-4222-8222-222222222222';
    const r = await merge([{ variantId: x, quantity: 2 }, { variantId: z, quantity: 1 }, { variantId: unknown, quantity: 1 }]);
    expect(r.status).toBe(200);
    expect(r.headers['idempotency-replayed']).toBeUndefined();
    expect(qtyOf(r.body, x)).toBe(4);
    expect(qtyOf(r.body, y)).toBe(1);
    expect(qtyOf(r.body, z)).toBe(1);
    expect([...r.body.mergedVariantIds].sort()).toEqual([x, z].sort());
    expect(r.body.skippedVariantIds).toEqual([unknown]);
    expect(r.body.addedCount).toBe(2);
    expect(r.body.evicted).toEqual([]);
  });

  it('T-CART-06: cắt X = 5; 29 dòng + 3 dòng mới -> 30 dòng, evicted là dòng cũ nhất', async () => {
    await add(blackS, 4);
    expect(qtyOf(await merge([{ variantId: blackS, quantity: 4 }]).then((r) => r.body), blackS)).toBe(5);

    await prisma.cartLine.deleteMany();
    const cart = await prisma.cart.findFirstOrThrow();
    const vs = await prisma.productVariant.findMany({ where: { inventoryQty: { gt: 0 } }, orderBy: { sku: 'asc' }, take: 32 });
    const base = Date.now();
    for (let i = 0; i < 29; i++) {
      await prisma.cartLine.create({
        data: { cartId: cart.cart_id, variantId: vs[i].variant_id, quantity: 1, updatedAt: new Date(base - (100 - i) * 60_000) },
      });
    }
    const r = await merge(vs.slice(29, 32).map((v) => ({ variantId: v.variant_id, quantity: 1 })));
    expect(r.status).toBe(200);
    expect(r.body.cart.lines).toHaveLength(30);
    expect(r.body.addedCount).toBe(3);
    expect(r.body.evicted.map((e: { variantId: string }) => e.variantId)).toEqual([vs[0].variant_id, vs[1].variant_id]);
    expect(r.body.evicted[0]).toHaveProperty('productId');
    expect(await prisma.cartLine.count()).toBe(30);
  });

  it('T-CART-07: cùng Idempotency-Key hai lần -> phát lại, giỏ không đổi', async () => {
    const k = key();
    const lines = [{ variantId: top, quantity: 2 }];
    const a = await merge(lines, k);
    const b = await merge(lines, k);
    expect(b.status).toBe(200);
    expect(b.headers['idempotency-replayed']).toBe('true');
    expect(qtyOf(a.body, top)).toBe(2);
    expect(qtyOf(b.body, top)).toBe(2);
    expect(b.body.mergedVariantIds).toEqual([top]);
    const c2 = await merge([{ variantId: top, quantity: 3 }], k);
    expect(c2.status).toBe(409);
    expect(c2.body.error.code).toBe('idempotency-conflict');
  });

  it('T-CART-07: hai lần đồng thời cùng khoá -> chỉ cộng một lần', async () => {
    const k = key();
    const lines = [{ variantId: top, quantity: 2 }];
    const [a, b] = await Promise.all([merge(lines, k), merge(lines, k)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([a.headers['idempotency-replayed'], b.headers['idempotency-replayed']].filter(Boolean)).toEqual(['true']);
    const line = await prisma.cartLine.findFirstOrThrow({ where: { variantId: top } });
    expect(line.quantity).toBe(2);
  });

  it('validation: thiếu / sai Idempotency-Key, lines rỗng, trùng, quá 5', async () => {
    const bad = await post('/api/cart/merge', { lines: [{ variantId: top, quantity: 1 }] }, { ...c(), headers: { 'Idempotency-Key': 'ngan' } });
    expect(bad.status).toBe(422);
    expect(bad.body.error.field).toBe('Idempotency-Key');
    expect((await post('/api/cart/merge', { lines: [{ variantId: top, quantity: 1 }] }, c())).body.error.field).toBe('Idempotency-Key');
    expect((await merge([])).status).toBe(422);
    expect((await merge([{ variantId: top, quantity: 1 }, { variantId: top, quantity: 1 }])).status).toBe(422);
    expect((await merge([{ variantId: top, quantity: 6 }])).status).toBe(422);
  });

  it('dòng hết hàng vẫn mang sang khi gộp (không cắt theo tồn)', async () => {
    await setStock(top, 0);
    const r = await merge([{ variantId: top, quantity: 3 }]);
    expect(r.body.mergedVariantIds).toEqual([top]);
    expect(r.body.cart.lines[0]).toMatchObject({ requestedQuantity: 3, availability: 'out-of-stock', effectiveQuantity: 0 });
  });
});
