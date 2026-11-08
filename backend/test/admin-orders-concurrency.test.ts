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

describe('huỷ đồng thời cùng đơn (AC-ADM-14 phần huỷ)', () => {
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
