import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import prisma from '../src/config/prisma';
import { resetCheckoutRateLimits } from '../src/middleware/rate-limit';
import { getMembership } from '../src/modules/account/account.service';
import { getSalesReport } from '../src/modules/insights-admin/report.service';
import {
  aGet, aPost, adminGet, freshIp, get, iGet, insertReturn, insertRevenueOrder, loginAdmin, loginStaff, makeProduct, makeMember, resetCheckout, resetState, useClock, vnAt,
} from './helpers';

/** Lát 9.4 (số liệu): T-RET-42..46, 50 + nhật ký hợp nhất (AC-RET-40). D = 2026-11-12 VN, 15:00 VN. */

const D = '2026-11-12';
const NOW = '2026-11-12T08:00:00Z';
let A: Awaited<ReturnType<typeof loginAdmin>>;
let S: Awaited<ReturnType<typeof loginStaff>>;
let seq = 0;

const clearOrders = () => prisma.$executeRawUnsafe('TRUNCATE TABLE "order_items", "order_events", "orders", "idempotency_keys", "inventory_adjustments" RESTART IDENTITY CASCADE');
async function mk(name: string, category: string) {
  const p = await makeProduct({ name, category, status: 'ACTIVE', price: 500_000, variants: [{ sku: `MET-${++seq}-${Math.floor(Math.random() * 1e6)}`, qty: 50 }] });
  return p.variants[0].id;
}
const report = (qs: string, cookie = A.cookie) => iGet(`/reports/sales?${qs}`, cookie);
const sum = (xs: Array<{ revenue: number }>) => xs.reduce((n, x) => n + x.revenue, 0);

beforeAll(async () => {
  await resetState();
  await resetCheckout();
  A = await loginAdmin('met-admin@nine2fine.test');
  S = await loginStaff('met-staff@nine2fine.test');
});
beforeEach(async () => {
  resetCheckoutRateLimits();
  useClock(NOW);
  await clearOrders();
});

/** Đơn R1 (L1 = p1 500.000 x 2 giảm 100.000, L2 = p2 300.000 x 1) giao D-5, trạng thái thanh toán tuỳ ý. */
async function r1(p1: string, p2: string, o: { paymentStatus?: 'paid' | 'partially_refunded' | 'refunded'; userId?: string } = {}) {
  return insertRevenueOrder({
    deliveredAt: vnAt(D, -5, '10:00'), paymentStatus: o.paymentStatus, userId: o.userId,
    lines: [{ variantId: p1, quantity: 2, unitPrice: 500_000, lineDiscount: 100_000 }, { variantId: p2, quantity: 1, unitPrice: 300_000 }],
  });
}

describe('T-RET-43 AC-RET-51: doanh thu thuần', () => {
  it('(a) chưa hoàn 1.200.000; (b) partially_refunded L1x1 -> 750.000, units 2, đơn vẫn đếm; ngày bán gốc; Σ khối = KPI', async () => {
    const p1 = await mk('Áo hoàn', 'tops');
    const p2 = await mk('Quần hoàn', 'bottoms');
    const o = await r1(p1, p2);
    const q = `from=${D}&to=${D}`;
    const wide = `from=2026-11-06&to=${D}`;
    const a = await report(wide);
    expect([a.body.kpis.revenue.value, a.body.kpis.units.value, a.body.kpis.completedOrders.value]).toEqual([1_200_000, 3, 1]);
    // hoàn L1 x1 (not-fit): goods 450.000
    await insertReturn({ orderId: o.id, state: 'refunded', reason: 'not-fit', lines: [{ variantId: p1, quantity: 1, accepted: 1 }] });
    await prisma.order.update({ where: { order_id: o.id }, data: { paymentStatus: 'partially_refunded' } });
    const b = await report(wide);
    expect([b.body.kpis.revenue.value, b.body.kpis.units.value, b.body.kpis.completedOrders.value]).toEqual([750_000, 2, 1]);
    const day = (d: string) => b.body.byDay.find((x: { date: string }) => x.date === d);
    expect(day('2026-11-07')).toMatchObject({ revenue: 750_000, units: 2, completedOrders: 1 }); // D-5 = ngày bán gốc
    expect(sum(b.body.byDay)).toBe(750_000);
    expect(sum(b.body.byCategory)).toBe(750_000);
    expect(b.body.byPayment.reduce((n: number, x: { revenue: number }) => n + x.revenue, 0)).toBe(750_000);
    expect(sum(b.body.topProducts)).toBe(750_000);
    // báo cáo của ngày hoàn (D) không có doanh thu âm
    expect((await report(q)).body.kpis.revenue.value).toBe(0);
    // không có phí giao / phí gửi trả trong doanh thu
    expect(b.body.kpis.shippingCollected.value).toBe(0);
  });
  it('(c) hoàn đủ (refunded) -> 0; dòng 0 / 0 không hiện ở byCategory / topProducts / topVariants', async () => {
    const p1 = await mk('Áo giữ', 'tops');
    const p2 = await mk('Quần trả hết', 'bottoms');
    const o = await insertRevenueOrder({
      deliveredAt: vnAt(D, -2, '10:00'), paymentStatus: 'partially_refunded',
      lines: [{ variantId: p1, quantity: 1, unitPrice: 400_000 }, { variantId: p2, quantity: 1, unitPrice: 300_000 }],
    });
    await insertReturn({ orderId: o.id, state: 'refunded', reason: 'wrong-size', lines: [{ variantId: p2, quantity: 1, accepted: 1 }] });
    const r = await report('from=2026-11-01&to=2026-11-12');
    expect(r.body.kpis.revenue.value).toBe(400_000);
    expect(r.body.byCategory.map((c: { category: { slug: string } }) => c.category.slug)).toEqual(['tops']);
    expect(r.body.topProducts).toHaveLength(1);
    expect(r.body.topVariants).toHaveLength(1);
    expect(sum(r.body.byCategory)).toBe(r.body.kpis.revenue.value);
    const o2 = await insertRevenueOrder({ deliveredAt: vnAt(D, -2, '11:00'), paymentStatus: 'refunded', lines: [{ variantId: p1, quantity: 1, unitPrice: 999_000 }] });
    await insertReturn({ orderId: o2.id, state: 'refunded', reason: 'wrong-size' });
    const r2 = await report('from=2026-11-01&to=2026-11-12');
    expect(r2.body.kpis.revenue.value).toBe(400_000); // refunded bị loại
  });
  it('cùng kết quả dưới 4 múi giờ phiên (ranh giới ngày bán gốc 17:00Z)', async () => {
    const p1 = await mk('Áo múi giờ', 'tops');
    const p2 = await mk('Quần múi giờ', 'bottoms');
    const o = await insertRevenueOrder({
      deliveredAt: new Date('2026-11-11T17:00:00.000Z'), paymentStatus: 'partially_refunded',
      lines: [{ variantId: p1, quantity: 2, unitPrice: 500_000 }, { variantId: p2, quantity: 1, unitPrice: 300_000 }],
    });
    await insertReturn({ orderId: o.id, state: 'refunded', reason: 'not-fit', lines: [{ variantId: p1, quantity: 1, accepted: 1 }] });
    const at = new Date(NOW);
    const out: Record<string, unknown> = {};
    for (const tz of ['UTC', 'Asia/Bangkok', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
      out[tz] = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL TIME ZONE '${tz}'`);
        return { d11: await getSalesReport(tx, { from: '2026-11-11', to: '2026-11-11', days: 1, sort: 'units' }, at), d12: await getSalesReport(tx, { from: '2026-11-12', to: '2026-11-12', days: 1, sort: 'units' }, at) };
      });
    }
    const base = out.UTC as { d11: Awaited<ReturnType<typeof getSalesReport>>; d12: Awaited<ReturnType<typeof getSalesReport>> };
    expect(base.d11.kpis.revenue.value).toBe(0);
    expect(base.d12.kpis.revenue.value).toBe(800_000); // 1.300.000 - 500.000 (p1 x1)
    for (const tz of Object.keys(out)) expect(out[tz], tz).toEqual(base);
  });
});

describe('T-RET-44 AC-RET-52: KPI hoàn', () => {
  it('refundedAmount 450.000, refundedUnits 1, returnedOrders 1; previous null khi kỳ trước không có đơn giao; returnRate (Should)', async () => {
    const p1 = await mk('Áo kpi', 'tops');
    const p2 = await mk('Quần kpi', 'bottoms');
    const o = await r1(p1, p2, { paymentStatus: 'partially_refunded' });
    await insertReturn({ orderId: o.id, state: 'refunded', reason: 'not-fit', lines: [{ variantId: p1, quantity: 1, accepted: 1 }] });
    const day = vnAt(D, -5, '10:00');
    const d5 = new Date(day.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
    const r = await report(`from=${d5}&to=${d5}`);
    const k = r.body.kpis;
    expect([k.refundedAmount, k.refundedUnits, k.returnedOrders]).toEqual([{ value: 450_000, previous: null }, { value: 1, previous: null }, { value: 1, previous: null }]);
    expect(k.returnRate).toEqual({ value: 0.3333, previous: null }); // 1 / (2 + 1)
    // kỳ trước CÓ đơn giao: previous là số (0)
    await insertRevenueOrder({ deliveredAt: vnAt(D, -6, '10:00'), lines: [{ variantId: p2, quantity: 1, unitPrice: 100_000 }] });
    const r2 = await report(`from=${d5}&to=${d5}`);
    expect(r2.body.kpis.refundedAmount).toEqual({ value: 450_000, previous: 0 });
    expect(r2.body.kpis.returnedOrders.previous).toBe(0);
    // không đổi theo ngày hoàn: kỳ chỉ chứa ngày hoàn không có hoàn
    expect((await report(`from=${D}&to=${D}`)).body.kpis.refundedAmount.value).toBe(0);
    const csv = await get(`/api/admin/reports/sales/export?from=${d5}&to=${d5}`, { cookie: A.cookie, ip: freshIp() });
    expect(csv.status).toBe(200);
    expect(csv.text).toContain('450000');
  });
  it('mẫu 0 -> returnRate 0', async () => {
    const r = await report(`from=${D}&to=${D}`);
    expect(r.body.kpis.returnRate.value).toBe(0);
  });
});

describe('T-RET-45 AC-RET-53: hạng thành viên', () => {
  it('M 18.000.000 gồm R1: (a) L1x1 not-fit -> 17.550.000 Bronze; (b) hết wrong-size -> 16.800.000; (c) rejected / cancelled -> 18.000.000 Silver; admin cùng số', async () => {
    const p1 = await mk('Áo hạng', 'tops');
    const p2 = await mk('Quần hạng', 'bottoms');
    const big = await mk('Đồ lớn', 'tops');
    const M = await makeMember({ email: 'm-tier@example.com' });
    const order1 = await r1(p1, p2, { userId: M.user_id });
    await insertRevenueOrder({ deliveredAt: vnAt(D, -10, '10:00'), userId: M.user_id, lines: [{ variantId: big, quantity: 1, unitPrice: 16_800_000 }] });
    const spent = () => getMembership(M.user_id);
    const adminView = async () => (await aGet(`/customers/${M.user_id}`, A.cookie)).body;
    expect(await spent()).toMatchObject({ spent: 18_000_000, tier: 'silver' });

    const ret = await insertReturn({ orderId: order1.id, state: 'refunded', reason: 'not-fit', lines: [{ variantId: p1, quantity: 1, accepted: 1 }] });
    expect(await spent()).toMatchObject({ spent: 17_550_000, tier: 'bronze', nextTierAt: 18_000_000 }); // không trừ phí gửi trả
    const c1 = await adminView();
    expect([c1.spentThisYear, c1.tier]).toEqual([17_550_000, 'bronze']);
    expect(c1.totalSpent).toBe(17_550_000);

    await prisma.orderReturn.deleteMany({ where: { return_id: ret.id } });
    await insertReturn({ orderId: order1.id, state: 'refunded', reason: 'wrong-size' });
    expect(await spent()).toMatchObject({ spent: 16_800_000, tier: 'bronze' });
    expect((await adminView()).spentThisYear).toBe(16_800_000);

    for (const state of ['rejected', 'cancelled'] as const) {
      await prisma.orderReturn.deleteMany({});
      await insertReturn({ orderId: order1.id, state });
      expect(await spent()).toMatchObject({ spent: 18_000_000, tier: 'silver' });
      const c = await adminView();
      expect([c.spentThisYear, c.tier]).toEqual([18_000_000, 'silver']);
    }
  });
});

describe('T-RET-42 AC-RET-50: Tổng quan', () => {
  it('todo returnRequested 2 / returnApproved 1 / returnReceived 1 = counts của danh sách; không đổi theo range; S cùng số', async () => {
    const p = await mk('Áo todo', 'tops');
    const states = ['requested', 'requested', 'approved', 'received', 'refunded', 'rejected'] as const;
    for (const st of states) {
      const o = await insertRevenueOrder({ deliveredAt: vnAt(D, -3, '10:00'), lines: [{ variantId: p, quantity: 1, unitPrice: 100_000 }] });
      await insertReturn({ orderId: o.id, state: st, reason: 'not-fit' });
    }
    const list = await aGet('/returns', A.cookie);
    for (const range of ['today', '7d', '30d']) {
      for (const cookie of [A.cookie, S.cookie]) {
        const r = await iGet(`/dashboard?range=${range}`, cookie);
        expect(r.status).toBe(200);
        expect([r.body.todo.returnRequested, r.body.todo.returnApproved, r.body.todo.returnReceived]).toEqual([2, 1, 1]);
        expect(r.body.todo.returnRequested).toBe(list.body.counts.requested);
        expect(r.text).not.toContain('returnRate');
        expect(r.text).not.toContain('deliveryFailed');
      }
    }
    const staff = await iGet('/dashboard?range=30d', S.cookie);
    expect(Object.keys(staff.body).sort()).toEqual(['generatedAt', 'orders', 'todo']);
  });
});

describe('T-RET-46 AC-RET-55: tách khỏi hàng hoàn Slice 4', () => {
  it('yêu cầu trả hàng không đưa đơn vào tab returning; đơn vẫn completed', async () => {
    const p = await mk('Áo tab', 'tops');
    const o = await insertRevenueOrder({ deliveredAt: vnAt(D, -3, '10:00'), lines: [{ variantId: p, quantity: 1, unitPrice: 100_000 }] });
    const before = (await adminGet('/counts', A.cookie)).body.counts ?? (await adminGet('/counts', A.cookie)).body;
    await insertReturn({ orderId: o.id, state: 'approved', reason: 'not-fit' });
    const after = (await adminGet('/counts', A.cookie)).body.counts ?? (await adminGet('/counts', A.cookie)).body;
    expect(after.returning).toBe(before.returning);
    expect(after.completed).toBe(before.completed);
    const code = (await prisma.order.findUniqueOrThrow({ where: { order_id: o.id } })).code;
    const d = await adminGet(`/${code}`, A.cookie);
    expect([d.body.status, d.body.tab, d.body.returnHandling]).toEqual(['completed', 'completed', undefined]);
  });
});

describe('Nhật ký hợp nhất AC-RET-40', () => {
  it('targetType=order: 3 dòng nhân viên của yêu cầu, không dòng của khách, không ghi chú / mã giao dịch', async () => {
    const p1 = await mk('Áo nhật ký', 'tops');
    const p2 = await mk('Quần nhật ký', 'bottoms');
    const o = await r1(p1, p2);
    const a = await insertReturn({ orderId: o.id, state: 'requested', reason: 'not-fit' });
    await prisma.orderEvent.create({ data: { orderId: o.id, returnId: a.id, at: new Date(NOW), fromStatus: 'completed', toStatus: 'completed', paymentStatus: 'paid', actor: 'customer', kind: 'return_requested', reasonCode: 'not-fit' } });
    const id = a.id;
    await aPost(`/returns/${id}/approve`, { note: 'ghi-chu-bi-mat' }, S.cookie);
    await aPost(`/returns/${id}/receive`, { lines: [{ variantId: p1, acceptedQuantity: 2, disposition: 'restock' }, { variantId: p2, acceptedQuantity: 1, disposition: 'restock' }] }, S.cookie);
    await aPost(`/returns/${id}/refund`, { amount: (await prisma.orderReturn.findUniqueOrThrow({ where: { return_id: id } })).amount, refundReference: 'CK-AUD-1' }, A.cookie);
    const r = await aGet(`/audit-log?targetType=order&from=${D}&to=${D}&limit=50`, A.cookie);
    expect(r.status).toBe(200);
    const actions = r.body.items.map((i: { action: { code: string } }) => i.action.code).filter((x: string) => x.startsWith('order.return-')).sort();
    expect(actions).toEqual(['order.return-approved', 'order.return-received', 'order.return-refunded']);
    expect(JSON.stringify(r.body)).not.toContain('ghi-chu-bi-mat');
    expect(JSON.stringify(r.body)).not.toContain('CK-AUD-1');
    expect(r.body.items.every((i: { actor: { name: string } }) => !!i.actor)).toBe(true);
  });
});

describe('T-RET-50 AC-RET-30, 51 (cấu trúc): quét tĩnh', () => {
  const root = path.resolve(__dirname, '../src');
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f);
      return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
    });
  // Bỏ chú thích (dòng // và khối) để quét mã thật.
  const code = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const rel = (f: string) => path.relative(root, f).replace(/\\/g, '/');

  it("giá trị 'refunded' / 'partially_refunded' của payment_status chỉ ở process-return.service.ts (ghi) và revenue.sql.ts (đọc)", () => {
    const hits = files(root).filter((f) => /partially_refunded/.test(code(f))).map(rel).sort();
    expect(hits).toEqual(['modules/insights-admin/revenue.sql.ts', 'modules/returns/process-return.service.ts']);
    const writers = files(root).filter((f) => /"payment_status"\s*=\s*\(CASE/.test(code(f))).map(rel);
    expect(writers).toEqual(['modules/returns/process-return.service.ts']);
  });
  it('số tài khoản không có trong logger.*, mail/, return-events.ts, audit.query.ts', () => {
    const scan = files(root).filter((f) => /\/mail\/|return-events\.ts$|audit\.query\.ts$/.test(f.replace(/\\/g, '/')));
    expect(scan.length).toBeGreaterThan(3);
    for (const f of scan) expect(code(f), rel(f)).not.toMatch(/account_?number|accountNumber/i);
    for (const f of files(path.join(root, "modules/returns"))) {
      for (const line of code(f).split('\n')) {
        if (/logger\.(info|warn|error)\(/.test(line)) expect(line, rel(f)).not.toMatch(/account|bank|detail|note|refundReference/i);
      }
    }
  });
  it("không now() / CURRENT_DATE / AT TIME ZONE 'Asia' trong SQL mới; line_discount không dùng cho tiền hoàn ngoài return-amount", () => {
    const mine = files(root).filter((f) => /modules\/returns\//.test(f.replace(/\\/g, '/')) || /revenue\.sql\.ts$/.test(f));
    for (const f of mine) {
      expect(code(f), rel(f)).not.toMatch(/\bnow\(\)|CURRENT_DATE|AT TIME ZONE 'Asia/i);
    }
    for (const f of files(path.join(root, 'modules/returns'))) {
      if (/return-amount\.ts$/.test(f)) continue;
      expect(code(f), rel(f)).not.toMatch(/line_discount/);
    }
  });
});
