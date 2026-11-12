import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import prisma from '../src/config/prisma';
import { resetCheckoutRateLimits } from '../src/middleware/rate-limit';
import { toSalesCsv } from '../src/modules/insights-admin/csv';
import { getSalesReport } from '../src/modules/insights-admin/report.service';
import {
  advance, assertNoSecrets, get, iGet, insertRevenueOrder, freshIp, loginAdmin, loginStaff, makeProduct, makeRevenueFixtures, makeVoucher,
  orderBody, resetCheckout, resetState, submitOrder, useClock, vid, vnAt,
} from './helpers';

/** Lát 8.3 (Báo cáo + CSV): T-RPT-01..10, T-INS-14, T-INS-30, T-INS-31. D = 2026-11-12 VN, 15:00 VN. */

const D = '2026-11-12';
const NOW = '2026-11-12T08:00:00Z';

let admin: Awaited<ReturnType<typeof loginAdmin>>;
let staff: Awaited<ReturnType<typeof loginStaff>>;

beforeAll(async () => {
  await resetState();
  await resetCheckout();
  admin = await loginAdmin('admin-r@nine2fine.test');
  staff = await loginStaff('staff-r@nine2fine.test');
  await makeRevenueFixtures(D);
});
beforeEach(() => {
  resetCheckoutRateLimits();
  useClock(NOW);
});

const report = (qs: string, cookie = admin.cookie) => iGet(`/reports/sales${qs ? `?${qs}` : ''}`, cookie);
const sum = (xs: Array<{ revenue: number }>) => xs.reduce((n, x) => n + x.revenue, 0);
const clearOrders = () => prisma.$executeRawUnsafe('TRUNCATE TABLE "order_items", "order_events", "orders" RESTART IDENTITY CASCADE');

let seq = 0;
async function mkProduct(name: string, category = 'tops', price = 500_000) {
  const p = await makeProduct({ name, category, status: 'ACTIVE', price, variants: [{ sku: `R8-${++seq}-${Math.floor(Math.random() * 1e6)}`, qty: 50 }] });
  return { id: p.id, v: p.variants[0].id };
}

describe('T-RPT-01 AC-RPT-01, 02: tham số', () => {
  it('mặc định 30 ngày kết thúc D; from=to=D; 366 ngày; 367 ngày 422 to; from > to 422 from; to = D+1 422 to', async () => {
    const def = await report('');
    expect(def.status).toBe(200);
    expect(def.headers['cache-control']).toMatch(/no-store/);
    expect(def.body).toMatchObject({ from: '2026-10-14', to: D, days: 30, previousFrom: '2026-09-14', previousTo: '2026-10-13', sort: 'units' });
    expect(def.body.byDay).toHaveLength(30);
    expect(def.body.generatedAt).toBe('2026-11-12T08:00:00.000Z');
    const one = await report(`from=${D}&to=${D}`);
    expect(one.status).toBe(200);
    expect(one.body).toMatchObject({ days: 1, previousFrom: '2026-11-11', previousTo: '2026-11-11' });
    expect((await report('from=2025-11-12&to=2026-11-12')).body.days).toBe(366);
    const long = await report('from=2025-11-11&to=2026-11-12');
    expect(long.status).toBe(422);
    expect(long.body.error).toMatchObject({ code: 'validation', field: 'to' });
    expect((await report('from=2026-11-13&to=2026-11-12')).body.error.field).toBe('from');
    expect((await report('to=2026-11-13')).body.error.field).toBe('to');
    for (const bad of ['2026-02-30', '2026-13-01', 'abc']) {
      const r = await report(`from=${bad}`);
      expect(r.status).toBe(422);
      expect(r.body.error.field).toBe('from');
      assertNoSecrets(r);
    }
    const onlyFrom = await report('from=2026-11-01');
    expect(onlyFrom.status).toBe(200);
    expect(onlyFrom.body.to).toBe(D);
    expect((await report('from=2026-11-10&to=2026-11-12')).body).toMatchObject({ previousFrom: '2026-11-07', previousTo: '2026-11-09' });
  });
});

describe('T-RPT-02 AC-RPT-03, AC-INS-12: KPI, kỳ trước, đơn đủ điều kiện', () => {
  it('D..D: 1.200.000 / 2 đơn / 3 sp / AOV 600.000 / giảm 100.000 / ship 60.000 / đặt 2, huỷ 1, 0,3333; previous theo D-1', async () => {
    const r = await report(`from=${D}&to=${D}`);
    expect(r.status).toBe(200);
    expect(r.body.kpis).toEqual({
      revenue: { value: 1_200_000, previous: 1_000_000 },
      completedOrders: { value: 2, previous: 1 },
      units: { value: 3, previous: 2 },
      averageOrderValue: { value: 600_000, previous: 1_000_000 },
      discountTotal: { value: 100_000, previous: 0 },
      shippingCollected: { value: 60_000, previous: 0 },
      placedOrders: { value: 2, previous: null }, // D-1 không có đơn đặt / huỷ -> null
      cancelledOrders: { value: 1, previous: null },
      cancelRate: { value: 0.3333, previous: null },
      refundedAmount: { value: 0, previous: 0 },
      refundedUnits: { value: 0, previous: 0 },
      returnedOrders: { value: 0, previous: 0 },
      returnRate: { value: 0, previous: 0 },
    });
    assertNoSecrets(r);
  });

  it('D-8..D: 4.200.000 (O9 hoàn tiền, O4..O7 chưa giao không tính); kỳ trước rỗng -> previous null', async () => {
    const r = await report(`from=2026-11-04&to=${D}`);
    expect(r.body.days).toBe(9);
    expect(r.body.kpis.revenue).toEqual({ value: 4_200_000, previous: null });
    expect(r.body.kpis.completedOrders).toEqual({ value: 4, previous: null });
    expect(r.body.kpis.averageOrderValue).toEqual({ value: 1_050_000, previous: null });
  });
});

describe('T-RPT-03 AC-INS-13: Σ các khối khớp từng đồng', () => {
  it.each([[`from=${D}&to=${D}`], ['from=2026-11-04&to=2026-11-12'], ['from=2026-10-14&to=2026-11-12']])('khoảng %s', async (qs) => {
    const r = await report(qs);
    const v = r.body.kpis.revenue.value;
    expect(v).toBeGreaterThan(0);
    expect(sum(r.body.byDay)).toBe(v);
    expect(sum(r.body.byCategory)).toBe(v);
    expect(sum(r.body.byPayment)).toBe(v);
    expect(sum(r.body.topProducts)).toBe(v); // <= 10 sản phẩm
    expect(r.body.byDay.reduce((n: number, d: { units: number }) => n + d.units, 0)).toBe(r.body.kpis.units.value);
    expect(r.body.byDay.reduce((n: number, d: { completedOrders: number }) => n + d.completedOrders, 0)).toBe(r.body.kpis.completedOrders.value);
    expect(r.body.topProducts.reduce((n: number, d: { units: number }) => n + d.units, 0)).toBe(r.body.kpis.units.value);
  });
});

describe('T-RPT-08 AC-RPT-08: byPayment luôn đủ hai dòng', () => {
  it('chỉ COD: bank-transfer 0 / 0 / 0, share cod = 1', async () => {
    const r = await report(`from=${D}&to=${D}`);
    expect(r.body.byPayment).toEqual([
      { method: 'cod', completedOrders: 2, revenue: 1_200_000, share: 1 },
      { method: 'bank-transfer', completedOrders: 0, revenue: 0, share: 0 },
    ]);
    const two = await report(`from=2026-11-11&to=${D}`);
    expect(two.body.byPayment.map((p: { method: string; revenue: number }) => [p.method, p.revenue])).toEqual([['cod', 1_200_000], ['bank-transfer', 1_000_000]]);
    expect(two.body.byPayment.map((p: { share: number }) => p.share)).toEqual([0.5455, 0.4545]);
  });
});

describe('T-RPT-09 AC-RPT-10 (BE): staff 403; khoảng rỗng', () => {
  it('S 403 trước mọi thứ (kể cả tham số sai); khoảng rỗng: mảng rỗng / 0, không NaN, byDay đủ ngày', async () => {
    const s = await report('', staff.cookie);
    expect(s.status).toBe(403);
    expect(s.body.error.code).toBe('forbidden');
    expect(s.headers['cache-control']).toMatch(/no-store/);
    expect((await report('from=abc', staff.cookie)).status).toBe(403);
    const r = await report('from=2026-01-01&to=2026-01-05');
    expect(r.status).toBe(200);
    expect(r.body.byDay).toHaveLength(5);
    expect(r.body.byDay.every((d: { revenue: number; completedOrders: number; units: number }) => d.revenue === 0 && d.completedOrders === 0 && d.units === 0)).toBe(true);
    expect(r.body.topProducts).toEqual([]);
    expect(r.body.topVariants).toEqual([]);
    expect(r.body.byCategory).toEqual([]);
    expect(r.body.byPayment).toHaveLength(2);
    expect(r.body.kpis.revenue).toEqual({ value: 0, previous: null });
    expect(r.body.kpis.averageOrderValue.value).toBe(0);
    expect(r.body.kpis.cancelRate.value).toBe(0);
    expect(r.text).not.toMatch(/NaN|Infinity/);
  });
});

describe('T-INS-14 AC-INS-11: đa múi giờ phiên và ranh giới 17:00Z', () => {
  it('đơn 16:59:59Z / 17:00:00Z ngày 11: from=to=12 chỉ có đơn 17:00:00Z; from=to=11 chỉ đơn 16:59:59Z; cùng kết quả dưới 4 múi giờ', async () => {
    await clearOrders();
    const p = await mkProduct('Biên giờ');
    const early = await insertRevenueOrder({ deliveredAt: new Date('2026-11-11T16:59:59.000Z'), lines: [{ variantId: p.v, quantity: 1, unitPrice: 111_000 }] });
    const late = await insertRevenueOrder({ deliveredAt: new Date('2026-11-11T17:00:00.000Z'), lines: [{ variantId: p.v, quantity: 2, unitPrice: 222_000 }] });
    const at = new Date(NOW);
    const q = (day: string) => ({ from: day, to: day, days: 1, sort: 'units' as const });
    const results: Record<string, unknown> = {};
    for (const tz of ['UTC', 'Asia/Bangkok', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
      results[tz] = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL TIME ZONE '${tz}'`);
        const [{ tz: shown }] = await tx.$queryRaw<Array<{ tz: string }>>`SELECT current_setting('TimeZone') AS tz`;
        expect(shown).toBe(tz);
        return { d11: await getSalesReport(tx, q('2026-11-11'), at), d12: await getSalesReport(tx, q('2026-11-12'), at), wide: await getSalesReport(tx, { from: '2026-11-10', to: '2026-11-12', days: 3, sort: 'revenue' }, at) };
      });
    }
    const base = results.UTC as { d11: Awaited<ReturnType<typeof getSalesReport>>; d12: Awaited<ReturnType<typeof getSalesReport>>; wide: Awaited<ReturnType<typeof getSalesReport>> };
    expect(base.d11.kpis.revenue.value).toBe(111_000);
    expect(base.d11.topProducts.map((t) => t.units)).toEqual([1]);
    expect(base.d12.kpis.revenue.value).toBe(444_000);
    expect(base.d12.kpis.completedOrders.value).toBe(1);
    expect(base.d12.byDay).toEqual([{ date: '2026-11-12', revenue: 444_000, completedOrders: 1, units: 2 }]);
    expect(base.wide.byDay.map((d) => [d.date, d.revenue])).toEqual([['2026-11-10', 0], ['2026-11-11', 111_000], ['2026-11-12', 444_000]]);
    for (const tz of Object.keys(results)) expect(results[tz], tz).toEqual(base);
    // qua API (phiên cục bộ Bangkok): cùng kết quả
    const api = await report(`from=${D}&to=${D}`);
    expect(api.body.kpis.revenue.value).toBe(444_000);
    expect(early.code).not.toBe(late.code);
    // thời điểm trả về ISO UTC, tiền số nguyên
    expect(api.body.generatedAt).toMatch(/Z$/);
    expect(Number.isInteger(api.body.kpis.revenue.value)).toBe(true);
  });
});

describe('T-RPT-04 AC-RPT-04: byDay theo ngày VN', () => {
  it('D-2..D: đúng 3 điểm, D-1 = 0 mọi chỉ tiêu; đơn 17:00Z rơi ngày sau; Σ = KPI', async () => {
    await clearOrders();
    const p = await mkProduct('Theo ngày');
    await insertRevenueOrder({ deliveredAt: vnAt(D, -2, '10:00'), lines: [{ variantId: p.v, quantity: 2, unitPrice: 100_000 }] });
    await insertRevenueOrder({ deliveredAt: vnAt(D, 0, '10:00'), lines: [{ variantId: p.v, quantity: 1, unitPrice: 300_000 }] });
    await insertRevenueOrder({ deliveredAt: new Date('2026-11-11T17:00:00.000Z'), lines: [{ variantId: p.v, quantity: 1, unitPrice: 50_000 }] }); // = 00:00 VN ngày D
    const r = await report(`from=2026-11-10&to=${D}`);
    expect(r.body.byDay).toEqual([
      { date: '2026-11-10', revenue: 200_000, completedOrders: 1, units: 2 },
      { date: '2026-11-11', revenue: 0, completedOrders: 0, units: 0 },
      { date: D, revenue: 350_000, completedOrders: 2, units: 2 },
    ]);
    expect(sum(r.body.byDay)).toBe(r.body.kpis.revenue.value);
  });
});

describe('T-RPT-05 AC-RPT-05: top sản phẩm', () => {
  it('mặc định theo units; sort=revenue; sort=profit 422; 12 sản phẩm -> 10 dòng; hoà hoàn toàn theo productId tăng', async () => {
    await clearOrders();
    const [a, b, c] = [await mkProduct('Top A'), await mkProduct('Top B'), await mkProduct('Top C')];
    await insertRevenueOrder({
      deliveredAt: vnAt(D, -1, '10:00'),
      lines: [{ variantId: a.v, quantity: 5, unitPrice: 100_000 }, { variantId: b.v, quantity: 5, unitPrice: 200_000 }, { variantId: c.v, quantity: 1, unitPrice: 900_000 }],
    });
    const r = await report('from=2026-11-11&to=2026-11-11');
    expect(r.body.topProducts.map((t: { name: string }) => t.name)).toEqual(['Top B', 'Top A', 'Top C']); // units 5,5,1; hoà units: revenue 1.000.000 > 500.000
    const byRev = await report('from=2026-11-11&to=2026-11-11&sort=revenue');
    expect(byRev.body.sort).toBe('revenue');
    expect(byRev.body.topProducts.map((t: { name: string }) => t.name)).toEqual(['Top B', 'Top C', 'Top A']); // 1,0M; 0,9M; 0,5M
    const bad = await report('sort=profit');
    expect(bad.status).toBe(422);
    expect(bad.body.error.field).toBe('sort');
    // 12 sản phẩm, hoà hoàn toàn (1 đơn vị, 10.000 đ) -> 10 dòng theo productId tăng
    await clearOrders();
    const many = [];
    for (let i = 0; i < 12; i++) many.push(await mkProduct(`Hoà ${i}`));
    await insertRevenueOrder({ deliveredAt: vnAt(D, 0, '10:00'), lines: many.map((m) => ({ variantId: m.v, quantity: 1, unitPrice: 10_000 })) });
    const t = await report(`from=${D}&to=${D}`);
    expect(t.body.topProducts).toHaveLength(10);
    expect(t.body.topVariants).toHaveLength(10);
    const ids = t.body.topProducts.map((x: { productId: string }) => x.productId);
    expect(ids).toEqual([...many.map((m) => m.id)].sort().slice(0, 10));
    expect(t.body.byCategory[0].units).toBe(12);
    expect(t.body.topProducts[0]).toMatchObject({ category: { slug: 'tops', name: expect.any(String) }, image: { id: 'pexels-test-image' } });
  });
});

describe('T-RPT-06 AC-RPT-06: sản phẩm ẩn / lưu trữ vẫn tính, tên chụp theo dòng đơn mới nhất', () => {
  it('P ARCHIVED sau khi bán; đổi tên sau khi bán không đổi báo cáo; Σ units biến thể = units sản phẩm', async () => {
    await clearOrders();
    const p = await makeProduct({
      name: 'Áo lưu trữ', status: 'ACTIVE', price: 400_000,
      variants: [{ sku: 'ARC8-S', size: 'S', qty: 9 }, { sku: 'ARC8-M', size: 'M', qty: 9 }],
    });
    await insertRevenueOrder({ deliveredAt: vnAt(D, -3, '10:00'), snapshot: { name: 'Tên cũ' }, lines: [{ variantId: p.variants[0].id, quantity: 1, unitPrice: 400_000 }] });
    await insertRevenueOrder({
      deliveredAt: vnAt(D, -1, '10:00'), snapshot: { name: 'Tên mới nhất' },
      lines: [{ variantId: p.variants[0].id, quantity: 2, unitPrice: 400_000 }, { variantId: p.variants[1].id, quantity: 3, unitPrice: 400_000 }],
    });
    await prisma.product.update({ where: { product_id: p.id }, data: { status: 'ARCHIVED', name: 'Tên sau khi lưu trữ' } });
    const r = await report(`from=2026-11-05&to=${D}`);
    expect(r.body.topProducts).toHaveLength(1);
    expect(r.body.topProducts[0]).toMatchObject({ productId: p.id, name: 'Tên mới nhất', units: 6, revenue: 2_400_000 });
    const byVariant = Object.fromEntries(r.body.topVariants.map((v: { sku: string; units: number }) => [v.sku, v.units]));
    expect(byVariant).toEqual({ 'ARC8-S': 3, 'ARC8-M': 3 });
    expect(r.body.topVariants.reduce((n: number, v: { units: number }) => n + v.units, 0)).toBe(r.body.topProducts[0].units);
    expect(r.body.topVariants[0]).toMatchObject({ productName: 'Tên mới nhất', color: 'Đen', productId: p.id });
  });
});

describe('T-RPT-07 AC-RPT-07: theo danh mục hiện tại', () => {
  it('P1 chuyển danh mục sau khi bán: tính theo danh mục mới; share 4 chữ số; sắp doanh thu giảm; Σ = KPI', async () => {
    await clearOrders();
    const a = await mkProduct('Cat A', 'tops', 400_000);
    const b = await mkProduct('Cat B', 'bottoms', 400_000);
    await insertRevenueOrder({ deliveredAt: vnAt(D, -1, '10:00'), lines: [{ variantId: a.v, quantity: 1, unitPrice: 400_000 }, { variantId: b.v, quantity: 2, unitPrice: 400_000 }] });
    let r = await report('from=2026-11-11&to=2026-11-11');
    expect(r.body.byCategory.map((c: { category: { slug: string }; revenue: number }) => [c.category.slug, c.revenue])).toEqual([['bottoms', 800_000], ['tops', 400_000]]);
    expect(r.body.byCategory.map((c: { share: number }) => c.share)).toEqual([0.6667, 0.3333]);
    const dresses = await prisma.category.findUniqueOrThrow({ where: { slug: 'dresses' } });
    await prisma.product.update({ where: { product_id: a.id }, data: { categoryId: dresses.category_id } });
    r = await report('from=2026-11-11&to=2026-11-11');
    expect(r.body.byCategory.map((c: { category: { slug: string } }) => c.category.slug)).toEqual(['bottoms', 'dresses']);
    expect(sum(r.body.byCategory)).toBe(r.body.kpis.revenue.value);
  });
});

describe('T-INS-31 AC-INS-12 (bất biến): đơn thật qua checkout', () => {
  it('voucher % và cố định: Σ dòng = subtotal - discount; doanh thu báo cáo = Σ đơn', async () => {
    await clearOrders();
    await resetCheckout();
    const blazer = await vid('the-everyday-blazer', 'Đen', 'S');
    const shirt = await vid('weekend-shirt', 'Trắng', 'S');
    await prisma.productVariant.updateMany({ where: { variant_id: { in: [blazer, shirt] } }, data: { inventoryQty: 50 } });
    const items = [{ variantId: blazer, quantity: 2 }, { variantId: shirt, quantity: 1 }];
    const pct = await makeVoucher({ code: 'PCT15', kind: 'percent', value: 15, maxDiscount: null });
    const fixed = await makeVoucher({ code: 'FIX77', kind: 'fixed', value: 77_777 });
    const placed: string[] = [];
    const phones = ['0912345671', '0912345672', '0912345673']; // khác SĐT để không dính "đơn trùng" (BR-CHK-16)
    for (const [i, code] of [pct.code, fixed.code, undefined].entries()) {
      const res = await submitOrder(await orderBody(items, { voucherCodes: code ? [code] : [], phone: phones[i] }));
      expect(res.status, JSON.stringify(res.body.error)).toBe(201);
      placed.push(res.body.order.id);
    }
    await prisma.order.updateMany({ where: { code: { in: placed } }, data: { status: 'completed', paymentStatus: 'paid', deliveredAt: vnAt(D, 0, '09:00') } });
    const rows = await prisma.$queryRaw<Array<{ code: string; line: bigint; net: bigint; discount: number }>>`
      SELECT o.code, SUM(oi.unit_price::bigint * oi.quantity - oi.line_discount)::bigint AS line, (o.subtotal - o.discount)::bigint AS net, o.discount
      FROM orders o JOIN order_items oi ON oi.order_id = o.order_id WHERE o.code = ANY(${placed}) GROUP BY o.code, o.subtotal, o.discount`;
    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.discount > 0)).toHaveLength(2);
    for (const r of rows) expect(Number(r.line), r.code).toBe(Number(r.net));
    const rep = await report(`from=${D}&to=${D}`);
    expect(rep.body.kpis.revenue.value).toBe(rows.reduce((n, r) => n + Number(r.net), 0));
    expect(rep.body.kpis.completedOrders.value).toBe(3);
    expect(rep.body.kpis.discountTotal.value).toBe(rows.reduce((n, r) => n + r.discount, 0));
  });
});

describe('T-RPT-10 AC-RPT-11: CSV', () => {
  const csvGet = (qs: string, cookie = admin.cookie) => get(`/api/admin/reports/sales/export${qs ? `?${qs}` : ''}`, { cookie, ip: freshIp() }).buffer(true).parse((res, cb) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks).toString('utf8')));
  });

  it('BOM, tên tệp, năm khối, số bằng JSON cùng khoảng; chống công thức; bọc dấu phẩy / " / xuống dòng', async () => {
    await clearOrders();
    const mk = async (name: string) => (await mkProduct(name)).v;
    await insertRevenueOrder({ deliveredAt: vnAt(D, -1, '10:00'), snapshot: { name: '=HYPERLINK("http://e.com","x")' }, lines: [{ variantId: await mk('F1'), quantity: 3, unitPrice: 100_000 }] });
    await insertRevenueOrder({ deliveredAt: vnAt(D, 0, '10:00'), snapshot: { name: 'Áo, có "dấu phẩy"' }, shippingFee: 30_000, lines: [{ variantId: await mk('F2'), quantity: 2, unitPrice: 100_000 }] });
    await insertRevenueOrder({ deliveredAt: vnAt(D, 0, '11:00'), snapshot: { name: 'Hai\ndòng' }, lines: [{ variantId: await mk('F3'), quantity: 1, unitPrice: 100_000 }] });
    await insertRevenueOrder({ deliveredAt: vnAt(D, 0, '12:00'), snapshot: { name: '+cmd|x' }, lines: [{ variantId: await mk('F4'), quantity: 1, unitPrice: 50_000 }] });
    const res = await csvGet(`from=2026-11-11&to=${D}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv; charset=utf-8/);
    expect(res.headers['content-disposition']).toBe('attachment; filename="nine2fine-bao-cao-2026-11-11_2026-11-12.csv"');
    expect(res.headers['cache-control']).toMatch(/no-store/);
    const text = res.body as unknown as string;
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const blocks = text.slice(1).split('\r\n\r\n');
    expect(blocks.pop()).toBe(''); // chuỗi kết thúc bằng một dòng trống
    expect(blocks.map((b) => b.split('\r\n')[0])).toEqual(['KPI', 'Theo ngày', 'Top sản phẩm', 'Theo danh mục', 'Theo phương thức thanh toán']);
    expect(text).toContain(`'=HYPERLINK(""http://e.com"",""x"")"`); // chèn ' đầu, bọc " và nhân đôi "
    expect(text).toContain(`"'=HYPERLINK(`);
    expect(text).toContain('"Áo, có ""dấu phẩy"""');
    expect(text).toContain('"Hai\ndòng"');
    expect(text).toContain("'+cmd|x");
    const json = (await report(`from=2026-11-11&to=${D}&sort=units`)).body;
    const kpiRows = Object.fromEntries(blocks[0].split('\r\n').slice(2).map((l) => l.split(',')));
    expect(Number(kpiRows['Doanh thu (đồng)'])).toBe(json.kpis.revenue.value);
    expect(Number(kpiRows['Đơn hoàn thành'])).toBe(json.kpis.completedOrders.value);
    expect(kpiRows['Tổng giảm giá (đồng)']).toBe('0');
    const dayRows = blocks[1].split('\r\n').slice(2).map((l) => l.split(','));
    expect(dayRows).toEqual(json.byDay.map((d: { date: string; revenue: number; completedOrders: number; units: number }) => [d.date, String(d.revenue), String(d.completedOrders), String(d.units)]));
    expect(blocks[3]).toContain(String(json.byCategory[0].share));
    // hàm thuần: cùng đầu vào cho cùng đầu ra
    const generated = await getSalesReport(prisma, { from: '2026-11-11', to: D, days: 2, sort: 'units' }, new Date(NOW));
    expect(toSalesCsv(generated)).toBe(text);
  });

  it('S 403; 367 ngày 422 JSON; vượt 20 / 60 giây chung bộ đếm với báo cáo -> 429', async () => {
    expect((await csvGet('', staff.cookie)).status).toBe(403);
    const long = await csvGet('from=2025-11-11&to=2026-11-12');
    expect(long.status).toBe(422);
    expect(long.headers['content-type']).toMatch(/json/);
    resetCheckoutRateLimits();
    // 20 yêu cầu báo cáo / CSV trộn (mỗi yêu cầu qua cổng riêng của tài khoản): yêu cầu 21 -> 429
    for (let i = 0; i < 10; i++) expect((await report(`from=${D}&to=${D}`)).status).toBe(200);
    for (let i = 0; i < 10; i++) expect((await csvGet(`from=${D}&to=${D}`)).status).toBe(200);
    const over = await report(`from=${D}&to=${D}`);
    expect(over.status).toBe(429);
    expect(over.body.error).toMatchObject({ code: 'rate-limited', retryAfterSeconds: expect.any(Number) });
    expect(over.headers['retry-after']).toBeTruthy();
    advance(61_000);
    expect((await report(`from=${D}&to=${D}`)).status).toBe(200);
  });
});

describe('R3: không tràn int4 khi nhân unit_price x quantity', () => {
  it('100.000.000 x 20 (= 2.000.000.000) + dòng khác: doanh thu và top đúng, không lỗi số học', async () => {
    await clearOrders();
    const p = await mkProduct('Đắt nhất', 'tops', 100_000_000);
    const q = await mkProduct('Rẻ', 'tops', 1_000);
    await insertRevenueOrder({ deliveredAt: vnAt(D, 0, '10:00'), lines: [{ variantId: p.v, quantity: 20, unitPrice: 100_000_000 }] });
    await insertRevenueOrder({ deliveredAt: vnAt(D, 0, '11:00'), lines: [{ variantId: p.v, quantity: 20, unitPrice: 100_000_000 }, { variantId: q.v, quantity: 1, unitPrice: 1_000 }] });
    const r = await report(`from=${D}&to=${D}`);
    expect(r.status).toBe(200);
    expect(r.body.kpis.revenue.value).toBe(4_000_001_000); // vượt 2^31
    expect(r.body.byDay[0].revenue).toBe(4_000_001_000);
    expect(r.body.topProducts[0]).toMatchObject({ name: 'Đắt nhất', units: 40, revenue: 4_000_000_000 });
    expect(r.body.byCategory[0].share).toBe(1);
  });
});

describe('T-INS-30 AC-INS-13 (cấu trúc): quét tĩnh', () => {
  const root = path.resolve(__dirname, '../src');
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f);
      return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
    });

  it("`payment_status = 'paid'` chỉ ở revenue.sql.ts (trong module insights-admin)", () => {
    const hits = files(path.join(root, 'modules/insights-admin')).filter((f) => /payment_status\s*(=|IN)\s*\(?\s*'(paid|refunded|partially_refunded)'/.test(readFileSync(f, 'utf8')));
    expect(hits.map((f) => path.basename(f))).toEqual(['revenue.sql.ts']);
  });

  it('SQL trong module insights-admin không dùng hàm thời gian / múi giờ của CSDL', () => {
    for (const f of files(path.join(root, 'modules/insights-admin')).filter((x) => /\$queryRaw|Prisma\.sql/.test(readFileSync(x, 'utf8')))) {
      const code = readFileSync(f, 'utf8');
      expect(code, f).not.toMatch(/CURRENT_DATE|CURRENT_TIMESTAMP|AT TIME ZONE 'Asia|generate_series|date_trunc|now\(\)/i);
    }
  });
});
