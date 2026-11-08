import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  adminGet, adminPost, flushMail, freshIp, get, loginAdmin, loginMember, loginStaff, makeOrder, makeVoucher, mails, orderBody, post, prisma,
  resetCheckout, resetState, stockOf, submitOrder, vid,
} from './helpers';
import { setMailTransport } from '../src/mail/mailer';
import { insertOrderEvent } from '../src/modules/order/order-event';
import { retryPendingEventEmails, setEmailRetryDelays } from '../src/modules/order/order-email.service';
import { expireDueOrders } from '../src/modules/order/expiry.job';

/** Lát 4.4: bàn giao, giao xong, huỷ từ to_receive, hàng hoàn, email bàn giao / giao xong, idempotency, SMTP lỗi. T-ADM-xx <-> AC-ADM-xx. */

let top: string;
let blazer: string;
let shirt: string;

beforeEach(async () => {
  vi.useRealTimers();
  setEmailRetryDelays([0, 0, 0]);
  await resetState();
  await resetCheckout();
  top = await vid('off-duty-top', 'Trắng', 'S');
  blazer = await vid('the-everyday-blazer', 'Đen', 'S');
  shirt = await vid('weekend-shirt', 'Trắng', 'S');
});

const HOUR = 3600_000;
const act = (code: string, path: string, body: unknown, cookie: string, headers?: Record<string, string>) =>
  adminPost(`/${code}/${path}`, body, cookie, headers);
const row = (code: string) => prisma.order.findUniqueOrThrow({ where: { code }, include: { events: true } });
const eventsOf = async (code: string) => (await row(code)).events.length;
const snapshot = async (code: string) => {
  const o = await row(code);
  return JSON.stringify({ ...o, events: o.events.length });
};
const mailsFor = (code: string) => mails.filter((m) => m.subject.includes(`#${code}`));

/** Đơn khách thật qua POST /orders (trừ tồn, giữ lượt voucher). Khách vãng lai COD luôn cần gọi. */
async function placeOrder(items: Array<{ variantId: string; quantity: number }>, o: { voucherCodes?: string[]; phone?: string; email?: string } = {}) {
  const body = await orderBody(items, { phone: o.phone ?? '0912345678', email: o.email ?? 'khach@example.com', voucherCodes: o.voucherCodes ?? [] });
  const r = await submitOrder(body);
  if (r.status !== 201) throw new Error(`order ${r.status} ${JSON.stringify(r.body)}`);
  await flushMail();
  mails.length = 0;
  return r.body.order.id as string;
}

async function addCalls(code: string, times: Date[]) {
  const o = await prisma.order.findUniqueOrThrow({ where: { code } });
  for (const at of times) {
    await insertOrderEvent(prisma, { orderId: o.order_id, at, fromStatus: 'to_ship', toStatus: 'to_ship', paymentStatus: 'pending', actor: 'shop', kind: 'call_attempt' });
  }
}

const shipped = { carrier: 'GHTK', trackingNumber: 'ghtk-12345' };
const transitData = (tn: string) => ({ carrier: 'GHN', trackingNumber: tn, activeTrackingNumber: tn, handedOverAt: new Date() });

describe('T-ADM-13 sai trạng thái -> invalid-transition, không đổi gì (AC-ADM-13)', () => {
  it('5 cặp; expectedStatus đúng trạng thái thật', async () => {
    const admin = await loginAdmin();
    const pairs: Array<[Awaited<ReturnType<typeof makeOrder>>, string, string, Record<string, unknown>]> = [
      [await makeOrder({ status: 'completed', data: { paymentStatus: 'paid', deliveredAt: new Date() } }), 'completed', 'cancel', { reason: 'other', note: 'abcde' }],
      [await makeOrder({ status: 'cancelled', data: { cancelledAt: new Date(), cancelledBy: 'customer' } }), 'cancelled', 'ship', shipped],
      [await makeOrder({ status: 'to_receive', data: transitData('GHN-3001') }), 'to_receive', 'confirm', {}],
      [await makeOrder({ needsCall: false }), 'to_ship', 'deliver', {}],
      [await makeOrder({ status: 'to_pay' }), 'to_pay', 'ship', shipped],
    ];
    for (const [o, st, path, extra] of pairs) {
      const before = await snapshot(o.code);
      const stock = await stockOf(top);
      const r = await act(o.code, path, { expectedStatus: st, ...extra }, admin.cookie);
      expect(r.status).toBe(409);
      expect(r.body.error).toMatchObject({ code: 'invalid-transition', currentStatus: st });
      expect(await snapshot(o.code)).toBe(before);
      expect(await stockOf(top)).toBe(stock);
    }
    await flushMail();
    expect(mails).toHaveLength(0);
  });

  it('expectedStatus khác -> 409 order-state-changed kèm order + currentStatus; trước cả invalid-transition', async () => {
    const s = await loginStaff();
    const o = await makeOrder({ status: 'to_receive', data: transitData('GHN-3002') });
    const r = await act(o.code, 'ship', { expectedStatus: 'to_ship', ...shipped }, s.cookie);
    expect(r.status).toBe(409);
    expect(r.body.error).toMatchObject({ code: 'order-state-changed', currentStatus: 'to_receive', order: { id: o.code, status: 'to_receive' } });
    expect(r.body.error.order.allowedActions).toContain('deliver');
  });

  it('mã đơn lạ -> 404 (sau 422)', async () => {
    const s = await loginStaff();
    expect((await act('N2F0000000000', 'confirm', { expectedStatus: 'to_ship' }, s.cookie)).status).toBe(404);
    expect((await act('abc', 'confirm', { expectedStatus: 'to_ship' }, s.cookie)).status).toBe(404);
    expect((await act('N2F0000000000', 'confirm', {}, s.cookie)).status).toBe(422);
  });
});

describe('T-ADM-23 / 24 bàn giao (AC-ADM-23, 24)', () => {
  it('validate carrier / trackingNumber; trùng đơn chưa huỷ 422; trùng đơn đã huỷ hợp lệ', async () => {
    const s = await loginStaff();
    const { code } = await makeOrder({ needsCall: false });
    const bad: Array<[Record<string, unknown>, string]> = [
      [{ carrier: 'G', trackingNumber: 'GHTK-1' }, 'carrier'],
      [{ carrier: 'x'.repeat(51), trackingNumber: 'GHTK-1' }, 'carrier'],
      [{ carrier: 'GHTK', trackingNumber: 'ABC' }, 'trackingNumber'],
      [{ carrier: 'GHTK', trackingNumber: 'ab c!' }, 'trackingNumber'],
      [{ carrier: 'GHTK', trackingNumber: 'A'.repeat(41) }, 'trackingNumber'],
      [{ trackingNumber: 'GHTK-1' }, 'carrier'],
    ];
    for (const [b, field] of bad) {
      const r = await act(code, 'ship', { expectedStatus: 'to_ship', ...b }, s.cookie);
      expect(r.status).toBe(422);
      expect(r.body.error.field).toBe(field);
    }
    await makeOrder({ status: 'to_receive', data: transitData('DUP-0001') });
    const dup = await act(code, 'ship', { expectedStatus: 'to_ship', carrier: 'GHN', trackingNumber: 'dup-0001' }, s.cookie);
    expect(dup.status).toBe(422);
    expect(dup.body.error.field).toBe('trackingNumber');
    await makeOrder({ status: 'cancelled', data: { cancelledAt: new Date(), cancelledBy: 'shop', carrier: 'GHN', trackingNumber: 'OLD-0001', handedOverAt: new Date() } });
    const reuse = await act(code, 'ship', { expectedStatus: 'to_ship', carrier: 'GHN', trackingNumber: 'old-0001' }, s.cookie);
    expect(reuse.status).toBe(200);
    expect(reuse.body.shipment.trackingNumber).toBe('OLD-0001');
  });

  it('chưa xác nhận -> condition-not-met; xác nhận / không cần gọi -> 200 chữ hoa, tồn không đổi, pending; lần hai 409', async () => {
    const s = await loginStaff(undefined, { firstName: 'Bình', lastName: 'Võ' });
    const need = await makeOrder();
    const before = await snapshot(need.code);
    const r0 = await act(need.code, 'ship', { expectedStatus: 'to_ship', ...shipped }, s.cookie);
    expect(r0.status).toBe(409);
    expect(r0.body.error).toMatchObject({ code: 'condition-not-met', currentStatus: 'to_ship' });
    expect(await snapshot(need.code)).toBe(before);

    await act(need.code, 'confirm', { expectedStatus: 'to_ship' }, s.cookie);
    const stock = await stockOf(top);
    const r = await act(need.code, 'ship', { expectedStatus: 'to_ship', carrier: '  GHTK  ', trackingNumber: ' ghtk-12345 ' }, s.cookie);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      status: 'to_receive', paymentStatus: 'pending', tab: 'in-transit',
      shipment: { carrier: 'GHTK', trackingNumber: 'GHTK-12345', handedOverBy: { name: 'Võ Bình', role: 'staff' } },
      estimatedDelivery: { from: '2026-11-11', to: '2026-11-13' },
    });
    expect(r.body.allowedActions).toEqual(expect.arrayContaining(['deliver', 'cancel-refused', 'cancel-undeliverable']));
    expect(await stockOf(top)).toBe(stock);
    const db = await row(need.code);
    expect(db.handedOverAt).not.toBeNull();
    expect(db.activeTrackingNumber).toBe('GHTK-12345');
    const again = await act(need.code, 'ship', { expectedStatus: 'to_ship', carrier: 'GHN', trackingNumber: 'GHN-9' + '0000' }, s.cookie);
    expect(again.body.error.code).toBe('order-state-changed');
    const again2 = await act(need.code, 'ship', { expectedStatus: 'to_receive', carrier: 'GHN', trackingNumber: 'GHN-90000' }, s.cookie);
    expect(again2.body.error.code).toBe('invalid-transition');
    expect(db.events.filter((e) => e.kind === 'shipped')).toHaveLength(1);

    const free = await makeOrder({ needsCall: false });
    expect((await act(free.code, 'ship', { expectedStatus: 'to_ship', carrier: 'J&T', trackingNumber: 'JT-0001' }, s.cookie)).status).toBe(200);
  });
});

describe('T-ADM-25 / 28 email bàn giao, giao xong (AC-ADM-25, 28)', () => {
  it('order-shipped: tiêu đề, đơn vị, mã, ngày dự kiến, số tiền thu, địa chỉ, chống lừa đảo; order-delivered: đủ mục, không mời đánh giá', async () => {
    const s = await loginStaff();
    const { code } = await makeOrder({ needsCall: false });
    await act(code, 'ship', { expectedStatus: 'to_ship', ...shipped }, s.cookie);
    await flushMail();
    const [m] = mailsFor(code);
    expect(m.to).toBe('khach@example.com');
    expect(m.subject).toBe(`nine2fine – Đơn #${code} đã được giao cho đơn vị vận chuyển`);
    for (const part of ['GHTK', 'GHTK-12345', '11/11/2026 - 13/11/2026', 'Số tiền shipper thu khi giao', '12 Phố Huế', 'Nguyễn Văn A', 'Hotline CSKH', 'không hỏi mật khẩu hay mã OTP', `/track-order?code=${code}`]) {
      expect(m.text).toContain(part);
    }
    mails.length = 0;
    const d = await act(code, 'deliver', { expectedStatus: 'to_receive' }, s.cookie);
    expect(d.status).toBe(200);
    await flushMail();
    const [m2] = mailsFor(code);
    expect(m2.subject).toBe(`nine2fine – Đơn #${code} đã giao thành công`);
    for (const part of [`#${code}`, 'Off-Duty', '/policies/returns', 'Hotline CSKH', 'không hỏi mật khẩu hay mã OTP']) expect(m2.text.toLowerCase()).toContain(part.toLowerCase());
    expect(m2.text).toMatch(/lúc \d{2}:\d{2} \d{2}\/\d{2}\/\d{4}/);
    expect(m2.text).not.toMatch(/đánh giá|review/i);
    const ev = (await row(code)).events.filter((e) => e.emailTemplate);
    expect(ev.every((e) => e.emailSentAt !== null && e.emailAttempts === 1)).toBe(true);
  });
});

describe('T-ADM-26 / 27 giao thành công, completed là cuối (AC-ADM-26, 27)', () => {
  it('completed + paid + paidAt/deliveredAt, 1 sự kiện; lần hai 409; to_ship 409; khách huỷ 409 not-cancellable', async () => {
    const s = await loginStaff();
    const admin = await loginAdmin();
    const m = await loginMember('nhan@example.com');
    const { code } = await makeOrder({ status: 'to_receive', userId: m.user.user_id, data: transitData('GHN-4001') });
    const r = await act(code, 'deliver', { expectedStatus: 'to_receive' }, s.cookie);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'completed', paymentStatus: 'paid', tab: 'completed' });
    expect(r.body.deliveredAt).toBe(r.body.paidAt);
    expect(r.body.allowedActions).toEqual(['add-note']);
    const db = await row(code);
    expect(db.deliveredBy).toBe(s.user.user_id);
    expect(db.events.filter((e) => e.kind === 'delivered')).toHaveLength(1);
    expect((await act(code, 'deliver', { expectedStatus: 'to_receive' }, s.cookie)).body.error.code).toBe('order-state-changed');
    for (const [path, extra] of [['deliver', {}], ['cancel', { reason: 'other', note: 'abcde' }], ['ship', shipped], ['cancel', { reason: 'refused' }]] as const) {
      expect((await act(code, path, { expectedStatus: 'completed', ...extra }, admin.cookie)).body.error.code).toBe('invalid-transition');
    }
    const c = await post(`/api/orders/${code}/cancel`, {}, { cookie: m.cookie, ip: freshIp() });
    expect(c.body.error.code).toBe('not-cancellable');
    const dto = await get(`/api/orders/${code}`, { cookie: m.cookie, ip: freshIp() });
    expect(dto.body).toMatchObject({ status: 'completed', deliveredAt: r.body.deliveredAt, shipment: { carrier: 'GHN', trackingNumber: 'GHN-4001' } });
    const toShip = await makeOrder({ needsCall: false });
    expect((await act(toShip.code, 'deliver', { expectedStatus: 'to_ship' }, s.cookie)).body.error.code).toBe('invalid-transition');
  });
});

describe('T-ADM-31 / 32 refused từ to_receive, giới hạn COD (AC-ADM-31, 32)', () => {
  it('refused: cancelled, delivery_refused_at, tồn chưa cộng, voucher trả, tab returning, email câu chuẩn', async () => {
    const s = await loginStaff();
    await makeVoucher({ code: 'TV31', value: 50000 });
    const code = await placeOrder([{ variantId: blazer, quantity: 2 }], { voucherCodes: ['TV31'] });
    await act(code, 'confirm', { expectedStatus: 'to_ship' }, s.cookie);
    await act(code, 'ship', { expectedStatus: 'to_ship', ...shipped }, s.cookie);
    const stock = await stockOf(blazer);
    await flushMail();
    mails.length = 0;
    const r = await act(code, 'cancel', { expectedStatus: 'to_receive', reason: 'refused' }, s.cookie);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'cancelled', tab: 'returning', returnHandling: { state: 'pending' }, cancellation: { by: 'shop', reasonCode: 'refused' } });
    expect(r.body.allowedActions).toEqual(expect.arrayContaining(['restock', 'write-off']));
    expect(r.body.stockRestoredAt).toBeUndefined();
    expect(await stockOf(blazer)).toBe(stock);
    expect((await prisma.voucher.findUniqueOrThrow({ where: { code: 'TV31' } })).usedCount).toBe(0);
    const db = await row(code);
    expect(db.deliveryRefusedAt).not.toBeNull();
    expect(db.activeTrackingNumber).toBeNull();
    expect(db.trackingNumber).toBe('GHTK-12345');
    await flushMail();
    expect(mailsFor(code)[0].text).toContain('Đơn không được nhận khi giao hàng.');
    expect((await adminGet('/counts', s.cookie)).body.returning).toBe(1);
  });

  it('2 đơn refused cùng SĐT -> COD khoá too-many-refusals; undeliverable / other không tính; SĐT khác mở', async () => {
    const s = await loginStaff();
    const admin = await loginAdmin();
    const phone = '0944000111';
    const quote = (p: string) =>
      post('/api/checkout/quote', { items: [{ variantId: top, quantity: 1 }], voucherCodes: [], contact: { phone: p, email: 'q@example.com' } }, { ip: freshIp() });
    const mk = async (n: number) => (await makeOrder({ status: 'to_receive', phone, data: transitData(`R-000${n}`) })).code;
    const [a, b, c, d] = [await mk(1), await mk(2), await mk(3), await mk(4)];
    await act(c, 'cancel', { expectedStatus: 'to_receive', reason: 'undeliverable' }, s.cookie);
    await act(d, 'cancel', { expectedStatus: 'to_receive', reason: 'other', note: 'abcde' }, admin.cookie);
    await act(a, 'cancel', { expectedStatus: 'to_receive', reason: 'refused' }, s.cookie);
    expect((await quote(phone)).body.paymentMethods[0]).toMatchObject({ method: 'cod', available: true });
    await act(b, 'cancel', { expectedStatus: 'to_receive', reason: 'refused' }, s.cookie);
    expect((await quote(phone)).body.paymentMethods[0]).toEqual({ method: 'cod', available: false, reason: 'too-many-refusals' });
    expect((await quote('0944000222')).body.paymentMethods[0].available).toBe(true);
  });
});

describe('T-ADM-33 / 34 hàng hoàn (AC-ADM-33, 34)', () => {
  const returning = async (n: number) =>
    (await makeOrder({
      status: 'cancelled', items: [{ variantId: blazer, quantity: 2 }],
      data: { cancelledAt: new Date(), cancelledBy: 'shop', cancelReasonCode: 'undeliverable', returnedFromTransit: true, carrier: 'GHN', trackingNumber: `RS-000${n}`, handedOverAt: new Date() },
    })).code;

  it('restocked: tồn +2, return_handled_at, vẫn cancelled, 1 sự kiện; lần hai 409', async () => {
    const s = await loginStaff();
    const code = await returning(1);
    const stock = await stockOf(blazer);
    const r = await act(code, 'returned-stock', { expectedStatus: 'cancelled', decision: 'restocked' }, s.cookie);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'cancelled', tab: 'cancelled', returnHandling: { state: 'restocked', decidedBy: { role: 'staff' } } });
    expect(r.body.stockRestoredAt).toBeDefined();
    expect(await stockOf(blazer)).toBe(stock + 2);
    const db = await row(code);
    expect(db.returnHandledAt).not.toBeNull();
    expect(db.events.filter((e) => e.kind === 'stock_restocked')).toHaveLength(1);
    for (const decision of ['restocked', 'written_off']) {
      const again = await act(code, 'returned-stock', { expectedStatus: 'cancelled', decision, note: 'hàng hỏng' }, s.cookie);
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe('invalid-transition');
    }
    expect(await stockOf(blazer)).toBe(stock + 2);
    await flushMail();
    expect(mails).toHaveLength(0);
  });

  it('written_off: note rỗng / 4 -> 422; 5 -> 200 tồn không đổi, rời returning; rồi restocked 409; đơn huỷ từ to_ship 409', async () => {
    const s = await loginStaff();
    const code = await returning(2);
    const stock = await stockOf(blazer);
    for (const note of [undefined, '', 'abcd']) {
      const r = await act(code, 'returned-stock', { expectedStatus: 'cancelled', decision: 'written_off', ...(note === undefined ? {} : { note }) }, s.cookie);
      expect(r.status).toBe(422);
      expect(r.body.error.field).toBe('note');
    }
    const r = await act(code, 'returned-stock', { expectedStatus: 'cancelled', decision: 'written_off', note: 'rách hộp' }, s.cookie);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ tab: 'cancelled', returnHandling: { state: 'written_off', note: 'rách hộp' } });
    expect(r.body.stockRestoredAt).toBeUndefined();
    expect(await stockOf(blazer)).toBe(stock);
    expect((await act(code, 'returned-stock', { expectedStatus: 'cancelled', decision: 'restocked' }, s.cookie)).body.error.code).toBe('invalid-transition');
    expect(await stockOf(blazer)).toBe(stock);

    const fromShip = await makeOrder();
    await act(fromShip.code, 'cancel', { expectedStatus: 'to_ship', reason: 'declined_on_call' }, s.cookie);
    expect((await act(fromShip.code, 'returned-stock', { expectedStatus: 'cancelled', decision: 'restocked' }, s.cookie)).body.error.code).toBe('invalid-transition');
    expect((await act(fromShip.code, 'returned-stock', { expectedStatus: 'cancelled', decision: 'bogus' }, s.cookie)).body.error.field).toBe('decision');
  });
});

describe('T-ADM-12 DTO khách sau thao tác thật không lộ nhân viên (AC-ADM-12)', () => {
  it('đặt hàng + đang vận chuyển (đơn vị + mã); không lần gọi / ghi chú / tên / UUID nhân viên', async () => {
    const s = await loginStaff('lan.nv@nine2fine.test', { firstName: 'Lan', lastName: 'Đỗ' });
    const m = await loginMember('kh12@example.com');
    const { code } = await makeOrder({ userId: m.user.user_id });
    await act(code, 'call-attempts', { expectedStatus: 'to_ship', note: 'máy bận lần 1' }, s.cookie);
    await act(code, 'confirm', { expectedStatus: 'to_ship' }, s.cookie);
    await act(code, 'ship', { expectedStatus: 'to_ship', ...shipped }, s.cookie);
    const dto = await get(`/api/orders/${code}`, { cookie: m.cookie, ip: freshIp() });
    expect(dto.status).toBe(200);
    expect(dto.body.timeline.map((t: { title: string }) => t.title)).toEqual(['Đã đặt hàng', 'Đang vận chuyển']);
    expect(dto.body.timeline[1]).toMatchObject({ actor: 'nine2fine', detail: 'GHTK - GHTK-12345' });
    const json = JSON.stringify(dto.body);
    for (const leak of [s.user.user_id, 'lan.nv@nine2fine.test', 'Đỗ Lan', 'máy bận', 'call_attempt']) expect(json).not.toContain(leak);
  });
});

describe('T-ADM-17 Idempotency-Key (AC-ADM-17)', () => {
  it('cùng khoá + body -> 200 Idempotency-Replayed; khác body / người khác -> 409; sai dạng 422; lỗi 4xx không lưu khoá', async () => {
    const s = await loginStaff();
    const s2 = await loginStaff();
    const { code } = await makeOrder({ needsCall: false });
    const key = { 'Idempotency-Key': 'ship-intent-000000000001' };
    const bad = await act(code, 'ship', { expectedStatus: 'to_receive', ...shipped }, s.cookie, key);
    expect(bad.status).toBe(409);
    expect(await prisma.idempotencyKey.count({ where: { scope: 'admin-action' } })).toBe(0);
    const r1 = await act(code, 'ship', { expectedStatus: 'to_ship', ...shipped }, s.cookie, key);
    expect(r1.status).toBe(200);
    expect(r1.headers['idempotency-replayed']).toBeUndefined();
    const r2 = await act(code, 'ship', { expectedStatus: 'to_ship', ...shipped }, s.cookie, key);
    expect(r2.status).toBe(200);
    expect(r2.headers['idempotency-replayed']).toBe('true');
    expect(r2.body).toEqual(r1.body);
    const diff = await act(code, 'ship', { expectedStatus: 'to_ship', carrier: 'GHN', trackingNumber: 'GHN-1' + '000' }, s.cookie, key);
    expect(diff.body.error.code).toBe('idempotency-conflict');
    const other = await act(code, 'ship', { expectedStatus: 'to_ship', ...shipped }, s2.cookie, key);
    expect(other.body.error.code).toBe('idempotency-conflict');
    const otherPath = await act(code, 'deliver', { expectedStatus: 'to_ship', ...shipped }, s.cookie, key);
    expect(otherPath.status).toBe(409);
    expect((await act(code, 'deliver', { expectedStatus: 'to_receive' }, s.cookie, { 'Idempotency-Key': 'short' })).body.error).toMatchObject({ code: 'validation', field: 'Idempotency-Key' });
    expect((await row(code)).events.filter((e) => e.kind === 'shipped')).toHaveLength(1);
    await flushMail();
    expect(mailsFor(code)).toHaveLength(1);
  });
});

describe('T-ADM-43 SMTP lỗi không đổi nghiệp vụ (AC-ADM-43)', () => {
  it('ship vẫn 200; thử 3 lần; báo CSKH không kèm email khách; job bù gửi thư còn treo', async () => {
    const s = await loginStaff();
    const sent: Array<{ to: string; subject: string; text: string }> = [];
    let tries = 0;
    setMailTransport({
      async send(m) {
        if (m.to === 'khach@example.com') {
          tries++;
          throw new Error('smtp down');
        }
        sent.push(m);
      },
    });
    const { code } = await makeOrder({ needsCall: false });
    const r = await act(code, 'ship', { expectedStatus: 'to_ship', ...shipped }, s.cookie);
    expect(r.status).toBe(200);
    await flushMail();
    expect(tries).toBe(3);
    expect((await row(code)).status).toBe('to_receive');
    const ev = (await row(code)).events.find((e) => e.kind === 'shipped')!;
    expect(ev.emailAttempts).toBe(3);
    expect(ev.emailSentAt).toBeNull();
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe(`Không gửi được email đơn ${code}`);
    expect(sent[0].text).not.toContain('khach@example.com');

    // Job bù: sự kiện có thư, chưa gửi, 5 phút tuổi.
    setMailTransport({ async send(m) { sent.push(m); } });
    const o2 = await makeOrder({ status: 'to_receive', data: transitData('GHN-5001') });
    const ev2 = await insertOrderEvent(prisma, {
      orderId: o2.id, at: new Date(Date.now() - 5 * 60_000), fromStatus: 'to_ship', toStatus: 'to_receive', paymentStatus: 'pending',
      actor: 'shop', kind: 'shipped', emailTemplate: 'order-shipped',
    });
    expect(await retryPendingEventEmails()).toBe(1);
    expect(await retryPendingEventEmails()).toBe(0);
    expect(sent.filter((m) => m.subject.includes(o2.code))).toHaveLength(1);
    expect((await prisma.orderEvent.findUniqueOrThrow({ where: { event_id: ev2 } })).emailSentAt).not.toBeNull();
  });
});

describe('T-ADM-60 tích hợp qua POST /orders (AC-ADM-21, 24, 26)', () => {
  it('đặt COD cần gọi -> gọi x3 -> unreachable; đặt -> xác nhận -> bàn giao -> giao xong; tồn khớp từng bước', async () => {
    const s = await loginStaff();
    const base = await stockOf(top);
    const a = await placeOrder([{ variantId: top, quantity: 1 }], { phone: '0961000001', email: 'a1@example.com' });
    expect(await stockOf(top)).toBe(base - 1);
    for (let i = 0; i < 3; i++) expect((await act(a, 'call-attempts', { expectedStatus: 'to_ship' }, s.cookie)).status).toBe(200);
    const d = await adminGet(`/${a}`, s.cookie);
    expect(d.body.allowedActions).toContain('cancel-unreachable');
    expect((await act(a, 'cancel', { expectedStatus: 'to_ship', reason: 'unreachable' }, s.cookie)).status).toBe(200);
    expect(await stockOf(top)).toBe(base);

    const b = await placeOrder([{ variantId: top, quantity: 2 }], { phone: '0961000002', email: 'a2@example.com' });
    expect(await stockOf(top)).toBe(base - 2);
    expect((await act(b, 'confirm', { expectedStatus: 'to_ship' }, s.cookie)).status).toBe(200);
    expect((await act(b, 'ship', { expectedStatus: 'to_ship', carrier: 'Viettel Post', trackingNumber: 'VTP-777' + '1' }, s.cookie)).status).toBe(200);
    expect(await stockOf(top)).toBe(base - 2);
    const done = await act(b, 'deliver', { expectedStatus: 'to_receive' }, s.cookie);
    expect(done.body).toMatchObject({ status: 'completed', paymentStatus: 'paid' });
    expect(await stockOf(top)).toBe(base - 2);
    const tl = (await adminGet(`/${b}`, s.cookie)).body.timeline.map((t: { kind: string }) => t.kind);
    expect(tl).toEqual(['delivered', 'shipped', 'confirmed', 'placed']);
  });
});
