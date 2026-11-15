import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import prisma from '../src/config/prisma';
import { resetCheckoutRateLimits } from '../src/middleware/rate-limit';
import { iGet, loginAdmin, loginStaff, makeRevenueFixtures, resetCheckout, resetState, useClock, vnAt } from './helpers';

/**
 * Nâng cấp admin 2026-11-15: GET /api/admin/reports-extra (chỉ đọc, chỉ quản trị viên).
 * D = 2026-11-12 VN, 15:00 VN; dữ liệu = makeRevenueFixtures (O1..O9) + một mã giảm giá gắn vào O1.
 */
const D = '2026-11-12';
const NOW = '2026-11-12T08:00:00Z';

let admin: Awaited<ReturnType<typeof loginAdmin>>;
let staff: Awaited<ReturnType<typeof loginStaff>>;
let fx: Awaited<ReturnType<typeof makeRevenueFixtures>>;

beforeAll(async () => {
  await resetState();
  await resetCheckout();
  admin = await loginAdmin('admin-x@nine2fine.test');
  staff = await loginStaff('staff-x@nine2fine.test');
  fx = await makeRevenueFixtures(D);
  await prisma.order.update({ where: { code: fx.codes.O1 }, data: { discountVoucherCode: 'GIAM50K', confirmedAt: vnAt(D, -4, '11:00') } });
});
beforeEach(() => {
  resetCheckoutRateLimits();
  useClock(NOW);
});

const extra = (qs: string, cookie = admin.cookie) => iGet(`/reports-extra${qs ? `?${qs}` : ''}`, cookie);

describe('reports-extra: quyền và tham số', () => {
  it('chưa đăng nhập 401, nhân viên 403, khoảng sai 422 kèm field; no-store', async () => {
    expect((await extra('', '')).status).toBe(401);
    const forbidden = await extra('', staff.cookie);
    expect(forbidden.status).toBe(403);
    const bad = await extra('from=2026-13-01');
    expect(bad.status).toBe(422);
    expect(bad.body.error).toMatchObject({ code: 'validation', field: 'from' });
    expect((await extra('to=2026-11-13')).body.error.field).toBe('to');
    expect((await extra('from=2025-11-11&to=2026-11-12')).status).toBe(422);
    const ok = await extra('');
    expect(ok.status).toBe(200);
    expect(ok.headers['cache-control']).toMatch(/no-store/);
    expect(ok.body).toMatchObject({ from: '2026-10-14', to: D, days: 30 });
  });
});

describe('reports-extra: số liệu', () => {
  it('heatmap 7 x 24 cộng lại đúng số đơn đặt trong khoảng; vận hành đếm cùng tập đơn', async () => {
    const from = '2026-10-14';
    const r = await extra(`from=${from}&to=${D}`);
    expect(r.status).toBe(200);
    const grid: number[][] = r.body.heatmap;
    expect(grid).toHaveLength(7);
    for (const row of grid) expect(row).toHaveLength(24);
    const placed = await prisma.order.count({
      where: { createdAt: { gte: vnAt(from, 0), lt: vnAt(D, 1) } },
    });
    expect(grid.flat().reduce((a, b) => a + b, 0)).toBe(placed);
    expect(r.body.operations.counts.placed).toBe(placed);
    expect(r.body.operations.onTime.rate).toBeGreaterThanOrEqual(0);
    expect(r.body.operations.onTime.rate).toBeLessThanOrEqual(1);
    // O1 đặt D-4 10:00, xác nhận D-4 11:00: trung vị 60 phút (đơn duy nhất có confirmed_at).
    expect(r.body.operations.medianMinutes.confirm).toBe(60);
  });

  it('khách: mọi đơn fixture cùng một email nên là 1 khách; tỉnh Hà Nội; voucher GIAM50K', async () => {
    const r = await extra(`from=2026-10-14&to=${D}`);
    const c = r.body.customers;
    expect(c.buyers).toBe(c.newBuyers + c.returningBuyers);
    expect(c.buyers).toBeGreaterThanOrEqual(1);
    expect(c.repeatRate).toBeGreaterThanOrEqual(0);
    expect(c.repeatRate).toBeLessThanOrEqual(1);
    expect(r.body.provinces[0]).toMatchObject({ name: 'Hà Nội' });
    const code = r.body.promotions.codes.find((x: { code: string }) => x.code === 'GIAM50K');
    expect(code).toMatchObject({ kind: 'discount', orders: 1 });
    expect(r.body.promotions.ordersWithVoucher).toBe(1);
    expect(r.body.promotions.share).toBeGreaterThan(0);
    expect(Array.isArray(r.body.returns)).toBe(true);
    expect(Array.isArray(r.body.operations.cancelReasons)).toBe(true);
  });

  it('khoảng không có đơn: mọi số 0, không NaN', async () => {
    const r = await extra('from=2025-01-01&to=2025-01-07');
    expect(r.status).toBe(200);
    expect(r.body.customers).toMatchObject({ buyers: 0, repeatRate: 0 });
    expect(r.body.operations.onTime).toEqual({ delivered: 0, onTime: 0, rate: 0 });
    expect(r.body.operations.medianMinutes).toEqual({ confirm: null, handover: null, deliver: null });
    expect(r.body.promotions).toMatchObject({ orders: 0, share: 0, codes: [] });
    expect(JSON.stringify(r.body)).not.toMatch(/NaN|Infinity/);
  });
});
