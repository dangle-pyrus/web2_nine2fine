import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  flushMail, freshIp, get, loginMember, mails, orderBody, post, prisma, resetCheckout, resetState, stockOf, submitOrder, vid,
} from './helpers';
import { resetConfigCache } from '../src/config/env';
import { setEmailRetryDelays } from '../src/modules/order/order-email.service';
import { expireDueOrders } from '../src/modules/order/expiry.job';
import { extractOrderCode } from '../src/modules/order/payment.service';
import { parseSepayDate } from '../src/modules/payment/sepay.routes';

/** T-QR-01 (CHK-27, BR-CHK-21): chuyển khoản QR + webhook SePay. */

const KEY = 'test-sepay-webhook-key-0123456789';
const BANK = { BANK_NAME: 'MBBank', BANK_ACCOUNT_NUMBER: '0123456789', BANK_ACCOUNT_NAME: 'CONG TY NINE2FINE' };

function enableEnv(): void {
  Object.assign(process.env, BANK, { SEPAY_WEBHOOK_KEY: KEY });
  resetConfigCache();
}
function disableEnv(): void {
  for (const k of [...Object.keys(BANK), 'SEPAY_WEBHOOK_KEY']) delete process.env[k];
  resetConfigCache();
}
const setFlag = (on: boolean) => prisma.$executeRawUnsafe(`UPDATE "store_settings" SET "bank_transfer_enabled" = ${on} WHERE "id" = 1`);

let top: string;
let blazer: string;
let txSeq = 1000;

beforeEach(async () => {
  vi.useRealTimers();
  setEmailRetryDelays([0, 0, 0]);
  await resetState();
  await resetCheckout();
  enableEnv();
  await setFlag(true);
  top = await vid('off-duty-top', 'Trắng', 'S');
  blazer = await vid('the-everyday-blazer', 'Đen', 'S');
});

afterAll(async () => {
  disableEnv();
  await setFlag(false);
});

const hook = (body: Record<string, unknown>, auth: string | null = `Apikey ${KEY}`) =>
  post('/api/payments/sepay/webhook', body, { origin: null, xrw: null, ip: freshIp(), headers: auth ? { Authorization: auth } : {} });

const sepay = (over: Record<string, unknown>) => ({
  id: ++txSeq,
  gateway: 'MBBank',
  transactionDate: '2026-11-13 10:00:00',
  accountNumber: BANK.BANK_ACCOUNT_NUMBER,
  code: null,
  content: '',
  transferType: 'in',
  transferAmount: 0,
  accumulated: 0,
  subAccount: null,
  referenceCode: 'FT2631700001',
  description: '',
  ...over,
});

async function bankOrder(items = [{ variantId: blazer, quantity: 1 }]) {
  const m = await loginMember(`qr${txSeq}@example.com`);
  const res = await submitOrder(await orderBody(items, { cookie: m.cookie, email: m.email, paymentMethod: 'bank-transfer' }), { cookie: m.cookie });
  expect(res.status).toBe(201);
  const order = res.body.order as { id: string; pricing: { total: number } };
  await flushMail();
  mails.length = 0;
  return { m, code: order.id, total: order.pricing.total };
}
const payment = (code: string, cookie: string) => get(`/api/orders/${code}/payment`, { cookie, ip: freshIp() });
const dbOrder = (code: string) => prisma.order.findUniqueOrThrow({ where: { code } });

describe('T-QR-01 chuyển khoản QR (SePay)', () => {
  it('đặt bank-transfer -> to_pay + pending, hạn +30 phút; /payment awaiting, QR SePay nhúng số tiền + mã đơn', async () => {
    const before = Date.now();
    const { m, code, total } = await bankOrder();
    const o = await dbOrder(code);
    expect(o).toMatchObject({ status: 'to_pay', paymentStatus: 'pending', paymentMethod: 'bank_transfer' });
    const holdMs = o.paymentDueAt!.getTime() - before;
    expect(holdMs).toBeGreaterThan(29 * 60_000);
    expect(holdMs).toBeLessThan(31 * 60_000);
    const r = await payment(code, m.cookie);
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body).toMatchObject({ orderId: code, amount: total, status: 'awaiting', transferContent: code, account: { bank: 'MBBank', accountNumber: '0123456789' } });
    expect(r.body.shortfall).toBeUndefined();
    const qr = new URL(r.body.qrImageUrl);
    expect(qr.host).toBe('qr.sepay.vn');
    expect(qr.searchParams.get('amount')).toBe(String(total));
    expect(qr.searchParams.get('des')).toBe(code);
    expect(qr.searchParams.get('acc')).toBe('0123456789');
  });

  it('webhook đủ tiền -> paid + to_ship, sự kiện + email "Đã nhận thanh toán"; gửi lại cùng id không cộng hai lần', async () => {
    const { m, code, total } = await bankOrder();
    const body = sepay({ content: `MBVCB.1234.${code}.CT tu 0011 NGUYEN VAN A`, transferAmount: total });
    const r = await hook(body);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true });
    const o = await dbOrder(code);
    expect(o).toMatchObject({ status: 'to_ship', paymentStatus: 'paid' });
    expect(o.paidAt).not.toBeNull();
    const again = await hook(body);
    expect(again.status).toBe(200);
    expect(await prisma.paymentTransaction.count({ where: { orderId: o.order_id } })).toBe(1);
    const events = await prisma.orderEvent.findMany({ where: { orderId: o.order_id, kind: 'payment_received' } });
    expect(events).toHaveLength(1);
    await flushMail();
    expect(mails.map((x) => x.subject)).toEqual([`nine2fine – Đã nhận thanh toán đơn #${code}`]);
    const p = await payment(code, m.cookie);
    expect(p.body).toMatchObject({ status: 'paid' });
    expect(p.body.paidAt).toBeTruthy();
    // Đơn đã thanh toán không bị job hết hạn huỷ.
    expect(await expireDueOrders(new Date(Date.now() + 3_600_000))).toBe(0);
    expect((await dbOrder(code)).status).toBe('to_ship');
  });

  it('thiếu tiền: giữ to_pay, /payment báo shortfall và QR nhúng số còn thiếu; chuyển nốt -> paid', async () => {
    const { m, code, total } = await bankOrder();
    await hook(sepay({ content: code, transferAmount: 100_000 }));
    expect(await dbOrder(code)).toMatchObject({ status: 'to_pay', paymentStatus: 'pending' });
    const p = await payment(code, m.cookie);
    expect(p.body).toMatchObject({ status: 'awaiting', amount: total, shortfall: total - 100_000 });
    expect(new URL(p.body.qrImageUrl).searchParams.get('amount')).toBe(String(total - 100_000));
    await hook(sepay({ code, content: 'chuyen not', transferAmount: total - 100_000 }));
    expect(await dbOrder(code)).toMatchObject({ status: 'to_ship', paymentStatus: 'paid' });
  });

  it('thừa tiền: paid, sự kiện ghi cần hoàn phần thừa (ghi chú nội bộ cho kế toán)', async () => {
    const { code, total } = await bankOrder();
    await hook(sepay({ content: code.toLowerCase(), transferAmount: total + 50_000 }));
    const o = await dbOrder(code);
    expect(o).toMatchObject({ status: 'to_ship', paymentStatus: 'paid' });
    const e = await prisma.orderEvent.findFirstOrThrow({ where: { orderId: o.order_id, kind: 'payment_received' } });
    expect(e.detail).toContain('50.000₫');
    expect(e.internalNote).toContain('50.000₫');
    expect((await prisma.paymentTransaction.findFirstOrThrow({ where: { orderId: o.order_id } })).outcome).toBe('overpaid');
  });

  it('quá hạn chưa đủ tiền -> expired + hoàn tồn; tiền về sau khi huỷ: không khôi phục, ghi cần hoàn 100%', async () => {
    const { m, code, total } = await bankOrder();
    expect(await stockOf(blazer)).toBe(4);
    await prisma.order.update({ where: { code }, data: { paymentDueAt: new Date(Date.now() - 1000) } });
    const p = await payment(code, m.cookie);
    expect(p.body.status).toBe('expired');
    expect(await stockOf(blazer)).toBe(5);
    await hook(sepay({ content: code, transferAmount: total }));
    const o = await dbOrder(code);
    expect(o).toMatchObject({ status: 'cancelled', paymentStatus: 'pending' });
    const tx = await prisma.paymentTransaction.findFirstOrThrow({ where: { orderId: o.order_id } });
    expect(tx).toMatchObject({ matched: true, outcome: 'after_cancel' });
    const note = await prisma.orderEvent.findFirstOrThrow({ where: { orderId: o.order_id, kind: 'note' } });
    expect(note.internalNote).toContain('hoàn');
  });

  it('nội dung không có mã đơn / mã đơn COD -> ghi unmatched, đơn không đổi; tiền ra và 0 ₫ bỏ qua', async () => {
    const r = await hook(sepay({ content: 'chuyen tien an trua', transferAmount: 200_000 }));
    expect(r.status).toBe(200);
    expect(await prisma.paymentTransaction.count({ where: { matched: false, outcome: 'unmatched' } })).toBe(1);
    const cod = await submitOrder(await orderBody([{ variantId: top, quantity: 1 }]));
    expect(cod.status).toBe(201);
    await hook(sepay({ content: cod.body.order.id, transferAmount: 500_000 }));
    expect(await dbOrder(cod.body.order.id)).toMatchObject({ status: 'to_ship', paymentStatus: 'pending' });
    expect(await prisma.paymentTransaction.count({ where: { matched: false } })).toBe(2);
    expect((await hook(sepay({ content: 'x', transferType: 'out', transferAmount: 10_000 }))).status).toBe(200);
    expect(await prisma.paymentTransaction.count()).toBe(2);
  });

  it('xác thực: thiếu / sai API key -> 401, không ghi; không cần Origin; body sai -> 422', async () => {
    const { code, total } = await bankOrder();
    const body = sepay({ content: code, transferAmount: total });
    expect((await hook(body, null)).status).toBe(401);
    expect((await hook(body, 'Apikey sai-khoa-0000000000000000')).status).toBe(401);
    expect((await hook(body, `Bearer ${KEY}`)).status).toBe(401);
    expect(await prisma.paymentTransaction.count()).toBe(0);
    expect((await dbOrder(code)).status).toBe('to_pay');
    const bad = await hook({ id: 'abc', transferType: 'in', transferAmount: -1 });
    expect(bad.status).toBe(422);
  });

  it('thiếu SEPAY_WEBHOOK_KEY: QR tắt (quote khoá bank-transfer, /payment 404) và webhook luôn 401', async () => {
    const { m, code, total } = await bankOrder();
    delete process.env.SEPAY_WEBHOOK_KEY;
    resetConfigCache();
    expect((await payment(code, m.cookie)).status).toBe(404);
    const q = await post('/api/checkout/quote', { items: [{ variantId: top, quantity: 1 }], voucherCodes: [] }, { ip: freshIp() });
    expect(q.body.policy.bankTransferEnabled).toBe(false);
    expect(q.body.paymentMethods.find((x: { method: string }) => x.method === 'bank-transfer')).toMatchObject({ available: false, reason: 'not-enabled' });
    expect((await hook(sepay({ content: code, transferAmount: total }))).status).toBe(401);
  });

  it('hàm thuần: tách mã đơn, đọc ngày SePay giờ VN', () => {
    expect(extractOrderCode(null, 'IBFT N2F2611130042 thanh toan')).toBe('N2F2611130042');
    expect(extractOrderCode('n2f2611130042', '')).toBe('N2F2611130042');
    expect(extractOrderCode(null, 'N2F 2611 1300 42')).toBe('N2F2611130042');
    expect(extractOrderCode(null, 'khong co ma')).toBeNull();
    expect(parseSepayDate('2026-11-13 10:00:00', new Date(0)).toISOString()).toBe('2026-11-13T03:00:00.000Z');
    expect(parseSepayDate('sai', new Date(0)).getTime()).toBe(0);
  });
});
