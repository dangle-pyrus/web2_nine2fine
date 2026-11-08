import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  adminGet, adminPost, flushMail, freshIp, get, loginAdmin, loginMember, loginStaff, makeOrder, makeVoucher, mails, orderBody, post, prisma,
  resetCheckout, resetState, stockOf, submitOrder, vid,
} from './helpers';
import { setMailTransport } from '../src/mail/mailer';
import { insertOrderEvent } from '../src/modules/order/order-event';
import { retryPendingEventEmails, setEmailRetryDelays } from '../src/modules/order/order-email.service';
import { expireDueOrders } from '../src/modules/order/expiry.job';

/** Lát 4.3: ghi cuộc gọi, xác nhận, dịch vụ huỷ dùng chung (mọi lý do), email huỷ do shop. T-ADM-xx <-> AC-ADM-xx. */

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

describe('T-ADM-18 ghi nhận không liên lạc được (AC-ADM-18)', () => {
  it('nhiều lần, ghi chú 250 hợp lệ / 251 -> 422; vẫn to_ship, tab to-confirm; 1 sự kiện mỗi lần', async () => {
    const s = await loginStaff();
    const { code } = await makeOrder();
    const r1 = await act(code, 'call-attempts', { expectedStatus: 'to_ship', note: 'x'.repeat(250) }, s.cookie);
    expect(r1.status).toBe(200);
    expect(r1.headers['cache-control']).toBe('no-store');
    expect(r1.body).toMatchObject({ id: code, status: 'to_ship', tab: 'to-confirm', callAttempts: { total: 1, inFirstDay: 1 } });
    expect(r1.body.timeline[0]).toMatchObject({ kind: 'call_attempt', actor: { type: 'staff', role: 'staff' }, note: 'x'.repeat(250) });
    expect((await act(code, 'call-attempts', { expectedStatus: 'to_ship' }, s.cookie)).body.callAttempts.total).toBe(2);
    const bad = await act(code, 'call-attempts', { expectedStatus: 'to_ship', note: 'x'.repeat(251) }, s.cookie);
    expect(bad.status).toBe(422);
    expect(bad.body.error).toMatchObject({ code: 'validation', field: 'note' });
    expect(await eventsOf(code)).toBe(3); // placed + 2
    expect(mails).toHaveLength(0);
  });

  it('đơn không cần gọi, đã xác nhận, completed -> 409 invalid-transition; thiếu expectedStatus -> 422', async () => {
    const s = await loginStaff();
    const noCall = await makeOrder({ needsCall: false });
    const confirmed = await makeOrder({ data: { confirmedAt: new Date() } });
    const done = await makeOrder({ status: 'completed', data: { paymentStatus: 'paid', deliveredAt: new Date() } });
    for (const [code, st] of [[noCall.code, 'to_ship'], [confirmed.code, 'to_ship'], [done.code, 'completed']] as const) {
      const before = await snapshot(code);
      const r = await act(code, 'call-attempts', { expectedStatus: st }, s.cookie);
      expect(r.status).toBe(409);
      expect(r.body.error).toMatchObject({ code: 'invalid-transition', currentStatus: st });
      expect(await snapshot(code)).toBe(before);
    }
    const v = await act(noCall.code, 'call-attempts', {}, s.cookie);
    expect(v.body.error).toMatchObject({ code: 'validation', field: 'expectedStatus' });
  });
});

describe('T-ADM-19 khách xác nhận (AC-ADM-19)', () => {
  it('lưu giờ + người, vẫn to_ship, sang to-fulfil; lần hai 409 invalid-transition', async () => {
    const s = await loginStaff(undefined, { firstName: 'Lan', lastName: 'Trần Thị' });
    const { code } = await makeOrder();
    const r = await act(code, 'confirm', { expectedStatus: 'to_ship' }, s.cookie);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'to_ship', tab: 'to-fulfil', needsCall: false, confirmation: { confirmedBy: { name: 'Trần Thị Lan', role: 'staff' } } });
    expect(r.body.allowedActions).toContain('ship');
    const db = await row(code);
    expect(db.confirmedAt).not.toBeNull();
    expect(db.confirmedBy).toBe(s.user.user_id);
    const again = await act(code, 'confirm', { expectedStatus: 'to_ship' }, s.cookie);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('invalid-transition');
    expect(await eventsOf(code)).toBe(2);
    const counts = await adminGet('/counts', s.cookie);
    expect(counts.body).toMatchObject({ 'to-confirm': 0, 'to-fulfil': 1 });
  });
});

describe('T-ADM-20 cửa sổ 24 giờ của unreachable (AC-ADM-20)', () => {
  const t = new Date('2026-11-01T01:00:00Z').getTime();
  const at = (...hs: number[]) => hs.map((h) => new Date(t + h * HOUR));
  const cases: Array<[string, Date[], number]> = [
    ['2 lần', at(0, 1), 409],
    ['t, t+23h, t+25h', at(0, 23, 25), 409],
    ['3 lần trong 2 giờ', at(0, 1, 2), 200],
    ['t, t+30h, t+31h, t+32h', at(0, 30, 31, 32), 200],
    ['biên t, t+12h, t+24h00m00s', at(0, 12, 24), 200],
    ['t, t+12h, t+24h01m', [...at(0, 12), new Date(t + 24 * HOUR + 60_000)], 409],
  ];
  it.each(cases)('%s', async (_name, times, expected) => {
    const s = await loginStaff();
    const { code } = await makeOrder();
    await addCalls(code, times);
    const detail = await adminGet(`/${code}`, s.cookie);
    expect(detail.body.allowedActions.includes('cancel-unreachable')).toBe(expected === 200);
    const r = await act(code, 'cancel', { expectedStatus: 'to_ship', reason: 'unreachable' }, s.cookie);
    expect(r.status).toBe(expected);
    if (expected === 409) {
      expect(r.body.error).toMatchObject({ code: 'condition-not-met', currentStatus: 'to_ship' });
      expect((await row(code)).status).toBe('to_ship');
    }
  });

  it('đơn đã xác nhận (không cần gọi) dù đủ 3 lần -> invalid-transition', async () => {
    const s = await loginStaff();
    const { code } = await makeOrder({ data: { confirmedAt: new Date() } });
    await addCalls(code, at(0, 1, 2));
    const r = await act(code, 'cancel', { expectedStatus: 'to_ship', reason: 'unreachable' }, s.cookie);
    expect(r.body.error.code).toBe('invalid-transition');
  });
});

describe('T-ADM-21 / 22 huỷ unreachable, declined_on_call (AC-ADM-21, 22)', () => {
  it('unreachable: cancelled, shop, pending, tồn +2, voucher trả, email câu chuẩn, delivery_refused_at NULL', async () => {
    const s = await loginStaff();
    await makeVoucher({ code: 'TV50', value: 50000 });
    const before = await stockOf(blazer);
    const code = await placeOrder([{ variantId: blazer, quantity: 2 }], { voucherCodes: ['TV50'] });
    expect(await stockOf(blazer)).toBe(before - 2);
    expect((await prisma.voucher.findUniqueOrThrow({ where: { code: 'TV50' } })).usedCount).toBe(1);
    await addCalls(code, [new Date(Date.now() - 2 * HOUR), new Date(Date.now() - HOUR), new Date()]);
    const r = await act(code, 'cancel', { expectedStatus: 'to_ship', reason: 'unreachable' }, s.cookie);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'cancelled', paymentStatus: 'pending', cancellation: { by: 'shop', reasonCode: 'unreachable' } });
    expect(await stockOf(blazer)).toBe(before);
    expect((await prisma.voucher.findUniqueOrThrow({ where: { code: 'TV50' } })).usedCount).toBe(0);
    const db = await row(code);
    expect(db.deliveryRefusedAt).toBeNull();
    expect(db.stockRestoredAt).not.toBeNull();
    expect(db.cancelReason).toBe('Chúng tôi không liên lạc được với bạn để xác nhận đơn.');
    await flushMail();
    const m = mailsFor(code);
    expect(m).toHaveLength(1);
    expect(m[0].subject).toBe(`nine2fine – Đơn #${code} đã huỷ`);
    expect(m[0].text).toContain('Chúng tôi không liên lạc được với bạn để xác nhận đơn.');
    expect(m[0].text).not.toMatch(/hoàn lại/);
  });

  it('declined_on_call: chưa xác nhận 200 (tồn hoàn, email); đã xác nhận 409; không cần gọi 409', async () => {
    const s = await loginStaff();
    const before = await stockOf(top);
    const code = await placeOrder([{ variantId: top, quantity: 1 }]);
    const r = await act(code, 'cancel', { expectedStatus: 'to_ship', reason: 'declined_on_call', note: 'khách đổi ý' }, s.cookie);
    expect(r.status).toBe(200);
    expect(r.body.cancellation).toMatchObject({ by: 'shop', reasonCode: 'declined_on_call', note: 'khách đổi ý', reason: 'Bạn đã báo không muốn nhận đơn.' });
    expect(await stockOf(top)).toBe(before);
    await flushMail();
    expect(mailsFor(code)[0].text).toContain('Bạn đã báo không muốn nhận đơn.');
    expect(mailsFor(code)[0].text).not.toContain('khách đổi ý');
    for (const o of [await makeOrder({ data: { confirmedAt: new Date() } }), await makeOrder({ needsCall: false })]) {
      const x = await act(o.code, 'cancel', { expectedStatus: 'to_ship', reason: 'declined_on_call' }, s.cookie);
      expect(x.status).toBe(409);
      expect(x.body.error.code).toBe('invalid-transition');
    }
  });
});

describe('T-ADM-50 huỷ theo yêu cầu khách qua hotline (AC-ADM-50)', () => {
  it('note rỗng / 4 / 251 -> 422 field note', async () => {
    const s = await loginStaff();
    const { code } = await makeOrder();
    for (const note of [undefined, '', '    ', 'abcd', 'x'.repeat(251)]) {
      const r = await act(code, 'cancel', { expectedStatus: 'to_ship', reason: 'customer_request', ...(note === undefined ? {} : { note }) }, s.cookie);
      expect(r.status).toBe(422);
      expect(r.body.error.field).toBe('note');
    }
  });

  it('chưa xác nhận / đã xác nhận / không cần gọi, staff và admin: cancelledBy customer, tồn 1 lần, 1 sự kiện có tên NV, COD không bị khoá', async () => {
    const staff = await loginStaff(undefined, { firstName: 'Hà', lastName: 'Lê' });
    const admin = await loginAdmin(undefined, { firstName: 'An', lastName: 'Phạm' });
    const variants: Array<Record<string, unknown>> = [{}, { data: { confirmedAt: new Date() } }, { needsCall: false }];
    let i = 0;
    for (const who of [staff, admin]) {
      for (const v of variants) {
        const phone = `09330000${String(++i).padStart(2, '0')}`;
        const { code } = await makeOrder({ ...v, phone, items: [{ variantId: shirt, quantity: 2 }] });
        const detail = await adminGet(`/${code}`, who.cookie);
        expect(detail.body.allowedActions).toContain('cancel-customer-request');
        const before = await stockOf(shirt);
        const r = await act(code, 'cancel', { expectedStatus: 'to_ship', reason: 'customer_request', note: 'Khách gọi hotline 9h' }, who.cookie);
        expect(r.status).toBe(200);
        expect(r.body).toMatchObject({ status: 'cancelled', paymentStatus: 'pending', cancellation: { by: 'customer', reasonCode: 'customer_request' } });
        expect(await stockOf(shirt)).toBe(before + 2);
        const db = await row(code);
        expect(db.deliveryRefusedAt).toBeNull();
        expect(db.cancelledBy).toBe('customer');
        const ev = db.events.filter((e) => e.kind === 'cancelled');
        expect(ev).toHaveLength(1);
        expect(ev[0]).toMatchObject({ actor: 'shop', actorUserId: who.user.user_id, actorRole: who === admin ? 'admin' : 'staff', reasonCode: 'customer_request' });
        expect(ev[0].actorName).toBe(who === admin ? 'Phạm An' : 'Lê Hà');
        // lần hai
        const again = await act(code, 'cancel', { expectedStatus: 'to_ship', reason: 'customer_request', note: 'Khách gọi lại' }, who.cookie);
        expect(again.status).toBe(409);
        expect(await stockOf(shirt)).toBe(before + 2);
        // COD cùng SĐT vẫn mở
        const q = await post('/api/checkout/quote', { items: [{ variantId: top, quantity: 1 }], voucherCodes: [], contact: { phone, email: 'q@example.com' } }, { ip: freshIp() });
        expect(q.body.paymentMethods[0]).toMatchObject({ method: 'cod', available: true });
      }
    }
    await flushMail();
    const m = mails.filter((x) => x.subject.includes('đã huỷ'));
    expect(m).toHaveLength(6);
    for (const x of m) {
      expect(x.text).toContain('Đơn đã được huỷ theo yêu cầu của bạn.');
      expect(x.text).not.toContain('hotline 9h');
    }
  });

  it('to_receive và cancel_requested -> 409 invalid-transition', async () => {
    const s = await loginStaff();
    const a = await makeOrder({ status: 'to_receive', data: transitData('GHN-1001') });
    const b = await makeOrder({ status: 'cancel_requested', data: { cancelRequestedAt: new Date() } });
    for (const [code, st] of [[a.code, 'to_receive'], [b.code, 'cancel_requested']] as const) {
      const r = await act(code, 'cancel', { expectedStatus: st, reason: 'customer_request', note: 'Khách gọi hotline' }, s.cookie);
      expect(r.status).toBe(409);
      expect(r.body.error.code).toBe('invalid-transition');
    }
  });
});

describe('T-ADM-29 ma trận lý do x trạng thái (AC-ADM-29)', () => {
  it('refused / undeliverable ở to_ship và unreachable / declined ở to_receive -> 409; other note 422 / 200 ở hai trạng thái', async () => {
    const admin = await loginAdmin();
    const s = await loginStaff();
    const ts = await makeOrder();
    const tr = await makeOrder({ status: 'to_receive', data: transitData('GHN-2001') });
    for (const reason of ['refused', 'undeliverable']) {
      expect((await act(ts.code, 'cancel', { expectedStatus: 'to_ship', reason }, s.cookie)).body.error.code).toBe('invalid-transition');
    }
    for (const reason of ['unreachable', 'declined_on_call']) {
      expect((await act(tr.code, 'cancel', { expectedStatus: 'to_receive', reason }, s.cookie)).body.error.code).toBe('invalid-transition');
    }
    for (const note of ['', 'abcd', 'x'.repeat(251)]) {
      const r = await act(ts.code, 'cancel', { expectedStatus: 'to_ship', reason: 'other', note }, admin.cookie);
      expect(r.status).toBe(422);
      expect(r.body.error.field).toBe('note');
    }
    for (const [code, st] of [[ts.code, 'to_ship'], [tr.code, 'to_receive']] as const) {
      const r = await act(code, 'cancel', { expectedStatus: st, reason: 'other', note: 'abcde' }, admin.cookie);
      expect(r.status).toBe(200);
      expect(r.body.cancellation).toMatchObject({ by: 'shop', reasonCode: 'other' });
    }
    expect((await row(tr.code)).deliveryRefusedAt).toBeNull();
    expect((await row(tr.code)).returnedFromTransit).toBe(true);
    expect((await row(tr.code)).activeTrackingNumber).toBeNull();
  });
});

describe('T-ADM-30 hoàn kho nhiều dòng, voucher còn hạn / hết hạn, huỷ lần hai mọi đường (AC-ADM-30)', () => {
  it('cộng đúng từng biến thể một lần; voucher hết hạn không trả', async () => {
    const s = await loginStaff();
    await makeVoucher({ code: 'TEXP', value: 50000 });
    const items = [{ variantId: blazer, quantity: 2 }, { variantId: top, quantity: 1 }, { variantId: shirt, quantity: 1 }];
    const base = { blazer: await stockOf(blazer), top: await stockOf(top), shirt: await stockOf(shirt) };
    const code = await placeOrder(items, { voucherCodes: ['TEXP'] });
    expect(await stockOf(blazer)).toBe(base.blazer - 2);
    await prisma.voucher.update({ where: { code: 'TEXP' }, data: { endsAt: new Date(Date.now() - 1000) } });
    const r = await act(code, 'cancel', { expectedStatus: 'to_ship', reason: 'declined_on_call' }, s.cookie);
    expect(r.status).toBe(200);
    expect({ blazer: await stockOf(blazer), top: await stockOf(top), shirt: await stockOf(shirt) }).toEqual(base);
    expect((await prisma.voucher.findUniqueOrThrow({ where: { code: 'TEXP' } })).usedCount).toBe(1);
    expect(r.body.stockRestoredAt).toBeDefined();

    // Huỷ lần hai qua mọi đường: admin, khách, hết hạn -> không đổi tồn.
    const admin = await loginAdmin();
    expect((await act(code, 'cancel', { expectedStatus: 'cancelled', reason: 'other', note: 'abcde' }, admin.cookie)).body.error.code).toBe('invalid-transition');
    expect((await act(code, 'cancel', { expectedStatus: 'to_ship', reason: 'other', note: 'abcde' }, admin.cookie)).body.error.code).toBe('order-state-changed');
    const m = await loginMember('owner@example.com');
    await prisma.order.update({ where: { code }, data: { userId: m.user.user_id } });
    const c = await post(`/api/orders/${code}/cancel`, {}, { cookie: m.cookie, ip: freshIp() });
    expect(c.status).toBe(409);
    expect(c.body.error.code).toBe('not-cancellable');
    await expireDueOrders(new Date(Date.now() + 365 * 24 * HOUR));
    expect({ blazer: await stockOf(blazer), top: await stockOf(top), shirt: await stockOf(shirt) }).toEqual(base);
    expect((await row(code)).events.filter((e) => e.toStatus === 'cancelled')).toHaveLength(1);
  });
});

describe('T-ADM-11 lỗi chèn giữa bước cộng tồn -> rollback toàn bộ (AC-ADM-11)', () => {
  afterEach(async () => {
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS n2f_test_fail ON product_variants');
  });

  it('5xx unavailable; trạng thái / tồn / voucher / sự kiện / thư / khoá không đổi; bỏ lỗi làm lại 200', async () => {
    const s = await loginStaff();
    const admin = await loginAdmin();
    await makeVoucher({ code: 'TV11', value: 50000 });
    const code = await placeOrder([{ variantId: top, quantity: 1 }], { voucherCodes: ['TV11'] });
    const code2 = await placeOrder([{ variantId: top, quantity: 1 }], { phone: '0987654321', email: 'b@example.com' });
    const stock = await stockOf(top);
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION n2f_test_fail() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe('CREATE TRIGGER n2f_test_fail BEFORE UPDATE ON product_variants FOR EACH ROW EXECUTE FUNCTION n2f_test_fail()');
    const b1 = await snapshot(code);
    const b2 = await snapshot(code2);
    const r1 = await act(code, 'cancel', { expectedStatus: 'to_ship', reason: 'declined_on_call' }, s.cookie, { 'Idempotency-Key': 'fault-key-0000000001' });
    const r2 = await act(code2, 'cancel', { expectedStatus: 'to_ship', reason: 'other', note: 'lệch kho' }, admin.cookie);
    for (const r of [r1, r2]) {
      expect(r.status).toBe(500);
      expect(r.body.error.code).toBe('unavailable');
      expect(JSON.stringify(r.body)).not.toMatch(/injected|product_variants|select|update/i);
    }
    await flushMail();
    expect(await snapshot(code)).toBe(b1);
    expect(await snapshot(code2)).toBe(b2);
    expect(await stockOf(top)).toBe(stock);
    expect((await prisma.voucher.findUniqueOrThrow({ where: { code: 'TV11' } })).usedCount).toBe(1);
    expect(await prisma.idempotencyKey.count({ where: { scope: 'admin-action' } })).toBe(0);
    expect(mails).toHaveLength(0);

    await prisma.$executeRawUnsafe('DROP TRIGGER n2f_test_fail ON product_variants');
    const ok = await act(code, 'cancel', { expectedStatus: 'to_ship', reason: 'declined_on_call' }, s.cookie, { 'Idempotency-Key': 'fault-key-0000000001' });
    expect(ok.status).toBe(200);
    expect(ok.headers['idempotency-replayed']).toBeUndefined();
    expect(await stockOf(top)).toBe(stock + 1);
    expect((await row(code)).events.filter((e) => e.kind === 'cancelled')).toHaveLength(1);
    expect((await prisma.voucher.findUniqueOrThrow({ where: { code: 'TV11' } })).usedCount).toBe(0);
  });
});

describe('T-ADM-35 email huỷ other không lộ ghi chú (AC-ADM-35)', () => {
  it('không chứa "lệch kho", có câu chuẩn, không đoạn hoàn tiền', async () => {
    const admin = await loginAdmin();
    const { code } = await makeOrder();
    await act(code, 'cancel', { expectedStatus: 'to_ship', reason: 'other', note: 'nội bộ: lệch kho' }, admin.cookie);
    await flushMail();
    const [m] = mailsFor(code);
    expect(m.text).toContain('nine2fine không thể thực hiện đơn này.');
    expect(m.text).not.toContain('lệch kho');
    expect(m.text).not.toMatch(/hoàn lại|hoàn tiền/);
  });
});

describe('T-ADM-45 migration nới scope idempotency', () => {
  it('chỉ thay CHECK chk_idempotency_scope (rộng hơn), không đụng dữ liệu / cột', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const sql = readFileSync(path.resolve(__dirname, '../prisma/migrations/20261108000200_admin_action_idempotency_scope/migration.sql'), 'utf8')
      .split(/\r?\n/).filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(sql).not.toMatch(/\b(TRUNCATE|DELETE|RENAME|UPDATE|INSERT|DROP\s+(TABLE|COLUMN|TYPE|INDEX))\b/i);
    expect(sql).not.toMatch(/ALTER COLUMN/i);
    expect(sql.match(/DROP CONSTRAINT "chk_idempotency_scope"/g)).toHaveLength(1);
    expect(sql).toContain(`CHECK ("scope" IN ('order-create', 'cart-merge', 'admin-action'))`);
    await expect(prisma.$executeRaw`INSERT INTO idempotency_keys (scope, key, request_hash, expires_at) VALUES ('other', 'k0000000000000001', ${'a'.repeat(64)}, now())`).rejects.toThrow();
  });
});
