import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetCheckoutRateLimits } from '../src/middleware/rate-limit';
import { computeState } from '../src/modules/catalog-admin/promotion.query';
import {
  aDel, aGet, aPost, aPut, adminPost, del, freshIp, get, loginAdmin, loginMember, loginStaff, makeVoucher, orderBody, patch,
  post, prisma, resetCheckout, resetState, submitOrder, useClock, vid,
} from './helpers';

/** Lát 6.6 BE: khuyến mãi = voucher (T-INV-60..67, AC-INV-40..46, AC-INV-06 phần voucher). */

let admin: Awaited<ReturnType<typeof loginAdmin>>;
let staff: Awaited<ReturnType<typeof loginStaff>>;
let top: string; // off-duty-top Trắng/S 390.000

beforeEach(async () => {
  vi.useRealTimers();
  await resetState();
  await resetCheckout();
  admin = await loginAdmin('admin-v@nine2fine.test', { firstName: 'Quản', lastName: 'Trị' });
  staff = await loginStaff('staff-v@nine2fine.test');
  top = await vid('off-duty-top', 'Trắng', 'S');
  resetCheckoutRateLimits();
});

const A = () => admin.cookie;
const S = () => staff.cookie;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Dto = Record<string, any>;
const body = (over: Record<string, unknown> = {}) => ({
  code: 'SALE50K', title: 'Giảm 50K', type: 'fixed', value: 50000, maxDiscount: null, minSubtotal: 0, categories: [], usageLimit: null,
  perCustomerLimit: 3, audience: 'everyone', firstOrderOnly: false, excludeSaleItems: false, startsAt: null, endsAt: null, enabled: true, ...over,
});
const create = async (over: Record<string, unknown> = {}) => {
  const r = await aPost('/promotions', body(over), A());
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body as Dto;
};
/** Body PUT từ bản đọc được (như FE). */
const putBody = (d: Dto, over: Record<string, unknown> = {}) => ({
  code: d.code, title: d.title, type: d.type, value: d.value, maxDiscount: d.maxDiscount, minSubtotal: d.minSubtotal, categories: d.categories,
  usageLimit: d.usageLimit, perCustomerLimit: d.perCustomerLimit, audience: d.audience, firstOrderOnly: d.firstOrderOnly,
  excludeSaleItems: d.excludeSaleItems, startsAt: d.startsAt, endsAt: d.endsAt, enabled: d.enabled, updatedAt: d.updatedAt, ...over,
});
const quote = (voucherCodes: string[], quantity = 1, cookie?: string) =>
  post('/api/checkout/quote', { items: [{ variantId: top, quantity }], voucherCodes }, { ip: freshIp(), cookie });
let n = 0;
/** Đặt 1 đơn COD có mã (mỗi lần một số điện thoại / email riêng). */
const placeWith = async (codes: string[], quantity = 1) => {
  const phone = `09${String(20_000_000 + ++n).slice(-8)}`;
  return submitOrder(await orderBody([{ variantId: top, quantity }], { voucherCodes: codes, phone, email: `v${n}@example.com` }));
};

describe('T-INV-60 AC-INV-40: mã tạo ở admin dùng được ở checkout', () => {
  it('SALE50K fixed 50.000, tối thiểu 300.000: báo giá -50.000 ngay; /account/vouchers có mã; staff 403', async () => {
    expect((await aPost('/promotions', body(), S())).status).toBe(403);
    expect(await prisma.voucher.count({ where: { code: 'SALE50K' } })).toBe(0);
    const d = await create({ minSubtotal: 300000 });
    expect(d).toMatchObject({ code: 'SALE50K', title: 'Giảm 50K', type: 'fixed', value: 50000, state: 'running', used: 0, hasRedemptions: false, enabled: true, audience: 'everyone', categories: [] });
    expect(d.updatedBy).toEqual({ name: 'Trị Quản' });
    expect(new Date(d.startsAt).getTime()).toBeLessThanOrEqual(Date.now()); // trống = lúc tạo
    const q = await quote(['SALE50K']);
    expect(q.body.pricing).toMatchObject({ subtotal: 390000, discount: 50000 });
    const m = await loginMember('mem-v@example.com');
    const mine = await get('/api/account/vouchers', { cookie: m.cookie, ip: freshIp() });
    expect(mine.body.some((v: { code: string }) => v.code === 'SALE50K')).toBe(true);
    // Đọc lại: khớp
    expect((await aGet(`/promotions/${d.id}`, S())).body).toEqual(d);
  });
});

describe('T-INV-61 AC-INV-41: chuẩn hoá và kiểm giá trị', () => {
  it('mã sai -> 422 code; " sale 10 " lưu SALE10; trùng 409 duplicate; 4 ca giá trị / thời gian 422', async () => {
    for (const code of ['sale-10', 'AB1', 'x'.repeat(21), '']) {
      const r = await aPost('/promotions', body({ code }), A());
      expect(r.status, code).toBe(422);
      expect(r.body.error).toMatchObject({ code: 'validation', field: 'code' });
    }
    const ok = await aPost('/promotions', body({ code: ' sale 10 ' }), A());
    expect(ok.status).toBe(201);
    expect(ok.body.code).toBe('SALE10');
    const dup = await aPost('/promotions', body({ code: 'n2ffreeship', type: 'free-shipping', value: null }), A());
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatchObject({ code: 'duplicate', field: 'code' });
    const dup2 = await aPost('/promotions', body({ code: 'Sale 10' }), A());
    expect(dup2.body.error).toMatchObject({ code: 'duplicate', field: 'code' });

    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    const dayAfter = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ code: 'PCT95', type: 'percent', value: 95 }, 'value'],
      [{ code: 'PCT0', type: 'percent', value: 0 }, 'value'],
      [{ code: 'PCTMAX', type: 'percent', value: 10, maxDiscount: 999 }, 'maxDiscount'],
      [{ code: 'FSHIP', type: 'free-shipping', value: 10 }, 'value'],
      [{ code: 'FSHIP2', type: 'free-shipping', value: null, maxDiscount: 5000 }, 'maxDiscount'],
      [{ code: 'FIX500', type: 'fixed', value: 500 }, 'value'],
      [{ code: 'FIXMAX', type: 'fixed', value: 50000, maxDiscount: 5000 }, 'maxDiscount'],
      [{ code: 'ENDBEF', startsAt: dayAfter, endsAt: tomorrow }, 'endsAt'],
      [{ code: 'ENDEQ', startsAt: tomorrow, endsAt: tomorrow }, 'endsAt'],
      [{ code: 'ENDPAST', endsAt: yesterday }, 'endsAt'],
      [{ code: 'TTLX1', title: '   ' }, 'title'],
      [{ code: 'MINS', minSubtotal: -1 }, 'minSubtotal'],
      [{ code: 'LIM0', usageLimit: 0 }, 'usageLimit'],
      [{ code: 'PERU', perCustomerLimit: 11 }, 'perCustomerLimit'],
      [{ code: 'ENAB', enabled: 'yes' }, 'enabled'],
    ];
    for (const [over, field] of cases) {
      const r = await aPost('/promotions', body(over), A());
      expect(r.status, JSON.stringify(over)).toBe(422);
      expect(r.body.error, JSON.stringify(over)).toMatchObject({ code: 'validation', field });
    }
    // Hợp lệ biên: percent 90 + maxDiscount, free-shipping, bắt đầu tương lai
    const pct = await create({ code: 'PCT90', type: 'percent', value: 90, maxDiscount: 10_000_000 });
    expect(pct).toMatchObject({ type: 'percent', value: 90, maxDiscount: 10_000_000 });
    const fs = await create({ code: 'FSOK', type: 'free-shipping', value: null, startsAt: tomorrow });
    expect(fs).toMatchObject({ type: 'free-shipping', value: null, state: 'scheduled' });
    expect(await prisma.voucher.count({ where: { code: { in: ['PCT95', 'FSHIP', 'ENDPAST', 'SALE-10'] } } })).toBe(0);
  });
});

describe('T-INV-62 AC-INV-42: mã đã có lượt dùng', () => {
  it('khoá loại / giá trị / giảm tối đa, đổi mã 422, usageLimit < đã dùng 422 totalLimit; đổi minSubtotal áp từ báo giá kế tiếp', async () => {
    const w = await create({ code: 'WELC15', type: 'percent', value: 15, maxDiscount: 100000, usageLimit: 5 });
    const o1 = await placeWith(['WELC15']);
    expect(o1.status, JSON.stringify(o1.body)).toBe(201);
    const o2 = await placeWith(['WELC15']);
    expect(o2.status).toBe(201);
    const discount1 = o1.body.order.pricing?.discount ?? o1.body.order.discount;
    const cur = (await aGet(`/promotions/${w.id}`, S())).body;
    expect(cur).toMatchObject({ used: 2, hasRedemptions: true, state: 'running' });
    expect(cur.updatedAt).toBe(w.updatedAt); // dùng mã không làm đổi phiên bản admin

    const bad: Array<[Record<string, unknown>, number, string, string?]> = [
      [{ value: 20 }, 409, 'voucher-in-use'],
      [{ type: 'fixed', value: 50000, maxDiscount: null }, 409, 'voucher-in-use'],
      [{ maxDiscount: 50000 }, 409, 'voucher-in-use'],
      [{ maxDiscount: null }, 409, 'voucher-in-use'],
      [{ code: 'OTHER15' }, 422, 'validation', 'code'],
      [{ usageLimit: 1 }, 422, 'validation', 'totalLimit'],
    ];
    for (const [over, status, code, field] of bad) {
      const r = await aPut(`/promotions/${w.id}`, putBody(cur, over), A());
      expect(r.status, JSON.stringify(over)).toBe(status);
      expect(r.body.error.code).toBe(code);
      if (field) expect(r.body.error.field).toBe(field);
    }
    expect((await prisma.voucher.findUniqueOrThrow({ where: { voucher_id: w.id } })).value).toBe(15);
    expect((await aPut(`/promotions/${w.id}`, putBody(cur, { usageLimit: 2 }), S())).status).toBe(403);

    const ok = await aPut(`/promotions/${w.id}`, putBody(cur, { minSubtotal: 500000, usageLimit: 2, title: 'Mới', perCustomerLimit: 2 }), A());
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body).toMatchObject({ minSubtotal: 500000, usageLimit: 2, title: 'Mới', used: 2, state: 'expired', value: 15, code: 'WELC15' });
    expect(ok.body.updatedBy).toEqual({ name: 'Trị Quản' });
    // Mức mới áp từ báo giá kế tiếp (đã hết lượt -> exhausted); đơn cũ giữ số tiền giảm
    const q = await quote(['WELC15']);
    expect(q.body.rejectedVouchers[0]).toMatchObject({ code: 'WELC15', reason: 'exhausted' });
    const saved = await prisma.order.findFirstOrThrow({ where: { code: o1.body.order.id } });
    expect(saved.discount).toBe(discount1 ?? saved.discount);
    expect(saved.discount).toBeGreaterThan(0);
    // minSubtotal mới: nới tổng lượt rồi báo giá 390.000 < 500.000
    const cur2 = (await aGet(`/promotions/${w.id}`, S())).body;
    await sleep(3);
    await aPut(`/promotions/${w.id}`, putBody(cur2, { usageLimit: 10 }), A());
    expect((await quote(['WELC15'])).body.rejectedVouchers[0]).toMatchObject({ reason: 'min-spend', minSubtotal: 500000 });
  });

  it('chưa có lượt dùng: đổi loại / giá trị được; id lạ 404', async () => {
    const x = await create({ code: 'FREE1', usageLimit: 3 });
    const r = await aPut(`/promotions/${x.id}`, putBody(x, { type: 'percent', value: 10, maxDiscount: 20000 }), A());
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ type: 'percent', value: 10, maxDiscount: 20000 });
    expect((await aPut('/promotions/00000000-0000-4000-8000-000000000000', putBody(x), A())).status).toBe(404);
    expect((await aPut('/promotions/abc', putBody(x), A())).status).toBe(404);
    expect((await aGet('/promotions/abc', S())).status).toBe(404);
  });
});

describe('T-INV-63 AC-INV-43: tắt / bật có hiệu lực ngay', () => {
  it('tắt: báo giá gỡ kèm lý do; đặt hàng 409 voucher-changed; bật lại áp được; đúng giá trị hiện có vẫn 200', async () => {
    const x = await create({ code: 'LIVE50' });
    const staleBody = await orderBody([{ variantId: top, quantity: 1 }], { voucherCodes: ['LIVE50'], phone: '0911111111', email: 'live@example.com' });
    expect(staleBody.expected.pricing.discount).toBe(50000);
    const off = await patch(`/api/admin/promotions/${x.id}`, { enabled: false }, { cookie: A(), ip: freshIp() });
    expect(off.status).toBe(200);
    expect(off.body).toMatchObject({ enabled: false, state: 'disabled' });
    expect(off.body.updatedAt).not.toBe(x.updatedAt);
    const q = await quote(['LIVE50']);
    expect(q.body.rejectedVouchers[0]).toMatchObject({ code: 'LIVE50', applied: false });
    expect(q.body.pricing.discount).toBe(0);
    const placed = await submitOrder(staleBody);
    expect(placed.status).toBe(409);
    expect(placed.body.error.code).toBe('voucher-changed');
    expect(await prisma.order.count()).toBe(0);
    // Đúng giá trị hiện có: 200, không đổi phiên bản
    const again = await patch(`/api/admin/promotions/${x.id}`, { enabled: false }, { cookie: A(), ip: freshIp() });
    expect(again.status).toBe(200);
    expect(again.body.updatedAt).toBe(off.body.updatedAt);
    const on = await patch(`/api/admin/promotions/${x.id}`, { enabled: true }, { cookie: A(), ip: freshIp() });
    expect(on.body).toMatchObject({ enabled: true, state: 'running' });
    expect((await quote(['LIVE50'])).body.pricing.discount).toBe(50000);
    // updatedAt cũ trên PATCH -> 409; quyền / dạng
    const stale = await patch(`/api/admin/promotions/${x.id}`, { enabled: false, updatedAt: x.updatedAt }, { cookie: A(), ip: freshIp() });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('version-conflict');
    expect((await patch(`/api/admin/promotions/${x.id}`, { enabled: false }, { cookie: S(), ip: freshIp() })).status).toBe(403);
    expect((await patch(`/api/admin/promotions/${x.id}`, { enabled: 'no' }, { cookie: A(), ip: freshIp() })).status).toBe(422);
  });
});

describe('T-INV-64 AC-INV-44: xoá', () => {
  it('chưa dùng 204; đã dùng 409; dùng rồi huỷ (đã trả lượt) vẫn 409; staff 403; id lạ 404', async () => {
    const x = await create({ code: 'DEL1X' });
    const w = await create({ code: 'USED1' });
    const y = await create({ code: 'RELE1' });
    expect((await del(`/api/admin/promotions/${x.id}`, { cookie: S(), ip: freshIp() })).status).toBe(403);
    expect((await aDel(`/promotions/${x.id}`, A())).status).toBe(204);
    expect(await prisma.voucher.count({ where: { voucher_id: x.id } })).toBe(0);
    expect((await aDel(`/promotions/${x.id}`, A())).status).toBe(404);
    expect((await placeWith(['USED1'])).status).toBe(201);
    const wr = await aDel(`/promotions/${w.id}`, A());
    expect(wr.status).toBe(409);
    expect(wr.body.error.code).toBe('voucher-in-use');
    const oy = await placeWith(['RELE1']);
    expect(oy.status).toBe(201);
    const c = await adminPost(`/${oy.body.order.id}/cancel`, { expectedStatus: 'to_ship', reason: 'declined_on_call' }, S());
    expect(c.status, JSON.stringify(c.body)).toBe(200);
    const red = await prisma.voucherRedemption.findFirstOrThrow({ where: { voucherId: y.id } });
    expect(red.releasedAt).not.toBeNull();
    expect((await prisma.voucher.findUniqueOrThrow({ where: { voucher_id: y.id } })).usedCount).toBe(0);
    const yr = await aDel(`/promotions/${y.id}`, A());
    expect(yr.status).toBe(409);
    expect(yr.body.error.code).toBe('voucher-in-use');
    expect((await aGet(`/promotions/${y.id}`, S())).body).toMatchObject({ used: 0, hasRedemptions: true });
  });
});

describe('T-INV-65 AC-INV-45: trạng thái tính lúc đọc', () => {
  it('computeState: bảng ca (thứ tự disabled -> scheduled -> expired -> running)', () => {
    const at = new Date('2026-11-10T05:00:00.000Z');
    const h = (n: number) => new Date(at.getTime() + n * 3_600_000);
    const base = { enabled: true, startsAt: null as Date | null, endsAt: null as Date | null, usageLimit: null as number | null, used: 0 };
    const table: Array<[Partial<typeof base>, string]> = [
      [{}, 'running'],
      [{ enabled: false }, 'disabled'],
      [{ enabled: false, startsAt: h(1) }, 'disabled'],
      [{ enabled: false, endsAt: h(-1) }, 'disabled'],
      [{ startsAt: h(1) }, 'scheduled'],
      [{ startsAt: h(1), endsAt: h(2), usageLimit: 1, used: 1 }, 'scheduled'],
      [{ startsAt: at }, 'running'],
      [{ endsAt: h(-1) }, 'expired'],
      [{ endsAt: at }, 'expired'],
      [{ endsAt: h(1) }, 'running'],
      [{ usageLimit: 5, used: 5 }, 'expired'],
      [{ usageLimit: 5, used: 4 }, 'running'],
      [{ usageLimit: null, used: 999 }, 'running'],
    ];
    for (const [over, want] of table) expect(computeState({ ...base, ...over }, at), JSON.stringify(over)).toBe(want);
  });

  it('6 mã: disabled, scheduled, expired x3, running; counts khớp từng tab; SQL khớp computeState (múi giờ DB không ảnh hưởng)', async () => {
    await prisma.voucher.deleteMany();
    useClock(new Date().toISOString());
    const now = new Date();
    await makeVoucher({ code: 'ST0FF', isActive: false });
    await makeVoucher({ code: 'ST1SCH', startsAt: new Date(now.getTime() + 86_400_000) });
    await makeVoucher({ code: 'ST2YES', endsAt: new Date(now.getTime() - 86_400_000) });
    await makeVoucher({ code: 'ST3OUT', totalLimit: 5, usedCount: 5 });
    await makeVoucher({ code: 'ST4NOW', endsAt: now, startsAt: new Date(now.getTime() - 3_600_000) });
    await makeVoucher({ code: 'ST5OK' });
    const r = await aGet('/promotions', S());
    expect(r.status).toBe(200);
    const stateOf = Object.fromEntries(r.body.items.map((i: Dto) => [i.code, i.state]));
    expect(stateOf).toEqual({ ST0FF: 'disabled', ST1SCH: 'scheduled', ST2YES: 'expired', ST3OUT: 'expired', ST4NOW: 'expired', ST5OK: 'running' });
    expect(r.body.counts).toEqual({ all: 6, running: 1, scheduled: 1, expired: 3, disabled: 1 });
    for (const state of ['running', 'scheduled', 'expired', 'disabled'] as const) {
      const t = await aGet(`/promotions?state=${state}`, S());
      expect(t.body.items.length).toBe(r.body.counts[state]);
      expect(t.body.total).toBe(r.body.counts[state]);
      expect(t.body.items.every((i: Dto) => i.state === state)).toBe(true);
      expect(t.body.counts).toEqual(r.body.counts); // counts không theo state
    }
    // q theo mã hoặc tên (bỏ dấu), counts theo q
    await prisma.voucher.update({ where: { code: 'ST5OK' }, data: { name: 'Khuyến mãi Hè rực rỡ' } });
    const q = await aGet('/promotions?q=he%20ruc', S());
    expect(q.body.items.map((i: Dto) => i.code)).toEqual(['ST5OK']);
    expect(q.body.counts.all).toBe(1);
    expect((await aGet('/promotions?q=st3', S())).body.items.map((i: Dto) => i.code)).toEqual(['ST3OUT']);
    // 422 + phân trang + thứ tự
    for (const [qs, field] of [['state=zzz', 'state'], ['limit=101', 'limit'], ['page=0', 'page'], [`q=${'a'.repeat(101)}`, 'q']] as const) {
      const e = await aGet(`/promotions?${qs}`, S());
      expect(e.status, qs).toBe(422);
      expect(e.body.error.field).toBe(field);
    }
    const pg = await aGet('/promotions?limit=4&page=2', S());
    expect(pg.body).toMatchObject({ total: 6, page: 2, limit: 4 });
    expect(pg.body.items).toHaveLength(2);
  });
});

describe('T-INV-66 AC-INV-46: danh mục và đối tượng', () => {
  it('2 danh mục / tiers / customerIds / audience lạ -> 422, không lưu; 1 danh mục lưu được', async () => {
    const before = await prisma.voucher.count();
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ code: 'CAT2', categories: ['tops', 'bottoms'] }, 'categories'],
      [{ code: 'CATX', categories: ['khong-co'] }, 'categories'],
      [{ code: 'AUD1', audience: 'tiers' }, 'audience'],
      [{ code: 'AUD2', audience: 'customers' }, 'audience'],
      [{ code: 'AUD3', tiers: ['gold'] }, 'tiers'],
      [{ code: 'AUD4', customerIds: ['u1'] }, 'customerIds'],
    ];
    for (const [over, field] of cases) {
      const r = await aPost('/promotions', body(over), A());
      expect(r.status, JSON.stringify(over)).toBe(422);
      expect(r.body.error.field, JSON.stringify(over)).toBe(field);
    }
    expect(await prisma.voucher.count()).toBe(before);
    const ok = await create({ code: 'CAT1', categories: ['tops'], audience: 'members', firstOrderOnly: true, excludeSaleItems: true, tiers: [], customerIds: [] });
    expect(ok).toMatchObject({ categories: ['tops'], audience: 'members', firstOrderOnly: true, excludeSaleItems: true });
  });
});

describe('T-INV-67 AC-INV-06 (voucher): phiên bản', () => {
  it('A sửa, A2 giữ updatedAt cũ -> 409 version-conflict, không đổi', async () => {
    const x = await create({ code: 'VER01' });
    const a = (await aGet(`/promotions/${x.id}`, A())).body;
    const a2 = (await aGet(`/promotions/${x.id}`, S())).body;
    await sleep(5);
    const first = await aPut(`/promotions/${x.id}`, putBody(a, { title: 'Bản của A' }), A());
    expect(first.status).toBe(200);
    expect(first.body.updatedAt).not.toBe(a.updatedAt);
    const second = await aPut(`/promotions/${x.id}`, putBody(a2, { title: 'Bản của A2' }), A());
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('version-conflict');
    expect((await prisma.voucher.findUniqueOrThrow({ where: { voucher_id: x.id } })).name).toBe('Bản của A');
    // Với bản mới nhất thì lưu được
    expect((await aPut(`/promotions/${x.id}`, putBody(first.body, { title: 'Bản 3' }), A())).status).toBe(200);
  });

  it('một đơn dùng mã giữa chừng KHÔNG gây xung đột giả (checkout chỉ cập nhật updated_at / used_count)', async () => {
    const x = await create({ code: 'VER02', usageLimit: 10 });
    const read = (await aGet(`/promotions/${x.id}`, A())).body;
    await sleep(5);
    expect((await placeWith(['VER02'])).status).toBe(201);
    const row = await prisma.voucher.findUniqueOrThrow({ where: { voucher_id: x.id } });
    expect(row.usedCount).toBe(1);
    expect(row.updatedAt.getTime()).toBeGreaterThan(x.updatedAt ? new Date(x.updatedAt).getTime() : 0); // cột updated_at đã bị checkout đổi
    const r = await aPut(`/promotions/${x.id}`, putBody(read, { title: 'Sau đơn' }), A());
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ title: 'Sau đơn', used: 1 });
    // Đặt hàng sau khi admin sửa vẫn bình thường (admin không làm checkout báo xung đột)
    expect((await placeWith(['VER02'])).status).toBe(201);
    // Voucher seed cũ (admin_updated_at null): phiên bản = created_at, PUT được
    const legacy = (await aGet('/promotions?q=N2FFREESHIP', A())).body.items[0];
    expect(legacy.updatedAt).toBe(legacy.createdAt);
    const lr = await aPut(`/promotions/${legacy.id}`, putBody(legacy, { title: 'Freeship mới' }), A());
    expect(lr.status, JSON.stringify(lr.body)).toBe(200);
  });
});

describe('quyền, phiên, định dạng (BR-INV-01, 02, 47)', () => {
  it('không phiên 401 no-store; staff đọc được, ghi 403 trước cả Zod; thân sai dạng 422', async () => {
    const anon = await get('/api/admin/promotions', { ip: freshIp() });
    expect(anon.status).toBe(401);
    expect(anon.headers['cache-control']).toMatch(/no-store/);
    expect((await aGet('/promotions', S())).status).toBe(200);
    const bad = await aPost('/promotions', { rubbish: true }, S());
    expect(bad.status).toBe(403);
    const x = await create({ code: 'PERM1' });
    expect((await aPut(`/promotions/${x.id}`, {}, S())).status).toBe(403);
    expect((await aDel(`/promotions/${x.id}`, S())).status).toBe(403);
    const missing = await aPost('/promotions', {}, A());
    expect(missing.status).toBe(422);
    expect(JSON.stringify(missing.body)).not.toMatch(/SELECT|prisma|\bat\s/i);
    const noVersion = await aPut(`/promotions/${x.id}`, { ...putBody(x), updatedAt: undefined }, A());
    expect(noVersion.status).toBe(422);
    expect(noVersion.body.error.field).toBe('updatedAt');
  });
});
