import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetCheckoutRateLimits } from '../src/middleware/rate-limit';
import {
  aDel, aGet, aPost, aPut, adminPost, get, loginAdmin, loginStaff, makeOrder, makeProduct, newKey, orderBody, prisma, resetCheckout, resetState,
  stockOf, submitOrder,
} from './helpers';

/**
 * Lát 6.5 + 6.7 BE: tồn kho (T-INV-50..58, 70..72) và test đua với đặt hàng (T-INV-54, AC-INV-33).
 * Khoá dòng biến thể: điều chỉnh tay, đặt hàng, huỷ đơn tuần tự hoá trên cùng dòng `product_variants`.
 */

let admin: Awaited<ReturnType<typeof loginAdmin>>;
let staff: Awaited<ReturnType<typeof loginStaff>>;

beforeAll(async () => {
  await resetState();
  await resetCheckout();
  admin = await loginAdmin('admin-i@nine2fine.test', { firstName: 'Quản', lastName: 'Trị' });
  staff = await loginStaff('staff-i@nine2fine.test', { firstName: 'Lan', lastName: 'Trần' });
});
beforeEach(async () => {
  vi.useRealTimers();
  resetCheckoutRateLimits();
  await prisma.$executeRawUnsafe('UPDATE "store_settings" SET "low_stock_default" = 5');
  await prisma.$executeRawUnsafe('UPDATE "product_variants" SET "low_stock_threshold" = NULL');
});

const A = () => admin.cookie;
const S = () => staff.cookie;
let nameSeq = 0;
/** Sản phẩm ACTIVE với tên duy nhất (token tìm kiếm riêng) để các ca không lẫn với catalog seed. */
async function product(qtys: number[], opts: { name?: string; sizes?: string[] } = {}) {
  const n = ++nameSeq;
  const word = opts.name ?? `zebra${n}`;
  const sizes = opts.sizes ?? ['S', 'M', 'L', 'XL'];
  const p = await makeProduct({
    status: 'ACTIVE',
    name: `Áo ${word}`,
    variants: qtys.map((q, i) => ({ sku: `ZB${n}-${i}-${sizes[i % sizes.length]}`.toUpperCase(), size: sizes[i % sizes.length], qty: q })),
  });
  return { ...p, word };
}
const adj = (cookie: string, variantId: string, body: unknown, key: string | null = newKey()) =>
  aPost(`/inventory/${variantId}/adjustments`, body, cookie, key === null ? undefined : { 'Idempotency-Key': key });
const item = async (sku: string) => {
  const r = await aGet(`/inventory?q=${encodeURIComponent(sku)}`, S());
  expect(r.status).toBe(200);
  return r.body.items.find((i: { sku: string }) => i.sku === sku);
};
const logRows = (variantId: string) => prisma.inventoryAdjustment.findMany({ where: { variantId }, orderBy: [{ at: 'asc' }] });
let phoneSeq = 0;
const phone = () => `09${String(10_000_000 + ++phoneSeq).slice(-8)}`;
const placeOne = async (variantId: string, quantity: number) => {
  const p = phone();
  const body = await orderBody([{ variantId, quantity }], { phone: p, email: `k${p}@example.com` });
  return submitOrder(body);
};

describe('T-INV-50 AC-INV-29: Trong kho / Đang giữ / Có thể bán / trạng thái', () => {
  it('đang giữ chỉ tính to_pay, to_ship, cancel_requested; ngưỡng mặc định 5', async () => {
    const p = await product([10]);
    const v = p.variants[0];
    await makeOrder({ status: 'to_ship', items: [{ variantId: v.id, quantity: 2 }] });
    await makeOrder({ status: 'to_pay', items: [{ variantId: v.id, quantity: 1 }] });
    await makeOrder({ status: 'completed', items: [{ variantId: v.id, quantity: 4 }] });
    await makeOrder({ status: 'cancelled', items: [{ variantId: v.id, quantity: 4 }], data: { cancelledAt: new Date(), cancelledBy: 'shop', cancelReasonCode: 'declined_on_call' } });
    const r = await aGet(`/inventory?q=${v.sku}`, S());
    expect(r.headers['cache-control']).toMatch(/no-store/);
    expect(r.body.items[0]).toMatchObject({
      variantId: v.id, productId: p.id, sku: v.sku, onHand: 13, reserved: 3, available: 10, status: 'in',
      lowStockThreshold: 5, thresholdCustom: false, category: 'tops', productStatus: 'active',
    });
    expect(r.body.items[0].color).toEqual({ name: 'Đen', hex: '#000000' });
    await prisma.productVariant.update({ where: { variant_id: v.id }, data: { inventoryQty: 5 } });
    expect((await item(v.sku)).status).toBe('low');
    await prisma.productVariant.update({ where: { variant_id: v.id }, data: { inventoryQty: 0 } });
    expect(await item(v.sku)).toMatchObject({ status: 'out', available: 0, onHand: 3 });
  });
});

describe('T-INV-51 AC-INV-30: lọc, tìm, đếm tab', () => {
  it('tab low đếm đúng, lọc màu + size, tìm SKU, counts = số dòng', async () => {
    const p = await makeProduct({
      status: 'ACTIVE', name: 'Áo Quokka',
      variants: [
        { sku: 'QK-DEN-S', color: 'Đen', size: 'S', qty: 1 },
        { sku: 'QK-DEN-M', color: 'Đen', size: 'M', qty: 2 },
        { sku: 'QK-TRANG-S', color: 'Trắng', hex: '#FFFFFF', size: 'S', qty: 5 },
        { sku: 'QK-TRANG-M', color: 'Trắng', hex: '#FFFFFF', size: 'M', qty: 4 },
        { sku: 'QK-BE-L', color: 'Be', hex: '#F5F5DC', size: 'L', qty: 0 },
        { sku: 'QK-BE-XL', color: 'Be', hex: '#F5F5DC', size: 'XL', qty: 50 },
      ],
    });
    void p;
    const low = await aGet('/inventory?q=quokka&view=low', S());
    expect(low.body.total).toBe(4);
    expect(low.body.items.map((i: { sku: string }) => i.sku)).toEqual(['QK-DEN-S', 'QK-DEN-M', 'QK-TRANG-M', 'QK-TRANG-S']); // có thể bán tăng, rồi SKU
    const f = await aGet('/inventory?q=quokka&color=đen&size=M', S());
    expect(f.body.items.map((i: { sku: string }) => i.sku)).toEqual(['QK-DEN-M']);
    expect((await aGet('/inventory?q=qk-be-l', S())).body.items.map((i: { sku: string }) => i.sku)).toEqual(['QK-BE-L']);
    const facets = await aGet('/inventory/facets?q=quokka', S());
    expect(facets.body.counts).toEqual({ all: 6, in: 1, low: 4, out: 1 });
    for (const view of ['all', 'in', 'low', 'out'] as const) {
      const page = await aGet(`/inventory?q=quokka&view=${view}`, S());
      expect(page.body.items.length).toBe(facets.body.counts[view]);
      expect(page.body.total).toBe(facets.body.counts[view]);
    }
    // Phân trang + 422
    const pg = await aGet('/inventory?q=quokka&limit=2&page=3', S());
    expect(pg.body).toMatchObject({ total: 6, page: 3, limit: 2 });
    expect(pg.body.items).toHaveLength(2);
    for (const [qs, field] of [['limit=101', 'limit'], ['limit=0', 'limit'], ['page=0', 'page'], ['size=XXL', 'size'], [`q=${'a'.repeat(101)}`, 'q'], ['view=zzz', 'view']] as const) {
      const r = await aGet(`/inventory?${qs}`, S());
      expect(r.status, qs).toBe(422);
      expect(r.body.error).toMatchObject({ code: 'validation', field });
    }
  });
});

describe('T-INV-52 AC-INV-31: delta và set', () => {
  it('received, damaged vượt, set không đổi, set dưới đang giữ, set hợp lệ, delta ngoài khoảng', async () => {
    const p = await product([10]);
    const v = p.variants[0];
    await makeOrder({ status: 'to_ship', items: [{ variantId: v.id, quantity: 3 }] });
    const ok = await adj(S(), v.id, { mode: 'delta', quantity: 5, reason: 'received', note: 'Nhập lô 12' });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body).toMatchObject({ available: 15, reserved: 3, onHand: 18, status: 'in' });
    expect(ok.headers['cache-control']).toMatch(/no-store/);

    const over = await adj(S(), v.id, { mode: 'delta', quantity: -16, reason: 'damaged' });
    expect(over.status).toBe(422);
    expect(over.body.error).toMatchObject({ code: 'validation', field: 'quantity' });
    expect(over.body.error.message).toContain('Chỉ còn 15');

    const same = await adj(S(), v.id, { mode: 'set', quantity: 18, reason: 'count', expectedAvailable: 15 });
    expect(same.status).toBe(422);
    expect(same.body.error).toMatchObject({ field: 'quantity' });
    expect(same.body.error.message).toContain('không thay đổi');

    const low = await adj(S(), v.id, { mode: 'set', quantity: 2, reason: 'count', expectedAvailable: 15 });
    expect(low.status).toBe(422);
    expect(low.body.error.message).toContain('thấp hơn 3');

    const good = await adj(S(), v.id, { mode: 'set', quantity: 20, reason: 'count', expectedAvailable: 15 });
    expect(good.status).toBe(200);
    expect(good.body).toMatchObject({ available: 17, reserved: 3, onHand: 20 });

    for (const quantity of [10_001, 0]) {
      const r = await adj(S(), v.id, { mode: 'delta', quantity, reason: 'received' });
      expect(r.status, `delta ${quantity}`).toBe(422);
      expect(r.body.error.field).toBe('quantity');
    }
    // Vượt 100.000
    await prisma.productVariant.update({ where: { variant_id: v.id }, data: { inventoryQty: 95_000 } });
    const cap = await adj(S(), v.id, { mode: 'delta', quantity: 6_000, reason: 'received' });
    expect(cap.status).toBe(422);
    expect(cap.body.error).toMatchObject({ field: 'quantity' });
    // chỉ 2 điều chỉnh thành công có dòng nhật ký
    expect(await logRows(v.id)).toHaveLength(2);
  });
});

describe('T-INV-53 AC-INV-32: cặp lý do / cách / dấu / ghi chú', () => {
  it('sai cặp -> 422 reason; correction cần note 5..200', async () => {
    const p = await product([10]);
    const v = p.variants[0];
    const bad: Array<[Record<string, unknown>, string]> = [
      [{ mode: 'delta', quantity: -2, reason: 'received' }, 'reason'],
      [{ mode: 'delta', quantity: 2, reason: 'damaged' }, 'reason'],
      [{ mode: 'delta', quantity: -2, reason: 'return' }, 'reason'],
      [{ mode: 'delta', quantity: 3, reason: 'count' }, 'reason'],
      [{ mode: 'set', quantity: 12, reason: 'received', expectedAvailable: 10 }, 'reason'],
      [{ mode: 'delta', quantity: 2, reason: 'correction' }, 'note'],
      [{ mode: 'delta', quantity: 2, reason: 'correction', note: 'abc' }, 'note'],
      [{ mode: 'delta', quantity: 2, reason: 'received', note: 'x'.repeat(201) }, 'note'],
      [{ mode: 'set', quantity: 12, reason: 'count' }, 'expectedAvailable'],
      [{ mode: 'move', quantity: 1, reason: 'count' }, 'mode'],
      [{ mode: 'delta', quantity: 1.5, reason: 'received' }, 'quantity'],
      [{ mode: 'delta', quantity: 2, reason: 'sold' }, 'reason'],
    ];
    for (const [body, field] of bad) {
      const r = await adj(S(), v.id, body);
      expect(r.status, JSON.stringify(body)).toBe(422);
      expect(r.body.error, JSON.stringify(body)).toMatchObject({ code: 'validation', field });
    }
    expect(await stockOf(v.id)).toBe(10);
    expect(await logRows(v.id)).toHaveLength(0);
    // Hợp lệ: correction + note, nhật ký chụp người + vai trò; trường lạ bị bỏ qua.
    const ok = await adj(S(), v.id, { mode: 'delta', quantity: -1, reason: 'correction', note: '  Sửa   nhầm lô ', foo: 1 });
    expect(ok.status).toBe(200);
    const [row] = await logRows(v.id);
    expect(row).toMatchObject({ delta: -1, availableAfter: 9, reason: 'correction', note: 'Sửa nhầm lô', actorName: 'Trần Lan', actorRole: 'staff', actorUserId: staff.user.user_id });
  });

  it('id lạ / sai dạng 404; thiếu hoặc sai Idempotency-Key 422; staff không đổi ngưỡng', async () => {
    const unknown = '00000000-0000-4000-8000-000000000000';
    expect((await adj(S(), unknown, { mode: 'delta', quantity: 1, reason: 'received' })).status).toBe(404);
    expect((await adj(S(), 'abc', { mode: 'delta', quantity: 1, reason: 'received' })).status).toBe(404);
    const p = await product([3]);
    for (const key of [null, 'short', 'x'.repeat(65), 'khoa-co-ky-tu-la-!!!!!!!!']) {
      const r = await adj(S(), p.variants[0].id, { mode: 'delta', quantity: 1, reason: 'received' }, key);
      expect(r.status, String(key)).toBe(422);
      expect(r.body.error).toMatchObject({ code: 'validation', field: 'Idempotency-Key' });
    }
    const t = await aPost('/inventory/thresholds', {}, S());
    expect(t.status).toBe(404); // PUT là phương thức đúng: POST không có route
    expect((await aPut('/inventory/thresholds', { defaultThreshold: 8 }, S())).status).toBe(403);
    expect((await aGet('/inventory/facets', S())).status).toBe(200);
  });
});

describe('T-INV-54 AC-INV-33: đua điều chỉnh với đặt hàng (khoá dòng biến thể)', () => {
  const N = 20;
  it(`x${N}: tồn 3, 3 khách đặt 1 + 3 điều chỉnh -1 + 1 nhập +1: không âm, nhật ký khớp, không 500`, async () => {
    const p = await product([3]);
    const v = p.variants[0];
    let ordersOk = 0;
    let damagedOk = 0;
    for (let i = 0; i < N; i++) {
      resetCheckoutRateLimits();
      await prisma.productVariant.update({ where: { variant_id: v.id }, data: { inventoryQty: 3 } });
      await prisma.inventoryAdjustment.deleteMany({ where: { variantId: v.id } });
      const phones = [phone(), phone(), phone()];
      const bodies = await Promise.all(phones.map((ph) => orderBody([{ variantId: v.id, quantity: 1 }], { phone: ph, email: `k${ph}@example.com` })));
      const ordersBefore = await prisma.order.count();
      const rs = await Promise.all([
        ...bodies.map((b) => submitOrder(b)),
        ...[0, 1, 2].map(() => adj(i % 2 ? S() : A(), v.id, { mode: 'delta', quantity: -1, reason: 'damaged' })),
        adj(A(), v.id, { mode: 'delta', quantity: 1, reason: 'received' }),
      ]);
      expect(rs.filter((r) => r.status >= 500).map((r) => r.body)).toEqual([]);
      const orders = rs.slice(0, 3);
      const damaged = rs.slice(3, 6);
      const received = rs[6];
      for (const o of orders) expect([201, 409]).toContain(o.status);
      for (const d of damaged) expect([200, 422]).toContain(d.status);
      expect(received.status).toBe(200);
      const created = orders.filter((o) => o.status === 201).length;
      const okDamaged = damaged.filter((d) => d.status === 200).length;
      expect(await prisma.order.count()).toBe(ordersBefore + created);
      const finalQty = await stockOf(v.id);
      expect(finalQty).toBe(3 + 1 - created - okDamaged);
      expect(finalQty).toBeGreaterThanOrEqual(0);
      const log = await logRows(v.id);
      expect(log).toHaveLength(okDamaged + 1); // thành công đúng 1 dòng, thất bại 0 dòng
      expect(log.filter((l) => l.reason === 'damaged')).toHaveLength(okDamaged);
      for (const l of log) {
        expect(l.availableAfter).toBeGreaterThanOrEqual(0);
        expect(Math.abs(l.delta)).toBe(1);
      }
      ordersOk += created;
      damagedOk += okDamaged;
    }
    console.info(`đua điều chỉnh/đặt hàng: đơn tạo ${ordersOk}, damaged thành công ${damagedOk} (tổng ${N} vòng)`);
  }, 300_000);

  it(`x${N}: set (đếm kho) vs đặt hàng: kết quả luôn nhất quán với số lượng giữ`, async () => {
    const p = await product([10]);
    const v = p.variants[0];
    let conflicts = 0;
    for (let i = 0; i < N; i++) {
      resetCheckoutRateLimits();
      await prisma.productVariant.update({ where: { variant_id: v.id }, data: { inventoryQty: 10 } });
      await prisma.inventoryAdjustment.deleteMany({ where: { variantId: v.id } });
      await prisma.order.deleteMany();
      const body = await orderBody([{ variantId: v.id, quantity: 2 }], { phone: phone(), email: `s${i}@example.com` });
      const [o, s] = await Promise.all([
        submitOrder(body),
        adj(S(), v.id, { mode: 'set', quantity: 30, reason: 'count', expectedAvailable: 10 }),
      ]);
      expect(o.status).toBe(201);
      expect([200, 409]).toContain(s.status);
      const qty = await stockOf(v.id);
      const log = await logRows(v.id);
      if (s.status === 200) {
        // set chạy sau đặt hàng được khoá chờ: expectedAvailable 10 lệch 8 -> 409; chạy trước: 30 - 0 = 30 rồi đơn trừ 2.
        expect(qty).toBe(28);
        expect(log).toHaveLength(1);
      } else {
        conflicts++;
        expect(s.body.error).toMatchObject({ code: 'stock-changed', available: 8 });
        expect(qty).toBe(8);
        expect(log).toHaveLength(0);
      }
    }
    console.info(`set vs đặt hàng: stock-changed ${conflicts}/${N}`);
  }, 300_000);
});

describe('T-INV-55 AC-INV-34: stock-changed khi expectedAvailable lệch', () => {
  it('đơn trừ 1 sau khi NV thấy 10 -> 409 kèm available, reserved; không đổi, không nhật ký', async () => {
    const p = await product([10]);
    const v = p.variants[0];
    await makeOrder({ status: 'to_ship', items: [{ variantId: v.id, quantity: 3 }] });
    expect((await item(v.sku)).available).toBe(10);
    expect((await placeOne(v.id, 1)).status).toBe(201); // khách đặt trong lúc NV đang nhìn: 9, đang giữ 4
    const r = await adj(S(), v.id, { mode: 'set', quantity: 13, reason: 'count', expectedAvailable: 10 });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatchObject({ code: 'stock-changed', available: 9, reserved: 4 });
    expect(await stockOf(v.id)).toBe(9);
    expect(await logRows(v.id)).toHaveLength(0);
    // Thử lại với số mới: 13 - 4 = 9 = hiện tại -> không đổi; 17 -> available 13
    const ok = await adj(S(), v.id, { mode: 'set', quantity: 17, reason: 'count', expectedAvailable: 9 });
    expect(ok.body).toMatchObject({ available: 13, reserved: 4 });
  });
});

describe('T-INV-56 AC-INV-35: Idempotency-Key', () => {
  it('gửi lại: tăng một lần, một dòng, Idempotency-Replayed; cùng khoá khác body 409; trả bản chụp lần đầu', async () => {
    const p = await product([10]);
    const v = p.variants[0];
    const key = newKey();
    const body = { mode: 'delta', quantity: 5, reason: 'received', note: 'lô A' };
    const first = await adj(S(), v.id, body, key);
    expect(first.status).toBe(200);
    expect(first.headers['idempotency-replayed']).toBeUndefined();
    await prisma.productVariant.update({ where: { variant_id: v.id }, data: { inventoryQty: 99 } }); // đổi sau lần đầu
    const again = await adj(S(), v.id, body, key);
    expect(again.status).toBe(200);
    expect(again.headers['idempotency-replayed']).toBe('true');
    expect(again.body).toEqual(first.body);
    expect(await stockOf(v.id)).toBe(99);
    expect(await logRows(v.id)).toHaveLength(1);
    const diff = await adj(S(), v.id, { ...body, quantity: 6 }, key);
    expect(diff.status).toBe(409);
    expect(diff.body.error.code).toBe('idempotency-conflict');
    // Người khác dùng cùng khoá: khác request_hash -> conflict, không áp.
    const other = await adj(A(), v.id, body, key);
    expect(other.status).toBe(409);
    expect(await logRows(v.id)).toHaveLength(1);
    // Lỗi 422 không đốt khoá.
    const k2 = newKey();
    expect((await adj(S(), v.id, { mode: 'delta', quantity: -1000, reason: 'damaged' }, k2)).status).toBe(422);
    expect((await adj(S(), v.id, { mode: 'delta', quantity: -1, reason: 'damaged' }, k2)).status).toBe(200); // khoá chưa được lưu bởi lần 422
  });

  it('x10: hai yêu cầu song song cùng khoá cùng nội dung: cả hai 200, tăng một lần, một dòng', async () => {
    const p = await product([10]);
    const v = p.variants[0];
    for (let i = 0; i < 10; i++) {
      resetCheckoutRateLimits();
      const key = newKey();
      const before = await stockOf(v.id);
      const body = { mode: 'delta', quantity: 2, reason: 'received' };
      const rs = await Promise.all([adj(S(), v.id, body, key), adj(S(), v.id, body, key)]);
      expect(rs.map((r) => r.status)).toEqual([200, 200]);
      expect(rs.filter((r) => r.headers['idempotency-replayed'] === 'true')).toHaveLength(1);
      expect(await stockOf(v.id)).toBe(before + 2);
    }
    expect(await logRows(v.id)).toHaveLength(10);
  }, 120_000);
});

describe('T-INV-57 AC-INV-36: lịch sử', () => {
  it('3 điều chỉnh -> 3 dòng mới trước đủ trường; 63 dòng -> 50; PUT / DELETE dòng 404', async () => {
    const p = await product([10]);
    const v = p.variants[0];
    for (const [quantity, reason] of [[1, 'received'], [-2, 'damaged'], [3, 'return']] as const) {
      expect((await adj(quantity > 0 ? S() : A(), v.id, { mode: 'delta', quantity, reason, note: `n${quantity}` })).status).toBe(200);
    }
    const r = await aGet(`/inventory/${v.id}/movements`, S());
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toMatch(/no-store/);
    expect(r.body.map((m: { change: number }) => m.change)).toEqual([3, -2, 1]);
    expect(r.body[1]).toMatchObject({ reason: 'damaged', after: 9, note: 'n-2', author: 'Trị Quản', authorRole: 'admin' });
    expect(r.body[0]).toMatchObject({ reason: 'return', after: 12, author: 'Trần Lan', authorRole: 'staff' });
    expect(typeof r.body[0].id).toBe('string');
    expect(new Date(r.body[0].at).getTime()).toBeGreaterThan(Date.now() - 60_000);

    const base = Date.now() - 3_600_000;
    await prisma.inventoryAdjustment.createMany({
      data: Array.from({ length: 60 }, (_, i) => ({
        variantId: v.id, at: new Date(base + i * 1000), delta: 1, availableAfter: 10 + i, reason: 'received', actorName: 'Seed', actorRole: 'admin' as const,
      })),
    });
    expect((await aGet(`/inventory/${v.id}/movements`, S())).body).toHaveLength(50);

    const rowId = r.body[0].id;
    expect((await aPut(`/inventory/${v.id}/movements/${rowId}`, { note: 'x' }, A())).status).toBe(404);
    expect((await aDel(`/inventory/${v.id}/movements/${rowId}`, A())).status).toBe(404);
    expect((await aGet('/inventory/abc/movements', S())).status).toBe(404);
    expect((await aGet('/inventory/00000000-0000-4000-8000-000000000000/movements', S())).status).toBe(404);
  });
});

describe('T-INV-58 BR-INV-30: facets', () => {
  it('counts tổng, customCount, màu distinct, ngưỡng mặc định, size cố định', async () => {
    const p = await makeProduct({
      status: 'ACTIVE', name: 'Áo Facet',
      variants: [
        { sku: 'FC-1', color: 'Đỏ', hex: '#FF0000', size: 'S', qty: 0 },
        { sku: 'FC-2', color: 'Đỏ', hex: '#FF0000', size: 'M', qty: 3 },
        { sku: 'FC-3', color: 'Xanh Rêu', hex: '#556B2F', size: 'L', qty: 30 },
      ],
    });
    await prisma.productVariant.update({ where: { variant_id: p.variants[0].id }, data: { lowStockThreshold: 2 } });
    const r = await aGet('/inventory/facets?q=facet', S());
    expect(r.status).toBe(200);
    expect(r.body.counts).toEqual({ all: 3, in: 1, low: 1, out: 1 });
    expect(r.body.counts.in + r.body.counts.low + r.body.counts.out).toBe(r.body.counts.all);
    expect(r.body.customCount).toBe(1);
    expect(r.body.defaultThreshold).toBe(5);
    expect(r.body.sizes).toEqual(['S', 'M', 'L', 'XL']);
    expect(r.body.categories.map((c: { value: string }) => c.value)).toContain('tops');
    expect(r.body.colors.filter((c: { name: string }) => c.name === 'Đỏ')).toHaveLength(1);
    expect(r.body.colors.map((c: { name: string }) => c.name)).toContain('Xanh Rêu');
    // Bộ lọc cùng bộ với danh sách
    expect((await aGet('/inventory/facets?q=facet&color=ĐỎ', S())).body.counts.all).toBe(2);
    expect((await aGet('/inventory/facets?size=ZZ', S())).status).toBe(422);
  });
});

describe('T-INV-70 AC-INV-37: ngưỡng sắp hết (Should)', () => {
  it('mặc định 8: qty 7 low ở admin, PDP vẫn IN_STOCK; riêng 2 -> in; null -> low; về 8; 1.001 -> 422; staff 403', async () => {
    const p = await product([7]);
    const v = p.variants[0];
    expect((await item(v.sku)).status).toBe('in'); // 7 > 5
    const set8 = await aPut('/inventory/thresholds', { defaultThreshold: 8 }, A());
    expect(set8.status, JSON.stringify(set8.body)).toBe(200);
    expect(set8.body).toEqual({ defaultThreshold: 8, customCount: 0 });
    expect(await item(v.sku)).toMatchObject({ status: 'low', lowStockThreshold: 8, thresholdCustom: false });
    const store = await get(`/api/products/${p.slug}`);
    expect(store.status).toBe(200);
    const stockOfStore = JSON.stringify(store.body);
    expect(stockOfStore).toMatch(/IN_STOCK/); // storefront luôn theo BR-CAT-04 (<= 5)
    expect(stockOfStore).not.toMatch(/LOW_STOCK/);

    const own = await aPut('/inventory/thresholds', { items: [{ variantId: v.id, threshold: 2 }] }, A());
    expect(own.body).toEqual({ defaultThreshold: 8, customCount: 1 });
    expect(await item(v.sku)).toMatchObject({ status: 'in', lowStockThreshold: 2, thresholdCustom: true });
    expect((await aGet('/inventory/facets', S())).body.customCount).toBe(1);

    await aPut('/inventory/thresholds', { items: [{ variantId: v.id, threshold: null }] }, A());
    expect(await item(v.sku)).toMatchObject({ status: 'low', thresholdCustom: false });

    await aPut('/inventory/thresholds', { items: [{ variantId: v.id, threshold: 1 }] }, A());
    const cleared = await aPut('/inventory/thresholds', { clearCustom: true, defaultThreshold: 5 }, A());
    expect(cleared.body).toEqual({ defaultThreshold: 5, customCount: 0 });

    for (const [body, field] of [
      [{ defaultThreshold: 1001 }, 'defaultThreshold'],
      [{ defaultThreshold: -1 }, 'defaultThreshold'],
      [{ items: [{ variantId: v.id, threshold: 1001 }] }, 'items.threshold'],
      [{ items: [{ variantId: '00000000-0000-4000-8000-000000000000', threshold: 3 }] }, 'items[0].variantId'],
      [{ defaultThreshold: 9, items: [{ variantId: v.id, threshold: 3 }, { variantId: 'zzz', threshold: 3 }] }, 'items[1].variantId'],
      [{}, 'defaultThreshold'],
    ] as const) {
      const r = await aPut('/inventory/thresholds', body, A());
      expect(r.status, JSON.stringify(body)).toBe(422);
      expect(r.body.error.code).toBe('validation');
      void field;
    }
    // Lỗi giữa chừng: tất cả hoặc không (default không đổi, mục đầu không áp)
    await aPut('/inventory/thresholds', { defaultThreshold: 9, items: [{ variantId: v.id, threshold: 3 }, { variantId: 'zzz', threshold: 3 }] }, A());
    expect((await aGet('/inventory/facets', S())).body).toMatchObject({ defaultThreshold: 5, customCount: 0 });
    expect((await aPut('/inventory/thresholds', { defaultThreshold: 8 }, S())).status).toBe(403);
  });
});

describe('T-INV-71 AC-INV-38: biến động do đơn trong lịch sử (Should)', () => {
  it('đặt 2 rồi huỷ: "Bán theo đơn" -2 và "Đơn huỷ, hoàn kho" +2; checkout không ghi thêm nhật ký', async () => {
    const p = await product([10]);
    const v = p.variants[0];
    const placed = await placeOne(v.id, 2);
    expect(placed.status).toBe(201);
    const code = placed.body.order.id as string;
    expect(await logRows(v.id)).toHaveLength(0); // đặt hàng không ghi nhật ký kho
    let m = (await aGet(`/inventory/${v.id}/movements`, S())).body;
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ change: -2, after: null, reason: 'order', note: `Bán theo đơn ${code}`, author: 'Khách', authorRole: null });

    const c = await adminPost(`/${code}/cancel`, { expectedStatus: 'to_ship', reason: 'declined_on_call' }, S());
    expect(c.status, JSON.stringify(c.body)).toBe(200);
    expect(await logRows(v.id)).toHaveLength(0);
    m = (await aGet(`/inventory/${v.id}/movements`, S())).body;
    expect(m).toHaveLength(2);
    expect(m[0]).toMatchObject({ change: 2, after: null, reason: 'cancel', note: `Đơn huỷ, hoàn kho ${code}`, author: 'Hệ thống' });
    expect(m[1]).toMatchObject({ change: -2, reason: 'order' });
    expect(await stockOf(v.id)).toBe(10);
    // trộn với điều chỉnh tay: mới trước
    await adj(S(), v.id, { mode: 'delta', quantity: 1, reason: 'received' });
    m = (await aGet(`/inventory/${v.id}/movements`, S())).body;
    expect(m.map((x: { reason: string }) => x.reason)).toEqual(['received', 'cancel', 'order']);
  });
});

describe('T-INV-72 AC-INV-39: người sửa gần nhất', () => {
  it('A sửa P; S mở P thấy updatedBy.name của A', async () => {
    const p = await product([4]);
    const d = (await aGet(`/products/${p.id}`, S())).body;
    expect(d.updatedBy).toBeNull();
    const put = await aPut(
      `/products/${p.id}`,
      {
        slug: d.slug, name: d.name, type: d.type, description: 'Mô tả mới', status: d.status, category: d.category, genders: d.genders, moments: d.moments,
        price: d.price, compareAtPrice: d.compareAtPrice, material: d.material, care: d.care, fitSummary: d.fitSummary,
        images: d.images.map((i: { id: string; alt: string; color: string }) => ({ id: i.id, alt: i.alt, color: i.color })),
        variants: d.variants.map((x: { id: string; sku: string; color: unknown; size: string; inventory: number }) => ({ id: x.id, sku: x.sku, color: x.color, size: x.size, inventory: x.inventory })),
        updatedAt: d.updatedAt,
      },
      A(),
    );
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    const seen = (await aGet(`/products/${p.id}`, S())).body;
    expect(seen.updatedBy).toEqual({ name: 'Trị Quản' });
  });
});
