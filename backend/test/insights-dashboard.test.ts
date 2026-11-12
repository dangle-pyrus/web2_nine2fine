import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import prisma from '../src/config/prisma';
import { resetCheckoutRateLimits } from '../src/middleware/rate-limit';
import {
  adminGet, assertNoSecrets, iGet, insertRevenueOrder, loginAdmin, loginStaff, makeMember, makeProduct, makeRevenueFixtures, resetCheckout, resetState,
  RevenueFixture, useClock, vnAt,
} from './helpers';

/** Lát 8.2 (Tổng quan): T-DSH-01..09 ↔ AC-DSH-01..09, AC-INS-12 (phần ngày). D = 2026-11-12 VN, 15:00 VN. */

const D = '2026-11-12';
const NOW = '2026-11-12T08:00:00Z';

let admin: Awaited<ReturnType<typeof loginAdmin>>;
let staff: Awaited<ReturnType<typeof loginStaff>>;
let fx: RevenueFixture;

beforeAll(async () => {
  await resetState();
  await resetCheckout();
  admin = await loginAdmin('admin-d@nine2fine.test');
  staff = await loginStaff('staff-d@nine2fine.test');
  fx = await makeRevenueFixtures(D);
});
beforeEach(() => {
  resetCheckoutRateLimits();
  useClock(NOW);
});

const dash = async (range: string | undefined, cookie = admin.cookie) => iGet(`/dashboard${range === undefined ? '' : `?range=${range}`}`, cookie);

describe('T-DSH-01 AC-DSH-01: range', () => {
  it('today / 7d / 30d trả 200 đúng khoảng; week 422 field range; vắng = today', async () => {
    const t = await dash('today');
    expect(t.status).toBe(200);
    expect(t.headers['cache-control']).toMatch(/no-store/);
    expect(t.body.range).toBe('today');
    expect(t.body.period).toEqual({
      from: '2026-11-11T17:00:00.000Z', to: '2026-11-12T08:00:00.000Z', previousFrom: '2026-11-04T17:00:00.000Z', previousTo: '2026-11-05T08:00:00.000Z',
    });
    expect(t.body.generatedAt).toBe('2026-11-12T08:00:00.000Z');
    const w = await dash('7d');
    expect(w.body.range).toBe('7d');
    expect(w.body.period).toEqual({
      from: '2026-11-05T17:00:00.000Z', to: '2026-11-12T17:00:00.000Z', previousFrom: '2026-10-29T17:00:00.000Z', previousTo: '2026-11-05T17:00:00.000Z',
    });
    const m = await dash('30d');
    expect(m.status).toBe(200);
    expect(m.body.period.from).toBe('2026-10-13T17:00:00.000Z');
    const bad = await dash('week');
    expect(bad.status).toBe(422);
    expect(bad.body.error).toMatchObject({ code: 'validation', field: 'range' });
    assertNoSecrets(bad);
    expect((await dash(undefined)).body.range).toBe('today');
  });
});

describe('T-DSH-02 AC-DSH-02, AC-INS-12 (phần ngày): doanh thu theo ngày VN, đơn đủ điều kiện', () => {
  it('today: O1 + O3 (O2 hôm qua, O9 hoàn tiền, O4..O7 chưa giao loại)', async () => {
    const r = await dash('today');
    expect(r.body.revenue).toEqual({ value: 1_200_000, change: null }); // cùng giờ tuần trước không có đơn -> null
    expect(r.body.completedOrders).toEqual({ value: 2, change: null });
    expect(r.body.averageOrderValue).toEqual({ value: 600_000, change: null });
    expect(r.body.orders.value).toBe(2); // O4, O6 đặt hôm nay (O5 huỷ không tính)
    assertNoSecrets(r);
  });

  it('7d: 2.200.000, 3 đơn, 733.333, change 0,1 (kỳ trước = O8 2.000.000)', async () => {
    const r = await dash('7d');
    expect(r.body.revenue).toEqual({ value: 2_200_000, change: 0.1 });
    expect(r.body.completedOrders).toEqual({ value: 3, change: 2 }); // 3 so với 1 đơn kỳ trước (O8)
    expect(r.body.averageOrderValue.value).toBe(733_333);
    expect(r.body.averageOrderValue.change).toBe(-0.6333); // (733.333 - 2.000.000) / 2.000.000 = -0,6333335 -> độ lớn half-up
  });
});

describe('T-DSH-04 AC-DSH-04: khách mới', () => {
  it('2 khách hôm nay, 1 hôm qua, 1 staff hôm nay -> 2', async () => {
    const before = (await dash('today')).body.newCustomers.value as number;
    await makeMember({ createdAt: vnAt(D, 0, '08:00') });
    await makeMember({ createdAt: vnAt(D, 0, '12:00') });
    await makeMember({ createdAt: vnAt(D, -1, '12:00') });
    await prisma.user.create({ data: { email: 'nv-today@nine2fine.test', firstName: 'N', lastName: 'V', role: 'staff', terms_accepted_at: new Date(), createdAt: vnAt(D, 0, '08:30') } });
    const r = await dash('today');
    expect(r.body.newCustomers.value - before).toBe(2);
    expect((await dash('7d')).body.newCustomers.value).toBeGreaterThanOrEqual(3);
  });
});

describe('T-DSH-05 AC-DSH-05: todo = số tab Đơn hàng; S và A cùng số', () => {
  it('khớp GET /admin/orders/counts từng khoá', async () => {
    const counts = await adminGet('/counts', admin.cookie);
    expect(counts.status).toBe(200);
    const c = counts.body.counts ?? counts.body;
    for (const cookie of [admin.cookie, staff.cookie]) {
      const todo = (await dash('today', cookie)).body.todo;
      expect(todo).toMatchObject({
        toConfirm: c['to-confirm'], pendingPayment: c['pending-payment'], toFulfil: c['to-fulfil'], inTransit: c['in-transit'],
        cancelRequests: c['cancel-requests'], returning: c.returning,
      });
    }
    const todo = (await dash('today')).body.todo;
    expect(todo.toConfirm).toBeGreaterThanOrEqual(1); // O4
    expect(todo.pendingPayment).toBeGreaterThanOrEqual(1); // O6
    expect(todo.inTransit).toBeGreaterThanOrEqual(1); // O7
  });
});

describe('T-DSH-06 AC-DSH-06: tồn kho', () => {
  it('lowStock / outOfStock bằng counts của facets; đổi ngưỡng thì số đổi', async () => {
    await makeProduct({ name: 'Sắp hết 1', status: 'ACTIVE', variants: [{ sku: 'LOW8-1', qty: 3, size: 'S' }, { sku: 'LOW8-2', qty: 5, size: 'M' }, { sku: 'OUT8-1', qty: 0, size: 'L' }] });
    const facets = await iGet('/inventory/facets', admin.cookie);
    expect(facets.status).toBe(200);
    const todo = (await dash('today')).body.todo;
    expect(todo.lowStock).toBe(facets.body.counts.low);
    expect(todo.outOfStock).toBe(facets.body.counts.out);
    expect(todo.lowStock).toBeGreaterThanOrEqual(2);
    expect(todo.outOfStock).toBeGreaterThanOrEqual(1);
    // ngưỡng riêng SKU: đưa LOW8-2 (5) lên trên ngưỡng -> không còn "sắp hết"
    await prisma.productVariant.updateMany({ where: { sku: 'LOW8-2' }, data: { lowStockThreshold: 1 } });
    const after = (await dash('today')).body.todo;
    expect(after.lowStock).toBe(todo.lowStock - 1);
    expect(after.outOfStock).toBe(todo.outOfStock);
  });
});

describe('T-DSH-07 AC-DSH-09: staff không có khoá tiền', () => {
  it('staff: đúng ba khoá; không bao giờ returnRate / deliveryFailed / returnRequests', async () => {
    const s = await dash('30d', staff.cookie);
    expect(s.status).toBe(200);
    expect(Object.keys(s.body).sort()).toEqual(['generatedAt', 'orders', 'todo']);
    expect(Object.keys(s.body.orders).sort()).toEqual(['change', 'value']);
    for (const k of ['revenue', 'averageOrderValue', 'newCustomers', 'revenueSeries', 'topProducts', 'completedOrders', 'range', 'period']) {
      expect(s.text).not.toContain(`"${k}":`);
    }
    const a = await dash('30d');
    for (const res of [s, a]) for (const k of ['returnRate', 'deliveryFailed', 'returnRequests']) expect(res.text).not.toContain(k);
    expect(Object.keys(a.body).sort()).toEqual([
      'averageOrderValue', 'completedOrders', 'generatedAt', 'newCustomers', 'orders', 'period', 'range', 'revenue', 'revenueSeries', 'todo', 'topProducts',
    ]);
    expect(Object.keys(a.body.todo).sort()).toEqual([
      'cancelRequests', 'inTransit', 'lateDelivery', 'lowStock', 'outOfStock', 'pendingPayment', 'returning', 'toConfirm', 'toFulfil',
    ]);
    assertNoSecrets(s);
  });
});

describe('T-DSH-08 AC-DSH-07: lateDelivery', () => {
  it('O7 hạn D-1 trễ; hạn D chưa trễ', async () => {
    const before = (await dash('today')).body.todo.lateDelivery as number;
    expect(before).toBeGreaterThanOrEqual(1);
    await prisma.order.update({ where: { code: fx.codes.O7 }, data: { estimatedTo: new Date(`${D}T00:00:00.000Z`) } });
    expect((await dash('today')).body.todo.lateDelivery).toBe(before - 1);
    await prisma.order.update({ where: { code: fx.codes.O7 }, data: { estimatedTo: new Date('2026-11-11T00:00:00.000Z') } });
    expect((await dash('today')).body.todo.lateDelivery).toBe(before);
  });
});

describe('T-DSH-03 AC-DSH-03: DB không đơn', () => {
  it('change null, AOV 0, không NaN / 500 (today và 30d); series 30 điểm 0', async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "order_items", "order_events", "orders" RESTART IDENTITY CASCADE');
    for (const range of ['today', '30d']) {
      const r = await dash(range);
      expect(r.status).toBe(200);
      expect(r.body.revenue).toEqual({ value: 0, change: null });
      expect(r.body.completedOrders).toEqual({ value: 0, change: null });
      expect(r.body.averageOrderValue).toEqual({ value: 0, change: null });
      expect(r.body.orders).toEqual({ value: 0, change: null });
      expect(r.body.topProducts).toEqual([]);
      expect(r.body.revenueSeries).toHaveLength(30);
      expect(r.body.revenueSeries.every((p: { revenue: number; previous: number }) => p.revenue === 0 && p.previous === 0)).toBe(true);
      expect(r.text).not.toMatch(/NaN|Infinity/);
    }
  });
});

describe('T-DSH-09 AC-DSH-08: biểu đồ 30 ngày và top sản phẩm', () => {
  it('30 điểm cũ trước, ngày trống 0, Σ = KPI 30d, previous đúng vị trí; top P2, P1, P3 (hoà units phân theo revenue), <= 5', async () => {
    const mk = async (name: string, sku: string) => {
      const p = await makeProduct({ name, status: 'ACTIVE', price: 500_000, variants: [{ sku, qty: 50 }] });
      return p.variants[0].id;
    };
    const [v1, v2, v3] = [await mk('Top P1', 'T9-P1'), await mk('Top P2', 'T9-P2'), await mk('Top P3', 'T9-P3')];
    const extra: string[] = [];
    for (let i = 0; i < 4; i++) extra.push(await mk(`Top Ex${i}`, `T9-E${i}`)); // thêm sản phẩm để kiểm giới hạn 5 (mỗi cái 1 đơn vị, nhỏ nhất)
    await insertRevenueOrder({ deliveredAt: vnAt(D, -20, '10:00'), lines: [{ variantId: v2, quantity: 3, unitPrice: 500_000 }] });
    await insertRevenueOrder({
      deliveredAt: vnAt(D, -10, '10:00'),
      lines: [{ variantId: v2, quantity: 2, unitPrice: 500_000 }, { variantId: v1, quantity: 5, unitPrice: 400_000 }, ...extra.map((variantId) => ({ variantId, quantity: 1, unitPrice: 1000 }))],
    });
    await insertRevenueOrder({ deliveredAt: vnAt(D, -1, '10:00'), lines: [{ variantId: v3, quantity: 3, unitPrice: 200_000 }] });
    await insertRevenueOrder({ deliveredAt: vnAt(D, -35, '10:00'), lines: [{ variantId: v1, quantity: 1, unitPrice: 500_000 }] }); // kỳ trước, vị trí D-5

    const r = await dash('30d');
    const series = r.body.revenueSeries as Array<{ date: string; revenue: number; previous: number }>;
    expect(series).toHaveLength(30);
    expect(series[0].date).toBe('2026-10-14');
    expect(series[29].date).toBe(D);
    expect([...series].map((p) => p.date)).toEqual([...series].map((p) => p.date).sort());
    const byDate = Object.fromEntries(series.map((p) => [p.date, p]));
    expect(byDate['2026-10-23'].revenue).toBe(1_500_000); // D-20
    expect(byDate['2026-11-02'].revenue).toBe(3_004_000); // D-10: P2 1.0M + P1 2.0M + 4 x 1.000
    expect(byDate['2026-11-11'].revenue).toBe(600_000); // D-1
    expect(byDate['2026-11-07'].previous).toBe(500_000); // D-5 <- D-35
    expect(series.filter((p) => p.revenue === 0)).toHaveLength(27); // chỉ 3 ngày có đơn trong 30 ngày
    const sum = series.reduce((n, p) => n + p.revenue, 0);
    expect(sum).toBe(5_104_000);
    expect(sum).toBe(r.body.revenue.value); // Σ biểu đồ = KPI cùng định nghĩa
    expect(r.body.revenue.change).toBe(9.208); // (5.104.000 - 500.000) / 500.000
    expect(series.reduce((n, p) => n + p.previous, 0)).toBe(500_000);

    const top = r.body.topProducts as Array<{ name: string; units: number; revenue: number }>;
    expect(top.length).toBeLessThanOrEqual(5);
    expect(top.map((t) => t.name).slice(0, 3)).toEqual(['Top P2', 'Top P1', 'Top P3']); // P2 và P1 cùng 5 units: P2 revenue 2,5M > 2,0M
    expect(top.slice(0, 3).map((t) => [t.units, t.revenue])).toEqual([[5, 2_500_000], [5, 2_000_000], [3, 600_000]]);
    expect(top.every((t, i) => i === 0 || top[i - 1].units > t.units || (top[i - 1].units === t.units && top[i - 1].revenue >= t.revenue))).toBe(true);
    expect(top[0]).toHaveProperty('image');
    assertNoSecrets(r);
  });
});
