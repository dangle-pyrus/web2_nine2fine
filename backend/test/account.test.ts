import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  A, advance, cookieFrom, createUser, del, flushMail, freshIp, get, loginMember, loginPassword, loginStaff, makeOrder, makeVoucher,
  mails, patch, post, prisma, put, resetCheckout, resetState, useClock,
} from './helpers';
import { resetCheckoutRateLimits } from '../src/middleware/rate-limit';
import { hashPassword } from '../src/lib/crypto';

/** Slice 5 Account. T-ACC-xx <-> AC-ACC-xx (PRD Slice 5 mục 5). */

beforeEach(async () => {
  vi.useRealTimers();
  await resetState();
  await resetCheckout();
});
afterEach(() => vi.useRealTimers());

const opts = (cookie?: string) => ({ cookie, ip: freshIp() });
const aget = (p: string, cookie?: string) => get(`/api/account${p}`, opts(cookie));
const apatch = (p: string, body: unknown, cookie?: string) => patch(`/api/account${p}`, body, opts(cookie));
const aput = (p: string, body: unknown, cookie?: string) => put(`/api/account${p}`, body, opts(cookie));
const apost = (p: string, body: unknown, cookie?: string) => post(`/api/account${p}`, body, opts(cookie));
const adel = (p: string, cookie?: string) => del(`/api/account${p}`, opts(cookie));

async function wards(province: string, n = 2): Promise<string[]> {
  return (await prisma.ward.findMany({ where: { provinceCode: province }, orderBy: { code: 'asc' }, take: n })).map((w) => w.code);
}
async function addr(over: Record<string, unknown> = {}) {
  const [w] = await wards('79', 1);
  return { recipient: 'Nguyễn Văn Minh', phone: '0912345678', provinceCode: '79', wardCode: w, street: '12 Lê Lợi, Quận 1', isDefault: false, ...over };
}

describe('T-ACC-01/02 quyền truy cập (AC-ACC-01, 02; AC-AUTH-88)', () => {
  it('không cookie, cookie bị thu hồi, chỉ có n2f_asid -> 401 unauthenticated + no-store', async () => {
    const m = await loginMember();
    const s = await loginStaff();
    await post('/api/auth/logout', {}, opts(m.cookie));
    for (const cookie of [undefined, m.cookie, s.cookie.replace('n2f_asid', 'n2f_asid')]) {
      for (const r of [await aget('/profile', cookie), await apatch('/profile', { phone: null }, cookie), await aget('/addresses', cookie)]) {
        expect(r.status).toBe(401);
        expect(r.body.error.code).toBe('unauthenticated');
        expect(r.headers['cache-control']).toBe('no-store');
        expect(r.body.email).toBeUndefined();
      }
    }
  });

  it('401 (chưa đăng nhập) khác 403 (staff gọi hành động chỉ admin)', async () => {
    const s = await loginStaff();
    const order = await makeOrder();
    const r401 = await aget('/profile');
    const r403 = await post(`/api/admin/orders/${order.code}/cancel`, { expectedStatus: 'to_ship', reason: 'other', note: 'thử quyền admin' }, opts(s.cookie));
    expect(r401.body.error.code).toBe('unauthenticated');
    expect(r403.status).toBe(403);
    expect(r403.body.error.code).toBe('forbidden');
  });

  it('phản hồi thành công cũng no-store', async () => {
    const m = await loginMember();
    const r = await aget('/profile', m.cookie);
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
  });
});

describe('T-ACC-04 giới hạn tần suất theo tài khoản (AC-ACC-04)', () => {
  it('ghi 30 / 60 giây: lần 31 -> 429 + Retry-After; tài khoản khác không bị ảnh hưởng', async () => {
    resetCheckoutRateLimits();
    const m = await loginMember();
    const other = await loginMember();
    for (let i = 0; i < 30; i++) expect((await apatch('/profile', { phone: '0912345678' }, m.cookie)).status).toBe(200);
    const r = await apatch('/profile', { phone: '0912345678' }, m.cookie);
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe('rate-limited');
    expect(r.body.error.retryAfterSeconds).toBeGreaterThan(0);
    expect(r.headers['retry-after']).toBeDefined();
    expect((await apatch('/profile', { phone: null }, other.cookie)).status).toBe(200);
    expect((await aget('/profile', m.cookie)).status).toBe(200);
  });
});

describe('T-ACC-05..08 hồ sơ (AC-ACC-05..08)', () => {
  it('GET trả đủ 6 trường, không lộ băm mật khẩu', async () => {
    await createUser({ email: 'ho.so@example.com', password: A.password, firstName: 'Minh', lastName: 'Nguyễn Văn' });
    const cookie = cookieFrom(await loginPassword('ho.so@example.com', A.password, freshIp()), 'n2f_sid')!;
    const r = await aget('/profile', cookie);
    expect(r.body).toEqual({ email: 'ho.so@example.com', firstName: 'Minh', lastName: 'Nguyễn Văn', birthDate: null, phone: null, hasPassword: true });
    expect(JSON.stringify(r.body)).not.toMatch(/hash|\$2/i);
  });

  it('SĐT: chuẩn hoá +84, sai -> 422 field phone, null -> xoá', async () => {
    const m = await loginMember();
    expect((await apatch('/profile', { phone: '+84 912 345 678' }, m.cookie)).body.phone).toBe('0912345678');
    const bad = await apatch('/profile', { phone: '0123' }, m.cookie);
    expect(bad.status).toBe(422);
    expect(bad.body.error).toMatchObject({ code: 'validation', field: 'phone' });
    expect((await apatch('/profile', { phone: null }, m.cookie)).body.phone).toBeNull();
  });

  it('ngày sinh: hôm nay / ngày không có -> validation; chưa 13 tuổi -> underage; hợp lệ / null', async () => {
    useClock('2026-11-08T03:00:00Z');
    const m = await loginMember();
    const cases: Array<[unknown, number, string?]> = [
      ['2026-11-08', 422, 'validation'],
      ['2014-11-08', 422, 'underage'],
      ['2000-02-30', 422, 'validation'],
      ['1899-12-31', 422, 'validation'],
      ['13/11/2000', 422, 'validation'],
      ['2013-11-08', 200],
      ['1999-05-01', 200],
    ];
    for (const [birthDate, status, code] of cases) {
      const r = await apatch('/profile', { birthDate }, m.cookie);
      expect(r.status, String(birthDate)).toBe(status);
      if (code) expect(r.body.error.code).toBe(code);
    }
    expect((await aget('/profile', m.cookie)).body.birthDate).toBe('1999-05-01');
    expect((await apatch('/profile', { birthDate: null }, m.cookie)).body.birthDate).toBeNull();
  });

  it('body rỗng / chỉ trường lạ -> 422, email không đổi', async () => {
    const m = await loginMember();
    for (const body of [{}, { email: 'x@y.vn' }, { firstName: 'X' }]) {
      const r = await apatch('/profile', body, m.cookie);
      expect(r.status).toBe(422);
      expect(r.body.error.code).toBe('validation');
    }
    expect((await aget('/profile', m.cookie)).body.email).toBe(m.email);
  });
});

describe('T-ACC-09..12 mật khẩu (AC-ACC-09..12)', () => {
  it('tạo mật khẩu khi chưa có: phiên hiện tại giữ, phiên khác bị thu hồi, đăng nhập mật khẩu được', async () => {
    const user = await createUser({ email: 'chua.mk@example.com' });
    // Hai phiên thật: đặt mật khẩu tạm bằng SQL, đăng nhập 2 lần, rồi xoá mật khẩu (= tài khoản đăng ký bằng mã).
    await prisma.user.update({ where: { user_id: user.user_id }, data: { passwordHash: await hashPassword('Tam12345') } });
    const c1 = cookieFrom(await loginPassword('chua.mk@example.com', 'Tam12345', freshIp()), 'n2f_sid')!;
    const c2 = cookieFrom(await loginPassword('chua.mk@example.com', 'Tam12345', freshIp()), 'n2f_sid')!;
    await prisma.user.update({ where: { user_id: user.user_id }, data: { passwordHash: null } });
    expect((await aget('/profile', c1)).body.hasPassword).toBe(false);

    const r = await aput('/password', { currentPassword: null, newPassword: 'Abcdef12' }, c1);
    expect(r.status).toBe(204);
    expect((await aget('/profile', c1)).body.hasPassword).toBe(true);
    expect((await aget('/profile', c2)).status).toBe(401);
    expect((await loginPassword('chua.mk@example.com', 'Abcdef12', freshIp())).status).toBe(200);
  });

  it('quy tắc mật khẩu mới và mật khẩu hiện tại bắt buộc', async () => {
    const m = await loginMember();
    for (const newPassword of ['abcdefgh', 'ABCDEFGH', 'Abc1', 'A1' + 'b'.repeat(63), A.password]) {
      const r = await aput('/password', { currentPassword: A.password, newPassword }, m.cookie);
      expect(r.status, newPassword).toBe(422);
      expect(r.body.error).toMatchObject({ code: 'validation', field: 'newPassword' });
    }
    const email = await createUser({ email: 'trung.email1@example.com', password: A.password });
    const ce = cookieFrom(await loginPassword(email.email, A.password, freshIp()), 'n2f_sid')!;
    const same = await aput('/password', { currentPassword: A.password, newPassword: 'TRUNG.EMAIL1@EXAMPLE.COM' }, ce);
    expect(same.body.error).toMatchObject({ code: 'validation', field: 'newPassword' });
    const missing = await aput('/password', { newPassword: 'Abcdef12' }, m.cookie);
    expect(missing.status).toBe(422);
    expect(missing.body.error).toMatchObject({ code: 'validation', field: 'currentPassword' });
  });

  it('sai mật khẩu hiện tại 5 lần -> lần 6 khoá 429 password-locked dù đúng; 15 phút sau đổi được', async () => {
    useClock('2026-11-08T03:00:00Z');
    const m = await loginMember();
    for (let i = 1; i <= 5; i++) {
      const r = await aput('/password', { currentPassword: 'Sai12345', newPassword: 'Moi123456' }, m.cookie);
      expect(r.status, `lần ${i}`).toBe(422);
      expect(r.body.error).toMatchObject({ code: 'invalid-password', field: 'currentPassword' });
    }
    const locked = await aput('/password', { currentPassword: A.password, newPassword: 'Moi123456' }, m.cookie);
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('password-locked');
    expect(locked.body.error.retryAfterSeconds).toBeGreaterThan(0);
    advance(15 * 60_000 + 1000);
    expect((await aput('/password', { currentPassword: A.password, newPassword: 'Moi123456' }, m.cookie)).status).toBe(204);
    expect((await loginPassword(m.email, 'Moi123456', freshIp())).status).toBe(200);
  });

  it('đổi đúng: phiên admin khác bị thu hồi, phiên hiện tại giữ, thư "mật khẩu đã thay đổi"', async () => {
    const s = await loginStaff();
    const store = cookieFrom(await loginPassword(s.email, A.password, freshIp()), 'n2f_sid')!;
    expect((await get('/api/admin/orders', opts(s.cookie))).status).toBe(200);
    mails.length = 0;
    expect((await aput('/password', { currentPassword: A.password, newPassword: 'Moi123456' }, store)).status).toBe(204);
    expect((await get('/api/admin/orders', opts(s.cookie))).status).toBe(401);
    expect((await aget('/profile', store)).status).toBe(200);
    await flushMail();
    expect(mails.filter((x) => x.to === s.email)).toHaveLength(1);
  });
});

describe('T-ACC-13..17 sổ địa chỉ (AC-ACC-13..17)', () => {
  it('địa chỉ đầu tiên mặc định; isDefault true chuyển mặc định; thứ tự; có tên tỉnh/phường', async () => {
    const m = await loginMember();
    const a = await apost('/addresses', await addr({ isDefault: false }), m.cookie);
    expect(a.status).toBe(201);
    expect(a.body.isDefault).toBe(true);
    expect(a.body.province).toMatchObject({ code: '79' });
    expect(a.body.province.name.length).toBeGreaterThan(0);
    expect(a.body.ward.name.length).toBeGreaterThan(0);
    expect(a.body.isReturn).toBe(false);
    const b = await apost('/addresses', await addr({ recipient: '  Trần   Thị  B ', isDefault: true }), m.cookie);
    expect(b.body).toMatchObject({ isDefault: true, recipient: 'Trần Thị B' });
    const list = await aget('/addresses', m.cookie);
    expect(list.body.map((x: { id: string }) => x.id)).toEqual([b.body.id, a.body.id]);
    expect(list.body.map((x: { isDefault: boolean }) => x.isDefault)).toEqual([true, false]);
  });

  it('dữ liệu sai: phường không thuộc tỉnh -> invalid-address; SĐT / số nhà / người nhận -> validation', async () => {
    const m = await loginMember();
    const [hn] = await wards('01', 1);
    const bad = await apost('/addresses', await addr({ wardCode: hn }), m.cookie);
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('invalid-address');
    for (const [over, field] of [[{ phone: '0123' }, 'phone'], [{ street: 'abc' }, 'street'], [{ street: 'x'.repeat(201) }, 'street'], [{ recipient: '   ' }, 'recipient'], [{ recipient: 'x'.repeat(101) }, 'recipient'], [{ provinceCode: '' }, 'provinceCode']] as const) {
      const r = await apost('/addresses', await addr(over), m.cookie);
      expect(r.status).toBe(422);
      expect(r.body.error).toMatchObject({ code: 'validation', field });
    }
    expect((await aget('/addresses', m.cookie)).body).toEqual([]);
  });

  it('tối đa 10 địa chỉ', async () => {
    const m = await loginMember();
    for (let i = 0; i < 10; i++) expect((await apost('/addresses', await addr({ street: `${i + 1} Lê Lợi` }), m.cookie)).status).toBe(201);
    const r = await apost('/addresses', await addr(), m.cookie);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatchObject({ code: 'validation', field: 'addresses' });
    expect(await prisma.address.count({ where: { userId: m.user.user_id } })).toBe(10);
  });

  it('sửa mặc định với isDefault false vẫn mặc định; xoá mặc định -> mới nhất còn lại; của người khác / id lạ -> 404', async () => {
    useClock('2026-11-08T03:00:00Z');
    const m = await loginMember();
    const other = await loginMember();
    const a = (await apost('/addresses', await addr({ street: '1 Lê Lợi' }), m.cookie)).body;
    advance(1000);
    const b = (await apost('/addresses', await addr({ street: '2 Lê Lợi' }), m.cookie)).body;
    advance(1000);
    const c = (await apost('/addresses', await addr({ street: '3 Lê Lợi' }), m.cookie)).body;
    const upd = await aput(`/addresses/${a.id}`, await addr({ street: '1A Lê Lợi', isDefault: false }), m.cookie);
    expect(upd.body).toMatchObject({ isDefault: true, street: '1A Lê Lợi' });
    expect((await adel(`/addresses/${a.id}`, m.cookie)).status).toBe(204);
    const list = (await aget('/addresses', m.cookie)).body as Array<{ id: string; isDefault: boolean }>;
    expect(list.map((x) => [x.id, x.isDefault])).toEqual([[c.id, true], [b.id, false]]);
    const theirs = (await apost('/addresses', await addr(), other.cookie)).body;
    expect((await adel(`/addresses/${theirs.id}`, m.cookie)).status).toBe(404);
    expect((await aput(`/addresses/${theirs.id}`, await addr(), m.cookie)).status).toBe(404);
    expect((await apost(`/addresses/${theirs.id}/default`, {}, m.cookie)).status).toBe(404);
    expect((await apost('/addresses/khong-phai-uuid/default', {}, m.cookie)).status).toBe(404);
    expect((await apost('/addresses/00000000-0000-0000-0000-000000000000/default', {}, m.cookie)).status).toBe(404);
    const def = await apost(`/addresses/${b.id}/default`, {}, m.cookie);
    expect(def.body.map((x: { id: string; isDefault: boolean }) => [x.id, x.isDefault])).toEqual([[b.id, true], [c.id, false]]);
    expect((await aget('/addresses', other.cookie)).body).toHaveLength(1);
  });

  it('đặt mặc định đồng thời (x20): luôn đúng 1 mặc định, không 500', async () => {
    const m = await loginMember();
    const a = (await apost('/addresses', await addr({ street: '1 Lê Lợi' }), m.cookie)).body;
    const b = (await apost('/addresses', await addr({ street: '2 Lê Lợi' }), m.cookie)).body;
    for (let i = 0; i < 20; i++) {
      resetCheckoutRateLimits();
      const rs = await Promise.all([apost(`/addresses/${a.id}/default`, {}, m.cookie), apost(`/addresses/${b.id}/default`, {}, m.cookie)]);
      expect(rs.map((r) => r.status)).toEqual([200, 200]);
      expect(await prisma.address.count({ where: { userId: m.user.user_id, isDefault: true } })).toBe(1);
    }
  });

  it('DB chặn hai mặc định cho một người', async () => {
    const m = await loginMember();
    await apost('/addresses', await addr(), m.cookie);
    const [w] = await wards('79', 1);
    await expect(
      prisma.address.create({ data: { userId: m.user.user_id, recipientName: 'X', phone_number: '0912345678', street: '1 Lê Lợi', provinceCode: '79', wardCode: w, isDefault: true } }),
    ).rejects.toThrow();
  });
});

describe('T-ACC-22 hạng thành viên (AC-ACC-22)', () => {
  it('chỉ đơn completed năm nay của chính thành viên', async () => {
    useClock('2026-11-08T03:00:00Z');
    const m = await loginMember();
    expect((await aget('/membership', m.cookie)).body).toEqual({ tier: 'bronze', spent: 0, nextTierAt: 18_000_000, reviewDate: '2026-12-31' });
    const set = async (o: { code: string }, total: number, data: Record<string, unknown>) =>
      prisma.order.update({ where: { code: o.code }, data: { subtotal: total, total, ...data } });
    await set(await makeOrder({ userId: m.user.user_id, status: 'completed' }), 12_000_000, { deliveredAt: new Date('2026-03-01T00:00:00Z'), paymentStatus: 'paid' });
    await set(await makeOrder({ userId: m.user.user_id, status: 'completed' }), 8_000_000, { deliveredAt: new Date('2025-12-31T17:30:00Z'), paymentStatus: 'paid' }); // 00:30 01/01/2026 giờ VN
    await set(await makeOrder({ userId: m.user.user_id, status: 'completed' }), 30_000_000, { deliveredAt: new Date('2025-12-31T16:30:00Z'), paymentStatus: 'paid' }); // 23:30 31/12/2025 giờ VN
    await set(await makeOrder({ userId: m.user.user_id, status: 'cancelled', data: { cancelledAt: new Date(), cancelledBy: 'customer' } }), 5_000_000, {});
    await set(await makeOrder({ userId: null, email: m.email, status: 'completed' }), 50_000_000, { deliveredAt: new Date(), paymentStatus: 'paid' });
    expect((await aget('/membership', m.cookie)).body).toEqual({ tier: 'silver', spent: 20_000_000, nextTierAt: 40_000_000, reviewDate: '2026-12-31' });
    await set(await makeOrder({ userId: m.user.user_id, status: 'completed' }), 20_000_000, { deliveredAt: new Date(), paymentStatus: 'paid' });
    expect((await aget('/membership', m.cookie)).body).toMatchObject({ tier: 'gold', spent: 40_000_000, nextTierAt: null });
  });
});

describe('T-ACC-23 ưu đãi (AC-ACC-23)', () => {
  it('chỉ mã đang dùng được, hạn gần trước, không hạn sau cùng', async () => {
    useClock('2026-11-08T03:00:00Z');
    await prisma.voucher.deleteMany({});
    const m = await loginMember();
    const day = 86400_000;
    await makeVoucher({ code: 'AOKHONGHAN', kind: 'percent', value: 15, maxDiscount: 200000, minSubtotal: 500000, membersOnly: true });
    await makeVoucher({ code: 'AGANHET', kind: 'free_shipping', value: null, endsAt: new Date(Date.now() + 2 * day) });
    await makeVoucher({ code: 'BHETHAN', endsAt: new Date(Date.now() - day) });
    await makeVoucher({ code: 'CTAT', isActive: false });
    await makeVoucher({ code: 'DHETLUOT', totalLimit: 3, usedCount: 3 });
    await makeVoucher({ code: 'FCHUABATDAU', startsAt: new Date(Date.now() + day) });
    const e = await makeVoucher({ code: 'EDADUNG' });
    const order = await makeOrder({ userId: m.user.user_id });
    await prisma.voucherRedemption.create({ data: { voucherId: e.voucher_id, orderId: order.id, userId: m.user.user_id, email: m.email, phone: '0912345678' } as never });
    await makeVoucher({ code: 'GDONDAU', firstOrderOnly: true });
    const r = await aget('/vouchers', m.cookie);
    expect(r.status).toBe(200);
    expect(r.body.map((v: { code: string }) => v.code)).toEqual(['AGANHET', 'AOKHONGHAN']);
    expect(r.body[0]).toMatchObject({ headline: 'Miễn phí giao hàng' });
    expect(r.body[1]).toMatchObject({ headline: 'Giảm 15%', subline: 'tối đa 200.000₫', expiresAt: null });
    expect(r.body[1].conditions).toContain('Đơn từ 500.000₫');
    expect(r.body[1].conditions).toContain('Chỉ thành viên');
  });
});

describe('T-ACC-26 migration (AC-ACC-26)', () => {
  it('chỉ cộng thêm: không DROP bảng/cột, không xoá dữ liệu', () => {
    const sql = readFileSync(path.resolve(__dirname, '../prisma/migrations/20261109000100_account_addresses/migration.sql'), 'utf8');
    const stripped = sql.replace(/ON DELETE (RESTRICT|CASCADE|SET NULL)/g, '').replace(/DROP NOT NULL/g, '').replace(/^--.*$/gm, '');
    expect(stripped).not.toMatch(/\b(DROP|TRUNCATE|DELETE|RENAME)\b/i);
  });

  it('addresses bật RLS', async () => {
    const rows = await prisma.$queryRaw<Array<{ relrowsecurity: boolean }>>`SELECT relrowsecurity FROM pg_class WHERE relname = 'addresses' AND relkind = 'r'`;
    expect(rows[0].relrowsecurity).toBe(true);
  });
});
