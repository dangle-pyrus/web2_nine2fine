import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminPost, flushMail, loginStaff, makeOrder, mails, prisma, resetCheckout, resetState, stockOf, vid } from './helpers';
import { setEmailRetryDelays } from '../src/modules/order/order-email.service';

/**
 * Đồng thời Slice 4 (BR-ADM-14, AC-ADM-14..16, 33, 40): khoá dòng đơn + so `expectedStatus` => hai thao tác cùng đơn,
 * đúng một thành công, không hiệu ứng phụ hai lần. Lặp như T-CON của Slice 3.
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
const statuses = (rs: Array<{ status: number }>) => rs.map((r) => r.status).sort((a, b) => a - b);
const eventsOf = async (code: string, kind: string) =>
  (await prisma.order.findUniqueOrThrow({ where: { code }, include: { events: true } })).events.filter((e) => e.kind === kind).length;
const mailsFor = (code: string) => mails.filter((m) => m.subject.includes(`#${code}`));

describe('T-ADM-16 hai nhân viên bàn giao cùng đơn (AC-ADM-16)', () => {
  it(`x${N}: 1 x 200 + 1 x 409 order-state-changed kèm order; 1 sự kiện, 1 thư`, async () => {
    const [a, b] = [await loginStaff(), await loginStaff()];
    for (let i = 0; i < N; i++) {
      const { code } = await makeOrder({ needsCall: false });
      const rs = await Promise.all([
        act(code, 'ship', { expectedStatus: 'to_ship', carrier: 'GHTK', trackingNumber: `A-${i}-0000` }, a.cookie),
        act(code, 'ship', { expectedStatus: 'to_ship', carrier: 'GHN', trackingNumber: `B-${i}-0000` }, b.cookie),
      ]);
      expect(statuses(rs)).toEqual([200, 409]);
      const loser = rs.find((r) => r.status === 409)!;
      expect(loser.body.error).toMatchObject({ code: 'order-state-changed', currentStatus: 'to_receive', order: { id: code, status: 'to_receive' } });
      const winner = rs.find((r) => r.status === 200)!;
      expect(loser.body.error.order.shipment.trackingNumber).toBe(winner.body.shipment.trackingNumber);
      expect(await eventsOf(code, 'shipped')).toBe(1);
      await flushMail();
      expect(mailsFor(code)).toHaveLength(1);
    }
  }, 180_000);

  it(`x10: hai đơn khác nhau cùng mã vận đơn song song -> 1 x 200 + 1 x 422 trackingNumber`, async () => {
    const [a, b] = [await loginStaff(), await loginStaff()];
    for (let i = 0; i < 10; i++) {
      const o1 = await makeOrder({ needsCall: false });
      const o2 = await makeOrder({ needsCall: false });
      const tn = `SAME-${i}-0000`;
      const rs = await Promise.all([
        act(o1.code, 'ship', { expectedStatus: 'to_ship', carrier: 'GHTK', trackingNumber: tn }, a.cookie),
        act(o2.code, 'ship', { expectedStatus: 'to_ship', carrier: 'GHTK', trackingNumber: tn }, b.cookie),
      ]);
      expect(statuses(rs)).toEqual([200, 422]);
      expect(rs.find((r) => r.status === 422)!.body.error).toMatchObject({ code: 'validation', field: 'trackingNumber' });
      expect(await prisma.order.count({ where: { activeTrackingNumber: tn } })).toBe(1);
      expect(await prisma.order.count({ where: { code: { in: [o1.code, o2.code] }, status: 'to_ship' } })).toBe(1);
    }
  }, 180_000);
});

describe('huỷ vs bàn giao đồng thời (AC-ADM-14, 40 phần BE)', () => {
  it(`x${N}: đúng một bên thắng; trạng thái cuối khớp tồn, sự kiện, thư`, async () => {
    const [a, b] = [await loginStaff(), await loginStaff()];
    let cancelWins = 0;
    for (let i = 0; i < N; i++) {
      const { code } = await makeOrder({ needsCall: false, items: [{ variantId: blazer, quantity: 2 }] });
      const stock = await stockOf(blazer);
      const [c, s] = await Promise.all([
        act(code, 'cancel', { expectedStatus: 'to_ship', reason: 'customer_request', note: 'Khách gọi hotline' }, a.cookie),
        act(code, 'ship', { expectedStatus: 'to_ship', carrier: 'GHTK', trackingNumber: `CS-${i}-0000` }, b.cookie),
      ]);
      expect(statuses([c, s])).toEqual([200, 409]);
      const loser = c.status === 409 ? c : s;
      expect(loser.body.error.code).toBe('order-state-changed');
      const o = await prisma.order.findUniqueOrThrow({ where: { code } });
      if (c.status === 200) {
        cancelWins++;
        expect(o.status).toBe('cancelled');
        expect(await stockOf(blazer)).toBe(stock + 2);
        expect(o.handedOverAt).toBeNull();
        expect(await eventsOf(code, 'shipped')).toBe(0);
      } else {
        expect(o.status).toBe('to_receive');
        expect(await stockOf(blazer)).toBe(stock);
        expect(o.stockRestoredAt).toBeNull();
        expect(await eventsOf(code, 'cancelled')).toBe(0);
      }
      await flushMail();
      expect(mailsFor(code)).toHaveLength(1);
    }
    // Bên thắng tuỳ lịch chạy; mỗi lần đều nhất quán (đã kiểm ở trên). Ghi lại để thấy cả hai nhánh được đi qua.
    console.info(`cancel thắng ${cancelWins}/${N}`);
  }, 180_000);

  it(`x${N}: hai huỷ declined_on_call cùng đơn -> tồn cộng đúng một lần, 1 sự kiện, 1 thư`, async () => {
    const [a, b] = [await loginStaff(), await loginStaff()];
    for (let i = 0; i < N; i++) {
      const { code } = await makeOrder({ items: [{ variantId: top, quantity: 3 }] });
      const stock = await stockOf(top);
      const rs = await Promise.all([
        act(code, 'cancel', { expectedStatus: 'to_ship', reason: 'declined_on_call' }, a.cookie),
        act(code, 'cancel', { expectedStatus: 'to_ship', reason: 'declined_on_call' }, b.cookie),
      ]);
      expect(statuses(rs)).toEqual([200, 409]);
      expect(await stockOf(top)).toBe(stock + 3);
      expect(await eventsOf(code, 'cancelled')).toBe(1);
      await flushMail();
      expect(mailsFor(code)).toHaveLength(1);
    }
  }, 180_000);
});

describe('T-ADM-33 hai nhân viên nhập kho hàng hoàn cùng lúc (AC-ADM-33)', () => {
  it(`x${N}: đúng 1 thành công, tồn +2 (không +4), 1 sự kiện; restocked vs written_off cũng chỉ một`, async () => {
    const [a, b] = [await loginStaff(), await loginStaff()];
    for (let i = 0; i < N; i++) {
      const { code } = await makeOrder({
        status: 'cancelled', items: [{ variantId: blazer, quantity: 2 }],
        data: { cancelledAt: new Date(), cancelledBy: 'shop', cancelReasonCode: 'refused', returnedFromTransit: true, carrier: 'GHN', trackingNumber: `RT-${i}-0000`, handedOverAt: new Date() },
      });
      const stock = await stockOf(blazer);
      const second = i % 2 === 0
        ? { expectedStatus: 'cancelled', decision: 'restocked' }
        : { expectedStatus: 'cancelled', decision: 'written_off', note: 'hàng bị ướt' };
      const rs = await Promise.all([
        act(code, 'returned-stock', { expectedStatus: 'cancelled', decision: 'restocked' }, a.cookie),
        act(code, 'returned-stock', second, b.cookie),
      ]);
      expect(statuses(rs)).toEqual([200, 409]);
      expect(rs.find((r) => r.status === 409)!.body.error.code).toBe('invalid-transition');
      const o = await prisma.order.findUniqueOrThrow({ where: { code }, include: { events: true } });
      const handled = o.events.filter((e) => e.kind === 'stock_restocked' || e.kind === 'stock_written_off');
      expect(handled).toHaveLength(1);
      expect(await stockOf(blazer)).toBe(stock + (o.returnDecision === 'restocked' ? 2 : 0));
    }
  }, 180_000);
});

describe('T-ADM-17 cùng Idempotency-Key song song (AC-ADM-17)', () => {
  it('x10: cả hai 200, đúng một bản phát lại, 1 sự kiện, 1 thư', async () => {
    const s = await loginStaff();
    for (let i = 0; i < 10; i++) {
      const { code } = await makeOrder({ needsCall: false });
      const headers = { 'Idempotency-Key': `same-intent-${i}-0000000000` };
      const body = { expectedStatus: 'to_ship', carrier: 'GHTK', trackingNumber: `IK-${i}-0000` };
      const rs = await Promise.all([act(code, 'ship', body, s.cookie, headers), act(code, 'ship', body, s.cookie, headers)]);
      expect(statuses(rs)).toEqual([200, 200]);
      expect(rs.filter((r) => r.headers['idempotency-replayed'] === 'true')).toHaveLength(1);
      expect(rs[0].body).toEqual(rs[1].body);
      expect(await eventsOf(code, 'shipped')).toBe(1);
      await flushMail();
      expect(mailsFor(code)).toHaveLength(1);
    }
  }, 120_000);
});
