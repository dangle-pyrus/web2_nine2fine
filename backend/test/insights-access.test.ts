import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { INSIGHT_PERMISSIONS } from '../src/config/assumptions';
import prisma from '../src/config/prisma';
import { resetCatalogRateLimit } from '../src/middleware/catalog-rate-limit';
import { resetCheckoutRateLimits } from '../src/middleware/rate-limit';
import {
  advance, assertNoSecrets, freshIp, get, iGet, iPut, loginAdmin, loginMember, loginStaff, resetCheckout, resetState, resetStoreSettings, useClock,
} from './helpers';

/** Lát 8.1 / 8.5 (truy cập, quyền, giới hạn, lỗi): T-INS-01, 02, 03, 05 (cần các route đã có). */

const NOW = '2026-11-12T08:00:00Z';
let admin: Awaited<ReturnType<typeof loginAdmin>>;
let staff: Awaited<ReturnType<typeof loginStaff>>;

beforeAll(async () => {
  await resetState();
  await resetCheckout();
  admin = await loginAdmin('admin-i@nine2fine.test');
  staff = await loginStaff('staff-i@nine2fine.test');
});
beforeEach(async () => {
  resetCheckoutRateLimits();
  resetCatalogRateLimit();
  await resetStoreSettings();
  await prisma.$executeRawUnsafe('DELETE FROM store_settings_events');
  await prisma.$executeRawUnsafe(`UPDATE users SET role = 'staff' WHERE email = 'staff-i@nine2fine.test'`);
  await prisma.$executeRawUnsafe(`UPDATE users SET role = 'admin', is_active = true WHERE email = 'admin-i@nine2fine.test'`);
  useClock(NOW);
});

const READS = ['/dashboard', '/reports/sales', '/reports/sales/export', '/settings/store', '/audit-log'];
const settingsBody = async () => {
  const g = (await iGet('/settings/store', admin.cookie)).body;
  const { hotlineHref: _h, ...info } = g.info;
  return { updatedAt: g.updatedAt, info, operations: g.operations };
};
const writes = () => prisma.storeSettingsEvent.count();

describe('T-INS-01 AC-INS-01: phiên', () => {
  it('không cookie / chỉ n2f_sid / staff is_active=false: mọi API admin 401 no-store, DB không đổi; công khai 200', async () => {
    const member = await loginMember('storefront-i@example.com');
    const inactive = await loginStaff('inactive-i@nine2fine.test');
    await prisma.user.update({ where: { user_id: inactive.user.user_id }, data: { isActive: false } });
    const body = await settingsBody();
    const before = { row: await prisma.storeSetting.findUniqueOrThrow({ where: { id: 1 } }), events: await writes() };
    for (const cookie of [undefined, member.cookie, inactive.cookie]) {
      for (const path of READS) {
        const r = await iGet(path, cookie);
        expect(r.status, `${path} ${cookie?.slice(0, 8)}`).toBe(401);
        expect(r.body.error.code).toBe('unauthenticated');
        expect(r.headers['cache-control']).toMatch(/no-store/);
        assertNoSecrets(r);
      }
      const p = await iPut('/settings/store', { ...body, operations: { ...body.operations, shippingFee: 45_000 } }, cookie);
      expect(p.status).toBe(401);
      expect(p.headers['cache-control']).toMatch(/no-store/);
    }
    expect({ row: await prisma.storeSetting.findUniqueOrThrow({ where: { id: 1 } }), events: await writes() }).toEqual(before);
    const pub = await get('/api/store/settings', { ip: freshIp() });
    expect(pub.status).toBe(200);
    expect(Object.keys(pub.body).sort()).toEqual(['info', 'policy']);
  });
});

describe('T-INS-02 AC-INS-02, 03: phân quyền', () => {
  it('ma trận quyền; staff: báo cáo / CSV / cài đặt / nhật ký 403, tổng quan 200; admin: 200; hạ vai trò bằng SQL -> 403 không cần đăng nhập lại', async () => {
    expect(INSIGHT_PERMISSIONS.staff).toEqual(['dashboard.view']);
    const body = await settingsBody();
    for (const path of ['/reports/sales', '/reports/sales/export', '/settings/store', '/audit-log']) {
      const r = await iGet(path, staff.cookie);
      expect(r.status, path).toBe(403);
      expect(r.body.error.code).toBe('forbidden');
      expect(r.headers['cache-control']).toMatch(/no-store/);
    }
    const put = await iPut('/settings/store', { ...body, operations: { ...body.operations, shippingFee: 45_000 } }, staff.cookie);
    expect(put.status).toBe(403);
    expect(await writes()).toBe(0);
    expect((await prisma.storeSetting.findUniqueOrThrow({ where: { id: 1 } })).shippingFee).toBe(30_000);
    expect((await iGet('/dashboard', staff.cookie)).status).toBe(200);
    for (const path of READS) expect((await iGet(path, admin.cookie)).status, path).toBe(200);
    // staff bị 403 nhiều lần không đốt bộ đếm báo cáo
    for (let i = 0; i < 25; i++) expect((await iGet('/reports/sales', staff.cookie)).status).toBe(403);
    // admin bị hạ vai trò: có hiệu lực ngay (đọc lại từ DB mỗi yêu cầu)
    await prisma.$executeRawUnsafe(`UPDATE users SET role = 'staff' WHERE email = 'admin-i@nine2fine.test'`);
    expect((await iGet('/reports/sales', admin.cookie)).status).toBe(403);
    expect((await iGet('/settings/store', admin.cookie)).status).toBe(403);
    expect((await iGet('/dashboard', admin.cookie)).status).toBe(200);
  });
});

describe('T-INS-03 AC-INS-06: giới hạn tần suất', () => {
  it('21 yêu cầu báo cáo / 60 giây: 20 đầu 200, thứ 21 429 + Retry-After + retryAfterSeconds; hết cửa sổ lại 200', async () => {
    for (let i = 0; i < 20; i++) expect((await iGet('/reports/sales?from=2026-11-12&to=2026-11-12', admin.cookie)).status).toBe(200);
    const r = await iGet('/reports/sales?from=2026-11-12&to=2026-11-12', admin.cookie);
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe('rate-limited');
    expect(r.body.error.retryAfterSeconds).toBeGreaterThan(0);
    expect(r.headers['retry-after']).toBe(String(r.body.error.retryAfterSeconds));
    expect(r.headers['cache-control']).toMatch(/no-store/);
    // tài khoản admin khác không bị ảnh hưởng; Tổng quan (đọc 120) không dùng bộ đếm báo cáo
    expect((await iGet('/dashboard', admin.cookie)).status).toBe(200);
    advance(61_000);
    expect((await iGet('/reports/sales?from=2026-11-12&to=2026-11-12', admin.cookie)).status).toBe(200);
  });

  it('61 yêu cầu ghi (PUT cài đặt không đổi): thứ 61 là 429', async () => {
    const body = await settingsBody();
    for (let i = 0; i < 60; i++) expect((await iPut('/settings/store', body, admin.cookie)).status, `lần ${i + 1}`).toBe(200);
    const r = await iPut('/settings/store', body, admin.cookie);
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe('rate-limited');
    expect(await writes()).toBe(0);
  });
});

describe('T-INS-05 AC-INS-10: lỗi nhất quán, không rò chi tiết', () => {
  it('401, 403, 422, 429, 409: đúng code + HTTP, không stack / SQL / password_hash', async () => {
    const cases: Array<[string, number, string, Promise<{ status: number; body: any; text: string }>]> = [];
    cases.push(['401', 401, 'unauthenticated', iGet('/dashboard')]);
    cases.push(['403', 403, 'forbidden', iGet('/reports/sales', staff.cookie)]);
    cases.push(['422 range', 422, 'validation', iGet('/dashboard?range=week', admin.cookie)]);
    cases.push(['422 from', 422, 'validation', iGet('/reports/sales?from=2026-02-30', admin.cookie)]);
    cases.push(['422 settings', 422, 'validation', iPut('/settings/store', { updatedAt: 'x' }, admin.cookie)]);
    for (const [name, status, code, p] of cases) {
      const r = await p;
      expect(r.status, name).toBe(status);
      expect(r.body.error.code, name).toBe(code);
      expect(r.text, name).not.toMatch(/stack|SELECT|prisma|password_hash|at Object|node_modules/i);
      assertNoSecrets(r);
    }
    const body = await settingsBody();
    const first = await iPut('/settings/store', { ...body, operations: { ...body.operations, shippingFee: 36_000 } }, admin.cookie);
    expect(first.status).toBe(200);
    const conflict = await iPut('/settings/store', { ...body, operations: { ...body.operations, shippingFee: 37_000 } }, admin.cookie);
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('version-conflict');
    expect(conflict.text).not.toMatch(/stack|SELECT|prisma/i);
    for (let i = 0; i < 20; i++) await iGet('/reports/sales?from=2026-11-12&to=2026-11-12', admin.cookie);
    const limited = await iGet('/reports/sales', admin.cookie);
    expect(limited.status).toBe(429);
    expect(Object.keys(limited.body.error).sort()).toEqual(['code', 'message', 'retryAfterSeconds']);
  });
});
