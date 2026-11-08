import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  advance, flushMail, freshIp, get, lastCode, loginMember, makeAwaitingPayment, makeVoucher, mails, orderBody, post, prisma,
  rawSetCookie, resetCheckout, resetState, setStock, stockOf, submitOrder, useClock, vid,
} from './helpers';
import { setEmailRetryDelays } from '../src/modules/order/order-email.service';
import { expireDueOrders, purgeExpired } from '../src/modules/order/expiry.job';
import { revokeAllUserSessions } from '../src/modules/auth/session.service';

let top: string;
let shirt: string;
let blazer: string;

beforeEach(async () => {
  vi.useRealTimers();
  setEmailRetryDelays([0, 0, 0]);
  await resetState();
  await resetCheckout();
  top = await vid('off-duty-top', 'Trắng', 'S');
  shirt = await vid('weekend-shirt', 'Trắng', 'S');
  blazer = await vid('the-everyday-blazer', 'Đen', 'S');
});

const it1 = (variantId: string, quantity = 1) => ({ variantId, quantity });
const cancel = (code: string, cookie?: string, body: unknown = {}) =>
  post(`/api/orders/${code}/cancel`, body, { cookie, ip: freshIp() });
const memberOrder = async (m: Awaited<ReturnType<typeof loginMember>>, items = [it1(top)], extra: Record<string, unknown> = {}) => {
  const res = await submitOrder(await orderBody(items, { cookie: m.cookie, email: m.email, ...extra }), { cookie: m.cookie });
  expect(res.status).toBe(201);
  return res.body.order as { id: string };
};

describe('T-CAN-01 huỷ đơn (AC-CHK-16, AC-CHK-29)', () => {
  it('to_ship: cancelled, cancelledBy customer, tồn hoàn đủ, email huỷ; huỷ lần hai 409, tồn không đổi', async () => {
    const m = await loginMember('huy@example.com');
    const o = await memberOrder(m, [it1(blazer, 3)]);
    await flushMail(); // thư xác nhận gửi xong trước khi huỷ
    expect(await stockOf(blazer)).toBe(2);
    const res = await cancel(o.id, m.cookie, { reason: 'Đổi ý' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'cancelled', cancelledBy: 'customer', cancelReason: 'Đổi ý', canCancel: false });
    expect(res.body.cancelledAt).toEqual(expect.any(String));
    expect(res.body.timeline.map((t: { title: string }) => t.title)).toEqual(['Đã đặt hàng', 'Đã huỷ đơn']);
    expect(await stockOf(blazer)).toBe(5);
    await flushMail();
    expect(mails.map((x) => x.subject)).toEqual([`nine2fine – Xác nhận đơn hàng #${o.id}`, `nine2fine – Đơn #${o.id} đã huỷ`]);
    expect(mails[1].text).toContain('Lý do: Đổi ý');
    const again = await cancel(o.id, m.cookie);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('not-cancellable');
    expect(await stockOf(blazer)).toBe(5);
  });

  it('to_pay huỷ được; to_receive / completed / cancel_requested -> 409 không hoàn gì thêm', async () => {
    const m = await loginMember('huy2@example.com');
    const a = await memberOrder(m, [it1(top, 2)]);
    await makeAwaitingPayment(a.id, new Date(Date.now() + 1800_000));
    expect((await cancel(a.id, m.cookie)).status).toBe(200);
    expect(await stockOf(top)).toBe(5);
    for (const st of ['to_receive', 'completed', 'cancel_requested'] as const) {
      const o = await memberOrder(m, [it1(shirt)], { phone: `09${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}` });
      await prisma.order.update({ where: { code: o.id }, data: { status: st, ...(st === 'cancel_requested' ? { cancelRequestedAt: new Date() } : {}) } });
      const r = await cancel(o.id, m.cookie);
      expect(r.status).toBe(409);
      expect(r.body.error.code).toBe('not-cancellable');
      await prisma.order.update({ where: { code: o.id }, data: { status: 'to_ship' } });
      await cancel(o.id, m.cookie);
    }
  });

  it('đơn của người khác -> 404; không phiên -> 401; mã sai dạng -> 404', async () => {
    const m = await loginMember('chu@example.com');
    const other = await loginMember('khac@example.com');
    const o = await memberOrder(m);
    expect((await cancel(o.id, other.cookie)).status).toBe(404);
    expect((await cancel(o.id)).status).toBe(401);
    expect((await cancel('abc', m.cookie)).status).toBe(404);
    expect((await get(`/api/orders/${o.id}`, { cookie: other.cookie })).status).toBe(404);
    expect((await get(`/api/orders/${o.id.toLowerCase()}`, { cookie: m.cookie })).status).toBe(200);
    expect((await get(`/api/orders/%23${o.id}`, { cookie: m.cookie })).status).toBe(200);
    expect(await prisma.order.count({ where: { status: 'cancelled' } })).toBe(0);
  });
});

describe('T-VOU-10 trả lượt voucher khi huỷ (AC-CHK-16)', () => {
  it('mã còn hạn: used_count giảm, released_at đặt, áp lại được', async () => {
    const m = await loginMember('vou10@example.com');
    const o = await memberOrder(m, [it1(top)], { voucherCodes: ['N2FWELCOME15'] });
    expect((await prisma.voucher.findUniqueOrThrow({ where: { code: 'N2FWELCOME15' } })).usedCount).toBe(1);
    await cancel(o.id, m.cookie);
    expect((await prisma.voucher.findUniqueOrThrow({ where: { code: 'N2FWELCOME15' } })).usedCount).toBe(0);
    expect((await prisma.voucherRedemption.findFirstOrThrow()).releasedAt).not.toBeNull();
    const q = await post('/api/checkout/quote', { items: [it1(top)], voucherCodes: ['N2FWELCOME15'], contact: { email: m.email } }, { cookie: m.cookie, ip: freshIp() });
    expect(q.body.vouchers[0].code).toBe('N2FWELCOME15');
  });

  it('mã đã hết hạn lúc huỷ: không trả lượt, vẫn tính lượt riêng của khách', async () => {
    const m = await loginMember('vou10b@example.com');
    const o = await memberOrder(m, [it1(top)], { voucherCodes: ['N2FWELCOME15'] });
    await prisma.voucher.update({ where: { code: 'N2FWELCOME15' }, data: { endsAt: new Date(Date.now() - 1000) } });
    await cancel(o.id, m.cookie);
    expect((await prisma.voucher.findUniqueOrThrow({ where: { code: 'N2FWELCOME15' } })).usedCount).toBe(1);
    expect((await prisma.voucherRedemption.findFirstOrThrow()).releasedAt).toBeNull();
    await prisma.voucher.update({ where: { code: 'N2FWELCOME15' }, data: { endsAt: new Date(Date.now() + 3600_000) } });
    const q = await post('/api/checkout/quote', { items: [it1(top)], voucherCodes: ['N2FWELCOME15'], contact: { email: m.email } }, { cookie: m.cookie, ip: freshIp() });
    expect(q.body.rejectedVouchers[0].reason).toBe('per-user-limit');
  });
});

describe('T-CAN-02 hết hạn thanh toán', () => {
  it('expireDueOrders: cancelled actor system, tồn + lượt voucher hoàn, email; chạy hai lần không hoàn hai lần', async () => {
    await makeVoucher({ code: 'TLIM', value: 50000, totalLimit: 3 });
    const m = await loginMember('het@example.com');
    const o = await memberOrder(m, [it1(blazer, 2)], { voucherCodes: ['TLIM'] });
    await makeAwaitingPayment(o.id, new Date(Date.now() - 60_000));
    expect(await stockOf(blazer)).toBe(3);
    expect(await expireDueOrders()).toBe(1);
    const row = await prisma.order.findUniqueOrThrow({ where: { code: o.id }, include: { events: true } });
    expect(row).toMatchObject({ status: 'cancelled', cancelledBy: 'system', cancelReason: 'Hết thời gian thanh toán' });
    expect(row.events.map((e) => e.actor)).toContain('system');
    expect(await stockOf(blazer)).toBe(5);
    expect((await prisma.voucher.findUniqueOrThrow({ where: { code: 'TLIM' } })).usedCount).toBe(0);
    expect(await expireDueOrders()).toBe(0);
    expect(await stockOf(blazer)).toBe(5);
    await flushMail();
    expect(mails.filter((x) => x.subject.includes('đã huỷ'))).toHaveLength(1);
  });

  it('đơn chưa tới hạn không bị huỷ; GET quá hạn thấy cancelled ngay (lười)', async () => {
    const m = await loginMember('lazy@example.com');
    const fresh = await memberOrder(m, [it1(top)]);
    await makeAwaitingPayment(fresh.id, new Date(Date.now() + 600_000));
    expect(await expireDueOrders()).toBe(0);
    const got = await get(`/api/orders/${fresh.id}`, { cookie: m.cookie });
    expect(got.body).toMatchObject({ status: 'to_pay', canCancel: true });
    expect(got.body.paymentDueAt).toEqual(expect.any(String));
    await prisma.order.update({ where: { code: fresh.id }, data: { paymentDueAt: new Date(Date.now() - 1000) } });
    const late = await get(`/api/orders/${fresh.id}`, { cookie: m.cookie });
    expect(late.body).toMatchObject({ status: 'cancelled', cancelledBy: 'system' });
    expect(late.body.paymentDueAt).toBeUndefined();
    expect(await stockOf(top)).toBe(5);
  });

  it('purgeExpired xoá khoá idempotency / quyền xem / OTP hết hạn và giỏ quá 30 ngày', async () => {
    const m = await loginMember('purge@example.com');
    await post('/api/cart/lines', { variantId: top, quantity: 1 }, { cookie: m.cookie });
    await memberOrder(m, [it1(shirt)]);
    expect(await prisma.idempotencyKey.count()).toBeGreaterThan(0);
    await purgeExpired(new Date(Date.now() + 31 * 24 * 3600_000));
    expect(await prisma.idempotencyKey.count()).toBe(0);
    expect(await prisma.cart.count()).toBe(0);
  });
});

describe('T-LKP tra cứu đơn khách bằng OTP (AC-CHK-31)', () => {
  const GUEST = 'khach.tracuu@example.com';
  const placeGuest = async () => {
    const res = await submitOrder(await orderBody([it1(top)], { email: GUEST }));
    expect(res.status).toBe(201);
    await flushMail();
    return res.body.order.id as string;
  };
  const codes = (orderCode: string, email: string, ip = freshIp()) => post('/api/orders/lookup/codes', { orderCode, email }, { ip });
  const verify = (orderCode: string, email: string, code: string, ip = freshIp()) =>
    post('/api/orders/lookup/verify', { orderCode, email, code }, { ip });

  it('T-LKP-01: cùng phản hồi cho khớp và không khớp; chỉ khớp mới có thư; 60 giây gửi lại', async () => {
    const code = await placeGuest();
    mails.length = 0;
    const ok = await codes(code, GUEST);
    const wrongOrder = await codes('N2F0000000000', GUEST);
    const wrongEmail = await codes(code, 'khac@example.com');
    const malformed = await codes('abc', GUEST);
    for (const r of [ok, wrongOrder, wrongEmail, malformed]) {
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ resendAfterSeconds: 60 });
    }
    await flushMail();
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe(GUEST);
    expect(lastCode(GUEST)).toMatch(/^\d{8}$/);
    // trong 60 giây gửi lại: không thêm thư, trả số giây còn lại
    const again = await codes(code, GUEST);
    expect(again.body.resendAfterSeconds).toBeLessThanOrEqual(60);
    await flushMail();
    expect(mails).toHaveLength(1);
    useClock(new Date(Date.now() + 61_000).toISOString());
    await codes(code, GUEST);
    await flushMail();
    expect(mails).toHaveLength(2);
  });

  it('T-LKP-02: verify đúng -> 200 + cookie n2f_oa, không userId; email hoa; sai -> cùng 404; OTP dùng lại 404', async () => {
    const code = await placeGuest();
    mails.length = 0;
    await codes(code, GUEST);
    await flushMail();
    const otp = lastCode(GUEST)!;
    const wrong = await verify(code, GUEST, otp === '00000000' ? '11111111' : '00000000');
    expect(wrong.status).toBe(404);
    expect(wrong.body.error).toMatchObject({ code: 'not-found', message: 'Không tìm thấy đơn hàng phù hợp.' });
    const wrongOrder = await verify('N2F0000000000', GUEST, otp);
    const wrongEmail = await verify(code, 'khac@example.com', otp);
    expect(wrongOrder.body).toEqual(wrong.body);
    expect(wrongEmail.body).toEqual(wrong.body);
    const ok = await verify(`#${code.toLowerCase()}`, GUEST.toUpperCase(), otp);
    expect(ok.status).toBe(200);
    expect(ok.body.id).toBe(code);
    expect(JSON.stringify(ok.body)).not.toMatch(/userId|user_id/);
    const cookie = rawSetCookie(ok, 'n2f_oa')!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/orders/);
    expect(cookie).toMatch(/Max-Age=1800/);
    expect(cookie).toMatch(/SameSite=Lax/i);
    const reuse = await verify(code, GUEST, otp);
    expect(reuse.status).toBe(404);
  });

  it('sai OTP nhiều lần -> 429 code-locked', async () => {
    const code = await placeGuest();
    await codes(code, GUEST);
    await flushMail();
    const otp = lastCode(GUEST)!;
    const bad = otp === '00000000' ? '11111111' : '00000000';
    const ip = freshIp();
    for (let i = 0; i < 4; i++) expect((await verify(code, GUEST, bad, ip)).status).toBe(404);
    const locked = await verify(code, GUEST, bad, ip);
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('code-locked');
    expect(locked.body.error.retryAfterSeconds).toBeGreaterThan(0);
    expect((await verify(code, GUEST, otp, ip)).status).toBe(429); // đã khoá, kể cả mã đúng
  });

  it('T-LKP-03: cookie n2f_oa xem / huỷ đúng đơn của nó 30 phút; sau 31 phút -> 401; đơn khác -> 404', async () => {
    const code = await placeGuest();
    const other = (await submitOrder(await orderBody([it1(shirt)], { email: 'nguoikhac@example.com', phone: '0988888888' }))).body.order.id as string;
    await codes(code, GUEST);
    await flushMail();
    const ok = await verify(code, GUEST, lastCode(GUEST)!);
    const cookie = `n2f_oa=${rawSetCookie(ok, 'n2f_oa')!.split(';')[0].split('=')[1]}`;
    const view = await get(`/api/orders/${code}`, { cookie });
    expect(view.status).toBe(200);
    expect(view.body.id).toBe(code);
    expect((await get(`/api/orders/${other}`, { cookie })).status).toBe(404);
    const member = await loginMember('thanhvienkhac@example.com');
    expect((await get(`/api/orders/${code}`, { cookie: member.cookie })).status).toBe(404);
    expect((await get(`/api/orders/${code}`)).status).toBe(401);
    useClock(new Date(Date.now() + 31 * 60_000).toISOString());
    expect((await get(`/api/orders/${code}`, { cookie })).status).toBe(401);
    expect((await cancel(code, cookie)).status).toBe(401);
    vi.useRealTimers();
    const c = await cancel(code, cookie);
    expect(c.status).toBe(200);
    expect(c.body.status).toBe('cancelled');
    expect(await stockOf(top)).toBe(5);
  });

  it('T-RL-01: 11 yêu cầu tra cứu / 15 phút / IP -> 429', async () => {
    const ip = freshIp();
    for (let i = 0; i < 10; i++) expect((await codes('N2F0000000000', `x${i}@example.com`, ip)).status).toBe(200);
    const res = await codes('N2F0000000000', 'x11@example.com', ip);
    expect(res.status).toBe(429);
    expect(res.body.error.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect((await verify('N2F0000000000', 'x@example.com', '12345678', ip)).status).toBe(429); // verify chung bộ đếm
  });

  it('email sai dạng -> 422 validation field email', async () => {
    const r = await codes('N2F2611040427', 'khong-hop-le');
    expect(r.status).toBe(422);
    expect(r.body.error.field).toBe('email');
  });
});

describe('T-LST-01 danh sách đơn thành viên (AC-CHK-32, AC-CHK-33)', () => {
  it('12 đơn: trang 1 có 10 mới nhất trước, trang 2 có 2; đơn người khác 404; phiên thu hồi -> 401, đơn không đổi', async () => {
    const m = await loginMember('ds@example.com');
    await setStock(top, 100);
    useClock('2026-11-09T03:00:00Z');
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await submitOrder(await orderBody([it1(top)], { cookie: m.cookie, email: m.email, phone: `09110000${String(i).padStart(2, '0')}` }), { cookie: m.cookie });
      expect(res.status).toBe(201);
      ids.push(res.body.order.id);
      advance(1000);
    }
    const p1 = await get('/api/orders?page=1', { cookie: m.cookie });
    expect(p1.status).toBe(200);
    expect(p1.body).toMatchObject({ total: 12, page: 1, limit: 10 });
    expect(p1.body.items.map((x: { id: string }) => x.id)).toEqual([...ids].reverse().slice(0, 10));
    const p2 = await get('/api/orders?page=2', { cookie: m.cookie });
    expect(p2.body.items.map((x: { id: string }) => x.id)).toEqual([ids[1], ids[0]]);
    expect((await get('/api/orders?page=0', { cookie: m.cookie })).status).toBe(422);
    expect((await get('/api/orders?limit=51', { cookie: m.cookie })).body.error.field).toBe('limit');
    const other = await loginMember('ds2@example.com');
    expect((await get(`/api/orders/${ids[0]}`, { cookie: other.cookie })).status).toBe(404);
    expect((await get('/api/orders', { cookie: other.cookie })).body.items).toEqual([]);
    await revokeAllUserSessions(m.user.user_id, 'test');
    const list = await get('/api/orders', { cookie: m.cookie });
    expect(list.status).toBe(401);
    expect(list.body.error.code).toBe('unauthenticated');
    expect((await cancel(ids[0], m.cookie)).status).toBe(401);
    expect((await prisma.order.findUniqueOrThrow({ where: { code: ids[0] } })).status).toBe('to_ship');
    expect((await get('/api/orders')).status).toBe(401);
  });
});

describe('payment (QR chưa bật)', () => {
  it('GET /orders/{code}/payment -> 404 khi QR tắt hoặc đơn COD', async () => {
    const m = await loginMember('pay@example.com');
    const o = await memberOrder(m);
    expect((await get(`/api/orders/${o.id}/payment`, { cookie: m.cookie })).status).toBe(404);
    expect((await get(`/api/orders/${o.id}/payment`)).status).toBe(401);
  });
});
