import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  adminGet, adminPost, flushMail, freshIp, get, loginAdmin, loginMember, loginStaff, makeAwaitingPayment, makeOrder, makeVoucher, mails,
  orderBody, post, prisma, resetCheckout, resetState, stockOf, submitOrder, vid, withToShipCancelMode,
} from './helpers';
import { setEmailRetryDelays } from '../src/modules/order/order-email.service';

/**
 * Lát 4.5: yêu cầu huỷ của khách (C1) + duyệt / từ chối (T13, T14), S4-Q1 = 'request', S4-Q6 = một yêu cầu / đơn.
 * T-ADM-xx <-> AC-ADM-xx: 14, 15, 36, 37, 38, 39, 40.
 */

let top: string;
let blazer: string;

beforeEach(async () => {
  vi.useRealTimers();
  setEmailRetryDelays([0, 0, 0]);
  await resetState();
  await resetCheckout();
  top = await vid('off-duty-top', 'Trắng', 'S');
  blazer = await vid('the-everyday-blazer', 'Đen', 'S');
});

const N = 20;
const act = (code: string, path: string, body: unknown, cookie: string, headers?: Record<string, string>) =>
  adminPost(`/${code}/${path}`, body, cookie, headers);
const approve = (code: string, cookie: string, headers?: Record<string, string>) =>
  act(code, 'cancel-request/approve', { expectedStatus: 'cancel_requested' }, cookie, headers);
const reject = (code: string, reason: unknown, cookie: string) =>
  act(code, 'cancel-request/reject', { expectedStatus: 'cancel_requested', ...(reason === undefined ? {} : { reason }) }, cookie);
const customerCancel = (code: string, cookie: string, body: unknown = {}) => post(`/api/orders/${code}/cancel`, body, { cookie, ip: freshIp() });
const row = (code: string) => prisma.order.findUniqueOrThrow({ where: { code }, include: { events: true } });
const kinds = async (code: string, kind: string) => (await row(code)).events.filter((e) => e.kind === kind).length;
const mailsFor = (code: string) => mails.filter((m) => m.subject.includes(`#${code}`));
const statuses = (rs: Array<{ status: number }>) => rs.map((r) => r.status).sort((a, b) => a - b);

/** Thành viên đặt đơn COD thật (trừ tồn, giữ lượt voucher); bỏ thư xác nhận. */
async function memberOrder(m: Awaited<ReturnType<typeof loginMember>>, items: Array<{ variantId: string; quantity: number }>, voucherCodes: string[] = []) {
  const r = await submitOrder(await orderBody(items, { cookie: m.cookie, email: m.email, voucherCodes }), { cookie: m.cookie });
  if (r.status !== 201) throw new Error(`order ${r.status} ${JSON.stringify(r.body)}`);
  await flushMail();
  mails.length = 0;
  return r.body.order.id as string;
}

/** Đơn `cancel_requested` dựng thẳng (tồn không trừ: chỉ đo chênh lệch) kèm một lượt voucher đang giữ. */
async function requestedOrder(qty = 2) {
  const { code, id } = await makeOrder({ needsCall: false, status: 'cancel_requested', items: [{ variantId: blazer, quantity: qty }], data: { cancelRequestedAt: new Date(), cancelRequestReason: 'Đặt nhầm size' } });
  const v = await makeVoucher({ usedCount: 1 });
  await prisma.voucherRedemption.create({ data: { voucherId: v.voucher_id, orderId: id, phone: '0912345678', email: 'khach@example.com' } });
  return { code, voucherId: v.voucher_id };
}

describe('T-ADM-36 khách gửi yêu cầu huỷ ở to_ship (AC-ADM-36)', () => {
  it('251 -> 422; 250 -> cancel_requested, tồn / voucher / thanh toán giữ, pending, không thư; lần hai 409; tab cancel-requests', async () => {
    const m = await loginMember('yc36@example.com');
    const code = await memberOrder(m, [{ variantId: blazer, quantity: 2 }], ['N2FWELCOME15']);
    await prisma.order.update({ where: { code }, data: { confirmedAt: new Date() } });
    const stock = await stockOf(blazer);
    const before = await get(`/api/orders/${code}`, { cookie: m.cookie });
    expect(before.body).toMatchObject({ status: 'to_ship', canCancel: true, cancelMode: 'request' });

    const bad = await customerCancel(code, m.cookie, { reason: 'x'.repeat(251) });
    expect(bad.status).toBe(422);
    expect(bad.body.error).toMatchObject({ code: 'validation', field: 'reason' });
    expect((await row(code)).status).toBe('to_ship');

    const r = await customerCancel(code, m.cookie, { reason: 'y'.repeat(250) });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'cancel_requested', paymentStatus: 'pending', canCancel: false, cancelRequest: { outcome: 'pending' } });
    expect(r.body.cancelRequest.requestedAt).toEqual(expect.any(String));
    expect(r.body.cancelMode).toBeUndefined();
    expect(r.body.cancelledBy).toBeUndefined();
    expect(r.body.timeline.at(-1)).toMatchObject({ title: 'Đã gửi yêu cầu huỷ', actor: 'customer' });
    const o = await row(code);
    expect(o).toMatchObject({ status: 'cancel_requested', cancelRequestReason: 'y'.repeat(250), stockRestoredAt: null, cancelledAt: null, cancelledBy: null });
    expect(o.events.filter((e) => e.kind === 'cancel_requested')).toHaveLength(1);
    expect(o.events.find((e) => e.kind === 'cancel_requested')).toMatchObject({ actor: 'customer', fromStatus: 'to_ship', toStatus: 'cancel_requested', emailTemplate: null });
    expect(await stockOf(blazer)).toBe(stock);
    expect((await prisma.voucher.findUniqueOrThrow({ where: { code: 'N2FWELCOME15' } })).usedCount).toBe(1);
    expect((await prisma.voucherRedemption.findFirstOrThrow({ where: { orderId: o.order_id } })).releasedAt).toBeNull();
    await flushMail();
    expect(mailsFor(code)).toHaveLength(0);

    const again = await customerCancel(code, m.cookie);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('not-cancellable');
    expect(await kinds(code, 'cancel_requested')).toBe(1);

    const s = await loginStaff();
    expect((await adminGet('/counts', s.cookie)).body['cancel-requests']).toBe(1);
    const list = await adminGet('/?view=cancel-requests', s.cookie);
    expect(list.body.items.map((x: { id: string }) => x.id)).toEqual([code]);
    expect(list.body.items[0]).toMatchObject({ hasCancelRequest: true, tab: 'cancel-requests' });
    const d = await adminGet(`/${code}`, s.cookie);
    expect(d.body.cancelRequest).toMatchObject({ outcome: 'pending', reason: 'y'.repeat(250) });
    expect([...d.body.allowedActions].sort()).toEqual(['add-note', 'approve-cancel', 'reject-cancel']);
  });
});

describe('T-ADM-37 to_pay huỷ thẳng, to_receive 409, cờ direct (AC-ADM-37, AC-CHK-29)', () => {
  it('to_pay: cancelled + cancelMode cancel; to_receive: 409 not-cancellable không đổi; direct: to_ship huỷ thẳng', async () => {
    const m = await loginMember('yc37@example.com');
    const pay = await memberOrder(m, [{ variantId: top, quantity: 2 }]);
    await makeAwaitingPayment(pay, new Date(Date.now() + 1800_000));
    expect((await get(`/api/orders/${pay}`, { cookie: m.cookie })).body).toMatchObject({ canCancel: true, cancelMode: 'cancel' });
    const stockBefore = await stockOf(top);
    const c = await customerCancel(pay, m.cookie);
    expect(c.body).toMatchObject({ status: 'cancelled', cancelledBy: 'customer' });
    expect(await stockOf(top)).toBe(stockBefore + 2);

    const tr = await makeOrder({ status: 'to_receive', userId: m.user.user_id, data: { carrier: 'GHN', trackingNumber: 'GHN-0001', activeTrackingNumber: 'GHN-0001', handedOverAt: new Date() } });
    const r = await customerCancel(tr.code, m.cookie);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('not-cancellable');
    expect((await row(tr.code))).toMatchObject({ status: 'to_receive', cancelRequestedAt: null });

    await withToShipCancelMode('direct', async () => {
      const code = await memberOrder(m, [{ variantId: blazer, quantity: 1 }]);
      expect((await get(`/api/orders/${code}`, { cookie: m.cookie })).body).toMatchObject({ canCancel: true, cancelMode: 'cancel' });
      const stock = await stockOf(blazer);
      const d = await customerCancel(code, m.cookie);
      expect(d.body).toMatchObject({ status: 'cancelled', cancelledBy: 'customer' });
      expect(d.body.cancelRequest).toBeUndefined();
      expect(await stockOf(blazer)).toBe(stock + 1);
    });
  });
});

describe('T-ADM-38 duyệt yêu cầu huỷ (AC-ADM-38)', () => {
  it('cancelled, cancelledBy customer, sự kiện tên NV, tồn +, voucher trả, payment giữ, email đã duyệt; lần hai 409; DTO khách không lộ NV', async () => {
    const m = await loginMember('yc38@example.com');
    const code = await memberOrder(m, [{ variantId: blazer, quantity: 2 }], ['N2FWELCOME15']);
    const stock = await stockOf(blazer);
    await customerCancel(code, m.cookie, { reason: 'Đặt nhầm size' });
    const s = await loginStaff('lan.staff@nine2fine.test', { firstName: 'Lan', lastName: 'Trần Thị' });

    const r = await approve(code, s.cookie);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      status: 'cancelled', paymentStatus: 'pending', tab: 'cancelled',
      cancellation: { by: 'customer', reason: 'Đặt nhầm size' },
      cancelRequest: { outcome: 'approved', reason: 'Đặt nhầm size', decidedBy: { name: 'Trần Thị Lan', role: 'staff' } },
    });
    expect(r.body.cancellation.reasonCode).toBeUndefined();
    expect(r.body.timeline[0]).toMatchObject({ kind: 'cancel_approved', actor: { type: 'staff', name: 'Trần Thị Lan', role: 'staff' }, toStatus: 'cancelled' });
    expect(await stockOf(blazer)).toBe(stock + 2);
    expect((await prisma.voucher.findUniqueOrThrow({ where: { code: 'N2FWELCOME15' } })).usedCount).toBe(0);
    const o = await row(code);
    expect(o).toMatchObject({ cancelledBy: 'customer', cancelRequestOutcome: 'approved', cancelRequestDecidedBy: s.user.user_id, activeTrackingNumber: null });
    expect(o.stockRestoredAt).not.toBeNull();
    expect(o.events.filter((e) => e.toStatus === 'cancelled')).toHaveLength(1);

    await flushMail();
    const sent = mailsFor(code);
    expect(sent.map((x) => x.subject)).toEqual([`nine2fine – Yêu cầu huỷ đơn #${code} đã được duyệt`]);
    expect(sent[0].to).toBe(m.email);
    expect(sent[0].text).not.toContain('hoàn lại'); // COD chưa thanh toán: không có đoạn hoàn tiền

    const again = await approve(code, s.cookie);
    expect(again.status).toBe(409);
    expect(again.body.error).toMatchObject({ code: 'order-state-changed', currentStatus: 'cancelled' });
    expect(await stockOf(blazer)).toBe(stock + 2);

    const mine = await get(`/api/orders/${code}`, { cookie: m.cookie });
    expect(mine.body).toMatchObject({ status: 'cancelled', cancelledBy: 'customer', canCancel: false, cancelRequest: { outcome: 'approved' } });
    expect(mine.body.timeline.map((t: { title: string; actor: string }) => [t.title, t.actor])).toEqual([
      ['Đã đặt hàng', 'customer'], ['Đã gửi yêu cầu huỷ', 'customer'], ['Đã huỷ đơn', 'nine2fine'],
    ]);
    const json = JSON.stringify(mine.body);
    for (const leak of ['Trần Thị Lan', s.email, s.user.user_id]) expect(json).not.toContain(leak);
  });
});

describe('T-ADM-39 từ chối yêu cầu huỷ (AC-ADM-39)', () => {
  it('reason rỗng / 4 -> 422; 5 -> to_ship giữ xác nhận, tồn không đổi, email lý do + hotline; khách yêu cầu mới 409', async () => {
    const m = await loginMember('yc39@example.com');
    const code = await memberOrder(m, [{ variantId: blazer, quantity: 1 }]);
    const confirmedAt = new Date(Date.now() - 60_000);
    await prisma.order.update({ where: { code }, data: { confirmedAt } });
    await customerCancel(code, m.cookie);
    const stock = await stockOf(blazer);
    const s = await loginStaff();

    for (const reason of [undefined, '', '    ', 'abcd']) {
      const r = await reject(code, reason, s.cookie);
      expect(r.status).toBe(422);
      expect(r.body.error).toMatchObject({ code: 'validation', field: 'reason' });
    }
    expect((await reject(code, 'x'.repeat(251), s.cookie)).status).toBe(422);
    expect((await row(code)).status).toBe('cancel_requested');

    const r = await reject(code, ' Đã đóng gói ', s.cookie);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'to_ship', tab: 'to-fulfil', cancelRequest: { outcome: 'rejected', rejectReason: 'Đã đóng gói' } });
    expect(r.body.allowedActions).toContain('ship');
    expect(r.body.timeline[0]).toMatchObject({ kind: 'cancel_rejected', fromStatus: 'cancel_requested', toStatus: 'to_ship' });
    const o = await row(code);
    expect(o.confirmedAt?.getTime()).toBe(confirmedAt.getTime());
    expect(o).toMatchObject({ cancelRequestOutcome: 'rejected', cancelRequestRejectReason: 'Đã đóng gói', stockRestoredAt: null });
    expect(o.cancelRequestedAt).not.toBeNull();
    expect(await stockOf(blazer)).toBe(stock);

    await flushMail();
    const sent = mailsFor(code);
    expect(sent.map((x) => x.subject)).toEqual([`nine2fine – Yêu cầu huỷ đơn #${code} chưa được chấp nhận`]);
    expect(sent[0].text).toContain('Lý do: Đã đóng gói');
    expect(sent[0].text).toContain('1900 6868 29');

    const mine = await get(`/api/orders/${code}`, { cookie: m.cookie });
    expect(mine.body).toMatchObject({ status: 'to_ship', canCancel: false, cancelRequest: { outcome: 'rejected', rejectReason: 'Đã đóng gói' } });
    expect(mine.body.cancelMode).toBeUndefined();
    expect(mine.body.timeline.at(-1)).toMatchObject({ title: 'Yêu cầu huỷ chưa được chấp nhận', actor: 'nine2fine' });

    const again = await customerCancel(code, m.cookie);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('not-cancellable');
    expect((await row(code)).status).toBe('to_ship');
    expect(await kinds(code, 'cancel_requested')).toBe(1);

    // Đã từ chối thì duyệt / từ chối tiếp đều 409 (đơn đã về to_ship).
    expect((await approve(code, s.cookie)).body.error.code).toBe('order-state-changed');
    expect((await act(code, 'cancel-request/approve', { expectedStatus: 'to_ship' }, s.cookie)).body.error.code).toBe('invalid-transition');
  });

  it('admin cũng duyệt / từ chối được; Idempotency-Key lặp lại -> replay, không sự kiện thứ hai', async () => {
    const admin = await loginAdmin();
    const { code } = await requestedOrder(1);
    const key = 'approve-key-000000001';
    const a = await approve(code, admin.cookie, { 'Idempotency-Key': key });
    expect(a.status).toBe(200);
    const b = await approve(code, admin.cookie, { 'Idempotency-Key': key });
    expect(b.status).toBe(200);
    expect(b.headers['idempotency-replayed']).toBe('true');
    expect(await kinds(code, 'cancel_approved')).toBe(1);
    const { code: c2 } = await requestedOrder(1);
    expect((await reject(c2, 'Hàng đã giao cho shipper', admin.cookie)).status).toBe(200);
  });
});

describe('T-ADM-40 cancel_requested chặn thao tác khác; khách yêu cầu đua NV bàn giao (AC-ADM-40)', () => {
  it('call-attempt / confirm / ship / deliver / cancel other trên cancel_requested -> 409 invalid-transition, không đổi', async () => {
    const admin = await loginAdmin();
    const { code } = await makeOrder({ status: 'cancel_requested', data: { cancelRequestedAt: new Date() } });
    const cases: Array<[string, Record<string, unknown>]> = [
      ['call-attempts', {}], ['confirm', {}], ['ship', { carrier: 'GHTK', trackingNumber: 'GHTK-0001' }], ['deliver', {}],
      ['cancel', { reason: 'other', note: 'lệch kho' }], ['cancel', { reason: 'customer_request', note: 'Khách gọi hotline' }],
    ];
    for (const [path, body] of cases) {
      const r = await act(code, path, { expectedStatus: 'cancel_requested', ...body }, admin.cookie);
      expect(r.status).toBe(409);
      expect(r.body.error).toMatchObject({ code: 'invalid-transition', currentStatus: 'cancel_requested' });
    }
    const o = await row(code);
    expect(o.status).toBe('cancel_requested');
    expect(o.events).toHaveLength(1);
  });

  it(`x${N}: khách yêu cầu huỷ vs NV bàn giao: đúng một bên thắng, không có đơn vừa to_receive vừa có yêu cầu huỷ`, async () => {
    const m = await loginMember('yc40@example.com');
    const s = await loginStaff();
    let requestWins = 0;
    for (let i = 0; i < N; i++) {
      const { code } = await makeOrder({ needsCall: false, userId: m.user.user_id });
      const [c, sh] = await Promise.all([
        customerCancel(code, m.cookie),
        act(code, 'ship', { expectedStatus: 'to_ship', carrier: 'GHTK', trackingNumber: `RQ-${i}-0000` }, s.cookie),
      ]);
      expect(statuses([c, sh])).toEqual([200, 409]);
      const o = await row(code);
      if (c.status === 200) {
        requestWins++;
        expect(sh.body.error.code).toBe('order-state-changed');
        expect(o.status).toBe('cancel_requested');
        expect(o.handedOverAt).toBeNull();
        expect(o.events.filter((e) => e.kind === 'shipped')).toHaveLength(0);
      } else {
        expect(c.body.error.code).toBe('not-cancellable');
        expect(o.status).toBe('to_receive');
        expect(o.cancelRequestedAt).toBeNull();
        expect(o.events.filter((e) => e.kind === 'cancel_requested')).toHaveLength(0);
      }
    }
    expect(await prisma.order.count({ where: { status: 'to_receive', cancelRequestedAt: { not: null } } })).toBe(0);
    console.info(`yêu cầu huỷ thắng ${requestWins}/${N}`);
  }, 180_000);
});

describe('T-ADM-14 hai NV duyệt cùng lúc (AC-ADM-14)', () => {
  it(`x${N}: 1 x 200 + 1 x 409 order-state-changed; tồn +2 (không +4); 1 sự kiện; 1 thư; voucher trả 1 lần`, async () => {
    const [a, b] = [await loginStaff(), await loginStaff()];
    for (let i = 0; i < N; i++) {
      const { code, voucherId } = await requestedOrder(2);
      const stock = await stockOf(blazer);
      const rs = await Promise.all([approve(code, a.cookie), approve(code, b.cookie)]);
      expect(statuses(rs)).toEqual([200, 409]);
      const loser = rs.find((r) => r.status === 409)!;
      expect(loser.body.error).toMatchObject({ code: 'order-state-changed', currentStatus: 'cancelled' });
      expect(loser.body.error.order).toMatchObject({ id: code, status: 'cancelled' });
      expect(await stockOf(blazer)).toBe(stock + 2);
      expect(await kinds(code, 'cancel_approved')).toBe(1);
      expect((await prisma.voucher.findUniqueOrThrow({ where: { voucher_id: voucherId } })).usedCount).toBe(0);
      await flushMail();
      expect(mailsFor(code)).toHaveLength(1);
    }
  }, 180_000);
});

describe('T-ADM-15 duyệt vs từ chối cùng lúc (AC-ADM-15)', () => {
  it(`x${N}: một bên thắng, trạng thái cuối khớp, đúng 1 thư đúng loại`, async () => {
    const [a, b] = [await loginStaff(), await loginStaff()];
    let approveWins = 0;
    for (let i = 0; i < N; i++) {
      const { code, voucherId } = await requestedOrder(2);
      const stock = await stockOf(blazer);
      const [ap, rj] = await Promise.all([approve(code, a.cookie), reject(code, 'Hàng đã đóng gói', b.cookie)]);
      expect(statuses([ap, rj])).toEqual([200, 409]);
      expect((ap.status === 409 ? ap : rj).body.error.code).toBe('order-state-changed');
      const o = await row(code);
      const usedCount = (await prisma.voucher.findUniqueOrThrow({ where: { voucher_id: voucherId } })).usedCount;
      await flushMail();
      const sent = mailsFor(code);
      expect(sent).toHaveLength(1);
      if (ap.status === 200) {
        approveWins++;
        expect(o).toMatchObject({ status: 'cancelled', cancelRequestOutcome: 'approved' });
        expect(await stockOf(blazer)).toBe(stock + 2);
        expect(usedCount).toBe(0);
        expect(o.events.filter((e) => e.kind === 'cancel_rejected')).toHaveLength(0);
        expect(sent[0].subject).toContain('đã được duyệt');
      } else {
        expect(o).toMatchObject({ status: 'to_ship', cancelRequestOutcome: 'rejected', stockRestoredAt: null });
        expect(await stockOf(blazer)).toBe(stock);
        expect(usedCount).toBe(1);
        expect(o.events.filter((e) => e.kind === 'cancel_approved')).toHaveLength(0);
        expect(sent[0].subject).toContain('chưa được chấp nhận');
      }
    }
    console.info(`duyệt thắng ${approveWins}/${N}`);
  }, 180_000);
});
