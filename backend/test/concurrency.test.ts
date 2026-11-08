import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  freshIp, loginMember, makeVoucher, newKey, orderBody, post, prisma, resetCheckout, resetState, setStock, stockOf, submitOrder, vid,
  withToShipCancelMode,
} from './helpers';
import { setEmailRetryDelays } from '../src/modules/order/order-email.service';

let top: string;
let shirt: string;

beforeEach(async () => {
  vi.useRealTimers();
  setEmailRetryDelays([0, 0, 0]);
  await resetState();
  await resetCheckout();
  top = await vid('off-duty-top', 'Trắng', 'S');
  shirt = await vid('weekend-shirt', 'Trắng', 'S');
});

const it1 = (variantId: string, quantity = 1) => ({ variantId, quantity });
const statuses = (rs: Array<{ status: number }>) => rs.map((r) => r.status).sort((a, b) => a - b);

// T-CON-01 / AC-CHK-15: 2 người mua món cuối, lặp 20 lần.
describe('T-CON-01 hai người mua món cuối (AC-CHK-15)', () => {
  it('mỗi lần đúng 1 đơn 201 và 1 lần 409 stock-changed; tồn cuối 0; không âm', async () => {
    const a = await orderBody([it1(top)], { phone: '0911111111', email: 'a@example.com' });
    const b = await orderBody([it1(top)], { phone: '0922222222', email: 'b@example.com' });
    for (let i = 0; i < 20; i++) {
      await prisma.order.deleteMany();
      await setStock(top, 1);
      const rs = await Promise.all([submitOrder(a), submitOrder(b)]);
      expect(statuses(rs)).toEqual([201, 409]);
      const loser = rs.find((r) => r.status === 409)!;
      expect(loser.body.error.code).toBe('stock-changed');
      expect(loser.body.error.stockIssues).toEqual([{ variantId: top, available: 0 }]);
      expect(await stockOf(top)).toBe(0);
      expect(await prisma.order.count()).toBe(1);
    }
  }, 120_000);
});

// T-CON-02 / AC-VOU-13: 2 đơn dùng lượt voucher cuối, lặp 10 lần với mã mới.
describe('T-CON-02 hai đơn giành lượt voucher cuối', () => {
  it('mỗi lần đúng 1 đơn có mã; người kia 409 voucher-changed; tồn đơn thua không đổi; used_count = 1', async () => {
    for (let i = 0; i < 10; i++) {
      await prisma.order.deleteMany();
      await setStock(top, 5);
      const code = `LAST${i}XX`;
      await makeVoucher({ code, value: 50000, totalLimit: 1 });
      const a = await orderBody([it1(top)], { phone: '0911111111', email: 'a@example.com', voucherCodes: [code] });
      const b = await orderBody([it1(top)], { phone: '0922222222', email: 'b@example.com', voucherCodes: [code] });
      const rs = await Promise.all([submitOrder(a), submitOrder(b)]);
      expect(statuses(rs)).toEqual([201, 409]);
      const loser = rs.find((r) => r.status === 409)!;
      expect(loser.body.error.code).toBe('voucher-changed');
      expect(loser.body.error.removedVoucherCodes).toEqual([code]);
      expect(loser.body.error.quote.pricing.discount).toBe(0);
      expect(await prisma.order.count()).toBe(1);
      expect(await stockOf(top)).toBe(4); // chỉ đơn thắng trừ tồn
      expect((await prisma.voucher.findUniqueOrThrow({ where: { code } })).usedCount).toBe(1);
      expect(await prisma.voucherRedemption.count()).toBe(1);
    }
  }, 120_000);
});

describe('T-CON-03 cùng Idempotency-Key đồng thời (AC-CHK-18)', () => {
  it('1 đơn, cả hai phản hồi cùng mã (một 201, một 200)', async () => {
    const body = await orderBody([it1(top)]);
    const key = newKey();
    const rs = await Promise.all([submitOrder(body, { key }), submitOrder(body, { key })]);
    expect(statuses(rs)).toEqual([200, 201]);
    expect(rs[0].body.order.id).toBe(rs[1].body.order.id);
    expect(await prisma.order.count()).toBe(1);
    expect(await stockOf(top)).toBe(4);
  });
});

describe('T-CON-04 cùng khách hai đơn dùng mã per_user_limit 1', () => {
  it('chỉ một đơn có mã', async () => {
    await makeVoucher({ code: 'TCUS', value: 30000, perUserLimit: 1 });
    const a = await orderBody([it1(top)], { phone: '0933333333', email: 'same@example.com', voucherCodes: ['TCUS'] });
    const b = await orderBody([it1(shirt)], { phone: '0933333333', email: 'same@example.com', voucherCodes: ['TCUS'] });
    const rs = await Promise.all([submitOrder(a), submitOrder(b)]);
    expect(statuses(rs)).toEqual([201, 409]);
    expect(rs.find((r) => r.status === 409)!.body.error.code).toBe('voucher-changed');
    expect(await prisma.voucherRedemption.count()).toBe(1);
    expect((await prisma.voucher.findUniqueOrThrow({ where: { code: 'TCUS' } })).usedCount).toBe(1);
  });
});

describe('T-CON-05 đặt hàng + huỷ đơn khác đồng thời', () => {
  // Huỷ thẳng ở `to_ship` (cộng tồn, trả voucher) chỉ còn khi cờ S4-Q1 = 'direct'; đường duyệt yêu cầu huỷ: T-ADM-14.
  it('30 lần: không deadlock treo (< 5 giây mỗi yêu cầu), tồn cuối = ban đầu - tổng đơn chưa huỷ', async () => withToShipCancelMode('direct', async () => {
    const owner = await loginMember('con5b@example.com');
    for (let i = 0; i < 30; i++) {
      await prisma.order.deleteMany();
      await setStock(top, 5);
      const code = `MXB${String(i).padStart(2, '0')}XX`;
      await makeVoucher({ code, value: 20000 });
      const a = await submitOrder(await orderBody([it1(top)], { cookie: owner.cookie, email: owner.email, voucherCodes: [code] }), { cookie: owner.cookie });
      expect(a.status).toBe(201);
      const bodyB = await orderBody([it1(top)], { phone: '0922222222', email: 'b@example.com', voucherCodes: [code] });
      const t0 = Date.now();
      const [placed, cancelled] = await Promise.all([
        submitOrder(bodyB).then((r) => ({ r, ms: Date.now() - t0 })),
        post(`/api/orders/${a.body.order.id}/cancel`, {}, { cookie: owner.cookie, ip: freshIp() }).then((r) => ({ r, ms: Date.now() - t0 })),
      ]);
      expect(placed.r.status).toBe(201);
      expect(cancelled.r.status).toBe(200);
      expect(placed.ms).toBeLessThan(5000);
      expect(cancelled.ms).toBeLessThan(5000);
      const active = await prisma.order.findMany({ where: { status: { not: 'cancelled' } }, include: { items: true } });
      const sold = active.reduce((a2, o) => a2 + o.items.reduce((s, it) => s + it.quantity, 0), 0);
      expect(await stockOf(top)).toBe(5 - sold);
      expect((await prisma.voucher.findUniqueOrThrow({ where: { code } })).usedCount).toBe(active.length);
    }
  }), 180_000);
});

describe('T-CON-06 hai yêu cầu huỷ cùng đơn', () => {
  it('to_ship (S4-Q1 request): một 200 cancel_requested, một 409 not-cancellable; tồn không đổi, 1 sự kiện', async () => {
    const m = await loginMember('con6r@example.com');
    const o = await submitOrder(await orderBody([it1(top, 2)], { cookie: m.cookie, email: m.email }), { cookie: m.cookie });
    const cancel = () => post(`/api/orders/${o.body.order.id}/cancel`, {}, { cookie: m.cookie, ip: freshIp() });
    const rs = await Promise.all([cancel(), cancel()]);
    expect(statuses(rs)).toEqual([200, 409]);
    expect(rs.find((r) => r.status === 409)!.body.error.code).toBe('not-cancellable');
    expect(rs.find((r) => r.status === 200)!.body.status).toBe('cancel_requested');
    expect(await stockOf(top)).toBe(3);
    const row = await prisma.order.findUniqueOrThrow({ where: { code: o.body.order.id }, include: { events: true } });
    expect(row.events.filter((e) => e.kind === 'cancel_requested')).toHaveLength(1);
  });

  it('cờ direct: một 200, một 409; tồn hoàn đúng một lần', async () => withToShipCancelMode('direct', async () => {
    const m = await loginMember('con6@example.com');
    const o = await submitOrder(await orderBody([it1(top, 2)], { cookie: m.cookie, email: m.email }), { cookie: m.cookie });
    expect(await stockOf(top)).toBe(3);
    const cancel = () => post(`/api/orders/${o.body.order.id}/cancel`, {}, { cookie: m.cookie, ip: freshIp() });
    const rs = await Promise.all([cancel(), cancel()]);
    expect(statuses(rs)).toEqual([200, 409]);
    expect(rs.find((r) => r.status === 409)!.body.error.code).toBe('not-cancellable');
    expect(await stockOf(top)).toBe(5);
  }));
});

describe('T-CON-07 ba đơn cùng một biến thể', () => {
  it('tồn 5, mỗi đơn 2: 2 đơn thành công, 1 thất bại, tồn cuối 1', async () => {
    const bodies = await Promise.all(
      ['0911111111', '0922222222', '0933333333'].map((phone, i) => orderBody([it1(top, 2)], { phone, email: `u${i}@example.com` })),
    );
    const rs = await Promise.all(bodies.map((b) => submitOrder(b)));
    expect(statuses(rs)).toEqual([201, 201, 409]);
    expect(rs.find((r) => r.status === 409)!.body.error.code).toBe('stock-changed');
    expect(await stockOf(top)).toBe(1);
    expect(await prisma.order.count()).toBe(2);
  });
});
